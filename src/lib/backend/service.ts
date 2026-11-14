import "server-only";
import { z } from "zod";
import { backend } from "./client";
import { validateDocument, mediaIds } from "./content";
import { assertPublishable } from "./media-validation";
import {
  ProductSchema,
  type ProductRow,
  type Filters,
  filterProducts,
} from "./domain";
import { type Actor, requireOwnerIdentity } from "./security";
function checkActor(actor: Actor) {
  requireOwnerIdentity(actor.ownerId, process.env.OWNER_USER_ID);
}
function check(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
export const DraftInput = z
  .object({
    kind: z.enum([
      "product",
      "category",
      "collection",
      "style",
      "home",
      "store",
      "story",
      "help",
      "calculator",
    ]),
    id: z.string().uuid().nullable().default(null),
    baseRevision: z.number().int().nonnegative(),
    data: z.record(z.string(), z.unknown()),
  })
  .strict();
export async function saveDraft(
  actor: Actor,
  input: z.infer<typeof DraftInput>,
) {
  checkActor(actor);
  const data = validateDocument(input.kind, input.data);
  const r = await backend().rpc("backend_save_draft", {
    p_owner: actor.ownerId,
    p_kind: input.kind,
    p_id: input.id,
    p_base: input.baseRevision,
    p_data: data,
  });
  check(r.error);
  return r.data[0] as { draft_id: string; document_id: string };
}
export async function publishDraft(actor: Actor, draftId: string) {
  checkActor(actor);
  const db = backend();
  const { data: d, error } = await db
    .from("backend_drafts")
    .select("*,backend_documents(kind)")
    .eq("id", draftId)
    .eq("owner_id", actor.ownerId)
    .single();
  check(error);
  if (!d) throw new Error("NOT_FOUND");
  await validatePublication(d.backend_documents.kind, d.data);
  const r = await db.rpc("backend_publish", {
    p_owner: actor.ownerId,
    p_draft: draftId,
  });
  check(r.error);
  return { ...r.data[0], refresh: "pending" };
}
export async function validatePublication(kind: string, input: unknown) {
  const data = validateDocument(kind, input);
  const ids = mediaIds(data);
  const db = backend();
  const r = ids.length
    ? await db
        .from("backend_media")
        .select("id,mime,purpose")
        .in("id", ids)
        .eq("state", "ready")
    : { data: [], error: null };
  check(r.error);
  assertPublishable(kind, data, r.data ?? []);
}
export async function undoRevision(
  actor: Actor,
  id: string,
  expectedRevision: number,
) {
  checkActor(actor);
  const db = backend();
  const previous = await db
    .from("backend_revisions")
    .select("data")
    .eq("document_id", id)
    .eq("revision", expectedRevision - 1)
    .single();
  check(previous.error);
  if (!previous.data) throw new Error("NOT_FOUND");
  const doc = await db
    .from("backend_documents")
    .select("kind")
    .eq("id", id)
    .single();
  check(doc.error);
  if (!doc.data) throw new Error("NOT_FOUND");
  await validatePublication(doc.data.kind, previous.data.data);
  const r = await db.rpc("backend_undo", {
    p_owner: actor.ownerId,
    p_id: id,
    p_expected: expectedRevision,
  });
  check(r.error);
  return { ...r.data, refresh: "pending" };
}
export async function setArchived(
  actor: Actor,
  id: string,
  expectedRevision: number,
  archived: boolean,
) {
  checkActor(actor);
  const r = await backend().rpc("backend_set_archived", {
    p_owner: actor.ownerId,
    p_id: id,
    p_expected: expectedRevision,
    p_archived: archived,
  });
  check(r.error);
  return { ...r.data, refresh: "pending" };
}
export async function listProducts(
  filters: Filters = {},
): Promise<ProductRow[]> {
  const db = backend();
  const all: ProductRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const r = await db
      .from("public_catalogue")
      .select("*")
      .order("id")
      .range(offset, offset + 499);
    check(r.error);
    for (const row of r.data ?? [])
      all.push({
        id: row.id,
        revision: row.revision,
        firstPublishedAt: row.first_published_at,
        data: ProductSchema.parse(row.data),
      });
    if ((r.data?.length ?? 0) < 500) break;
  }
  return filterProducts(all, filters);
}
export async function getProduct(id: string) {
  const r = await backend()
    .from("public_catalogue")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  check(r.error);
  if (!r.data) throw new Error("NOT_FOUND");
  return {
    id: r.data.id,
    revision: r.data.revision,
    firstPublishedAt: r.data.first_published_at,
    data: ProductSchema.parse(r.data.data),
  };
}
export async function readContent(kind: string) {
  const r = await backend().from("public_content").select("*").eq("kind", kind);
  check(r.error);
  const products = await listProducts();
  const available = new Set(products.map((p) => p.id));
  return (r.data ?? []).map((row) => {
    const data = { ...row.data };
    for (const key of ["productIds", "featuredProductIds"])
      if (Array.isArray(data[key]))
        data[key] = data[key].filter((id: string) => available.has(id));
    return { ...row, data };
  });
}
export async function rateLimit(key: string, limit: number, seconds: number) {
  const r = await backend().rpc("backend_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_seconds: seconds,
  });
  check(r.error);
  if (!r.data) throw new Error("RATE_LIMITED");
}
