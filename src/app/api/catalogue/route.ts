import { z } from "zod";
import { handle } from "@/lib/backend/http";
import { listProducts, readContent } from "@/lib/backend/service";
import {
  UnitSchema,
  filterProducts,
  isNew,
  type ProductRow,
} from "@/lib/backend/domain";
const Query = z
  .object({
    search: z.string().max(100).optional(),
    category: z.string().max(100).optional(),
    colour: z.string().max(100).optional(),
    colours: z
      .string()
      .max(500)
      .transform((value) => value.split(","))
      .pipe(z.array(z.string().min(1).max(100)).max(50))
      .optional(),
    collection: z.string().min(1).max(150).optional(),
    unit: UnitSchema.optional(),
    minMinor: z.coerce.number().int().nonnegative().optional(),
    maxMinor: z.coerce.number().int().nonnegative().optional(),
    sort: z.enum(["newest", "price-low", "price-high"]).default("newest"),
    priceUnit: UnitSchema.optional(),
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(24),
  })
  .strict()
  .refine(
    (v) =>
      v.sort === "newest" ||
      v.priceUnit !== undefined,
    "Price sorting requires a selling unit",
  )
  .refine(
    (v) =>
      v.minMinor === undefined ||
      v.maxMinor === undefined ||
      v.minMinor <= v.maxMinor,
    "Invalid price range",
  );
export async function GET(request: Request) {
  return handle(async () => {
    const params = new URL(request.url).searchParams;
    for (const key of params.keys())
      if (params.getAll(key).length !== 1)
        throw new Error("INVALID_QUERY");
    const q = Query.parse(
      Object.fromEntries(params),
    );
    const allProducts = await listProducts();
    const rows = filterProducts(allProducts, q);
    const collections = q.collection
      ? await readContent("collection")
      : [];
    let filtered = rows;
    if (q.collection) {
      const collection = collections.find(
        (row) =>
          row.id === q.collection ||
          (row.data as { slug?: string }).slug === q.collection,
      );
      const ids = new Set(
        (collection?.data as { productIds?: string[] } | undefined)
          ?.productIds ?? [],
      );
      filtered = rows.filter((row) => ids.has(row.id));
    }

    const categories = new Map<string, number>();
    const colours = new Map<string, ProductRow["data"]["colours"][number]>();
    for (const row of allProducts) {
      categories.set(
        row.data.category,
        (categories.get(row.data.category) ?? 0) + 1,
      );
      for (const colour of row.data.colours) colours.set(colour.id, colour);
    }
    return {
      items: filtered
        .slice(q.offset, q.offset + q.limit)
        .map((r) => ({ ...r, isNew: isNew(r.firstPublishedAt) })),
      total: filtered.length,
      nextOffset:
        q.offset + q.limit < filtered.length ? q.offset + q.limit : null,
      facets: {
        categories: [...categories].map(([id, count]) => ({ id, count })),
        colours: [...colours.values()],
      },
    };
  });
}
