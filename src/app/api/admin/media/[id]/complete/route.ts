import { z } from "zod";
import { requireOwner } from "@/lib/backend/auth";
import { handle } from "@/lib/backend/http";
import { finishUpload } from "@/lib/backend/media";
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () =>
    finishUpload(
      await requireOwner(request),
      z
        .string()
        .uuid()
        .parse((await ctx.params).id),
    ),
  );
}
