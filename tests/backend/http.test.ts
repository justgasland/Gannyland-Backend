// @vitest-environment node
import { it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  GET as adminGet,
  POST as adminPost,
} from "../../src/app/api/admin/documents/route";
import { POST as webhook } from "../../src/app/api/whatsapp/webhook/route";
it("admin endpoints reject unauthenticated callers without contacting database", async () => {
  expect(
    (await adminGet(new Request("http://localhost/api/admin/documents")))
      .status,
  ).toBe(401);
  expect(
    (
      await adminPost(
        new Request("http://localhost/api/admin/documents", {
          method: "POST",
          body: "{}",
        }),
      )
    ).status,
  ).toBe(401);
});
it("webhook rejects invalid signatures before any writes", async () => {
  const res = await webhook(
    new Request("http://localhost/api/whatsapp/webhook", {
      method: "POST",
      body: "{}",
    }),
  );
  expect(res.status).toBe(401);
});

it("private draft image previews require owner authentication", async () => {
  const { GET } = await import("../../src/app/api/admin/media/[id]/route");
  const response = await GET(
    new Request(
      "http://localhost/api/admin/media/11111111-1111-4111-8111-111111111111",
    ),
    { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) },
  );
  expect(response.status).toBe(401);
});
