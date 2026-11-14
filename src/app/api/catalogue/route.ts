import { z } from "zod";
import { handle } from "@/lib/backend/http";
import { listProducts } from "@/lib/backend/service";
import { UnitSchema, isNew } from "@/lib/backend/domain";
const Query = z
  .object({
    search: z.string().max(100).optional(),
    category: z.string().max(100).optional(),
    colour: z.string().max(100).optional(),
    unit: UnitSchema.optional(),
    minMinor: z.coerce.number().int().nonnegative().optional(),
    maxMinor: z.coerce.number().int().nonnegative().optional(),
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(24),
  })
  .strict()
  .refine(
    (v) =>
      v.minMinor === undefined ||
      v.maxMinor === undefined ||
      v.minMinor <= v.maxMinor,
    "Invalid price range",
  );
export async function GET(request: Request) {
  return handle(async () => {
    const q = Query.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const rows = await listProducts(q);
    return {
      items: rows
        .slice(q.offset, q.offset + q.limit)
        .map((r) => ({ ...r, isNew: isNew(r.firstPublishedAt) })),
      total: rows.length,
      nextOffset: q.offset + q.limit < rows.length ? q.offset + q.limit : null,
    };
  });
}
