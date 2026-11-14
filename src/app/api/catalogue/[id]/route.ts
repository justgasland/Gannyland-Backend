import { z } from "zod";
import { handle } from "@/lib/backend/http";
import { getProduct, listProducts } from "@/lib/backend/service";
import { relatedProducts, isNew } from "@/lib/backend/domain";
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const product = await getProduct(
      z
        .string()
        .uuid()
        .parse((await ctx.params).id),
    );
    return {
      ...product,
      isNew: isNew(product.firstPublishedAt),
      related: relatedProducts(await listProducts(), product),
    };
  });
}
