import { brand } from "@/config/brand";
import { getEnv } from "@/lib/env";
import { exportFamilyData } from "@/server/account";
import { requireMember } from "@/server/session";

/** "Download all my data" (JSON). Signed-in family members only. */
export async function GET() {
  const { db, family } = await requireMember();
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
