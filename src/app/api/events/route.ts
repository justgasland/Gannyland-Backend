import { z } from "zod";
import { createHash } from "node:crypto";
import { backend } from "@/lib/backend/client";
import { handle, body } from "@/lib/backend/http";
import { rateLimit, getProduct } from "@/lib/backend/service";
export async function POST(request: Request) {
  return handle(async () => {
    const input = z
      .object({
        productId: z.string().uuid().optional(),
        styleId: z.string().uuid().optional(),
        source: z.enum([
          "home",
          "catalogue",
          "product",
          "style",
          "help",
          "store",
        ]),
      })
      .strict()
      .parse(await body(request));
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    await rateLimit(
      "event:" + createHash("sha256").update(ip).digest("hex"),
      30,
      60,
    );
    if (input.productId) await getProduct(input.productId);
    const { error } = await backend()
      .from("backend_events")
      .insert({
        type: "whatsapp_link_click",
        product_id: input.productId,
        style_id: input.styleId,
        source: input.source,
      });
    if (error) throw error;
    return { recorded: true };
  });
}
