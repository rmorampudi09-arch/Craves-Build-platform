# Account erasure (plan 1) - rulings and follow-ups

Carried out of the plan 1 execution ledger (subagent-driven run, 3-4 Nov 2026) so plans 2-5 can use them.
Branch docs/account-deletion-design, plan 1 commits 9b4da3c10..0761f0065.

## Rulings made during plan 1 (in order)

- Ruling: referral (Task 4) protection = its existing X-Referral-* HMAC with source `auth` allow-listed for the three POST paths; no allowed-callers entry — the plan's Task 4 text already says so; Global Constraints line applies to InternalCallFilter services only — cost if wrong: none (referral has no allowed-callers config).
- Ruling: advanced (Task 5) protection = X-Craves-Internal-Secret vs craves.internal.service-secret, as Task 5 says; no allowed-callers — cost if wrong: an extra config line later.
- Ruling: tests run locally with `export JAVA_HOME="/c/Program Files/Java/jdk-21"; /c/tools/apache-maven-3.9.9/bin/mvn -B -ntp ...` (Maven 3.9.9 installed 3 Nov with owner OK, sha512 verified); DB-gated tests skip locally (no PostgreSQL) and run in CI — cost if wrong: DB-test failures surface only in CI.
- Ruling: Task 1 concern 3 (a subscription active again by day 30 is not blocked) is a spec gap — spec "My calls": anything still open on day 30 makes the deletion wait. Add CUSTOMER blocker SUBSCRIPTION_STILL_ACTIVE (any customer subscription not CANCELLED/EXPIRED) so erase answers 409 — cost if wrong: a deletion waits for staff to end a subscription.
- Ruling: concerns 1,2,4 accepted (no refund rows on customer cancel; prepare rethrows first refusal after cancelling the rest; CHEF retired status INACTIVE). Concern 5 → plan 5 rollout (check Azure allowed-callers overrides). Note for later tasks: implementers may run DB tests on the zonky embedded PostgreSQL.
- Ruling: fix Minor 1 (ALL prepare: close chef plans before the refusable customer cancels), 3 (rename archive→retire/INACTIVE), 4 (notes update sets updated_at), 5 (anonymise customer-typed reasons in subscription_status_history rows where the actor is the person, unless a trigger forbids) — cheap and 5 is personal free text the spec's intent covers — cost if wrong: small extra diff.
- Ruling: Minor 2 kept as is — PENDING_PAYMENT/PAYMENT_FAILED rows and their unpaid invoices block until staff act; spec says open items make the deletion wait and staff see why. Carry to plan 2 (admin page must show these as staff tasks).
- Ruling: Minor 6 parked (manual-construction DB test does not exercise @Transactional; log before commit) — low risk.
- Ruling: concern 2 — spec goal "nothing identifies the person" and the data table already lists order "notification outbox bodies — Delete". CUSTOMER erase must also: delete/blank the person's notification_outbox rows; blank personal fields (dropoff name/phone/address/note) inside domain_event_outbox.payload_json and delivery_status_inbox payloads for the person's orders — only rows already processed/published, never pending ones, and only if no trigger forbids — cost if wrong: extra JSONB updates on historical rows.
- Ruling: concern 1 (updated_at not bumped) accepted; 3 accepted; 4 → plan 2 (deletion_pending claim blocks checkout before erase); 5 → plan 5 rollout (CRAVES_INTERNAL_SERVICE_KEY must be set; 403 vs 401 differs per service, coordinator treats any non-200/409 as a failed step); 6 accepted (refunds are the customer side).
- Ruling: leave customer_order.delivery_tracking_url and order_delivery_status_history.tracking_url — a courier job link that expires, not by itself identifying — cost if wrong: one more scrub later.
- Ruling: DEAD rows included in the scrub (nothing re-drives them) — accepted.
- Ruling: Minor 1 — keep delivery_partner_* (rider's data, not the erased customer's; rider data is out of scope). Amend the spec's order row at final cleanup — cost if wrong: one nullable-column update later.
- Ruling: Minor 2 — inbox trackingUrl scrub kept (harmless; replay reads only WAITING_* rows). Minor 3 — dual-role chef idempotency rows deleted by CUSTOMER erase: accepted, documented. Minor 4 → plan 2 must block new orders while pending (deletion_pending claim) before erase runs. Minor 5 — report wording only.
- Ruling: concern 1 accepted (REVERSED/CANCELLED payouts count as finished).
- Ruling: concern 2 — money owed lives in integration finance, so integration owns the chef referral-earnings blocker (REFERRAL_EARNING_UNPAID); Task 4 (referral) must NOT add REFERRAL_CASH_UNPAID — referral keeps only FRAUD_CASE_OPEN — cost if wrong: staff miss nothing (one source), plan text amended here.
- Ruling: concern 3 — a payout hold with nothing owed is not a blocker: PAYOUT_ON_HOLD only when the hold exists AND there is an unpaid payable/unsettled earning — fix now.
- Ruling: concern 4 — spec goal "nothing identifies the person": CUSTOMER erase also scrubs customer name/phone/email in payment_order.response_payload and in payment_attempt / payment_event / webhook_inbox payloads for the person's payment orders (processed rows only), and the customer dropoff name/phone columns on fleet trip rows for the person's orders (finished trips only; rider's own data untouched); skip any table a trigger forbids (count 0, say so) — fix now.
- Ruling: concerns 5, 6 accepted.
- Ruling: concern 1 — close it: also scrub dropoff contact/address in delivery_schema command/webhook payloads for the person's finished deliveries, fleet trip drop address + trip_event detail on finished trips, and UPI VPA / payer identifiers in provider bodies (a VPA often contains the phone number); masked card last-4 may stay. Meal-plan trips not linkable here — accepted, disclose. — cost if wrong: more JSONB scrub code.
- Ruling: concern 2 accepted (late provider retry after 30 days unlikely); concern 3 accepted (payment_order payload scrubbed regardless of status; matching uses ids).
- Ruling: leftovers accepted and to be disclosed: meal-plan trips/deliveries not linkable here (needs order-id lookup — candidate for plan 2: coordinator could pass the person's order ids), unmatched rejected delivery webhooks, Pidge/Shiprocket key coverage from our own payload shapes, rider GPS/door photos (rider-side, existing retention).
- Ruling: Important 1 is covered by my earlier ruling (round 2, "concern 3 accepted": payment_order payloads scrubbed regardless of status — nothing reads them; checkout is refused while pending) — ruling 4 amended for payment_order; no fix — cost if wrong: an abandoned pending payment's payload loses its contact fields.
- Ruling: Minor 2 (fleet hand-back could scrub an in-flight order's trip) and Minor 3 (Borzo id namespaces can match another customer's inbox row) break binding constraints ("never in-flight", "never another person's rows") → treated as Important, fix round 1.
- Ruling: concern 1 accepted (code retired on ALL only; coordinator sends ALL for whole-account). Concern 4 accepted (CONFIRMED fraud is final; only OPEN blocks).
- Ruling: concern 3 — money must not be stranded: add blockers CASH_OUT_IN_FLIGHT (CUSTOMER/ALL: a cash-out of the person's referral balance not yet finished) and REWARD_PENDING (ALL: a pending reward that would later credit a retired member); both settle within days and staff see them — cost if wrong: a deletion waits a few days.
- Ruling: concern 1 (undecided chef commission) not a blocker — some never decide and would block forever — accepted.
- Ruling: Important (member-then-wallet lock order vs wallet-first flows → deadlock) → fix round 1: wallet first, then member.
- Ruling: Minor REWARD_PENDING with a CONFIRMED fraud case would block ALL forever (anti-goal "request that silently never completes") → ride along in fix round 1: exclude rewards of members with a CONFIRMED fraud case.
- Ruling: CHEF scope erases nothing in advanced (DONE, empty counts, no receipt) — kitchencapacity's contributor erases customer holds (hold.person_id), and batch/kitchen_load keep only the chef's id as kitchen operating records, like order's chef_identity_id; the plan's "chef-owned module" premise was wrong — if wrong, chef ids stay in capacity tables, add a chef scrub later.
- Ruling: "schema exists" = flyway_schema_history has a successful row (implementer's call) — an empty schema from a failed first migration would 500 and block every deletion — if wrong, a module with a half-run migration is skipped.
- Ruling: keep implementer's Sonnet trailer on its own commits; 400-before-401 order matches subscription/integration; receipt only when something was removed — harmless either way.
- Ruling: notification_request body/payload/delivery_address are blanked per role too (CUSTOMER/CHEF rows where recipient_role matches; ALL every row incl. null role) — spec "one-side deletion erases that side's details"; brief had ALL only — if wrong, one-side deletions blank a few extra sent-message bodies.
- Ruling: push_device_registration and notification_preference only on ALL — app='customer' token serves both customer and chef sides, preferences are per identity — if wrong, a one-side deleter keeps a device token.
- Ruling: pdf_document, pdf_document_email (no address column, FK to pdf_document), pdf_document_audit, auth_email_verification_receipt (immutable, no address) untouched.
- Ruling: CUSTOMER scope must leave chef-side records — PersonalDataContributor gets a customer-side erase (default = erase) overridden where a module stores the person as chef; ALL keeps the existing erase (spec row) — if wrong, extra code in 2+ contributors.
- Ruling: kitchen_profile is anonymised in ONE UPDATE that also sets status INACTIVE — trg_kitchen_pickup_location_lifecycle (V4/V5) creates a new pickup version on any address change and enqueues provisioning only when NEW.status='ACTIVE' — if wrong, an anonymised pickup is sent to the delivery provider.
- Ruling: after that, every kitchen_pickup_location version of the kitchen (RETIRED ones keep the real address) is anonymised in place (ids kept: orders/integration reference them), and the kitchen's unsent pickup_location_provisioning_outbox rows go to a terminal status — if wrong, old addresses stay or a provider gets a blank pickup.
- Ruling: photo blobs are deleted BEFORE the DB transaction (delete-if-exists, so a retry is safe and never loses the blob names); only URLs that point at the catalog media container are deleted, other URLs are only cleared — if wrong, a DB failure after deletion leaves a closed kitchen with broken photo links (acceptable: kitchen is closed for deletion).
- Ruling: DEAD_LETTER requests of the identity also stopped (SKIPPED) so an admin requeue can never send a blank row — accepted; they leave the admin dead-letter list.
- Ruling: device delete ALL only, app='customer' only (rider tokens kept) — accepted; rider is a separate app/account and never touched by this work.
- Ruling: count key notification_request_stopped accepted (non-table key; coordinator must not parse keys).
- Ruling: blank also notification_request.title + last_error and the error text of its delivery_attempt / channel_delivery_dead_letter rows for the same erased requests — provider errors and titles can quote names/addresses — sent back before review.
- Ruling: user-chef notification_outbox rows of the erased role (ALL: every row of the identity) are deleted whatever their status — unsent notices to a side being deleted have no use, and a later dispatch would recreate in-app notices after notification-service was erased — if wrong, a dual-role person misses a pending notice for the deleted side.
- Ruling: support_case per requester_role (ALL: every case of the identity): subject and the requester's own messages anonymised; staff messages, status/assignment history kept.
- Ruling: chef_onboarding_document_history kept with KYC (owner decision 8); admin_* audits, auth_email_projection(+receipt), road_distance_cache (no identity) untouched.
- Ruling: menu_item.description is blanked on erase (item_name kept: orders snapshot names, archived items are hidden) — confirmed gap vs spec "nothing identifies the person"; free-text descriptions can name the chef — enters fix round 1 — if wrong, an archived dish loses its description.
- Ruling: reopenIfErased (from mine/lock/submitApplication/uploadDocument) soft-removes the erased application's KYC rows (removed_at + history snapshot) so the fresh draft is empty; rows and blobs stay (owner decision 8 keeps them) — unique identity constraint allows one application row — if wrong, staff see the old KYC as removed rather than active.
- Ruling: support cases linked to chef onboarding help count as CHEF side (the help case is filed with role CUSTOMER); all other cases follow requester_role — if wrong, a CUSTOMER-only erase leaves an applicant's help text or a CHEF-only erase misses it.
- Ruling: erase resolves the person's open chef_onboarding_help rows (no audit row) so a re-applicant never gets the old anonymised request back.
- Ruling: admin lists / favourites / finance readers show an erased application with "Deleted" placeholders, status unchanged.
- Ruling: for Important 1 take option (a) — the REOPENED_AFTER_ERASURE history snapshot (old blob_name, status, reviewer) is the retained KYC record; blobs stay in storage; javadoc/report corrected and a test pins it — option (b) needs a partial unique index + ON CONFLICT rewrites on a live table for a rare path — if wrong, a later legal purge must read history JSON to find old blobs.
- Ruling: Important 2 fix also adds explicit erased_at IS NULL refusals to approve/reject/reviewAction (review Minor 1) since the email mismatch was the only approval stop.
- Ruling: ChefDocumentReviewService per-document approve/reject also refuse an erased application (KYC rows are locked after erase) — added to Task 8 fix round 1 before re-review.
- Ruling: C1 - order PAYMENT_PENDING/CREATED block only while still payable (created_at within the provider payment-session expiry from config; 24 h if none); older ones are abandoned and anonymised like finished orders (never deleted) - if wrong, a very late payment lands on an anonymised order.
- Ruling: I1 - CHEF/ALL anonymise the chef's pickup phone/email/address (+ coords where nullable) on FINISHED orders where chef_identity_id is the person and on finished fleet trips where chef_id is the person, with placeholders that satisfy chk_order_pickup_snapshot_complete; kitchen name kept (earlier ruling); skip any column the V24/V25 guards cover and say so - spec goal "nothing identifies the person" - if wrong, past customers lose the chef's contact on old orders.
- Ruling: I2 - integration scrubs payment_attempt/payment_event bodies for the person's payment orders whatever their status, and webhook rows only once processed (unprocessed ones are still needed); deliveries with an OPEN stage younger than 7 days become blocker DELIVERY_IN_PROGRESS, older ones are scrubbed as finished - if wrong, a live delivery delays deletion a few days.
- Ruling: I3 - referral forfeit and CASH_OUT_IN_FLIGHT apply to ALL only (spec table scopes referral to A; spec beats plan's "CUSTOMER credits") - if wrong, a customer-only deleter keeps referral credits.
- Ruling: fix wave also takes Pidge trips[].receiver_detail scrub, user-chef admin queue hides erased applications, advanced logs the module on a stale switched-off schema failure, order customer_note scrub on orders without dropoff (M2), and one shared idempotency actor-hash helper in order (M4).
- Task 4: parked - forfeit posts against REFERRAL_CHECKOUT_CLEARING - Ruling: real; needs a new counterparty + finance sign-off; plan 2 must not enable the referral erase for ALL until finance rules - cost: a permanent clearing-account credit per forfeit.
- Ruling: pickup lat/lng (order) and kitchen_lat/lng (fleet trip) set to 0 on chef erase - the columns are NOT NULL / CHECK-bound, so a value is required, and 0 matches the existing dropoff convention - cost if wrong: other customers' old orders show a 0,0 pickup point (cosmetic).
- Ruling: chef pickup stop still inside published domain events, delivery commands and Pidge sender_detail/poc_detail is real but outside this wave - carry to plan 2 as a follow-up scrub task (same pattern as the customer dropoff scrub) - cost if wrong: a chef's kitchen (often home) address stays in old outbox/command payloads until that task ships.
- Ruling: Cashfree default order expiry may exceed the 24 h C1 window - follow-up: send order_expiry_time = 24 h on checkout so the provider and the blocker agree - cost if wrong: a payment completed after 24 h lands on an anonymised order.

## Notes for plan 2 (auth coordinator)

- Coordinator notes (plan 2): advanced service name "advanced"; counts keyed by module id.
- Plan 2 note: order-service keeps UNSENT customer notification_outbox rows; if dispatched after notification-service erase they recreate in-app notices — coordinator should erase notification last (or re-run it at the end).
- Plan 2 note: a chef can reopen the kitchen during the 30-day wait (prepare only pauses); catalog must refuse reopening while pause_reason='ACCOUNT_DELETION', and 'Keep my account' needs an undo-prepare call that reopens it.
- Plan 2 note: between catalog erase and auth's final login wipe a signed-in chef can still upload photos / save the kitchen; coordinator must refuse chef writes (deletion_pending claim) or revoke sessions before the service erases.
- Plan 2 note: meal-plan payment webhooks (subscription_payment_intent provider ids) cannot be matched in integration - coordinator must pass provider/order ids.
- Plan 2 note (M1): treat 409 as BLOCKED only when body status=="BLOCKED"; auth failures are 401/403/503 per service; subscription prepare can 409/403 on lifecycle refusals; referral 409 JOURNAL_KEY_CONFLICT.
- Plan 2 note (M6): "your account was deleted" SMS/email creates a new notification_request - send before the notification step or re-run notification erase last.
- Plan 2 note (M7): abandoned meal-plan checkouts (PENDING_PAYMENT + PAYMENT_REQUESTED) block until staff act - consider ageing out like C1.

## Notes for plan 5 (rollout)

- Plan 5 note: advanced container app needs CRAVES_INTERNAL_SERVICE_SECRET (503 until set).
- Plan 5 note: notification needs CRAVES_INTERNAL_SERVICE_KEY; check Azure override of CRAVES_INTERNAL_AUTH_ALLOWED_CALLERS (must include /internal/v1/account-erasure/**=auth).
- Plan 5 note (M5): per-service matrix - CRAVES_INTERNAL_SERVICE_KEY: order, integration, notification; CRAVES_INTERNAL_SERVICE_SECRET: subscription, user-chef, catalog, advanced; header X-Craves-Internal-Key: catalog, notification; X-Craves-Internal-Secret: others; referral HMAC; check Azure CRAVES_INTERNAL_AUTH_ALLOWED_CALLERS overrides on all six InternalCallFilter services.

## Deferred minor findings

- Task 1 re-review (a7f114d41b9768dbd): Approved. Parked Minor: SubscriptionRepository.java:248 writes a fixed creation reason with the customer as actor; erase blanks it too — harmless, comment slightly overstated.
- Task 3: minor (deferred): DropoffScrubber turns numeric fields into string placeholders (doc says numbers stay numbers).
- Task 3: minor (deferred): Pidge branch targets drop[].poc_detail/address that Craves never sends; real shape trips[].receiver_detail; report disclosure wrong.
- Task 3: minor (deferred): DB test builds the service with new ObjectMapper(), no Spring-context wiring test.
- Task 4: minor (deferred): forfeit posts against CHECKOUT_CLEARING because integration's ReferralJournalMirror rejects unknown counterparties; a dedicated forfeiture counterparty needs a coordinated integration change — finance follow-up.
- Task 4: minor (deferred): a SPEND reservation still RESERVED at erase is not a blocker (order-service's in-progress blocker covers live checkouts; an abandoned reservation would later release into a retired wallet).
- Task 5: minor (deferred): a switched-off schema that is migrated but stale/partly migrated makes the erase 500 forever (no comment/log naming it).
- Task 5: minor (deferred): TasteDataController.usable duplicates AccountErasureService.reachable.
- Task 5: minor (deferred): counts keyed by module id (taste-data = consent only; idempotency deletes uncounted) — coordinator must not parse keys.
- Task 5: minor (deferred): body validated before the secret (400 before 401/503), same as subscription/integration.
- Task 5: minor (deferred): internal erase receipt keeps the erased identity UUID + module list.
- Task 5: minor (deferred): platform.erasure imports TasteDataModule and owns taste-data SQL (two-way package dependency).
- Task 5: minor (deferred): no test that DELETE my-taste-data still skips a switched-off module.
- Task 5: minor (deferred): retry test uses ALL, not the same scope as the first call.
- Task 5: minor (deferred): CUSTOMER scope deletes adv_platform.idempotency_record by actor_id, incl. chef-role keyed replies (48 h caches).
- Task 5: minor (deferred): adv_trust.report.reporter_id treated as customer-side (report filing has no role gate).
- Task 6: minor (deferred): body bound before key check (400 before 403), matches pattern controllers.
- Task 6: minor (deferred): SQL built with String.formatted %s — a later LIKE '%' would break; add a comment.
- Task 6: minor (deferred): DB test builds service without Spring proxy (single-transaction stop+blank untested); stop's next_attempt_at/locked_at clearing not asserted.
- Task 6: minor (deferred): NotificationStatus.SKIPPED now also means "account erased"; dashboards counting SKIPPED as opt-out include these.
- Task 7: minor (deferred): photo uploaded between blob listing and DB commit is orphaned in storage.
- Task 7: minor (deferred): delivery provider keeps the real pickup address of DELIVERED provisioning rows (outside catalog) — disclose in privacy text (plan 4).
- Task 7: minor (deferred): menu item names/descriptions, cuisines and catalog audit tables (identity UUID + short reasons) untouched.
- Task 7: minor (deferred): blobs no row names (earlier swallowed deletes, upload race) never deleted — prefix delete under public/kitchens/{id}/ and public/dishes/{id}/ would close it.
- Task 7: minor (deferred): prepare close writes no kitchen_schedule_audit row.
- Task 7: minor (deferred): no filter-chain test that /internal/v1/account-erasure passes SecurityConfig.
- Task 7: minor (deferred): each blob delete rebuilds the container client + createIfNotExists.
- Task 8: minor (deferred): submitApplication's reopen always rolls back (USE_NEW_ONBOARDING_FLOW) — add a comment.
- Task 8: minor (deferred): body parsed before requireValid (400 before 401).
- Task 8: minor (deferred): InternalAccountErasureHttpTest only string-checks application.yml, not InternalCallFilter.
- Task 8: minor (deferred): stripped() SQL repeats sub-expressions ~6 times.
- Task 8: minor (deferred): reopen via lock() without prior mine() untested.
- Task 8: minor (deferred): admin listApplications keeps an erased PENDING application in the queue as "Deleted" (every action 409s); filter/label later.
- Task 8: minor (deferred): REOPENED_AFTER_ERASURE snapshots keep original_file_name (can be a person's name) and review_reason — same as live KYC rows (kept per decision 8).
- Final review M3 (can wait): NAMES_A_FINISHED_ORDER position() scan without index.
- Final review follow-ups (can wait): spec data table needs rows for CHEF count keys customer_order_pickup / fleet_trip_kitchen; fleet trip stuck after its order finished keeps kitchen contact; V39 statuses PICKED_UP/ARRIVED_AT_DROP not in order IN_PROGRESS (unused by OrderStatus today); checkout_pricing_quote_kitchen keeps kitchen pickup coordinates; Pidge quote drop[].location not scrubbed; fleet_schema.trip has no chef_id index.

## Test results at 0761f0065 (local, embedded PostgreSQL 16.4 with stub PostGIS)

- Final suites at HEAD 0761f0065: subscription 256/0 (5 env-skipped), notification 124/0, catalog 171 with 4 errors (stub PostGIS ST_DWithin, local only), order 416/0, integration 1325/0, referral IT 89/0, user-chef 297 with 1 error (stub PostGIS ST_Distance, local only), advanced IT 1 failure (ContractsIT CRLF, local only).
