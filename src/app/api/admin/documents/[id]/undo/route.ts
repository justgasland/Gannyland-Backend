import { z } from "zod";
import { requireOwner } from "@/lib/backend/auth";
import { handle, body } from "@/lib/backend/http";
import { undoRevision } from "@/lib/backend/service";
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const actor = await requireOwner(request);
    const { expectedRevision } = z
      .object({ expectedRevision: z.number().int().positive() })
      .strict()
      .parse(await body(request));
    return undoRevision(
      actor,
      z
        .string()
        .uuid()
        .parse((await ctx.params).id),
      expectedRevision,
    );
  });
}
