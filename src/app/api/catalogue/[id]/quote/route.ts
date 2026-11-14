import { z } from "zod";
import { handle, body } from "@/lib/backend/http";
import { getProduct, readContent } from "@/lib/backend/service";
import { SelectionSchema, quote, buildSalesLink } from "@/lib/backend/domain";
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const input = SelectionSchema.extend({
      expectedRevision: z.number().int().positive().optional(),
    }).parse(await body(request));
    const p = await getProduct(
      z
        .string()
        .uuid()
        .parse((await ctx.params).id),
    );
    const q = quote(p, input);
    const changed =
      input.expectedRevision !== undefined &&
      input.expectedRevision !== p.revision;
    if (changed) return { ...q, changed: true, requiresConfirmation: true };
    const colour = p.data.colours.find((c) => c.id === input.colourId)!;
    const amount =
      q.totalMinor === null
        ? "What is the price?"
        : `Estimated total: NGN ${(q.totalMinor / 100).toLocaleString("en-NG")}.`;
    const message = `Hello Gannyland, I’m interested in ${p.data.name} (${p.data.reference}), ${colour.name}, ${input.quantity} ${q.unit === "yard" ? "yards" : "trouser lengths"}. ${amount} Please confirm availability.`;
    const store = (await readContent("store"))[0]?.data;
    return {
      ...q,
      changed: false,
      message,
      whatsappUrl: store?.whatsapp
        ? buildSalesLink(store.whatsapp, message)
        : null,
    };
  });
}
