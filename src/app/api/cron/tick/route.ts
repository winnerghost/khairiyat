import { timingSafeEqualStr } from "@/lib/crypto";
import { getEnv } from "@/lib/env";
import { tickOnce } from "@/server/engine-runner";

/**
 * Protected scheduler tick for hosts that run the engine inside Next.js.
 * Call with:  Authorization: Bearer <CRON_SECRET>
 * (In the Supabase setup, pg_cron calls the Edge Function instead.)
 */
export async function POST(request: Request) {
  const env = getEnv();
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !timingSafeEqualStr(token, env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const stats = await tickOnce();
  return Response.json(stats, { status: stats.error ? 500 : 200 });
}
