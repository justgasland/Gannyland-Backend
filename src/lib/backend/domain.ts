import { z } from "zod";

const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const text = z.string().trim().min(1).max(500);
export const UnitSchema = z.enum(["yard", "trouser_length"]);
export type Unit = z.infer<typeof UnitSchema>;
const money = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const SellingOptionSchema = z
  .object({
    id,
    unit: UnitSchema,
    priceMode: z.enum(["exact", "enquiry"]),
    amountMinor: money.nullable(),
    lengthInches: z.number().positive().max(1000).optional(),
  })
  .strict()
  .refine(
    (o) =>
      o.priceMode === "enquiry"
        ? o.amountMinor === null
        : o.amountMinor !== null,
    "Price must match visibility",
  );
export const ProductSchema = z
  .object({
    name: text,
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(150),
    reference: text,
    category: id,
    description: z.string().max(5000).default(""),
    material: z.string().max(500).optional(),
    widthCm: z.number().positive().max(1000).optional(),
    colours: z
      .array(
        z
          .object({
            id,
            name: text,
            hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    availability: z.enum(["in_stock", "out_of_stock", "confirm"]),
    sellingOptions: z.array(SellingOptionSchema).min(1).max(2),
    images: z.array(z.string().uuid()).max(30),
    video: z.string().uuid().optional(),
    textureImage: z.string().uuid().optional(),
    suitableUses: z.array(text).max(20).default([]),
  })
  .strict()
  .superRefine((p, ctx) => {
    for (const list of [
      p.colours.map((c) => c.id),
      p.sellingOptions.map((o) => o.id),
      p.sellingOptions.map((o) => o.unit),
    ])
      if (new Set(list).size !== list.length)
        ctx.addIssue({
          code: "custom",
          message: "Duplicate colour, option or unit",
        });
  });
export type Product = z.infer<typeof ProductSchema>;
export type ProductRow = {
  id: string;
  revision: number;
  firstPublishedAt: string;
  data: Product;
};
export function validateQuantity(unit: Unit, q: string): boolean {
  if (!/^\d+(?:\.\d)?$/.test(q)) return false;
  const n = Number(q);
  return n > 0 && n <= 10000 && Number.isInteger(n * (unit === "yard" ? 2 : 1));
}
export function priceTotal(amount: number, unit: Unit, q: string): number {
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    !validateQuantity(unit, q)
  )
    throw new Error("INVALID_QUANTITY_OR_PRICE");
  const halves = Math.round(Number(q) * 2);
  const doubled = BigInt(amount) * BigInt(halves);
  const total = (doubled + BigInt(1)) / BigInt(2);
  if (total > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("TOTAL_TOO_LARGE");
  return Number(total);
}
export function isNew(date: string, now = new Date()): boolean {
  const age = now.getTime() - new Date(date).getTime();
  return age >= 0 && age < 7 * 86400000;
}
export type Filters = {
  search?: string;
  category?: string;
  colour?: string;
  unit?: Unit;
  minMinor?: number;
  maxMinor?: number;
};
export function filterProducts(rows: ProductRow[], f: Filters): ProductRow[] {
  return rows
    .filter(
      ({ data: p }) =>
        p.availability !== "out_of_stock" &&
        (!f.search ||
          `${p.name} ${p.reference}`
            .toLowerCase()
            .includes(f.search.toLowerCase())) &&
        (!f.category || p.category === f.category) &&
        (!f.colour || p.colours.some((c) => c.id === f.colour)) &&
        p.sellingOptions.some(
          (o) =>
            (!f.unit || o.unit === f.unit) &&
            ((f.minMinor === undefined && f.maxMinor === undefined) ||
              (o.amountMinor !== null &&
                (f.minMinor === undefined || o.amountMinor >= f.minMinor) &&
                (f.maxMinor === undefined || o.amountMinor <= f.maxMinor))),
        ),
    )
    .sort(
      (a, b) =>
        b.firstPublishedAt.localeCompare(a.firstPublishedAt) ||
        a.id.localeCompare(b.id),
    );
}
export function relatedProducts(
  rows: ProductRow[],
  p: ProductRow,
): ProductRow[] {
  return filterProducts(rows, { category: p.data.category })
    .filter((x) => x.id !== p.id)
    .slice(0, 3);
}
export const SelectionSchema = z
  .object({ colourId: id, optionId: id, quantity: z.string().max(20) })
  .strict();
export function quote(p: ProductRow, s: z.infer<typeof SelectionSchema>) {
  if (p.data.availability === "out_of_stock") throw new Error("UNAVAILABLE");
  if (!p.data.colours.some((c) => c.id === s.colourId))
    throw new Error("INVALID_COLOUR");
  const option = p.data.sellingOptions.find((o) => o.id === s.optionId);
  if (!option || !validateQuantity(option.unit, s.quantity))
    throw new Error("INVALID_SELECTION");
  return {
    productId: p.id,
    revision: p.revision,
    selection: s,
    totalMinor:
      option.amountMinor === null
        ? null
        : priceTotal(option.amountMinor, option.unit, s.quantity),
    currency: "NGN",
    unit: option.unit,
    availability: p.data.availability,
  };
}
export function buildSalesLink(phone: string, message: string) {
  if (!/^[1-9]\d{7,14}$/.test(phone))
    throw new Error("SALES_PHONE_NOT_CONFIGURED");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
export const ChartSchema = z
  .object({
    approved: z.boolean(),
    version: z.string().max(100).default("1"),
    rows: z
      .array(
        z
          .object({
            garment: text,
            size: text,
            widthCm: z.number().positive(),
            yards: z.number().positive().max(100),
          })
          .strict(),
      )
      .max(500),
  })
  .strict();
export type Chart = z.infer<typeof ChartSchema>;
export function estimateFabric(
  input: { garment: string; size: string; widthCm: number },
  chart: Pick<Chart, "approved" | "rows">,
): { yards: string } | { reason: "NOT_APPROVED" | "UNSUPPORTED" } {
  if (!chart.approved) return { reason: "NOT_APPROVED" };
  const row = chart.rows.find(
    (r) =>
      r.garment === input.garment &&
      r.size === input.size &&
      r.widthCm === input.widthCm,
  );
  return row
    ? { yards: String(Math.ceil(row.yards * 2) / 2) }
    : { reason: "UNSUPPORTED" };
}
export const CALCULATOR_DISCLAIMER =
  "Estimated fabric only. Your measurements, fabric width, pattern and tailor’s cutting method can change the amount needed. Confirm with your tailor before buying.";
