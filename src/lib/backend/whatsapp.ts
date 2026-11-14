import "server-only";
import { backend, required } from "./client";
import { type OwnerMessage } from "./security";
import { parseConfirmation, formatPreview } from "./assistant-contract";
import { interpret } from "./interpreter";
import { validateDocument } from "./content";
import { validatePublication } from "./service";
import { importWhatsAppImage } from "./whatsapp-media";
function joinedKind(value: { kind: string } | { kind: string }[]) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row) throw new Error("NOT_FOUND");
  return row.kind;
}
export type Reply = { text: string; actionId?: string };
export async function handleOwnerMessage(
  message: OwnerMessage,
): Promise<Reply> {
  if (message.from !== required("WHATSAPP_OWNER_PHONE"))
    throw new Error("UNAUTHORIZED");
  const db = backend();
  const owner = required("OWNER_USER_ID");
  const inbox = await db
    .from("backend_inbox")
    .select("result,sequence")
    .eq("provider_id", message.id)
    .single();
  if (inbox.error) throw inbox.error;
  if (inbox.data.result) return inbox.data.result as Reply;
  const prepared = await db
    .from("backend_pending_actions")
    .select("id,draft_id,backend_drafts(data,backend_documents(kind))")
    .eq("source_message", message.id)
    .eq("owner_id", owner)
    .maybeSingle();
  if (prepared.error) throw prepared.error;
  if (prepared.data) {
    const record = prepared.data as unknown as {
      id: string;
      backend_drafts: {
        data: Record<string, unknown>;
        backend_documents: { kind: string };
      };
    };
    const preview = formatPreview(
      record.backend_drafts.backend_documents.kind,
      record.backend_drafts.data,
    );
    const reply: Reply =
      preview.length > 900
        ? { text: "Your saved draft is ready for review in the dashboard." }
        : { text: preview + "\nPublish this change?", actionId: record.id };
    const saved = await db
      .from("backend_inbox")
      .update({ result: reply })
      .eq("provider_id", message.id);
    if (saved.error) throw saved.error;
    return reply;
  }
  const text =
    message.text?.body ??
    message.interactive?.button_reply?.id ??
    message.image?.caption ??
    "";
  const confirmation = parseConfirmation(text);
  let reply: Reply;
  if (confirmation) {
    const action = await db
      .from("backend_pending_actions")
      .select("draft_id")
      .eq("id", confirmation.id)
      .eq("owner_id", owner)
      .eq("sender", message.from)
      .single();
    if (action.error || !action.data)
      return {
        text: "That confirmation is not available. Please start the change again.",
      };
    if (confirmation.verb === "publish") {
      const draft = await db
        .from("backend_drafts")
        .select("data,backend_documents(kind)")
        .eq("id", action.data.draft_id)
        .single();
      if (draft.error) throw draft.error;
      await validatePublication(
        joinedKind(draft.data.backend_documents),
        draft.data.data,
      );
    }
    const r = await db.rpc("backend_confirm_action", {
      p_action: confirmation.id,
      p_owner: owner,
      p_sender: message.from,
      p_cancel: confirmation.verb === "cancel",
    });
    if (r.error) {
      if (
        /REVISION_CONFLICT|ACTION_EXPIRED|ACTION_CANCELLED/.test(
          r.error.message,
        )
      )
        reply = {
          text: "This draft expired, was cancelled, or the content changed. Please repeat your change so I can show the latest details.",
        };
      else throw r.error;
    } else
      reply = {
        text: r.data.cancelled
          ? "Cancelled. Nothing was published."
          : `Published revision ${r.data.revision}. Public refresh is queued. You can review the change in the dashboard.`,
      };
  } else {
    const attachmentId =
      message.type === "image" ? await importWhatsAppImage(message) : null;
    if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL)
      return {
        text: "The management assistant is not connected to its language service yet. Existing drafts can still be confirmed; use the owner dashboard for new changes.",
      };
    const docs = await db
      .from("backend_documents")
      .select("id,kind,revision,published")
      .eq("archived", false)
      .limit(250);
    if (docs.error) throw docs.error;
    const history = await db
      .from("backend_inbox")
      .select("payload,result,asset_id")
      .eq("sender", message.from)
      .lt("sequence", inbox.data.sequence)
      .not("result", "is", null)
      .order("sequence", { ascending: false })
      .limit(8);
    if (history.error) throw history.error;
    const proposed = await interpret(
      text || "I sent a picture. Ask which product or new product it is for.",
      { attachmentId, documents: docs.data, history: history.data.reverse() },
    );
    if (proposed.action === "question")
      reply = {
        text: proposed.question || "Which fabric would you like to update?",
      };
    else {
      if (
        !proposed.kind ||
        proposed.baseRevision === null ||
        !proposed.dataJson
      )
        throw new Error("INVALID_AI_ACTION");
      const data = validateDocument(
        proposed.kind,
        JSON.parse(proposed.dataJson),
      );
      const r = await db.rpc("backend_prepare_action", {
        p_message: message.id,
        p_owner: owner,
        p_sender: message.from,
        p_kind: proposed.kind,
        p_id: proposed.id,
        p_base: proposed.baseRevision,
        p_data: data,
      });
      if (r.error) throw r.error;
      const actionId = r.data[0].action_id as string;
      const stored = await db
        .from("backend_drafts")
        .select("data,backend_documents(kind)")
        .eq("id", r.data[0].draft_id)
        .single();
      if (stored.error) throw stored.error;
      const preview = formatPreview(
        joinedKind(stored.data.backend_documents),
        stored.data.data,
      );
      // Do not truncate a proposed edit and ask the owner to approve unseen fields.
      reply =
        preview.length > 900
          ? {
              text: "The draft is saved. It is too long to review safely in chat; please review and publish it through the dashboard.",
            }
          : { text: preview + "\nPublish this change?", actionId };
    }
  }
  const r = await db
    .from("backend_inbox")
    .update({ result: reply })
    .eq("provider_id", message.id);
  if (r.error) throw r.error;
  return reply;
}
export async function sendReply(to: string, reply: Reply) {
  if (to !== required("WHATSAPP_OWNER_PHONE")) throw new Error("UNAUTHORIZED");
  const version = required("WHATSAPP_API_VERSION");
  if (!/^v\d+\.\d+$/.test(version)) throw new Error("INVALID_API_VERSION");
  const payload = reply.actionId
    ? {
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: reply.text },
          action: {
            buttons: [
              {
                type: "reply",
                reply: { id: `publish ${reply.actionId}`, title: "Publish" },
              },
              {
                type: "reply",
                reply: { id: `cancel ${reply.actionId}`, title: "Cancel" },
              },
            ],
          },
        },
      }
    : { type: "text", text: { body: reply.text } };
  const r = await fetch(
    `https://graph.facebook.com/${version}/${required("WHATSAPP_PHONE_NUMBER_ID")}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${required("WHATSAPP_ACCESS_TOKEN")}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ messaging_product: "whatsapp", to, ...payload }),
    },
  );
  if (!r.ok) throw new Error("WHATSAPP_DELIVERY_FAILED");
  return r.json();
}
