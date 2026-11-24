/**
 * Families and membership. Every signed-in user belongs to a family; the
 * first person to sign up becomes its owner and can invite siblings.
 */
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { familyMembers, families, invitations, parents } from "@/db/schema/app";
import type { DbOrTx } from "@/db/types";
import { randomToken } from "@/lib/crypto";

export type Member = typeof familyMembers.$inferSelect;
export type Family = typeof families.$inferSelect;

/** Creates "<Name>'s family" with this user as owner, unless they already belong to one. */
export async function ensureFamilyForUser(
  db: DbOrTx,
  u: { id: string; name: string },
): Promise<{ family: Family; member: Member }> {
  const existing = await getMembership(db, u.id);
  if (existing) return existing;
  const firstName = u.name.trim().split(/\s+/)[0] || "My";
  const [family] = await db
    .insert(families)
    .values({ name: `${firstName}'s family`, createdByUserId: u.id })
    .returning();
  const [member] = await db
    .insert(familyMembers)
    .values({ familyId: family!.id, userId: u.id, role: "owner", displayName: u.name })
    .onConflictDoNothing()
    .returning();
  if (!member) {
    // A concurrent request created it first.
    const again = await getMembership(db, u.id);
    if (again) return again;
    throw new Error("Could not create family membership");
  }
  return { family: family!, member };
}

/** The user's family (owner membership first). */
export async function getMembership(
  db: DbOrTx,
  userId: string,
): Promise<{ family: Family; member: Member } | null> {
  const rows = await db
    .select({ member: familyMembers, family: families })
    .from(familyMembers)
    .innerJoin(families, eq(families.id, familyMembers.familyId))
    .where(eq(familyMembers.userId, userId))
    .orderBy(asc(familyMembers.role), asc(familyMembers.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function listMembers(db: DbOrTx, familyId: string): Promise<Member[]> {
  return db
    .select()
    .from(familyMembers)
    .where(eq(familyMembers.familyId, familyId))
    .orderBy(asc(familyMembers.createdAt));
}

export async function createInvitation(
  db: DbOrTx,
  input: { familyId: string; email: string; invitedByUserId: string; now: Date },
): Promise<{ token: string }> {
  const token = randomToken();
  await db.insert(invitations).values({
    familyId: input.familyId,
    email: input.email.trim().toLowerCase(),
    token,
    invitedByUserId: input.invitedByUserId,
    expiresAt: new Date(input.now.getTime() + 14 * 24 * 3600_000),
  });
  return { token };
}

export type AcceptInviteResult =
  { ok: true; familyId: string } | { ok: false; reason: "invalid" | "expired" | "has_parents" };

/**
 * Join a sibling's family. If the user's own family is empty (no parents
 * set up yet) it is removed; we never silently drop a family with parents.
 */
export async function acceptInvitation(
  db: DbOrTx,
  input: { token: string; userId: string; displayName: string; now: Date },
): Promise<AcceptInviteResult> {
  const [invite] = await db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.token, input.token),
        isNull(invitations.acceptedAt),
        gt(invitations.expiresAt, input.now),
      ),
    )
    .limit(1);
  if (!invite) return { ok: false, reason: "invalid" };

  const current = await getMembership(db, input.userId);
  if (current && current.family.id === invite.familyId)
    return { ok: true, familyId: invite.familyId };
  if (current) {
    const ownParents = await db
      .select({ id: parents.id })
      .from(parents)
      .where(eq(parents.familyId, current.family.id))
      .limit(1);
    if (ownParents.length > 0) return { ok: false, reason: "has_parents" };
    await db.delete(familyMembers).where(eq(familyMembers.id, current.member.id));
    if (current.member.role === "owner") {
      const others = await listMembers(db, current.family.id);
      if (others.length === 0) await db.delete(families).where(eq(families.id, current.family.id));
    }
  }
  await db
    .insert(familyMembers)
    .values({
      familyId: invite.familyId,
      userId: input.userId,
      role: "member",
      displayName: input.displayName,
    })
    .onConflictDoNothing();
  await db.update(invitations).set({ acceptedAt: input.now }).where(eq(invitations.id, invite.id));
  return { ok: true, familyId: invite.familyId };
}
