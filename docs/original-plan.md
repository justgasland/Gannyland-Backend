# Gannyland Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or, if selected by the user, superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build the final Gannyland website with one-owner dashboard and guided WhatsApp content administration.

**Architecture:** One Next.js application owns public reads and shared authenticated mutation services. PostgreSQL stores revisions and a durable job outbox; a separately scheduled worker processes webhook inbox entries, media, publication refreshes, and outgoing replies. Both owner interfaces use the same validation and publishing operations.

**Tech Stack:** Next.js, TypeScript, Tailwind CSS, Supabase PostgreSQL/Auth/Storage, official WhatsApp Cloud API; Vitest, PostgreSQL integration tests and Playwright for verification. Pin supported versions and check official integration documentation at implementation time. Hosting, worker scheduling and AI model selection are deployment choices to verify before purchasing services.

**Spec:** [Approved backend architecture](Gannyland-Backend-Plan.md). Read both documents. Project is greenfield: paths below are proposed relative to the application repository, which has not been created.

## Global constraints

- Figma source: `noDX3y0hAAn8V8XwZQkzRu`, page `41:200`, “Draft 01 — Final copy”, subject to the owner's explicit overrides in spec section 11.
- One owner; one verified administration sender; no public signup or staff-management UI.
- No checkout, payment processing, stock reservation, comparison or website enquiry form.
- Shared prices and availability across colours. Selling units remain independent.
- Yard quantities use 0.5-yard steps; trouser lengths use positive integers. Proposed minimum is 0.5 yard.
- No catalogue occasion filter. Style-page occasion groupings remain.
- New-label expiry is seven elapsed days from first publication. Related fabrics use the spec's same-category rule.
- Hide out-of-stock products from all public discovery and direct-detail responses.
- Contact is non-interactive until a destination is supplied; real call and WhatsApp links continue working.
- Preserve approved Figma layout; implementation defaults are labelled in the spec.
- Use published snapshots for public reads; owner drafts must remain private.
- Calculator values require an approved chart. Do not fabricate stock, business details, product specifications, panorama imagery or sizing estimates.

## Review focus

1. Anonymous direct API/storage access must not expose drafts or allow writes (Tasks 1–3).
2. Delayed confirmations must not overwrite a newer dashboard revision (Tasks 2, 9).
3. A price or availability change during an open enquiry must be reflected before WhatsApp opens (Task 5).
4. Duplicate/out-of-order messages and failed cache refresh must not repeat a mutation (Tasks 2, 8–9).
5. Unknown size/width combinations must produce no invented calculator estimate (Task 7).

## File structure and shared contracts

- `src/features/catalogue/`: product model, validation, price arithmetic, filtering and recommendations.
- `src/features/content/`: typed page sections, styles, store, tour, story and content services.
- `src/features/publishing/`: draft/revision checks, transactional publication and undo.
- `src/features/media/`: upload authorisation, validation, processing and placements.
- `src/features/enquiries/`: selection validation, current quotes and WhatsApp message generation.
- `src/features/calculator/`: approved chart validation and deterministic estimates.
- `src/features/whatsapp/`: provider adapter, webhook, owner binding, conversations and action interpreter.
- `src/features/jobs/`: durable leases, retry policy and handlers.
- `src/app/(public)/`, `src/app/admin/`, `src/app/api/`: public screens, private management and HTTP adapters.
- `supabase/migrations/`, `tests/unit/`, `tests/integration/`, `tests/e2e/`: schema and verification.

Shared types in `src/features/catalogue/types.ts`: `ID=string`; `MoneyMinor=number` (safe integer); `Unit='yard'|'trouser_length'`; `Availability='in_stock'|'out_of_stock'|'confirm'`; `PriceMode='exact'|'enquiry'`; `SellingOption={id,productId,unit,priceMode,amountMinor:number|null,currency:'NGN',lengthInches:number|null}`; `Selection={productId,colourId,optionId,quantity:string}`. Quantity is decimal text at boundaries; convert yards to integer half-yard counts for validation/arithmetic.

`Product` contains ID, slug, reference, category ID, colour options, selling options, availability, publication status, first publication timestamp, material, width, description and revision. `PublicProduct` is a published snapshot whose availability is not out_of_stock. Keep published media references in the snapshot. Public callers cannot choose a draft revision.

