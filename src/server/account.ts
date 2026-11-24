/**
 * Data export and account deletion (DPDP: access and erasure rights).
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  alerts,
  callResults,
  checkIns,
  emergencyContacts,
  familyMembers,
  familyNotes,
  families,
  medicines,
  notifications,
  parents,
  schedules,
  subscriptions,
} from "@/db/schema/app";
import { user } from "@/db/schema/auth";
import type { DbOrTx } from "@/db/types";
import { readHealthNotes } from "./parents";

/** Everything we hold about a family, as plain JSON. */
export async function exportFamilyData(db: DbOrTx, familyId: string, encryptionKey: string) {
  const [family] = await db.select().from(families).where(eq(families.id, familyId));
  const members = await db
    .select({ member: familyMembers, email: user.email, name: user.name })
    .from(familyMembers)
    .innerJoin(user, eq(user.id, familyMembers.userId))
    .where(eq(familyMembers.familyId, familyId));
  const parentRows = await db.select().from(parents).where(eq(parents.familyId, familyId));
  const ids = parentRows.map((p) => p.id);
  const byParent = async () => {
    if (ids.length === 0) return [];
    const [sch, meds, contacts, notes, cis, subs, als] = await Promise.all([
      db.select().from(schedules).where(inArray(schedules.parentId, ids)),
      db.select().from(medicines).where(inArray(medicines.parentId, ids)),
      db.select().from(emergencyContacts).where(inArray(emergencyContacts.parentId, ids)),
      db.select().from(familyNotes).where(inArray(familyNotes.parentId, ids)),
      db
        .select({ checkIn: checkIns, result: callResults })
        .from(checkIns)
        .leftJoin(callResults, eq(callResults.checkInId, checkIns.id))
        .where(inArray(checkIns.parentId, ids))
        .orderBy(asc(checkIns.localDate)),
      db.select().from(subscriptions).where(inArray(subscriptions.parentId, ids)),
      db.select().from(alerts).where(inArray(alerts.parentId, ids)),
    ]);
    return Promise.all(
      parentRows.map(async (p) => ({
        profile: p,
        healthNotes: await readHealthNotes(db, p.id, encryptionKey),
        schedule: sch.filter((s) => s.parentId === p.id),
        medicines: meds.filter((m) => m.parentId === p.id),
        emergencyContacts: contacts.filter((c) => c.parentId === p.id),
        notes: notes.filter((n) => n.parentId === p.id),
        subscription: subs.filter((s) => s.parentId === p.id),
        alerts: als.filter((a) => a.parentId === p.id),
        calls: cis.filter((c) => c.checkIn.parentId === p.id),
      })),
    );
  };
  const sent = await db
    .select({
      createdAt: notifications.createdAt,
      channel: notifications.channel,
      template: notifications.template,
      status: notifications.status,
      body: notifications.body,
    })
    .from(notifications)
    .where(eq(notifications.familyId, familyId));
  return {
    exportedAt: new Date().toISOString(),
    family,
    members: members.map((m) => ({ ...m.member, email: m.email, name: m.name })),
    parents: await byParent(),
    messagesSent: sent,
  };
}

/**
 * Delete a user's account. If they were the last member, the whole family
 * (parents, calls, everything) is deleted too. If others remain, the oldest
 * remaining member becomes the owner.
 */
export async function deleteAccount(
  db: DbOrTx,
  userId: string,
): Promise<{ familyDeleted: boolean }> {
  const memberships = await db.select().from(familyMembers).where(eq(familyMembers.userId, userId));
  let familyDeleted = false;
  for (const m of memberships) {
    const others = await db
      .select()
      .from(familyMembers)
      .where(and(eq(familyMembers.familyId, m.familyId)))
      .orderBy(asc(familyMembers.createdAt));
    const remaining = others.filter((o) => o.userId !== userId);
    if (remaining.length === 0) {
      await db.delete(families).where(eq(families.id, m.familyId));
      familyDeleted = true;
    } else if (m.role === "owner" && !remaining.some((r) => r.role === "owner")) {
      await db
        .update(familyMembers)
        .set({ role: "owner" })
        .where(eq(familyMembers.id, remaining[0]!.id));
    }
  }
  await db.delete(user).where(eq(user.id, userId));
  return { familyDeleted };
}
