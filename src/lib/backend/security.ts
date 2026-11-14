import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
export type Actor = { ownerId: string; channel: "dashboard" | "whatsapp" };
export function requireOwnerIdentity(
  actual: string | null,
  owner: string | undefined,
): Actor {
  if (!actual || !owner || actual !== owner) throw new Error("UNAUTHORIZED");
  return { ownerId: actual, channel: "dashboard" };
}
export function verifySignature(
  raw: string,
  signature: string | null,
  secret: string | undefined,
) {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature))
    return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"));
}
const Message = z.object({
  id: z.string().min(1).max(300),
  from: z.string().max(30),
  type: z.enum(["text", "image", "interactive"]),
  text: z.object({ body: z.string().max(10000) }).optional(),
  image: z
    .object({
      id: z.string(),
      caption: z.string().max(10000).optional(),
      mime_type: z.string().optional(),
    })
    .optional(),
  interactive: z
    .object({
      button_reply: z.object({ id: z.string(), title: z.string() }).optional(),
    })
    .optional(),
});
export type OwnerMessage = z.infer<typeof Message>;
const Payload = z.object({
  entry: z
    .array(
      z.object({
        changes: z.array(
          z.object({
            value: z.object({
              metadata: z.object({ phone_number_id: z.string() }).optional(),
              messages: z.array(z.unknown()).optional(),
            }),
          }),
        ),
      }),
    )
    .optional(),
});
export function parseMessages(
  payload: unknown,
  owner: string | undefined,
  businessPhone: string | undefined,
): OwnerMessage[] {
  if (!owner || !businessPhone) return [];
  const p = Payload.safeParse(payload);
  if (!p.success) return [];
  return (p.data.entry ?? [])
    .flatMap((e) => e.changes)
    .filter((c) => c.value.metadata?.phone_number_id === businessPhone)
    .flatMap((c) => c.value.messages ?? [])
    .flatMap((m) => {
      const v = Message.safeParse(m);
      return v.success && v.data.from === owner ? [v.data] : [];
    });
}
