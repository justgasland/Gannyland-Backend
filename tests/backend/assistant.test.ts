// @vitest-environment node
import { it, expect } from "vitest";
import {
  parseConfirmation,
  ActionSchema,
  formatPreview,
} from "../../src/lib/backend/assistant-contract";
it("requires an exact action token rather than generic yes", () => {
  expect(parseConfirmation("yes")).toBeNull();
  expect(
    parseConfirmation("publish 11111111-1111-4111-8111-111111111111"),
  ).toEqual({ verb: "publish", id: "11111111-1111-4111-8111-111111111111" });
  expect(parseConfirmation("publish someone")).toBeNull();
});
it("rejects model-generated direct publication or arbitrary code", () => {
  expect(
    ActionSchema.safeParse({ action: "publish", sql: "drop table products" })
      .success,
  ).toBe(false);
  expect(
    ActionSchema.safeParse({
      action: "question",
      question: "Per yard or trouser length?",
      kind: null,
      id: null,
      baseRevision: null,
      dataJson: null,
    }).success,
  ).toBe(true);
});
it("preview includes exact changed fields, not model assurances", () => {
  expect(
    formatPreview("product", { name: "Twill", availability: "out_of_stock" }),
  ).toContain("out_of_stock");
});
