// @vitest-environment node
import { Pool } from "pg";
import { beforeAll, afterAll, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
const url = new URL(
  process.env.TEST_DATABASE_URL ||
    "postgresql://127.0.0.1:55439/gannyland_test",
);
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.pathname !== "/gannyland_test"
)
  throw new Error(
    "Refusing destructive tests outside local gannyland_test database",
  );
const pool = new Pool({ connectionString: url.toString() });
const owner = "11111111-1111-4111-8111-111111111111";
beforeAll(async () => {
  await pool.query(
    "drop schema if exists public cascade; create schema public; grant usage on schema public to public",
  );
  const path = "supabase/migrations/202611130001_backend.sql";
  if (existsSync(path)) await pool.query(readFileSync(path, "utf8"));
  const assistant = "supabase/migrations/202611130003_assistant.sql";
  if (existsSync(assistant)) await pool.query(readFileSync(assistant, "utf8"));
  const fixes = "supabase/migrations/202611130004_review_fixes.sql";
  if (existsSync(fixes)) await pool.query(readFileSync(fixes, "utf8"));
});
afterAll(() => pool.end());
it("publishes atomically, rejects stale changes and hides drafts and sold-out", async () => {
  const {
    rows: [r],
  } = await pool.query(
    "select * from backend_save_draft($1,'product',null,0,$2)",
    [
      owner,
      {
        name: "Test",
        slug: "test",
        availability: "in_stock",
        images: [],
        sellingOptions: [],
      },
    ],
  );
  expect(
    (await pool.query("select * from public_catalogue")).rows,
  ).toHaveLength(0);
  const {
    rows: [a],
  } = await pool.query("select * from backend_publish($1,$2)", [
    owner,
    r.draft_id,
  ]);
  expect(a.revision).toBe(1);
  expect(
    (await pool.query("select * from public_catalogue")).rows,
  ).toHaveLength(1);
  expect(
    (
      await pool.query("select * from backend_publish($1,$2)", [
        owner,
        r.draft_id,
      ])
    ).rows[0].revision,
  ).toBe(1);
  const first = await pool.query(
    "select * from backend_save_draft($1,'product',$2,1,$3)",
    [
      owner,
      r.document_id,
      { name: "Test", slug: "test", availability: "out_of_stock" },
    ],
  );
  const stale = await pool.query(
    "select * from backend_save_draft($1,'product',$2,1,$3)",
    [
      owner,
      r.document_id,
      { name: "Stale", slug: "test", availability: "in_stock" },
    ],
  );
  await pool.query("select * from backend_publish($1,$2)", [
    owner,
    first.rows[0].draft_id,
  ]);
  await expect(
    pool.query("select * from backend_publish($1,$2)", [
      owner,
      stale.rows[0].draft_id,
    ]),
  ).rejects.toThrow("REVISION_CONFLICT");
  expect(
    (await pool.query("select * from public_catalogue")).rows,
  ).toHaveLength(0);
  expect(
    (await pool.query("select * from backend_jobs where kind='refresh'")).rows,
  ).toHaveLength(2);
});
it("denies anonymous access to private data and privileged RPCs", async () => {
  const c = await pool.connect();
  try {
    await c.query("set role anon");
    await expect(c.query("select * from backend_drafts")).rejects.toThrow(
      "permission denied",
    );
    await expect(
      c.query("select * from backend_publish($1,$2)", [owner, owner]),
    ).rejects.toThrow("permission denied");
    expect((await c.query("select * from public_catalogue")).rows).toHaveLength(
      0,
    );
  } finally {
    await c.query("reset role");
    c.release();
  }
});
it("claims jobs with leases and never concurrently claims the same job", async () => {
  const a = await pool.query("select * from backend_claim_jobs(1)");
  const b = await pool.query("select * from backend_claim_jobs(1)");
  expect(a.rows).toHaveLength(1);
  expect(b.rows).toHaveLength(1);
  expect(a.rows[0].id).not.toBe(b.rows[0].id);
});
it("deduplicates incoming provider messages", async () => {
  await pool.query(
    "insert into backend_inbox(provider_id,sender,payload) values('m1','123','{}') on conflict do nothing",
  );
  await pool.query(
    "insert into backend_inbox(provider_id,sender,payload) values('m1','123','{}') on conflict do nothing",
  );
  expect((await pool.query("select * from backend_inbox")).rows).toHaveLength(
    1,
  );
});

