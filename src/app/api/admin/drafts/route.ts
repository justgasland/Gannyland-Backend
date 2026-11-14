import { requireOwner } from "@/lib/backend/auth";
import { backend } from "@/lib/backend/client";
import { handle } from "@/lib/backend/http";
export async function GET(request: Request) {
  return handle(async () => {
    const actor = await requireOwner(request);
    const r = await backend()
      .from("backend_drafts")
      .select("*")
      .eq("owner_id", actor.ownerId)
      .eq("state", "pending")
      .order("created_at", { ascending: false })
      .limit(100);
    if (r.error) throw r.error;
    return { drafts: r.data };
  });
}
