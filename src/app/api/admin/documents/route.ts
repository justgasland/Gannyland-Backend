import { requireOwner } from "@/lib/backend/auth";
import { backend } from "@/lib/backend/client";
import { handle, body } from "@/lib/backend/http";
import { DraftInput, saveDraft, rateLimit } from "@/lib/backend/service";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return handle(async () => {
    await requireOwner(request);
    const { data, error } = await backend()
      .from("backend_documents")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return { documents: data };
  });
}
export async function POST(request: Request) {
  return handle(async () => {
    const actor = await requireOwner(request);
    await rateLimit(`admin:${actor.ownerId}`, 120, 60);
    return saveDraft(actor, DraftInput.parse(await body(request)));
  });
}
