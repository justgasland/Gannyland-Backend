import { z } from "zod";
import { handle } from "@/lib/backend/http";
import { publicMediaUrl } from "@/lib/backend/media";
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () =>
    publicMediaUrl(
      z
        .string()
        .uuid()
        .parse((await ctx.params).id),
    ),
  );
}
