import "server-only";
import { randomUUID } from "node:crypto";
import { backend } from "./client";
import { handleOwnerMessage, sendReply } from "./whatsapp";
export async function runJobs() {
  const db = backend();
  const token = randomUUID();
  const lock = await db.rpc("backend_acquire_worker", { p_token: token });
  if (lock.error) throw lock.error;
  if (!lock.data) return { busy: true, processed: 0 };
  let processed = 0;
  try {
    const claimed = await db.rpc("backend_claim_jobs", { p_limit: 1 });
    if (claimed.error) throw claimed.error;
    for (const job of claimed.data ?? []) {
      try {
        if (job.kind === "refresh") {
          // Public backend reads are no-store. Frontend cache integration is separate.
        } else if (job.kind === "inbox") {
          const inbox = await db
            .from("backend_inbox")
            .select("payload,sender")
            .eq("provider_id", job.payload.providerId)
            .single();
          if (inbox.error) throw inbox.error;
          const reply = await handleOwnerMessage(inbox.data.payload);
          const insert = await db
            .from("backend_jobs")
            .upsert(
              {
                kind: "reply",
                payload: { sender: inbox.data.sender, reply },
                dedupe_key: `reply:${job.payload.providerId}`,
              },
              { onConflict: "dedupe_key", ignoreDuplicates: true },
            );
          if (insert.error) throw insert.error;
        } else if (job.kind === "reply") {
          await sendReply(job.payload.sender, job.payload.reply);
        }
        const done = await db
          .from("backend_jobs")
          .update({ state: "done", lease_until: null, last_error: null })
          .eq("id", job.id)
          .eq("lease_token", job.lease_token);
        if (done.error) throw done.error;
        processed++;
      } catch (error) {
        const message = error instanceof Error ? error.message : "JOB_FAILED";
        const result = await db
          .from("backend_jobs")
          .update({
            state: job.attempts >= 5 ? "failed" : "pending",
            last_error: message.slice(0, 500),
            lease_until: null,
            available_at: new Date(
              Date.now() + Math.min(300, 2 ** job.attempts) * 1000,
            ).toISOString(),
          })
          .eq("id", job.id)
          .eq("lease_token", job.lease_token);
        if (result.error) throw result.error;
      }
    }
    return { processed };
  } finally {
    await db.rpc("backend_release_worker", { p_token: token });
  }
}
