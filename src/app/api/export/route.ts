import { brand } from "@/config/brand";
import { getEnv } from "@/lib/env";
import { exportFamilyData } from "@/server/account";
import { rateLimit } from "@/server/rate-limit";
import { requireMember } from "@/server/session";

/** "Download all my data" (JSON). Signed-in family members only. */
export async function GET() {
  const { db, family, user } = await requireMember();
  if (!rateLimit(`export:${user.id}`, 5, 60_000))
    return new Response("Too many requests", { status: 429 });
  const data = await exportFamilyData(db, family.id, getEnv().DATA_ENCRYPTION_KEY);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${brand.name.toLowerCase()}-data-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
