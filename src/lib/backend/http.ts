import { ZodError } from "zod";
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function body(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new Error("INVALID_CONTENT_TYPE");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("INVALID_BODY");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 128 * 1024) {
      await reader.cancel();
      throw new Error("BODY_TOO_LARGE");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("INVALID_JSON");
  }
}
export async function handle(fn: () => Promise<unknown>) {
  try {
    return json(await fn());
  } catch (e) {
    if (e instanceof ZodError)
      return json(
        {
          error: "VALIDATION_FAILED",
          issues: e.issues.map((i) => ({ path: i.path, message: i.message })),
        },
        400,
      );
    const m = e instanceof Error ? e.message : "INTERNAL_ERROR";
    const code = [
      "UNAUTHORIZED",
      "NOT_FOUND",
      "UNAVAILABLE",
      "REVISION_CONFLICT",
      "NOT_CONFIGURED",
      "RATE_LIMITED",
      "ACTION_EXPIRED",
      "ACTION_CANCELLED",
    ].find((c) => m.includes(c));
    const known =
      code ??
      (m.startsWith("INVALID_") || m === "BODY_TOO_LARGE"
        ? m
        : "INTERNAL_ERROR");
    const status =
      known === "UNAUTHORIZED"
        ? 401
        : known === "NOT_FOUND" || known === "UNAVAILABLE"
          ? 404
          : known === "REVISION_CONFLICT"
            ? 409
            : known === "RATE_LIMITED"
              ? 429
              : known === "NOT_CONFIGURED"
                ? 503
                : known === "INTERNAL_ERROR"
                  ? 500
                  : 400;
    return json({ error: known }, status);
  }
}
