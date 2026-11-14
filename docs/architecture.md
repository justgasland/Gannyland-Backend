# Gannyland Fabrics — Revised Backend Plan

Status: architecture approved by the owner, with the decisions in section 11 confirmed on 13 November 2026. Implementation has not started.

## 1. Authoritative scope

Frontend source: [Figma — Draft 01 — Final copy](https://www.figma.com/design/noDX3y0hAAn8V8XwZQkzRu/Gannyland-Fabrics?node-id=41-200).

The owner has confirmed this page is final unless they communicate changes. This plan supersedes the earlier generic backend outline where it differs from that design.

Gannyland is a fabric catalogue and business website. Customers discover fabrics, select options, review an enquiry message, and continue to the business's WhatsApp sales chat. The website does not process payments, reserve stock, or create fulfilled orders.

One owner manages the website through both a private dashboard and a WhatsApp administration assistant. Both interfaces use the same backend operations and published records.

Confirmed public pages: Home, All Fabrics, Fabric Details, Style Inspiration, Our Store, and Our Story, with desktop and mobile layouts. Additional designed interfaces include enquiry dialogs, ask-for-price flows, help menus, mobile filters, search-empty states, mobile navigation, and a mobile product action bar.

Not in the confirmed scope: carts, checkout, payments, customer accounts, comparison, website enquiry forms, multiple admin users, and an integrated customer messaging inbox. Public team profiles do not imply admin accounts.

## 2. Implementation approaches

1. Dashboard plus a guided WhatsApp assistant: natural messages become proposed structured actions; missing details trigger questions; buttons confirm publication. Recommended because fabric variants and selling units need precise updates while the owner needs simple controls.
2. Dashboard plus a button-only assistant: easier to constrain, but more steps for routine work and less convenient for photos with captions.
3. Dashboard plus fully free-form automation: flexible, but ambiguity around products, units, quantities, and page sections makes dependable publishing harder.

Both management interfaces are confirmed requirements. The owner has approved the guided assistant approach.

## 3. Architecture

Use the existing proposal of Next.js and TypeScript for the website, dashboard, and server-side application layer; Supabase PostgreSQL, Auth, and Storage for records, owner login, and media. These are proposed implementation choices, not additional frontend requirements.

Public website → published read API → database and media storage.

Admin dashboard → authenticated application operations → drafts and publishing → database.

Owner's WhatsApp → official WhatsApp API webhook → durable message inbox → background worker → conversation and proposed action → owner confirmation → the same application operations.

Publishing → cache invalidation → fresh public content. Open pages may subscribe to publication events where needed. A successful database write and a delivered WhatsApp reply are separate states.

Keep this as one application with a background processing facility, not microservices. A durable job runner must handle work that outlives a normal web request. Select its provider during implementation planning.

The business's sales chat and administration assistant are separate responsibilities. A dedicated assistant number is the proposed setup. Using an existing number requires checking its supported onboarding configuration. The owner's authorised sender number is linked to their dashboard account; it is not itself the assistant's API number.

## 4. Page-to-backend requirements

| Page | Required content and behaviour |
|---|---|
| Home | Hero content and media, ten selected fabrics in an ordered rail, collection cards, selected styles, help prompts, store summary, closing call to action, shared footer |
| All Fabrics | Search by fabric name; collection counts; colour, price, and selling-unit filters (no occasion filter); sorting; active filter chips; load more; new labels; colour swatches; empty-search help |
| Fabric Details | Ordered photos and video, texture close-up, colour choice, selling options, quantity and total, availability, material, width, suitable uses, linked styles, related fabrics |
| Style Inspiration | Occasion categories, selected featured look, ordered looks, images, descriptions, links to fabrics, contextual enquiry actions |
| Our Store | Store image, address, hours, phone, sales WhatsApp, directions, panorama scenes, shop gallery, visit information |
| Our Story | Hero, founding story, archival image, ordered milestones, business facts, team portraits/names/roles, closing content |
| Shared interface | Navigation destinations, contact links, help prompts, footer information, enquiry message templates |

Keep the approved layout in code. Make its content editable through structured fields rather than introducing an unrestricted page builder. Shared facts such as phone numbers and hours must come from central settings.

## 5. Data model

| Records | Purpose |
|---|---|
| Products | Name, slug, reference, description, category, material, fabric width, publication state, new-label setting |
| Product variants | Named colours and display swatches, with optional colour-specific images; prices and availability shared across colours |
| Selling options | Product association, unit, unit label, optional length specification, currency, price visibility and amount |
| Categories / collections | Names, slugs, descriptions, imagery, display order, product membership as appropriate |
| Occasions and suitable uses | Structured tags for product/style descriptions and style grouping; no catalogue occasion filter |
| Media assets and placements | Images, videos, dimensions, alt text, processing status, crop/focal-point settings, ordering and intended use |
| Styles and fabric links | Outfit titles, images, descriptions, occasion tags, featured status, and exact or explicitly illustrative fabric relationships |
| Homepage selections | Ordered featured fabrics, collections, and styles |
| Page content | Named editable sections and their text/media fields |
| Store settings | Address, coordinates/map destination, structured hours, phone, WhatsApp, social links |
| Tour scenes | Panorama assets, labels, sequence, initial view, and scene connections where needed |
| Story milestones and team profiles | Ordered public content independent of login accounts |
| Owner profile | Auth identity and verified administration WhatsApp sender |
| Content revisions / pending actions | Drafts, base revision, proposed changes, confirmation state, publication state |
| Message inbox / conversations / jobs | Deduplication, conversation progress, retries, and outgoing message status |
| Audit events | Actor, interface, timestamp, affected record, previous value, and new value |
| Enquiry interaction events | Product/style context and button interactions; never treated as confirmed messages or sales |

Final table boundaries and constraints belong in implementation planning. Avoid parallel editable copies of the same price or availability.

Store monetary values in integer minor units. Each selling option carries an explicit unit and price. Do not infer that a trouser length is equivalent to any fixed number of yards. The design's 45-inch example is configurable product information, not a universal rule.

Keep creation/publication timestamps for sorting. Model availability explicitly as in stock, out of stock, or confirm availability. Homepage selections target the ten-item design but must handle fewer publishable items gracefully. Yard quantities use 0.5-yard steps; trouser-length quantities are whole numbers. Store exact decimal quantities and round monetary totals to the nearest minor unit. A 0.5-yard minimum is a proposed implementation default, not a separately confirmed business minimum.

## 6. Customer enquiry behaviour

For publicly priced fabrics: select the fabric, colour, selling option, and quantity; calculate the displayed total; show the message preview; allow editing; then open WhatsApp with the prepared text.

For enquiry-only prices: show the designed ask-for-price interface, including approximate quantity choices and “Not sure”; do not invent a total.

Messages should identify the product and selected options. Adding a stable product reference/link is proposed so the business can reliably identify the enquiry.

Generic help prompts prefill an appropriate question. “Send Us a Photo” opens a sales chat where the customer attaches the photo; no website upload form is assumed.

Product-card and style-page enquiry buttons may lack selected colour, unit, or quantity. Proposed behaviour: gather missing options in the enquiry sheet before producing a priced message. Do not inherit the illustrative three-yard selection from the design. Confirm this interaction extension before implementation; routing to product details is the alternative.

Before generating a priced enquiry, revalidate the current selling option and price. If either changed while the visitor was browsing, show the new information before continuing. The business still confirms availability and the sale in chat.

Track only actual website interactions. Opening WhatsApp does not prove delivery, a conversation, or a sale.

## 7. Dashboard

Proposed navigation: Overview; Fabrics; Categories & Collections; Styles; Media; Homepage; Store & Tour; Our Story; Website Content; Activity; Settings.

The owner can create, duplicate, draft, preview, publish, archive, and restore products; manage colour options and unit prices; upload/reorder media; edit website content; and select featured items.

Use descriptive fields and image previews. Validate required information before publishing. Bulk changes need a preview of affected items. Store-team profiles remain ordinary content records.

The dashboard is the complete editor and recovery route when WhatsApp cannot express an operation clearly.

## 8. WhatsApp administration

Initial supported operations: create a fabric; change an existing fabric's price or price visibility; change availability; add or replace media; edit description; request homepage featuring; update opening hours and simple named page text.

The application first authenticates the webhook and verifies the sender. AI may interpret the request into a limited action schema; only application code can authorise and execute it. Messages from other senders cannot modify content.

Each edit follows: identify target → collect missing details → validate draft → show exact proposed changes → confirm → publish → report result and product/page link.

Ambiguous names require a choice with identifying images/references. An unspecified price unit requires a question. Multiple incoming photos must belong to an explicit pending draft rather than an assumed product. The assistant must never guess fabric composition, dimensions, prices, or availability from an image.

Confirmations are tied to a particular action and record revision. If the dashboard edits the record before chat confirmation, ask again using current values. Undo creates a new audited revision and must not silently overwrite later changes.

Use plain progress states: “Draft saved”, “Waiting for your confirmation”, “Published”, and “Not published yet”. Retry publication/notification failures safely and never claim publication merely because an AI response was produced.

Complex tour configuration, large collection rearrangements, full timeline editing, and account recovery remain dashboard tasks initially. Voice notes are not part of the confirmed first version.

## 9. Media and publication

Separate ordinary display images, close-up sources, videos, and panorama assets. Validate type and size, generate appropriate derivatives, preserve enough source detail for zoom, and require a deliberate main image and ordering.

The 360° tour needs real panorama assets and a viewer implementation. The Figma placeholders are not usable tour photography. Scene hosting, viewer choice, and capture costs remain decisions for implementation planning.

New content stays private until published. For changes to published content, retain the existing public revision until the replacement is confirmed. Publishing validates required links and media, commits related changes together, records an audit event, and invalidates affected pages.

Out-of-stock or unpublished products must be excluded from public listings, search, counts, homepage selections, recommendations, and purchasable style links. Direct URLs must show a generic unavailable/not-found page without exposing the product details; this URL behaviour is an implementation default. Retain the records privately for restocking and history. Revalidate existing enquiry dialogs before opening WhatsApp. Styles must not promise an exact fabric match when their association is merely illustrative.

Record cache-refresh work durably with the publication transaction and retry it independently. If the content is committed but public refresh is delayed, report that state rather than claiming either full completion or a failed edit. Never reapply the business mutation merely to retry cache invalidation.

## 10. Reliability and owner access

Use authenticated dashboard access, database access policies, server-only credentials, protected mutation endpoints, and a verified owner phone association. Changing the authorised number requires dashboard authentication and verification of the replacement number.

Persist incoming WhatsApp messages before acknowledging receipt. Deduplicate using provider message identifiers; make jobs safe to retry; process related conversation actions in order; track exhausted failures for support.

Back up database records and media with a documented restoration procedure. Limit retained chat data to what operation and support require. Apply upload limits, request throttling, monitoring, and spend alerts.

Templates, messaging windows, provider charges, and onboarding requirements must be checked when configuring the official WhatsApp integration. Customer deep links and the automated owner assistant have different requirements.

## 11. Confirmed decisions and remaining dependencies

The owner's decisions override the corresponding Figma details:

- “View Style” opens a detailed style view. Proposed route: `/styles/[slug]`; layout should reuse the existing style design language.
- Contact has no destination for now. Render its label without a fake link; functional phone and WhatsApp actions remain available.
- No occasion filter on the fabric catalogue, desktop or mobile. Retain the designed style-page occasion groupings; removing those was not requested.
- Price filters use eligible explicit selling-option prices, with the unit clearly labelled and no conversion between yards and trouser lengths. Enquiry-only options have no comparable amount and are excluded while a price filter is active. Products matching either selling option appear once; an active unit filter narrows eligibility first.
- Fractional yards use 0.5-yard steps. Whole-yard quantities are also valid. Proposed minimum: 0.5 yard, subject to business confirmation if needed.
- Prices and availability do not vary by colour. Colours remain selectable visual options.
- “New” expires after one week. Anchor expiry to first publication, exactly seven elapsed days; routine edits or restocking do not restart it (implementation default).
- Related fabrics are rule-based. Proposed rule: same category, published and in stock, exclude current fabric, newest first with stable ID tie-break, maximum three; show fewer when necessary.
- Out-of-stock fabrics are not publicly displayed. Dashboard records remain available for restocking.
- “How much do I need?” opens a normal size-based fabric calculator with a disclaimer.
- The guided assistant approach and architecture are approved.

The calculator is an estimate, not an order quantity guarantee. Proposed inputs are garment type, size, and fabric width, using an owner/tailor-approved lookup table. Show: “Estimated fabric only. Your measurements, fabric width, pattern and tailor’s cutting method can change the amount needed. Confirm with your tailor before buying.” Do not invent yardage values or infer missing fabric width. The sizing chart, size system and supported garments are still a content dependency before calculator activation.

Proposed remaining defaults: newest-first sorting only initially; card/style enquiry sheets collect missing choices rather than assuming the sample quantity; special tour setup remains in the dashboard. These are builder choices, not claimed user statements.

Content needed before launch: actual contact details and opening hours; product images and accurate specifications; real panorama capture; story and milestone dates; team names, roles, and portraits. Placeholder counts and claims must not become unverified production content.

## 12. Delivery sequence

1. Finalise unresolved product rules and map content fields to the final screens. Approve this plan and produce implementation tasks.
2. Build the shared schema, owner login, media pipeline, application operations, revisions, and publishing rules.
3. Build the dashboard alongside the catalogue and product pages. Verify all three selling-unit cases, price visibility, filters, quantities, and enquiry previews.
4. Complete homepage, styles, store, story, mobile flows, texture viewing, and the tour using supplied assets.
5. Connect WhatsApp administration to the same operations. Verify unknown senders, ambiguous products, duplicate delivery, multiple photos, stale confirmations, failed jobs, and undo.
6. Load real content and test the full workflow with the owner: add a fabric in chat, adjust it in the dashboard, verify public output, and open the correct customer enquiry.

The public frontend is tested against the authoritative Figma screens. Backend acceptance includes private drafts, consistent prices across all placements, safe conflicting edits, recoverable failures, accurate enquiry context, and usable owner workflows.

## 13. Cost implications

Earlier running-cost figures were indicative small-site allowances, not a quote for this final design. This scope adds videos, high-resolution texture assets, and panorama delivery; storage and bandwidth must be estimated from actual assets and traffic. WhatsApp charges depend on the chosen connection, destination, message category, and usage.

A build estimate should be prepared from this scope after resolving tour implementation and the interaction gaps. Separate development, ongoing infrastructure, WhatsApp/AI usage, real photography/panorama capture, and maintenance. No new price commitment is made in this document.
