import { z } from "zod";
import { requireOwner } from "@/lib/backend/auth";
import { handle } from "@/lib/backend/http";
import { publishDraft } from "@/lib/backend/service";
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const actor = await requireOwner(request);
    return publishDraft(
      actor,
      z
        .string()
        .uuid()
        .parse((await ctx.params).id),
    );
  });
}
