import { requireOwner } from "@/lib/backend/auth";
import { backend } from "@/lib/backend/client";
import { handle } from "@/lib/backend/http";
export async function GET(request: Request) {
  return handle(async () => {
    await requireOwner(request);
    const db = backend();
    const [revisions, jobs] = await Promise.all([
      db
        .from("backend_revisions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("backend_jobs")
        .select("id,kind,state,attempts,last_error,created_at")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (revisions.error || jobs.error) throw new Error("INTERNAL_ERROR");
    return { revisions: revisions.data, jobs: jobs.data };
  });
}
