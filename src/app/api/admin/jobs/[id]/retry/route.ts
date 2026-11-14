import { z } from "zod";
import { requireOwner } from "@/lib/backend/auth";
import { backend } from "@/lib/backend/client";
import { handle } from "@/lib/backend/http";
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    await requireOwner(request);
    const id = z
      .string()
      .uuid()
      .parse((await ctx.params).id);
    const r = await backend()
      .from("backend_jobs")
      .update({
        state: "pending",
        attempts: 0,
        available_at: new Date().toISOString(),
        lease_until: null,
        last_error: null,
      })
      .eq("id", id)
      .eq("state", "failed")
      .select("id");
    if (r.error) throw r.error;
    if (!r.data?.length) throw new Error("NOT_FOUND");
    return { queued: true };
  });
}
