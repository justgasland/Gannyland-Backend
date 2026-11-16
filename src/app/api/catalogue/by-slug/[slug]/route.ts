import { z } from "zod";
import { handle } from "@/lib/backend/http";
import { getProductBySlug, listProducts } from "@/lib/backend/service";
import { isNew, relatedProducts } from "@/lib/backend/domain";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  return handle(async () => {
    const slug = z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(150)
      .parse((await ctx.params).slug);
    const product = await getProductBySlug(slug);
    return {
      ...product,
      isNew: isNew(product.firstPublishedAt),
      related: relatedProducts(await listProducts(), product),
    };
  });
}