Shared types in `src/features/publishing/types.ts`: `Actor={ownerId,channel:'dashboard'|'whatsapp'}`; `Change={entityType,entityId,patch}` where patches are validated discriminated unions for the supported catalogue/content fields; `Draft={id,baseRevision,change}`; `PublishResult={entityId,revision,refresh:'pending'|'complete'}`. `PendingAction={id,ownerId,draftId,expiresAt,status}`. No arbitrary SQL, URL fetch, or code execution is an assistant action.

## Execution boundaries

Tasks 1–4 produce a working private content system; Tasks 5–7 add public journeys; Tasks 8–9 add owner chat management; Task 10 verifies deployment. These are sequential milestones sharing contracts, not separate products. Do not begin implementation until the user selects execution. Do not publish a live site merely because local implementation is complete.

Each task has a test-first cycle for consequential behaviour. Configure the test harness in Task 1; use `npm run test -- <path>` for unit tests, `npm run test:integration -- <path>` against a local isolated Supabase instance, and `npx playwright test <path>` for browser tests. Initial failure must be the intended missing behaviour, not a broken environment. Commit only within the eventual repository and include the task's exact files.

### Task 1: Owner access and catalogue foundation

**Files to create:** supabase/migrations/0001_catalogue.sql; src/lib/supabase/server.ts; src/features/catalogue/types.ts; src/features/catalogue/pricing.ts; src/features/auth/owner.ts; src/app/admin/login/page.tsx; package.json.

**Tests:** tests/integration/access.test.ts; tests/unit/pricing.test.ts.

**Interfaces:** Produces requireOwner():Promise<Actor>, validateQuantity(unit:Unit,quantity:string):boolean, calculateTotal(amountMinor:number,unit:Unit,quantity:string):number. Bootstrap the one owner through a privileged setup command; never allow an arbitrary registered account to become owner.

- [ ] Add the named test files with the following contract assertions and the failure cases in the implementation step. Fixture identifiers refer to records created in each test's isolated setup:

```ts
expect(validateQuantity('yard','0.5')).toBe(true); expect(validateQuantity('yard','0.25')).toBe(false); expect(validateQuantity('trouser_length','1.5')).toBe(false); expect(calculateTotal(2800000,'yard','1.5')).toBe(4200000);
```

- [ ] Run the focused commands below; confirm failure on the missing behaviour. For Task 1, establish a functioning test harness first.
- [ ] Create schema, server-only clients, owner allowlist and row policies. Deny anonymous writes and draft reads. Add signed-in-owner and anonymous integration fixtures; assert a second authenticated identity is also denied. Define positive amounts, exact/enquiry nullability, shared colour pricing and foreign-key constraints. Set up TypeScript/test scripts with this deliverable.
- [ ] Run the same commands; all assertions must pass, without depending on live sales messages or production data:

```sh
npm run test:integration -- tests/integration/access.test.ts
npm run test -- tests/unit/pricing.test.ts
```

- [ ] Commit the task's implementation and tests with message `feat: owner access and catalogue foundation` after reviewing the staged diff.

### Task 2: Shared drafts, publication and undo

**Files to create:** supabase/migrations/0002_revisions_jobs.sql; src/features/publishing/types.ts; src/features/publishing/service.ts; src/features/jobs/outbox.ts.

**Tests:** tests/integration/publishing.test.ts.

**Interfaces:** Consumes Actor, Change and Product. Produces saveDraft(actor:Actor,change:Change,baseRevision:number):Promise<Draft>, publishDraft(actor:Actor,draftId:ID,expectedRevision:number):Promise<PublishResult>, undoRevision(actor:Actor,entityId:ID,expectedRevision:number):Promise<PublishResult>.

- [ ] Add the named test files with the following contract assertions and the failure cases in the implementation step. Fixture identifiers refer to records created in each test's isolated setup:

```ts
expect(await publicRevision(productId)).toBe(1); await publishDraft(owner,draft.id,1); expect(await publicRevision(productId)).toBe(2); await expect(publishDraft(owner,staleDraft.id,1)).rejects.toMatchObject({code:'REVISION_CONFLICT'});
```

- [ ] Run the focused commands below; confirm failure on the missing behaviour. For Task 1, establish a functioning test harness first.
- [ ] Implement transactions for current snapshot, audit revision and outbox insertion. Test that failed outbox insertion rolls back publication, a draft is invisible, repeated publication does not create another revision, undo detects conflicts, and refresh retries do not repeat the content mutation. Model publish operation IDs for idempotency.
- [ ] Run the same commands; all assertions must pass, without depending on live sales messages or production data:

