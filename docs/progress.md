# Backend implementation ledger

Source: docs/architecture.md; original plan: docs/original-plan.md.

Ruling: User narrowed implementation to backend only in /Users/apple/Documents/Github/gannyland. Existing frontend is untouched; dashboard UI, Figma implementation and browser design verification are deferred. Cost: UI integration is a separate step.
Ruling: Work in the named repository on codex/backend, preserving its clean main branch; no additional worktree since the user explicitly requested setup here.
Ruling: Use Supabase PostgreSQL JSONB document revisions with typed application schemas and separate selling options within each product snapshot. One atomic snapshot avoids partial publication; JSON schema evolution requires application validation.
Ruling: Native isolated PostgreSQL is used for SQL integration verification because Docker is unavailable. Supabase Auth/Storage network configuration will require the user's project credentials and separate live checks.
Preflight: Public catalogue, enquiries and calculator consume validated published snapshots; admin and WhatsApp write shared draft/publish services; outbox owns retries without repeating publication.
Baseline: existing frontend test passed, 1/1.

Implemented backend setup: typed catalogue/content contracts; owner-token guard; public/admin routes; atomic draft/revision/outbox SQL; private media; guarded calculator; WhatsApp signature/inbox/AI draft/confirmation/image import; scheduled worker entry point; local SQL tests and environment/runbook.
Ruling: Published entities use typed JSONB snapshots with separate records per selling option inside product data; server schemas are the mutation boundary. Public APIs are no-store while page invalidation is queued.
Ruling: Actor authentication uses verified Supabase bearer tokens instead of introducing a dashboard cookie/login UI. Cost: the future dashboard must send the authenticated access token.
Ruling: Local SQL integration tests replace Docker/Supabase CLI tests; hosted Auth and Storage require staging verification.
Ruling: Frontend tasks and full operational deployment remain outside this backend-only setup. docs/README.md lists the remaining integration/production work explicitly.

Review: independent whole-change review completed. No critical finding; seven important findings addressed in one fix pass.
Final: fixed retry preview mismatch — assistant-retry test RED→GREEN; stored draft is resumed without reinterpreting.
Final: fixed out-of-order inbox retries and future history — SQL order regression RED→GREEN; history constrained to earlier processed sequences.
Final: fixed crashed fifth-attempt job lease — SQL regression RED→GREEN; expired final attempts become failed.
Final: fixed incompatible media placements and missing main image — publication validation tests RED→GREEN; shared by owner publication and WhatsApp confirmation.
Final: fixed raw editorial reference exposure — anonymous SQL access regression RED→GREEN; editorial projection is service-only.
Final: fixed absent private-media preview API — unauthenticated route regression RED→GREEN; owner-specific signing and asset list added.
Final: fixed missing archive/restore — revision-checked transactional operation, outbox and undo regression pass.
Verification: 24 unit/API/regression/frontend tests plus 9 isolated PostgreSQL tests pass; TypeScript and ESLint pass. Frontend source diff is empty.
Scope limitations: full assistant photo-grouping UX, verified phone rebinding, media derivatives/alt/focal metadata, channel-specific audit, operational cleanup and live-provider tests remain follow-on work, documented in README. Do not claim the full original website plan is complete.
Ruling: Keep the implementation on codex/backend without merging/pushing or deploying. Cost: main does not yet contain these changes.

User correction: backend is now a separate independent application under gannyland/backend. Frontend package dependencies restored; only tooling excludes backend files. No frontend/backend connection is added. Next.js is retained solely as the existing API route runtime.

User correction: frontend moved intact to frontend/, backend independently in backend/. Both have separate install/test/build commands. An interrupted relocation was recovered before validation.
