import { backend } from "@/lib/backend/client";
import { handle, json } from "@/lib/backend/http";
import { verifySignature, parseMessages } from "@/lib/backend/security";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (
    token &&
    q.get("hub.mode") === "subscribe" &&
    q.get("hub.verify_token") === token
  )
    return new Response(q.get("hub.challenge") ?? "", { status: 200 });
  return json({ error: "UNAUTHORIZED" }, 401);
}
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 128 * 1024)
    return json({ error: "BODY_TOO_LARGE" }, 413);
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 128 * 1024)
    return json({ error: "BODY_TOO_LARGE" }, 413);
  if (
    !verifySignature(
      raw,
      request.headers.get("x-hub-signature-256"),
      process.env.WHATSAPP_APP_SECRET,
    )
  )
    return json({ error: "UNAUTHORIZED" }, 401);
  return handle(async () => {
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error("INVALID_JSON");
    }
    const messages = parseMessages(
      payload,
      process.env.WHATSAPP_OWNER_PHONE,
      process.env.WHATSAPP_PHONE_NUMBER_ID,
    );
    for (const message of messages) {
      const { error } = await backend().rpc("backend_accept_message", {
        p_id: message.id,
        p_sender: message.from,
        p_payload: message,
      });
      if (error) throw error;
    }
    return { received: true };
  });
}
