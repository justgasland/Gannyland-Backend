import { z } from "zod";
import { handle } from "@/lib/backend/http";
import { readContent } from "@/lib/backend/service";
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ kind: string }> },
) {
  return handle(async () => ({
    items: await readContent(
      z
        .enum([
          "category",
          "collection",
          "style",
          "home",
          "store",
          "story",
          "help",
        ])
        .parse((await ctx.params).kind),
    ),
  }));
}
