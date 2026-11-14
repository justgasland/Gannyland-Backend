import "server-only";
import { randomUUID } from "node:crypto";
import { backend } from "./client";
import { type Actor, requireOwnerIdentity } from "./security";
import { validateUpload, validateMediaBytes } from "./media-validation";
import { mediaIds } from "./content";
export const BUCKET = "gannyland-media";
export async function requestUpload(actor: Actor, input: unknown) {
  requireOwnerIdentity(actor.ownerId, process.env.OWNER_USER_ID);
  const v = validateUpload(input);
  const id = randomUUID();
  const ext = v.mime.split("/")[1];
  const path = `${actor.ownerId}/${id}.${ext}`;
  const db = backend();
  const { error } = await db
    .from("backend_media")
    .insert({ id, owner_id: actor.ownerId, object_path: path, ...v });
  if (error) throw error;
  const r = await db.storage.from(BUCKET).createSignedUploadUrl(path);
  if (r.error) throw r.error;
  return {
    assetId: id,
    path,
    token: r.data.token,
    signedUrl: r.data.signedUrl,
  };
}
export async function finishUpload(actor: Actor, id: string) {
  requireOwnerIdentity(actor.ownerId, process.env.OWNER_USER_ID);
  const db = backend();
  const r = await db
    .from("backend_media")
    .select("*")
    .eq("id", id)
    .eq("owner_id", actor.ownerId)
    .single();
  if (r.error || !r.data) throw new Error("NOT_FOUND");
  const file = await db.storage.from(BUCKET).download(r.data.object_path);
  if (file.error || !file.data) throw new Error("INVALID_UPLOAD_MISSING");
  const valid =
    file.data.size === r.data.bytes &&
    validateMediaBytes(
      r.data.mime,
      new Uint8Array(await file.data.slice(0, 32).arrayBuffer()),
    );
  if (!valid) {
    await db.storage.from(BUCKET).remove([r.data.object_path]);
    throw new Error("INVALID_MEDIA_BYTES");
  }
  const update = await db
    .from("backend_media")
    .update({ state: "ready" })
    .eq("id", id);
  if (update.error) throw update.error;
  return { assetId: id, state: "ready" };
}
export async function publicMediaUrl(id: string) {
  const db = backend();
  const docs = await db
    .from("backend_documents")
    .select("kind,published")
    .eq("archived", false)
    .not("published", "is", null);
  if (docs.error) throw docs.error;
  const visible = (docs.data ?? []).some(
    (d) =>
      (d.kind !== "product" || d.published.availability !== "out_of_stock") &&
      mediaIds(d.published).includes(id),
  );
  if (!visible) throw new Error("NOT_FOUND");
  const asset = await db
    .from("backend_media")
    .select("object_path")
    .eq("id", id)
    .eq("state", "ready")
    .single();
  if (asset.error || !asset.data) throw new Error("NOT_FOUND");
  const r = await db.storage
    .from(BUCKET)
    .createSignedUrl(asset.data.object_path, 60);
  if (r.error) throw r.error;
  return { url: r.data.signedUrl, expiresIn: 60 };
}
export async function ownerMediaUrl(actor: Actor, id: string) {
  requireOwnerIdentity(actor.ownerId, process.env.OWNER_USER_ID);
  const db = backend();
  const asset = await db
    .from("backend_media")
    .select("object_path,state,mime,purpose")
    .eq("id", id)
    .eq("owner_id", actor.ownerId)
    .single();
  if (asset.error || !asset.data) throw new Error("NOT_FOUND");
  if (asset.data.state !== "ready") throw new Error("INVALID_MEDIA_NOT_READY");
  const signed = await db.storage
    .from(BUCKET)
    .createSignedUrl(asset.data.object_path, 300);
  if (signed.error) throw signed.error;
  return {
    assetId: id,
    mime: asset.data.mime,
    purpose: asset.data.purpose,
    url: signed.data.signedUrl,
    expiresIn: 300,
  };
}
