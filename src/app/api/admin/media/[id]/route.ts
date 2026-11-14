import { z } from "zod";
import { requireOwner } from "@/lib/backend/auth";
import { handle } from "@/lib/backend/http";
import { ownerMediaUrl } from "@/lib/backend/media";
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const actor = await requireOwner(request);
    return ownerMediaUrl(
      actor,
      z
        .string()
        .uuid()
        .parse((await ctx.params).id),
    );
  });
}
