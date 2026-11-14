// @vitest-environment node
import { it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  verifySignature,
  parseMessages,
  requireOwnerIdentity,
} from "../../src/lib/backend/security";
import { validateDocument } from "../../src/lib/backend/content";
it("verifies exact raw webhook bytes and fails closed without secret", () => {
  const raw = '{"x":1}';
  const sig =
    "sha256=" + createHmac("sha256", "secret").update(raw).digest("hex");
  expect(verifySignature(raw, sig, "secret")).toBe(true);
  expect(verifySignature(raw + " ", sig, "secret")).toBe(false);
  expect(verifySignature(raw, "sha256=x", "secret")).toBe(false);
  expect(verifySignature(raw, sig, "")).toBe(false);
});
it("accepts only owner messages for the configured business phone", () => {
  const payload = {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "business" },
              messages: [
                {
                  id: "m1",
                  from: "owner",
                  type: "text",
                  text: { body: "hello" },
                },
                {
                  id: "m2",
                  from: "stranger",
                  type: "text",
                  text: { body: "publish" },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  expect(parseMessages(payload, "owner", "business")).toHaveLength(1);
  expect(parseMessages(payload, "owner", "other")).toHaveLength(0);
  expect(parseMessages({}, "", "")).toHaveLength(0);
});
it("rejects missing/mismatched owner identity", () => {
  expect(() => requireOwnerIdentity(null, "owner")).toThrow();
  expect(() => requireOwnerIdentity("someone", "owner")).toThrow();
  expect(() => requireOwnerIdentity("owner", "")).toThrow();
  expect(requireOwnerIdentity("owner", "owner")).toEqual({
    ownerId: "owner",
    channel: "dashboard",
  });
});
it("uses typed content, rejects dangerous links and invented arbitrary sections", () => {
  expect(() => validateDocument("unknown", {})).toThrow();
  expect(() =>
    validateDocument("store", {
      name: "Store",
      phone: "2348000000000",
      whatsapp: "2348000000000",
      address: "A",
      hours: [],
      mapUrl: "javascript:alert(1)",
      gallery: [],
      scenes: [],
    }),
  ).toThrow();
  expect(() =>
    validateDocument("calculator", {
      approved: true,
      rows: [{ garment: "suit", size: "M", widthCm: 150, yards: -2 }],
    }),
  ).toThrow();
});
