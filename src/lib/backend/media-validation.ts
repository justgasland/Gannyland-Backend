import { z } from "zod";
export const UploadSchema = z
  .object({
    mime: z.enum(["image/jpeg", "image/png", "image/webp", "video/mp4"]),
    bytes: z.number().int().positive().max(52428800),
    purpose: z.enum(["image", "texture", "video", "panorama"]),
  })
  .strict()
  .refine(
    (v) =>
      v.purpose === "video"
        ? v.mime === "video/mp4"
        : v.mime.startsWith("image/"),
    "MIME does not match purpose",
  );
export function validateUpload(input: unknown) {
  return UploadSchema.parse(input);
}
export function validateMediaBytes(mime: string, bytes: Uint8Array) {
  const b = Buffer.from(bytes);
  if (mime === "image/jpeg")
    return b[0] === 255 && b[1] === 216 && b[2] === 255;
  if (mime === "image/png")
    return b
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/webp")
    return (
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP"
    );
  if (mime === "video/mp4") return b.toString("ascii", 4, 8) === "ftyp";
  return false;
}
export type MediaPlacementAsset = { id: string; purpose: string; mime: string };
export function assertMediaPlacements(
  data: Record<string, unknown>,
  assets: MediaPlacementAsset[],
) {
  const byId = new Map(assets.map((a) => [a.id, a]));
  function check(id: unknown, purpose: string) {
    if (typeof id !== "string") throw new Error("INVALID_MEDIA_PLACEMENT");
    const a = byId.get(id);
    if (
      !a ||
      a.purpose !== purpose ||
      (purpose === "video"
        ? !a.mime.startsWith("video/")
        : !a.mime.startsWith("image/"))
    )
      throw new Error("INVALID_MEDIA_PLACEMENT");
  }
  function walk(v: unknown, key: string, inScene = false) {
    if (v === undefined || v === null) return;
    if (key === "video") {
      check(v, "video");
      return;
    }
    if (key === "textureImage") {
      check(v, "texture");
      return;
    }
    if (["image", "heroImage", "archiveImage"].includes(key)) {
      check(v, inScene ? "panorama" : "image");
      return;
    }
    if (["images", "gallery"].includes(key) && Array.isArray(v)) {
      v.forEach((id) => check(id, "image"));
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((x) => walk(x, "", inScene || key === "scenes"));
      return;
    }
    if (v && typeof v === "object")
      Object.entries(v).forEach(([k, x]) => walk(x, k, inScene));
  }
  walk(data, "");
}
export function assertPublishable(
  kind: string,
  data: Record<string, unknown>,
  assets: MediaPlacementAsset[],
) {
  if (
    kind === "product" &&
    (!Array.isArray(data.images) || data.images.length === 0)
  )
    throw new Error("INVALID_MAIN_IMAGE_REQUIRED");
  assertMediaPlacements(data, assets);
}
