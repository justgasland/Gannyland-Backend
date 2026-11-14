# Gannyland backend

The backend is an independent API-only Next.js application in `gannyland/backend/`, with its own package, lockfile, environment, tests and build. It runs on port 4000. The existing frontend is in `gannyland/frontend/` and runs independently on port 3000. No frontend page or component is changed by this implementation. The previous static catalogue is **not yet connected** to these APIs.

## Local checks

```sh
cd backend
npm install
npm test
npm run test:integration
npm run typecheck
npm run lint
npm run build
```

Integration tests create and destroy their own loopback PostgreSQL cluster and a database named `gannyland_test`. Set `PG_BIN` if PostgreSQL binaries are not at `/opt/homebrew/opt/postgresql@18/bin`. Docker and a live Supabase project are not required for these tests. The database test refuses a non-loopback host or another database name before resetting its schema.

## Activate a Supabase project

1. Create/select the intended Supabase project. Apply the four files in `supabase/migrations/` in filename order using the project's normal migration workflow. The storage migration needs Supabase's `storage` schema; plain PostgreSQL tests deliberately cover application SQL, not hosted Auth/Storage.
2. Create the single owner through Supabase Auth administration. Disable public signups. Set `OWNER_USER_ID` to that user's UUID. A second authenticated user has no management access.
3. Copy `.env.example` to `.env.local`; fill values locally. Never paste service-role keys, Meta access tokens, model keys or passwords into Git or browser code.
4. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are backend values. The future dashboard can use the Supabase public/publishable key to sign in and send the resulting access token as `Authorization: Bearer <access_token>` to owner APIs. The server verifies it with Supabase Auth and matches the configured owner UUID on every management request.
5. Configure `gannyland-media` as the private bucket created by migration. There are no public or anonymous write policies. Uploads start with an owner-authorised signed URL; completion checks the stored length and file signature. Only assets referenced by visible published content receive short-lived public signed URLs.
6. Create catalogue/content through the owner API, review the resulting draft, then publish it. No sample business facts, products or calculator yardages are inserted into production.

Missing configuration returns a controlled error rather than silently using demo data. `/api/health` reports process health only, not connectivity readiness.

## Owner API

All endpoints below require the owner's Supabase bearer token. Data uses `src/lib/backend/domain.ts` and `content.ts` schemas. Unknown fields are rejected.

| Method/path                             | Purpose                                                          |
| --------------------------------------- | ---------------------------------------------------------------- |
| GET `/api/admin/documents`              | Current private records (up to 500)                              |
| POST `/api/admin/documents`             | Save a validated draft; never publishes                          |
| GET `/api/admin/drafts`                 | Pending owner drafts                                             |
| POST `/api/admin/drafts/:id/publish`    | Publish a reviewed draft with revision checks                    |
| POST `/api/admin/documents/:id/archive` | Archive/restore with expectedRevision and archived boolean       |
| POST `/api/admin/documents/:id/undo`    | Restore preceding published content, guarded by expectedRevision |
| GET `/api/admin/media`                  | Owner media list                                                 |
| GET `/api/admin/media/:id`              | Owner-only private draft preview URL                             |
| POST `/api/admin/media`                 | Obtain a private signed upload URL                               |
| POST `/api/admin/media/:id/complete`    | Validate upload and mark ready                                   |
| POST `/api/admin/jobs/:id/retry`        | Retry a failed job after its underlying issue is resolved        |
| GET `/api/admin/activity`               | Recent revisions and job statuses                                |

Example draft payload (image IDs must come from the media API):

```json
{
  "kind": "product",
  "id": null,
  "baseRevision": 0,
  "data": {
    "name": "Midnight Twill",
    "slug": "midnight-twill",
    "reference": "GF-001",
    "category": "suit-fabrics",
    "description": "Owner-supplied description",
    "colours": [{ "id": "navy", "name": "Navy", "hex": "#101B38" }],
    "availability": "in_stock",
    "images": [],
    "sellingOptions": [
      {
        "id": "yard",
        "unit": "yard",
        "priceMode": "exact",
        "amountMinor": 2800000
      },
      {
        "id": "length",
        "unit": "trouser_length",
        "priceMode": "enquiry",
        "amountMinor": null,
        "lengthInches": 45
      }
    ]
  }
}
```

`id:null` creates a new private record. To edit, use its UUID and current `revision`; supply the complete replacement document, not an arbitrary SQL/JSON patch. A stale revision returns 409. Prices are in kobo (₦28,000 = 2,800,000 kobo). Colour objects cannot carry separate prices or stock. Yard quantities advance by 0.5; trouser lengths by 1. Public content excludes out-of-stock products.

Publishing and refresh are separate. The database atomically stores the snapshot, revision and refresh job. Responses report refresh pending. Repeating publication of the same draft does not increment the revision again. Current public APIs use `no-store`; the worker acknowledges refresh jobs. It does not invalidate the separate frontend; that integration is not configured.

## Public API

