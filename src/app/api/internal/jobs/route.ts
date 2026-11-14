import { timingSafeEqual } from "node:crypto";
import { handle, json } from "@/lib/backend/http";
import { runJobs } from "@/lib/backend/worker";
export const maxDuration = 60;
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  const expected = secret ? `Bearer ${secret}` : "";
  if (
    !secret ||
    auth.length !== expected.length ||
    !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))
  )
    return json({ error: "UNAUTHORIZED" }, 401);
  return handle(runJobs);
}
