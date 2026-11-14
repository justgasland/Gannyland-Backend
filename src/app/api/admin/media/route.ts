import { backend } from "@/lib/backend/client";
import { requireOwner } from "@/lib/backend/auth";
import { body, handle } from "@/lib/backend/http";
import { requestUpload } from "@/lib/backend/media";
import { rateLimit } from "@/lib/backend/service";
export async function POST(request: Request) {
  return handle(async () => {
    const actor = await requireOwner(request);
    await rateLimit(`upload:${actor.ownerId}`, 30, 60);
    return requestUpload(actor, await body(request));
  });
}

export async function GET(request: Request) {
  return handle(async () => {
    const actor = await requireOwner(request);
    const r = await backend()
      .from("backend_media")
      .select("id,mime,purpose,bytes,state,created_at")
      .eq("owner_id", actor.ownerId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (r.error) throw r.error;
    return { assets: r.data };
  });
}