| Method/path                     | Purpose                                                                   |
| ------------------------------- | ------------------------------------------------------------------------- |
| GET `/api/catalogue`            | Search/filter/page available products                                     |
| GET `/api/catalogue/:id`        | Current detail, new-label status and related fabrics                      |
| POST `/api/catalogue/:id/quote` | Validate selected colour/unit/quantity and prepare enquiry                |
| GET `/api/content/:kind`        | Published category, collection, style, home, store, story or help records |
| POST `/api/calculator`          | Approved chart estimate and disclaimer                                    |
| GET `/api/media/:id`            | 60-second URL for a visible published asset                               |
| POST `/api/events`              | Rate-limited WhatsApp-link click event, never a sale                      |

Catalogue parameters: `search`, `category`, `colour`, `unit`, `minMinor`, `maxMinor`, `offset`, `limit` (1–100). There is no occasion filter. Prices match an eligible explicit selling option, without unit conversion. Enquiry-only values do not match price ranges. Newest sorting is stable by first publication time then ID.

Quote payload: `{"colourId":"navy","optionId":"yard","quantity":"1.5","expectedRevision":1}`. If the revision changed, the API returns `requiresConfirmation:true` with the current total and does not supply a WhatsApp link. The caller must show the changed details and request confirmation. Edited customer message text must be generated from/reconciled with the refreshed quote; the backend does not reserve stock.

Calculator payload: `{"garment":"suit","size":"M","widthCm":150}`. Publish an owner/tailor-approved calculator document before activation. Unsupported combinations and unapproved charts return a reason, not an invented estimate.

## WhatsApp administration

Use the official Meta Cloud API. Configure a dedicated API business number and a verified owner sender:

- Webhook: `/api/whatsapp/webhook`. GET handles Meta verification; POST verifies the SHA-256 signature over exact bytes before accepting messages.
- Only messages for `WHATSAPP_PHONE_NUMBER_ID` from `WHATSAPP_OWNER_PHONE` enter the private inbox. Sales conversations are not imported by this setup.
- Set an explicit supported `WHATSAPP_API_VERSION` in the deployment environment. Configure the subscriptions and number in the Meta app.
- Natural-language draft interpretation additionally needs `OPENAI_API_KEY` and an explicit compatible `OPENAI_MODEL`. The model proposes JSON only; server schemas, owner identity and revision checks control changes. Catalogue context and recent owner messages are sent to that configured language provider. No real model or WhatsApp request was made during local tests.
- Image messages use authenticated provider downloads into private storage. Images are not visually analysed to guess product facts. The assistant asks for missing information, uses conversation context, and prepares a reviewable draft.
- Publish/Cancel buttons carry exact action UUIDs. Generic “yes” is intentionally insufficient. Actions expire after one hour. Oversized drafts are saved for dashboard review rather than truncated and published unseen.
- Incoming messages are deduplicated. Draft creation for a message is transactional and idempotent. Confirmation cannot overwrite an intervening edit.

## Worker scheduling and recovery

Schedule authenticated `POST /api/internal/jobs` at least every 5–10 seconds on a scheduler supporting that frequency. Header: `Authorization: Bearer <CRON_SECRET>`. The endpoint processes one leased job per call, uses a global worker lease, and retries failed work with bounded backoff. Inbox jobs remain in arrival order even during retries; an exhausted earlier inbox job blocks later owner messages until support resolves or retries it. Expired final-attempt leases are marked failed. This is deliberately conservative initial throughput for one owner. A one-minute scheduler will work but will make chat updates noticeably slower.

For production, configure the host's execution timeout to at least 60 seconds and monitor failed jobs in the activity API. The worker must run independently of customer website visits. No scheduler or live deployment is created by the repository setup.

WhatsApp sends are at-least-once: a crash after Meta accepts a reply but before the local job is acknowledged can duplicate the reply. Publication remains idempotent. Late retries may be refused by WhatsApp messaging-window rules; approved templates and a notification fallback require separate live setup.

Back up database and storage independently. Restore both to a staging project and verify media references and owner access before any production recovery. Keep secrets out of logs; rotate the service-role key and provider token through environment configuration. Event IP keys are hashed for throttling, not stored as raw IP addresses.

## Verification limits and next integration work

Automated tests exercise catalogue arithmetic/filtering, schemas, API unauthenticated rejection, signature checks, transactional SQL, public projection restrictions, stale edits, job leases and confirmation replay. Hosted Supabase Auth/Storage, Meta delivery, language-model interpretation quality, actual uploaded-image decoding, real scheduler behaviour and full owner journeys still need a configured staging project.

The dashboard UI and customer frontend remain unchanged and need integration with these APIs. Backend setup is not a claim that the entire approved website is finished. Bulk editing, richer conversational recovery/undo, account phone-rebinding UI, media derivatives, live refresh subscriptions, retention/cleanup jobs and deployment monitoring need follow-on work before a fully operated production system.

Official integration references: [Supabase server-side auth](https://supabase.com/docs/guides/auth/server-side), [Meta webhook signatures](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/), [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

Dependency note: the repository's existing Next.js 15 / Vitest 3 dependency tree reports npm audit findings. No forced framework major upgrade was applied during this backend-only setup. Resolve these with a separately verified dependency update before production deployment.
