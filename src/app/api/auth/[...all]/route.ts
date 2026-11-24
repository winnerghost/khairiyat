import { getAuth } from "@/server/auth";

// Better Auth handles /api/auth/* (sign-in, sign-up, sessions, reset, Google callback).
// https://www.better-auth.com/docs/integrations/next

export async function GET(request: Request) {
  const auth = await getAuth();
  return auth.handler(request);
}

export async function POST(request: Request) {
  const auth = await getAuth();
  return auth.handler(request);
}
