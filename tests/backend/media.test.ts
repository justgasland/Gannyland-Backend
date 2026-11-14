// @vitest-environment node
import { it, expect } from "vitest";
import {
  validateMediaBytes,
  validateUpload,
} from "../../src/lib/backend/media-validation";
it("validates type size purpose and actual bytes", () => {
  expect(() =>
    validateUpload({ mime: "image/svg+xml", bytes: 30, purpose: "image" }),
  ).toThrow();
  expect(() =>
    validateUpload({ mime: "image/jpeg", bytes: 60000000, purpose: "image" }),
  ).toThrow();
  expect(() =>
    validateUpload({ mime: "video/mp4", bytes: 20, purpose: "texture" }),
  ).toThrow();
  expect(
    validateMediaBytes("image/jpeg", Buffer.from([255, 216, 255, 224])),
  ).toBe(true);
  expect(validateMediaBytes("image/jpeg", Buffer.from("<script>"))).toBe(false);
});
it("rejects video assets in image placements and generic images in panorama scenes", async () => {
  const { assertMediaPlacements } =
    await import("../../src/lib/backend/media-validation");
  expect(() =>
    assertMediaPlacements({ images: ["a"] }, [
      { id: "a", purpose: "video", mime: "video/mp4" },
    ]),
  ).toThrow();
  expect(() =>
    assertMediaPlacements({ scenes: [{ image: "a" }] }, [
      { id: "a", purpose: "image", mime: "image/jpeg" },
    ]),
  ).toThrow();
  expect(() =>
    assertMediaPlacements({ images: ["a"] }, [
      { id: "a", purpose: "image", mime: "image/jpeg" },
    ]),
  ).not.toThrow();
});
it("requires a main image before product publication", async () => {
  const { assertPublishable } =
    await import("../../src/lib/backend/media-validation");
  expect(() => assertPublishable("product", { images: [] }, [])).toThrow(
    "INVALID_MAIN_IMAGE_REQUIRED",
  );
});