```sh
npm run test:integration -- tests/integration/publishing.test.ts
```

- [ ] Commit the task's implementation and tests with message `feat: shared drafts, publication and undo` after reviewing the staged diff.

### Task 3: Media and complete owner dashboard

**Files to create:** supabase/migrations/0003_media_content.sql; src/features/media/service.ts; src/features/content/types.ts; src/features/content/service.ts; src/app/admin/layout.tsx; src/app/admin/products/page.tsx; src/app/admin/products/[id]/page.tsx; src/app/admin/content/[section]/page.tsx; src/app/admin/activity/page.tsx; src/app/admin/settings/page.tsx.

**Tests:** tests/integration/media.test.ts; tests/e2e/admin.spec.ts.

**Interfaces:** Consumes shared draft/publish operations. Produces requestUpload(actor:Actor,input:{mime:string,bytes:number,purpose:string}):Promise<{assetId:ID,url:string}>, finishUpload(actor:Actor,assetId:ID):Promise<void>, readContent(section:string):Promise<PublishedSection>. PublishedSection is a discriminated union for home, styles, store, story, navigation and help sections.

- [ ] Add the named test files with the following contract assertions and the failure cases in the implementation step. Fixture identifiers refer to records created in each test's isolated setup:

```ts
await expect(page.getByText("Draft saved")).toBeVisible(); await expect(publicPage.getByText("Unpublished test fabric")).toHaveCount(0);
```

- [ ] Run the focused commands below; confirm failure on the missing behaviour. For Task 1, establish a functioning test harness first.
- [ ] Implement private uploads and validated promotion/derivatives, main image and ordering, product duplicate/archive/restore, categories/collections, styles and links, homepage selection, store/tour and story/team editors, settings and activity. Reject incompatible media and unsupported uploads before publication. Add bulk-edit previews and verify cancel leaves records unchanged. Public assets must not contain draft-only uploads. Store focal points and alt text without altering approved layouts.
- [ ] Run the same commands; all assertions must pass, without depending on live sales messages or production data:

```sh
npm run test:integration -- tests/integration/media.test.ts
npx playwright test tests/e2e/admin.spec.ts
```

- [ ] Commit the task's implementation and tests with message `feat: media and complete owner dashboard` after reviewing the staged diff.

### Task 4: Catalogue read model and discovery

**Files to create:** src/features/catalogue/queries.ts; src/features/catalogue/filters.ts; src/features/catalogue/recommendations.ts; src/app/(public)/fabrics/page.tsx; src/components/catalogue/FilterSheet.tsx.

**Tests:** tests/integration/catalogue.test.ts; tests/e2e/catalogue.spec.ts.

**Interfaces:** Produces listProducts(query:{search?:string,category?:ID,colour?:ID,unit?:Unit,minMinor?:number,maxMinor?:number,cursor?:string}):Promise<{items:PublicProduct[],nextCursor:string|null,total:number}>, relatedProducts(id:ID):Promise<PublicProduct[]>, isNew(firstPublishedAt:string,now:Date):boolean. Use newest-first ordering with ID tie-break.

- [ ] Add the named test files with the following contract assertions and the failure cases in the implementation step. Fixture identifiers refer to records created in each test's isolated setup:

```ts
expect(isNew('2026-11-01T12:00:00Z',new Date('2026-11-08T11:59:59Z'))).toBe(true); expect(isNew('2026-11-01T12:00:00Z',new Date('2026-11-08T12:00:00Z'))).toBe(false);
```

- [ ] Run the focused commands below; confirm failure on the missing behaviour. For Task 1, establish a functioning test harness first.
- [ ] Implement eligible-option price filtering with no implicit conversion, deduplicated products, aggregate counts, swatches, stable load-more and no occasion filter. Exclude out-of-stock and unpublished records from every count/recommendation/list. Test one fabric with two differently priced units, enquiry-only prices, hidden stock and stable page boundaries. Related results are at most three eligible same-category items. Match desktop/mobile catalogue screens and empty-search state.
- [ ] Run the same commands; all assertions must pass, without depending on live sales messages or production data:

