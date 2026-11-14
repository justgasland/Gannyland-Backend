import { z } from "zod";
import { ProductSchema, ChartSchema } from "./domain";
const text = z.string().trim().min(1).max(500);
const copy = z.string().max(10000);
const media = z.string().uuid();
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(150);
const https = z
  .string()
  .url()
  .refine((v) => new URL(v).protocol === "https:", "HTTPS required");
const link = z
  .string()
  .max(500)
  .refine(
    (v) => /^\/(?!\/)/.test(v) || v.startsWith("https://"),
    "Internal path or HTTPS required",
  );
const image = media.optional();
const category = z
  .object({ name: text, slug, description: copy, image })
  .strict();
const schemas = {
  product: ProductSchema,
  category,
  collection: category.extend({ productIds: z.array(media).max(200) }).strict(),
  style: z
    .object({
      title: text,
      slug,
      description: copy,
      image: media,
      occasions: z.array(text).max(20),
      productIds: z.array(media).max(20),
      relationship: z.enum(["exact", "illustrative"]),
      featured: z.boolean().default(false),
    })
    .strict(),
  home: z
    .object({
      heroTitle: text,
      heroDescription: copy,
      heroImage: image,
      featuredProductIds: z.array(media).max(10),
      collectionIds: z.array(media).max(10),
      styleIds: z.array(media).max(10),
      closingTitle: text,
      closingDescription: copy,
    })
    .strict(),
  store: z
    .object({
      name: text,
      address: copy,
      phone: z.string().regex(/^[1-9]\d{7,14}$/),
      whatsapp: z.string().regex(/^[1-9]\d{7,14}$/),
      hours: z
        .array(
          z
            .object({
              day: text,
              opens: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
              closes: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
            })
            .strict(),
        )
        .max(7),
      mapUrl: https.optional(),
      instagram: https.optional(),
      heroImage: image,
      gallery: z.array(media).max(30),
      scenes: z
        .array(
          z
            .object({
              id: slug,
              label: text,
              image: media,
              yaw: z.number().min(-180).max(180),
              pitch: z.number().min(-90).max(90),
            })
            .strict(),
        )
        .max(20),
      visitDescription: copy.optional(),
    })
    .strict(),
  story: z
    .object({
      title: text,
      introduction: copy,
      heroImage: image,
      foundingStory: copy,
      archiveImage: image,
      milestones: z
        .array(
          z.object({ year: text, title: text, description: copy }).strict(),
        )
        .max(30),
      facts: z.array(z.object({ value: text, label: text }).strict()).max(10),
      team: z
        .array(z.object({ name: text, role: text, image }).strict())
        .max(20),
      closingTitle: text,
      closingDescription: copy,
    })
    .strict(),
  help: z
    .object({
      prompts: z
        .array(z.object({ label: text, message: copy }).strict())
        .max(20),
      links: z.array(z.object({ label: text, href: link }).strict()).max(20),
    })
    .strict(),
  calculator: ChartSchema,
};
export type DocumentKind = keyof typeof schemas;
export function validateDocument(
  kind: string,
  data: unknown,
): Record<string, unknown> {
  if (!(kind in schemas)) throw new Error("INVALID_KIND");
  return schemas[kind as DocumentKind].parse(data);
}
export function mediaIds(data: Record<string, unknown>): string[] {
  const ids: string[] = [];
  function visit(v: unknown, key: string) {
    if (
      ["image", "heroImage", "archiveImage", "textureImage", "video"].includes(
        key,
      ) &&
      typeof v === "string"
    )
      ids.push(v);
    else if (["images", "gallery"].includes(key) && Array.isArray(v))
      ids.push(...v.filter((x): x is string => typeof x === "string"));
    else if (Array.isArray(v)) v.forEach((x) => visit(x, ""));
    else if (v && typeof v === "object")
      Object.entries(v).forEach(([k, x]) => visit(x, k));
  }
  visit(data, "");
  return [...new Set(ids)];
}
