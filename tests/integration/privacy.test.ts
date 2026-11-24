import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { callResults, checkIns, familyMembers, families, parents } from "@/db/schema/app";
import { user } from "@/db/schema/auth";
import { runTick } from "@/engine/tick";
import { deleteAccount, exportFamilyData } from "@/server/account";
import { acceptInvitation, createInvitation, ensureFamilyForUser } from "@/server/families";
import { deleteParent, saveHealthNotes } from "@/server/parents";
import { createHarness, type Harness, seedFamily, TEST_KEY } from "../helpers/engine";

let H: Harness | undefined;
afterEach(async () => {
  await H?.h.close();
  H = undefined;
});

describe("privacy and family membership", () => {
  it("exports everything for the family (incl. decrypted health notes), and nothing from other families", async () => {
    H = await createHarness("2026-11-24T03:59:00Z");
    const a = await seedFamily(H.h.db, { createdAt: new Date("2026-11-20T00:00:00Z") });
    const b = await seedFamily(H.h.db, { createdAt: new Date("2026-11-20T00:00:00Z") });
    await saveHealthNotes(H.h.db, a.parent.id, "Knee pain", TEST_KEY);
    for (let i = 0; i < 6; i++) {
      H.clock.advanceMinutes(1);
      await runTick(H.deps);
    }
    const data = await exportFamilyData(H.h.db, a.family.id, TEST_KEY);
    expect(data.parents).toHaveLength(1);
    expect(data.parents[0]!.profile.id).toBe(a.parent.id);
    expect(data.parents[0]!.healthNotes).toBe("Knee pain");
    expect(data.parents[0]!.calls.length).toBeGreaterThan(0);
    expect(JSON.stringify(data)).not.toContain(b.parent.id);
  });

  it("deleting a parent removes their calls and transcripts", async () => {
    H = await createHarness("2026-11-24T03:59:00Z");
    const a = await seedFamily(H.h.db, { createdAt: new Date("2026-11-20T00:00:00Z") });
    for (let i = 0; i < 6; i++) {
      H.clock.advanceMinutes(1);
      await runTick(H.deps);
    }
    expect((await H.h.db.select().from(callResults)).length).toBe(1);
    await deleteParent(H.h.db, a.parent.id);
    expect(await H.h.db.select().from(checkIns)).toHaveLength(0);
    expect(await H.h.db.select().from(callResults)).toHaveLength(0);
  });

  it("deleting the only member's account deletes the whole family", async () => {
    H = await createHarness("2026-11-24T03:59:00Z");
    const a = await seedFamily(H.h.db, { createdAt: new Date("2026-11-20T00:00:00Z") });
    const r = await deleteAccount(H.h.db, a.userId);
    expect(r.familyDeleted).toBe(true);
    expect(await H.h.db.select().from(parents).where(eq(parents.id, a.parent.id))).toHaveLength(0);
  });

  it("a sibling joins with an invite; the family survives when the owner leaves", async () => {
    H = await createHarness("2026-11-24T03:59:00Z");
    const a = await seedFamily(H.h.db, { createdAt: new Date("2026-11-20T00:00:00Z") });
    await H.h.db.insert(user).values({ id: "sib", name: "Rohan", email: "rohan@example.com" });
    await ensureFamilyForUser(H.h.db, { id: "sib", name: "Rohan" }); // empty own family
    const { token } = await createInvitation(H.h.db, {
      familyId: a.family.id,
      email: "rohan@example.com",
      invitedByUserId: a.userId,
      now: H.clock.now(),
    });
    expect(
      await acceptInvitation(H.h.db, {
        token: "wrong",
        userId: "sib",
        displayName: "Rohan",
        now: H.clock.now(),
      }),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(
      await acceptInvitation(H.h.db, {
        token,
        userId: "sib",
        displayName: "Rohan",
        now: H.clock.now(),
      }),
    ).toEqual({ ok: true, familyId: a.family.id });
    // Clicking the link again works for the same person, but not for anyone else.
    expect(
      (
        await acceptInvitation(H.h.db, {
          token,
          userId: "sib",
          displayName: "Rohan",
          now: H.clock.now(),
        })
      ).ok,
    ).toBe(true);
    await H.h.db.insert(user).values({ id: "other", name: "Other", email: "other@example.com" });
    expect(
      (
        await acceptInvitation(H.h.db, {
          token,
          userId: "other",
          displayName: "Other",
          now: H.clock.now(),
        })
      ).ok,
    ).toBe(false);
    const members = await H.h.db
      .select()
      .from(familyMembers)
      .where(eq(familyMembers.familyId, a.family.id));
    expect(members.map((m) => m.userId).sort()).toEqual([a.userId, "sib"].sort());

    await deleteAccount(H.h.db, a.userId);
    const [fam] = await H.h.db.select().from(families).where(eq(families.id, a.family.id));
    expect(fam).toBeDefined();
    const [left] = await H.h.db
      .select()
      .from(familyMembers)
      .where(eq(familyMembers.familyId, a.family.id));
    expect(left).toMatchObject({ userId: "sib", role: "owner" });
  });
});
