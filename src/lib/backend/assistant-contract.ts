import { z } from "zod";
export const ActionSchema = z
  .object({
    action: z.enum(["question", "draft"]),
    question: z.string().max(2000).nullable(),
    kind: z.enum(["product", "home", "store", "story", "help"]).nullable(),
    id: z.string().uuid().nullable(),
    baseRevision: z.number().int().nonnegative().nullable(),
    dataJson: z.string().max(30000).nullable(),
  })
  .strict();
export function parseConfirmation(text: string) {
  const match = /^(publish|cancel) ([0-9a-f-]{36})$/i.exec(text.trim());
  if (!match || !z.string().uuid().safeParse(match[2]).success) return null;
  return { verb: match[1].toLowerCase() as "publish" | "cancel", id: match[2] };
}
export function formatPreview(kind: string, data: Record<string, unknown>) {
  return `Review ${kind} draft:\n${JSON.stringify(data, null, 2)}`;
}