it("serialises workers and makes assistant action preparation idempotent", async () => {
  const token = "22222222-2222-4222-8222-222222222222";
  expect(
    (await pool.query("select backend_acquire_worker($1) as locked", [token]))
      .rows[0].locked,
  ).toBe(true);
  expect(
    (await pool.query("select backend_acquire_worker($1) as locked", [owner]))
      .rows[0].locked,
  ).toBe(false);
  await pool.query("select backend_release_worker($1)", [token]);
  await pool.query(
    "insert into backend_inbox(provider_id,sender,payload) values('prepare','owner','{}')",
  );
  const params = [
    "prepare",
    owner,
    "owner",
    "product",
    null,
    0,
    { name: "Safe", slug: "safe", availability: "in_stock" },
  ];
  const a = (
    await pool.query(
      "select * from backend_prepare_action($1,$2,$3,$4,$5,$6,$7)",
      params,
    )
  ).rows[0];
  const b = (
    await pool.query(
      "select * from backend_prepare_action($1,$2,$3,$4,$5,$6,$7)",
      params,
    )
  ).rows[0];
  expect(a).toEqual(b);
  await expect(
    pool.query("select backend_confirm_action($1,$2,$3,false)", [
      a.action_id,
      owner,
      "stranger",
    ]),
  ).rejects.toThrow("NOT_FOUND");
  const result = await pool.query(
    "select backend_confirm_action($1,$2,$3,false) as result",
    [a.action_id, owner, "owner"],
  );
  expect(result.rows[0].result.revision).toBe(1);
  const repeat = await pool.query(
    "select backend_confirm_action($1,$2,$3,false) as result",
    [a.action_id, owner, "owner"],
  );
  expect(repeat.rows[0].result.revision).toBe(1);
});
it("does not process a later inbox message before an earlier retry", async () => {
  await pool.query("delete from backend_jobs");
  await pool.query(
    "insert into backend_jobs(kind,payload,available_at,created_at) values('inbox','{\"providerId\":\"earlier\"}',now()+interval '1 hour',now()-interval '1 minute'),('inbox','{\"providerId\":\"later\"}',now(),now())",
  );
  expect(
    (await pool.query("select * from backend_claim_jobs(1)")).rows,
  ).toHaveLength(0);
});
it("terminalises a crashed final job attempt", async () => {
  await pool.query("delete from backend_jobs");
  await pool.query(
    "insert into backend_jobs(kind,payload,state,attempts,lease_until) values('reply','{}','running',5,now()-interval '1 minute')",
  );
  await pool.query("select * from backend_claim_jobs(1)");
  expect(
    (await pool.query("select state from backend_jobs")).rows[0].state,
  ).toBe("failed");
});
it("does not expose raw editorial references through anonymous database access", async () => {
  const c = await pool.connect();
  try {
    await c.query("set role anon");
    await expect(c.query("select * from public_content")).rejects.toThrow(
      "permission denied",
    );
  } finally {
    await c.query("reset role");
    c.release();
  }
});

it("archives and restores with audited revisions, conflict checks and undo", async () => {
  const d = (
    await pool.query(
      "select * from backend_save_draft($1,'product',null,0,$2)",
      [owner, { slug: "archive-me", availability: "in_stock" }],
    )
  ).rows[0];
  await pool.query("select * from backend_publish($1,$2)", [owner, d.draft_id]);
  await pool.query("select backend_set_archived($1,$2,1,true)", [
    owner,
    d.document_id,
  ]);
  expect(
    (
      await pool.query("select * from public_catalogue where id=$1", [
        d.document_id,
      ])
    ).rows,
  ).toHaveLength(0);
  await expect(
    pool.query("select backend_set_archived($1,$2,1,false)", [
      owner,
      d.document_id,
    ]),
  ).rejects.toThrow("REVISION_CONFLICT");
  await pool.query("select backend_undo($1,$2,2)", [owner, d.document_id]);
  expect(
    (
      await pool.query("select revision from public_catalogue where id=$1", [
        d.document_id,
      ])
    ).rows[0].revision,
  ).toBe(3);
});
