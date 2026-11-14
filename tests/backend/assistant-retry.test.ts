// @vitest-environment node
import { it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ failUpdate: true }));
const interpret = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("SHOULD_NOT_REINTERPRET");
  }),
);
vi.mock("../../src/lib/backend/interpreter", () => ({ interpret }));
vi.mock("../../src/lib/backend/client", () => ({
  required: (key: string) =>
    ({ OWNER_USER_ID: "owner", WHATSAPP_OWNER_PHONE: "123" })[key] ||
    "configured",
  backend: () => ({
    from: (table: string) => {
      let updating = false;
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        limit: () => q,
        update: () => {
          updating = true;
          return q;
        },
        single: async () => ({
          data: { result: null, sequence: 2 },
          error: null,
        }),
        maybeSingle: async () => ({
          data: {
            id: "11111111-1111-4111-8111-111111111111",
            draft_id: "draft",
            backend_drafts: {
              data: { name: "Original saved fabric" },
              backend_documents: { kind: "product" },
            },
          },
          error: null,
        }),
        then: (resolve: (value: unknown) => unknown) =>
          resolve(
            updating
              ? {
                  error: state.failUpdate
                    ? ((state.failUpdate = false),
                      { message: "SIMULATED_WRITE_FAILURE" })
                    : null,
                }
              : { data: table === "backend_documents" ? [] : [], error: null },
          ),
      };
      return q;
    },
  }),
}));
import { handleOwnerMessage } from "../../src/lib/backend/whatsapp";
beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-not-real";
  process.env.OPENAI_MODEL = "test";
  state.failUpdate = true;
  interpret.mockClear();
});
it("resumes persisted draft after preparation and does not reinterpret a different preview", async () => {
  const msg = {
    id: "message",
    from: "123",
    type: "text" as const,
    text: { body: "change price" },
  };
  await expect(handleOwnerMessage(msg)).rejects.toBeDefined();
  const reply = await handleOwnerMessage(msg);
  expect(reply.text).toContain("Original saved fabric");
  expect(reply.actionId).toBe("11111111-1111-4111-8111-111111111111");
  expect(interpret).not.toHaveBeenCalled();
});
