import "server-only";
import { backend, required } from "./client";
import { requestUpload, finishUpload, BUCKET } from "./media";
import { type OwnerMessage } from "./security";
import { validateUpload } from "./media-validation";
export async function importWhatsAppImage(message: OwnerMessage) {
  if (!message.image || message.from !== required("WHATSAPP_OWNER_PHONE"))
    throw new Error("UNAUTHORIZED");
  const db = backend();
  const owner = required("OWNER_USER_ID");
  const actor = { ownerId: owner, channel: "whatsapp" as const };
  const inbox = await db
    .from("backend_inbox")
    .select("asset_id")
    .eq("provider_id", message.id)
    .single();
  if (inbox.error) throw inbox.error;
  if (inbox.data.asset_id) {
    const asset = await db
      .from("backend_media")
      .select("state")
      .eq("id", inbox.data.asset_id)
      .single();
    if (asset.data?.state === "ready") return inbox.data.asset_id as string;
  }
  const version = required("WHATSAPP_API_VERSION");
  if (!/^v\d+\.\d+$/.test(version) || !/^\d+$/.test(message.image.id))
    throw new Error("INVALID_PROVIDER_MEDIA");
  const headers = {
    Authorization: `Bearer ${required("WHATSAPP_ACCESS_TOKEN")}`,
  };
  const response = await fetch(
    `https://graph.facebook.com/${version}/${message.image.id}`,
    { headers, signal: AbortSignal.timeout(15000), redirect: "error" },
  );
  if (!response.ok) throw new Error("MEDIA_DOWNLOAD_FAILED");
  const metadata = await response.json();
  validateUpload({
    mime: metadata.mime_type,
    bytes: metadata.file_size,
    purpose: "image",
  });
  const url = new URL(metadata.url);
  if (
    url.protocol !== "https:" ||
    !["lookaside.fbsbx.com", "lookaside.facebook.com"].includes(url.hostname)
  )
    throw new Error("INVALID_PROVIDER_MEDIA_URL");
  const downloaded = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  if (!downloaded.ok || !downloaded.body)
    throw new Error("MEDIA_DOWNLOAD_FAILED");
  const reader = downloaded.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const r = await reader.read();
    if (r.done) break;
    size += r.value.length;
    if (size > 52428800) {
      await reader.cancel();
      throw new Error("INVALID_MEDIA_SIZE");
    }
    chunks.push(r.value);
  }
  if (size !== metadata.file_size) throw new Error("INVALID_MEDIA_SIZE");
  let assetId: string = inbox.data.asset_id;
  let path: string;
  if (assetId) {
    const asset = await db
      .from("backend_media")
      .select("object_path")
      .eq("id", assetId)
      .single();
    if (!asset.data) throw new Error("NOT_FOUND");
    path = asset.data.object_path;
  } else {
    const upload = await requestUpload(actor, {
      mime: metadata.mime_type,
      bytes: size,
      purpose: "image",
    });
    assetId = upload.assetId;
    path = upload.path;
    const r = await db
      .from("backend_inbox")
      .update({ asset_id: assetId })
      .eq("provider_id", message.id);
    if (r.error) throw r.error;
  }
  const saved = await db.storage
    .from(BUCKET)
    .upload(path, Buffer.concat(chunks), {
      contentType: metadata.mime_type,
      upsert: true,
    });
  if (saved.error) throw saved.error;
  await finishUpload(actor, assetId);
  return assetId;
}
