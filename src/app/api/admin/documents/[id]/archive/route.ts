import { z } from "zod";
import { requireOwner } from "@/lib/backend/auth";
import { handle, body } from "@/lib/backend/http";
import { setArchived } from "@/lib/backend/service";
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const actor = await requireOwner(request);
    const input = z
      .object({
        expectedRevision: z.number().int().positive(),
        archived: z.boolean(),
      })
      .strict()
      .parse(await body(request));
    return setArchived(
      actor,
      z
        .string()
        .uuid()
        .parse((await ctx.params).id),
      input.expectedRevision,
      input.archived,
    );
  });
}