```sh
npm run test:integration -- tests/integration/catalogue.test.ts
npx playwright test tests/e2e/catalogue.spec.ts
```

- [ ] Commit the task's implementation and tests with message `feat: catalogue read model and discovery` after reviewing the staged diff.

### Task 5: Fabric details and customer WhatsApp enquiry

**Files to create:** src/app/(public)/fabrics/[slug]/page.tsx; src/features/enquiries/service.ts; src/features/enquiries/message.ts; src/components/catalogue/EnquirySheet.tsx; src/components/catalogue/TextureViewer.tsx.

**Tests:** tests/unit/enquiry.test.ts; tests/e2e/enquiry.spec.ts.

**Interfaces:** Consumes Selection and published queries. Produces getCurrentQuote(selection:Selection):Promise<{selection:Selection,totalMinor:number|null,revision:number}>, buildSalesLink(phone:string,message:string):string. Unknown/unavailable products return a typed unavailable result without private details.

- [ ] Add the named test files with the following contract assertions and the failure cases in the implementation step. Fixture identifiers refer to records created in each test's isolated setup:

```ts
expect(buildSalesLink('2348000000000','Navy & gold')).toContain('Navy%20%26%20gold'); expect(await getCurrentQuote(halfYardSelection)).toMatchObject({totalMinor:1400000});
```

- [ ] Run the focused commands below; confirm failure on the missing behaviour. For Task 1, establish a functioning test harness first.
- [ ] Build photo/video gallery, texture interaction, colour selectors, all three selling-unit layouts, quantity controls, mobile sticky action, detail accordion, related fabrics and style links. Gather missing choices from card/style entry points. Implement exact-price preview and editable message, ask-for-price quantity choices, and help menu. Revalidate price/stock before final handoff; if changed require a fresh preview. Preserve edited text but explicitly notify about stale price text. Test sold-out mid-session, absent option, ask-only price and special-character encoding. Do not treat click events as orders.
- [ ] Run the same commands; all assertions must pass, without depending on live sales messages or production data:

```sh
npm run test -- tests/unit/enquiry.test.ts
npx playwright test tests/e2e/enquiry.spec.ts
```

- [ ] Commit the task's implementation and tests with message `feat: fabric details and customer whatsapp enquiry` after reviewing the staged diff.

### Task 6: Editorial pages and virtual store

**Files to create:** src/app/(public)/page.tsx; src/app/(public)/styles/page.tsx; src/app/(public)/styles/[slug]/page.tsx; src/app/(public)/store/page.tsx; src/app/(public)/story/page.tsx; src/components/site/Navigation.tsx; src/components/site/Footer.tsx; src/components/store/PanoramaViewer.tsx.

**Tests:** tests/e2e/content-pages.spec.ts; tests/unit/content-links.test.ts.

**Interfaces:** Consumes readContent and published products. Produces the six final page types plus style detail, responsive navigation and the panorama scene switcher. PanoramaScene={id,label,assetId,initialYaw:number,initialPitch:number}.

- [ ] Add the named test files with the following contract assertions and the failure cases in the implementation step. Fixture identifiers refer to records created in each test's isolated setup:

```ts
await expect(page.getByRole("link",{name:"Contact",exact:true})).toHaveCount(0); await expect(page.getByRole("heading",{name:style.title})).toBeVisible();
```

- [ ] Run the focused commands below; confirm failure on the missing behaviour. For Task 1, establish a functioning test harness first.
- [ ] Implement ordered homepage rail/collections/styles, style occasion grouping and detail route, exact/illustrative links, store gallery/directions/hours/tour, story milestones/team. Use a supported panorama viewer after verifying official docs; keep the scene data independent of viewer library. No invented real assets. Hide unavailable product links while retaining appropriate style editorial content. Test unpublished cross-links, fewer than ten featured fabrics, empty styles and missing scene assets. Visually compare at 1440px and 390px against Figma; verify touch, keyboard, reduced-motion and fullscreen controls. Render Contact as noninteractive text.
- [ ] Run the same commands; all assertions must pass, without depending on live sales messages or production data:

```sh
npx playwright test tests/e2e/content-pages.spec.ts
npm run test -- tests/unit/content-links.test.ts
```

- [ ] Commit the task's implementation and tests with message `feat: editorial pages and virtual store` after reviewing the staged diff.

### Task 7: Size-based calculator

