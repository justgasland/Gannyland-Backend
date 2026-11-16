// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  ProductSchema,
  priceTotal,
  validateQuantity,
  isNew,
  filterProducts,
  relatedProducts,
  quote,
  estimateFabric,
  buildSalesLink,
} from "../../src/lib/backend/domain";
const product = {
  name: "Midnight Twill",
  slug: "midnight-twill",
  reference: "GF-001",
  category: "suit",
  description: "Navy cloth",
  colours: [{ id: "navy", name: "Navy", hex: "#101b38" }],
  availability: "in_stock",
  images: [],
  sellingOptions: [
    { id: "yard", unit: "yard", priceMode: "exact", amountMinor: 2800000 },
    {
      id: "length",
      unit: "trouser_length",
      priceMode: "exact",
      amountMinor: 4200000,
    },
  ],
};
const row = (id = "a", data = product, date = "2026-11-01T00:00:00Z") => ({
  id,
  revision: 1,
  firstPublishedAt: date,
  data: ProductSchema.parse(data),
});
describe("catalogue contracts", () => {
  it("accepts only positive half-yard or whole-length steps", () => {
    expect(validateQuantity("yard", "0.5")).toBe(true);
    expect(validateQuantity("yard", "1")).toBe(true);
    for (const q of ["0", "-1", "0.25", "1e2", "Infinity", "1.00x"])
      expect(validateQuantity("yard", q)).toBe(false);
    expect(validateQuantity("trouser_length", "1.5")).toBe(false);
  });
  it("computes minor-unit totals without float drift", () => {
    expect(priceTotal(2800000, "yard", "1.5")).toBe(4200000);
    expect(priceTotal(101, "yard", "0.5")).toBe(51);
    expect(() => priceTotal(Number.MAX_SAFE_INTEGER, "yard", "2")).toThrow();
  });
  it("validates independent units and rejects colour prices", () => {
    expect(ProductSchema.safeParse(product).success).toBe(true);
    expect(
      ProductSchema.safeParse({
        ...product,
        colours: [{ id: "n", name: "Navy", hex: "#000000", amountMinor: 100 }],
      }).success,
    ).toBe(false);
    expect(
      ProductSchema.safeParse({
        ...product,
        sellingOptions: [
          { id: "x", unit: "yard", priceMode: "enquiry", amountMinor: 4 },
        ],
      }).success,
    ).toBe(false);
  });
  it("expires new after exactly seven days, not on future dates", () => {
    expect(
      isNew("2026-11-01T12:00:00Z", new Date("2026-11-08T11:59:59Z")),
    ).toBe(true);
    expect(
      isNew("2026-11-01T12:00:00Z", new Date("2026-11-08T12:00:00Z")),
    ).toBe(false);
    expect(isNew("2026-12-01", new Date("2026-11-01"))).toBe(false);
  });
  it("filters eligible units, excludes unknown prices and hidden stock", () => {
    const rows = [
      row(),
      row("b", { ...product, availability: "out_of_stock" }),
      row("c", {
        ...product,
        sellingOptions: [
          { id: "ask", unit: "yard", priceMode: "enquiry", amountMinor: null },
        ],
      } as never),
    ];
    expect(filterProducts(rows, { maxMinor: 3000000 })).toHaveLength(1);
    expect(
      filterProducts(rows, { maxMinor: 3000000, unit: "trouser_length" }),
    ).toHaveLength(0);
    expect(filterProducts(rows, {})).toHaveLength(2);
  });
  it("supports multi-colour filters and sorts by an explicit selling unit", () => {
    const rows = [
      row("a", product, "2026-11-03T00:00:00Z"),
      row(
        "b",
        {
          ...product,
          name: "Lower-priced fabric",
          colours: [{ id: "black", name: "Black", hex: "#000000" }],
          sellingOptions: [
            {
              id: "yard",
              unit: "yard",
              priceMode: "exact",
              amountMinor: 1000000,
            },
            {
              id: "length",
              unit: "trouser_length",
              priceMode: "exact",
              amountMinor: 7000000,
            },
          ],
        },
        "2026-11-02T00:00:00Z",
      ),
      row(
        "c",
        {
          ...product,
          name: "Enquiry fabric",
          sellingOptions: [
            {
              id: "yard",
              unit: "yard",
              priceMode: "enquiry",
              amountMinor: null,
            },
          ],
        } as never,
      ),
    ];
    expect(filterProducts(rows, { colours: ["black"] }).map((r) => r.id)).toEqual([
      "b",
    ]);
    expect(
      filterProducts(rows, { sort: "price-low", priceUnit: "yard" }).map(
        (r) => r.id,
      ),
    ).toEqual(["b", "a", "c"]);
    expect(
      filterProducts(rows, { sort: "price-high", priceUnit: "trouser_length" })
        .map((r) => r.id),
    ).toEqual(["b", "a"]);
  });
  it("recommends up to three same-category available fabrics", () => {
    expect(
      relatedProducts(
        [row(), row("b"), row("c"), row("d"), row("e")],
        row(),
      ).map((x) => x.id),
    ).toEqual(["b", "c", "d"]);
  });
  it("quotes only a valid colour and selling option; refuses sold-out", () => {
    expect(
      quote(row(), { colourId: "navy", optionId: "yard", quantity: "0.5" })
        .totalMinor,
    ).toBe(1400000);
    expect(() =>
      quote(row(), { colourId: "wrong", optionId: "yard", quantity: "1" }),
    ).toThrow();
    expect(() =>
      quote(row("b", { ...product, availability: "out_of_stock" }), {
        colourId: "navy",
        optionId: "yard",
        quantity: "1",
      }),
    ).toThrow();
  });
  it("builds encoded links and rejects fake phone numbers", () => {
    expect(buildSalesLink("2348000000000", "Navy & gold")).toContain(
      "Navy%20%26%20gold",
    );
    expect(() => buildSalesLink("", "hello")).toThrow();
  });
  it("requires approved exact calculator rows and rounds up to half yard", () => {
    const input = { garment: "suit", size: "M", widthCm: 150 };
    const chart = { approved: false, rows: [{ ...input, yards: 2.2 }] };
    expect(estimateFabric(input, chart)).toEqual({ reason: "NOT_APPROVED" });
    expect(estimateFabric(input, { ...chart, approved: true })).toEqual({
      yards: "2.5",
    });
    expect(
      estimateFabric({ ...input, size: "XL" }, { ...chart, approved: true }),
    ).toEqual({ reason: "UNSUPPORTED" });
  });
});