**Files to create:** src/features/calculator/types.ts; src/features/calculator/estimate.ts; src/components/catalogue/SizeCalculator.tsx; src/app/admin/calculator/page.tsx.

**Tests:** tests/unit/calculator.test.ts; tests/e2e/calculator.spec.ts.

**Interfaces:** Produces estimateFabric(input:{garment:string,size:string,widthCm:number},chart:ApprovedChart):{yards:string}|{reason:"UNSUPPORTED"|"NOT_APPROVED"}. ApprovedChart contains version, approval date, size system and explicit garment/size/width yardage rows.

- [ ] Add the named test files with the following contract assertions and the failure cases in the implementation step. Fixture identifiers refer to records created in each test's isolated setup:

```ts
expect(estimateFabric(unknownSize,approvedFixture)).toEqual({reason:"UNSUPPORTED"}); expect(estimateFabric(validInput,unapprovedFixture)).toEqual({reason:"NOT_APPROVED"});
```

- [ ] Run the focused commands below; confirm failure on the missing behaviour. For Task 1, establish a functioning test harness first.
- [ ] Implement exact-row lookup with half-yard round-up, no speculative interpolation or defaults for missing width. Label synthetic test rows as fixtures, never production advice. Display the spec disclaimer with every result and prompt tailor confirmation for unsupported combinations. Allow the owner to review/approve chart versions in dashboard. Block live activation until real garment/size/width values are supplied. Test boundary rounding, unknown size, absent width, unapproved chart and disclaimer visibility.
- [ ] Run the same commands; all assertions must pass, without depending on live sales messages or production data:

```sh
npm run test -- tests/unit/calculator.test.ts
npx playwright test tests/e2e/calculator.spec.ts
```

- [ ] Commit the task's implementation and tests with message `feat: size-based calculator` after reviewing the staged diff.

### Task 8: WhatsApp transport, authorised sender and durable worker

**Files to create:** src/app/api/whatsapp/webhook/route.ts; src/features/whatsapp/provider.ts; src/features/whatsapp/owner-binding.ts; src/features/jobs/worker.ts; src/features/jobs/handlers.ts; supabase/migrations/0004_whatsapp.sql.

**Tests:** tests/integration/whatsapp-webhook.test.ts; tests/integration/jobs.test.ts.

**Interfaces:** Produces verifyWebhook(rawBody:Uint8Array,signature:string):boolean, acceptMessage(event:ProviderEvent):Promise<void>, runJobs(limit:number):Promise<{processed:number,failed:number}>. ProviderEvent is an explicitly validated union of inbound owner message and delivery status; messages include unique provider ID, sender, type and timestamp.

- [ ] Add the named test files with the following contract assertions and the failure cases in the implementation step. Fixture identifiers refer to records created in each test's isolated setup:

```ts
await acceptMessage(event); await acceptMessage(event); expect(await inboxCount(event.id)).toBe(1); expect(await acceptedActions(unknownSender)).toHaveLength(0);
```

- [ ] Run the focused commands below; confirm failure on the missing behaviour. For Task 1, establish a functioning test harness first.
- [ ] Implement provider challenge and signature checks, persistence before acknowledgement, unique constraints and owner sender verification. Worker uses leases with expiry, bounded exponential retries and terminal failure records; serialise work per conversation. Keep failed outgoing delivery separate from mutation success. Validate provider media IDs and download only through the authenticated provider adapter. Configure a real scheduled worker before end-to-end activation; browser traffic must not be needed to drain jobs. Test forged signatures, duplicate events, worker interruption/lease recovery and failed refresh delivery.
- [ ] Run the same commands; all assertions must pass, without depending on live sales messages or production data:

```sh
npm run test:integration -- tests/integration/whatsapp-webhook.test.ts
npm run test:integration -- tests/integration/jobs.test.ts
```

- [ ] Commit the task's implementation and tests with message `feat: whatsapp transport, authorised sender and durable worker` after reviewing the staged diff.

### Task 9: Guided assistant using shared mutations

**Files to create:** src/features/whatsapp/conversation.ts; src/features/whatsapp/interpreter.ts; src/features/whatsapp/actions.ts; src/features/whatsapp/replies.ts; src/app/admin/whatsapp/page.tsx.

**Tests:** tests/integration/assistant.test.ts.

**Interfaces:** Consumes saveDraft, publishDraft and undoRevision. Produces interpretMessage(message:OwnerMessage,context:ConversationContext):Promise<ProposedAction>, handleOwnerMessage(message:OwnerMessage):Promise<Reply[]>. ProposedAction is a discriminated union of create/update fabric, update media, availability, featuring, store hours, named page text, confirm, cancel and undo.

- [ ] Add the named test files with the following contract assertions and the failure cases in the implementation step. Fixture identifiers refer to records created in each test's isolated setup:

```ts
await handleOwnerMessage(confirmStaleAction); expect(await productRevision(productId)).toBe(latestRevision); expect(await lastReply()).toMatchObject({kind:"RECONFIRM"});
```

- [ ] Run the focused commands below; confirm failure on the missing behaviour. For Task 1, establish a functioning test harness first.
- [ ] Use structured model output, validate every field, and treat model output as a proposal only. Link confirmations to owner/action/draft revision and expiry; ambiguous product/unit asks a question. Group images in an explicit draft, retain partial drafts and require publication confirmation. Show link and correct pending-refresh status; offer undo without overwriting intervening edits. Add dashboard recovery and number-rebinding workflow with authenticated verification. Test image-only input, duplicate product names, unspecified unit, multiple images, stale/expired confirmation, unknown sender, malicious text requesting unsupported actions, cancellation and notification failure after successful publication.
- [ ] Run the same commands; all assertions must pass, without depending on live sales messages or production data:

```sh
npm run test:integration -- tests/integration/assistant.test.ts
```

- [ ] Commit the task's implementation and tests with message `feat: guided assistant using shared mutations` after reviewing the staged diff.

### Task 10: Operational readiness and owner acceptance

**Files to create:** src/features/analytics/events.ts; src/app/api/events/route.ts; tests/e2e/owner-journey.spec.ts; docs/runbooks/deployment.md; docs/runbooks/recovery.md; .env.example.

**Tests:** tests/e2e/owner-journey.spec.ts; tests/integration/events.test.ts.

**Interfaces:** Produces documented environment setup, secrets boundaries, backup/restore steps, retry recovery and release checks; recordEnquiryClick(input:{productId?:ID,styleId?:ID,source:string}):Promise<void>. No sales/delivery claims from click data.

- [ ] Add the named test files with the following contract assertions and the failure cases in the implementation step. Fixture identifiers refer to records created in each test's isolated setup:

```ts
expect(await storedEvent(click)).toMatchObject({type:"whatsapp_link_click"}); expect(await createdOrders()).toHaveLength(0);
```

- [ ] Run the focused commands below; confirm failure on the missing behaviour. For Task 1, establish a functioning test harness first.
- [ ] Test owner adds fabric in chat, edits via dashboard, publishes, discovers it on mobile and opens accurate enquiry; then sells out/restocks it without resetting New. Verify public hiding and record retention. Test restore with both database/media assets, event throttling, error alerts, token rotation and backups. Run unit/integration suites, Playwright, lint/type checks and production build. Validate remaining real content and credentials before release; stage with restricted access and obtain explicit live-deployment direction. Document pending chart/tour/content dependencies honestly.
- [ ] Run the same commands; all assertions must pass, without depending on live sales messages or production data:

```sh
npx playwright test tests/e2e/owner-journey.spec.ts
npm run test:integration -- tests/integration/events.test.ts
```

- [ ] Commit the task's implementation and tests with message `feat: operational readiness and owner acceptance` after reviewing the staged diff.

## Self-review and handoff

Coverage: catalogue and owner access → Tasks 1–4; prices and enquiry variants → Tasks 1, 4–5; approved pages and media → Tasks 3, 5–6; calculator → Task 7; owner WhatsApp updates → Tasks 8–9; revisions, reliability and operational acceptance → Tasks 2, 8–10. All five review-focus cases have assigned tests. No user-facing account, checkout, comparison or form flow has been added.

Remaining external inputs: calculator chart, actual product/business/story/team assets, panorama capture, deployment accounts, authorised phone numbers and messaging credentials. They block activation of the corresponding features, not independent development with clearly labelled fixtures.

The user has approved architecture, not a live deployment or a specific execution method. Review this plan before code begins. Native execution implements tasks in this chat; subagent-driven execution assigns each task and review to separate agents. Native execution is recommended here because these tasks share tightly coupled content/publishing contracts and a single application, with a final independent review before integration.
