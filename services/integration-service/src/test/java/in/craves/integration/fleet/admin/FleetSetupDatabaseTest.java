package in.craves.integration.fleet.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetPolicyStore.DispatchRules;
import in.craves.integration.fleet.FleetPolicyStore.TermsChange;
import in.craves.integration.fleet.FleetRoleClient;
import in.craves.integration.fleet.FleetStorage;
import in.craves.integration.fleet.FleetTestMode;
import in.craves.integration.fleet.admin.FleetAdminModels.Admin;
import in.craves.integration.fleet.admin.FleetAdminModels.DispatchPolicyInput;
import in.craves.integration.fleet.admin.FleetAdminModels.DispatchPolicyVersion;
import in.craves.integration.fleet.admin.FleetAdminModels.FleetSetup;
import in.craves.integration.fleet.admin.FleetAdminModels.PilotKitchen;
import in.craves.integration.fleet.admin.FleetAdminModels.PilotNote;
import in.craves.integration.fleet.admin.FleetAdminModels.PilotRider;
import in.craves.integration.fleet.admin.FleetAdminModels.RateCardDraft;
import in.craves.integration.fleet.admin.FleetAdminModels.RateCardVersion;
import in.craves.integration.payout.bank.BankDataCipher;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.support.TransactionTemplate;

/** Publishing from the console and the pilot allow-lists against a real database, each call in its own transaction. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetSetupDatabaseTest {
    final FleetDatabase fleet = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final Admin ops = new Admin(UUID.randomUUID(), "Admin +91 98xxxxx210");
    final TransactionTemplate transaction = new TransactionTemplate(fleet.transactions);
    // The seeded draft 2026-10-v1 takes the first number of October 2026.
    final String month = YearMonth.now(ZoneId.of("Asia/Kolkata")).toString();
    final int first = "2026-10".equals(month) ? 2 : 1;
    FleetSetupService setup;

    @BeforeEach
    void setUp() {
        FleetAdminService admin = new FleetAdminService(fleet.db, json, mock(FleetStorage.class), mock(FleetRoleClient.class),
            mock(BankDataCipher.class));
        setup = new FleetSetupService(fleet.db, json, new FleetPolicyStore(fleet.db, json), admin, FleetDatabase.properties(true));
    }

    @Test
    void theFirstRateCardPublishesAtOnceAndTheNextNeedsFourteenDays() {
        RateCardVersion draft = (RateCardVersion) tx(() -> setup.createRateCardDraft(ops, UUID.randomUUID(),
            card(Instant.now().minus(1, ChronoUnit.HOURS), ranges())));
        assertThat(draft.version()).isEqualTo(month + "-v" + first);
        assertThat(draft.status()).isEqualTo("DRAFT");
        assertThat(draft.publishedAt()).isNull();
        assertThat(draft.ranges()).containsEntry("baseDropM", List.of(1000L, 3000L)).hasSize(11);

        RateCardVersion published = (RateCardVersion) tx(() -> setup.publishRateCard(ops, UUID.randomUUID(), draft.version()));
        assertThat(published.status()).isEqualTo("PUBLISHED");
        assertThat(published.effectiveFrom()).as("a first card starting in the past starts now").isEqualTo(published.publishedAt());
        assertThat(tx(setup::setup).rateCard().version()).isEqualTo(draft.version());

        refused(() -> setup.createRateCardDraft(ops, UUID.randomUUID(), card(Instant.now().plus(1, ChronoUnit.DAYS),
            Map.of("basePaise", List.of(0L, 9000L)))), 422, "RANGES_LOCKED");
        RateCardVersion soon = (RateCardVersion) tx(() -> setup.createRateCardDraft(ops, UUID.randomUUID(),
            card(Instant.now().plus(1, ChronoUnit.DAYS), null)));
        assertThat(soon.version()).isEqualTo(month + "-v" + (first + 1));
        assertThat(soon.ranges()).as("later cards keep the published ranges").isEqualTo(draft.ranges());
        refused(() -> setup.publishRateCard(ops, UUID.randomUUID(), soon.version()), 422, "VERSION_REFUSED");

        RateCardVersion later = (RateCardVersion) tx(() -> setup.createRateCardDraft(ops, UUID.randomUUID(),
            card(Instant.now().plus(15, ChronoUnit.DAYS), null)));
        tx(() -> setup.publishRateCard(ops, UUID.randomUUID(), later.version()));
        FleetSetup now = tx(setup::setup);
        assertThat(now.rateCard().version()).as("the later card waits for its date").isEqualTo(draft.version());
        assertThat(now.rateCards()).extracting(RateCardVersion::version)
            .containsExactly(later.version(), soon.version(), draft.version(), "2026-10-v1");
        refused(() -> setup.publishRateCard(ops, UUID.randomUUID(), later.version()), 409, "VERSION_ALREADY_PUBLISHED");
        refused(() -> setup.publishRateCard(ops, UUID.randomUUID(), "2026-01-v9"), 404, "VERSION_NOT_FOUND");
        assertThat(audited("RATE_CARD_DRAFTED")).isEqualTo(3);
        assertThat(audited("RATE_CARD_PUBLISHED")).isEqualTo(2);
    }

    @Test
    void theTriggerRefusesADirectUpdateThatBreaksTheRule() {
        RateCardVersion draft = (RateCardVersion) tx(() -> setup.createRateCardDraft(ops, UUID.randomUUID(), card(Instant.now(), ranges())));
        tx(() -> setup.publishRateCard(ops, UUID.randomUUID(), draft.version()));
        assertThatThrownBy(() -> fleet.db.update("UPDATE fleet_schema.rate_card SET status = 'PUBLISHED', published_at = now(), "
            + "effective_from = now() + INTERVAL '1 day' WHERE version = '2026-10-v1'")).isInstanceOf(DataIntegrityViolationException.class);
        fleet.db.update("UPDATE fleet_schema.rate_card SET status = 'PUBLISHED', published_at = now(), "
            + "effective_from = now() + INTERVAL '14 days' WHERE version = '2026-10-v1'");
    }

    @Test
    void aDraftMadeBeforeTheFirstCardTakesThePublishedRangesWhenItIsPublished() {
        Map<String, List<Long>> wider = new LinkedHashMap<>(ranges());
        wider.put("basePaise", List.of(1000L, 9000L));
        RateCardVersion firstCard = (RateCardVersion) tx(() -> setup.createRateCardDraft(ops, UUID.randomUUID(), card(Instant.now(), ranges())));
        RateCardVersion other = (RateCardVersion) tx(() -> setup.createRateCardDraft(ops, UUID.randomUUID(),
            card(Instant.now().plus(15, ChronoUnit.DAYS), wider)));
        tx(() -> setup.publishRateCard(ops, UUID.randomUUID(), firstCard.version()));
        RateCardVersion published = (RateCardVersion) tx(() -> setup.publishRateCard(ops, UUID.randomUUID(), other.version()));
        assertThat(published.ranges()).isEqualTo(firstCard.ranges());
        assertThat(fleet.db.queryForObject("SELECT summary FROM fleet_schema.admin_audit WHERE action = 'RATE_CARD_PUBLISHED' AND target_id = ?",
            String.class, other.version())).endsWith("Its declared ranges were replaced with the published card's.");
    }

    @Test
    void dispatchOffIsImmediateADetourChangeNeedsNoticeOnceRidersHaveTermsAndLiveNeedsARateCardInForce() {
        DispatchPolicyVersion off = (DispatchPolicyVersion) tx(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(), policy("off", 130, null)));
        assertThat(off.version()).isEqualTo(month + "-v" + first);
        assertThat(off.status()).isEqualTo("PUBLISHED");
        assertThat(off.effectiveFrom()).as("the first policy starts at once").isEqualTo(off.publishedAt());
        assertThat(off.ranges()).containsEntry("pickupDetourPercent", List.of(100L, 200L)).hasSize(7);
        assertThat(tx(setup::setup).dispatchPolicy().mode()).isEqualTo("off");

        refused(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(), policy("live", 130, null)), 422, "RATE_CARD_REQUIRED");
        refused(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(), policy("shadow", 250, null)), 422, "VERSION_REFUSED");
        refused(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(), policy("shadow", 130, Instant.now().plus(3, ChronoUnit.DAYS))), 422,
            "NOTICE_TOO_SHORT");
        DispatchPolicyVersion early = (DispatchPolicyVersion) tx(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(), policy("shadow", 150, null)));
        assertThat(early.effectiveFrom()).as("no rate card is published, so riders have no terms to give notice of")
            .isEqualTo(early.publishedAt());

        RateCardVersion card = (RateCardVersion) tx(() -> setup.createRateCardDraft(ops, UUID.randomUUID(), card(Instant.now(), ranges())));
        tx(() -> setup.publishRateCard(ops, UUID.randomUUID(), card.version()));
        refused(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(), policy("shadow", 130, null)), 422, "DETOUR_NEEDS_NOTICE");
        Instant notice = Instant.now().plus(15, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MICROS);
        DispatchPolicyVersion detour = (DispatchPolicyVersion) tx(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(),
            policy("shadow", 130, notice)));
        assertThat(detour.effectiveFrom()).isEqualTo(notice);
        DispatchPolicyVersion live = (DispatchPolicyVersion) tx(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(), policy("live", 150, null)));
        DispatchPolicyVersion stop = (DispatchPolicyVersion) tx(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(),
            new DispatchPolicyInput("off", 10, null, null, 999, null, null, null, null)));
        assertThat(stop.pickupDetourPercent()).as("a stale page still stops: the values in force are kept").isEqualTo(150);
        assertThat(stop.offerSeconds()).isEqualTo(40);
        FleetSetup now = tx(setup::setup);
        assertThat(now.dispatchPolicy().version()).as("off is the emergency stop: at once").isEqualTo(stop.version());
        assertThat(now.dispatchPolicies()).as("five versions and the seeded draft").hasSize(6);
        assertThat(audited("DISPATCH_POLICY_SET")).isEqualTo(5);
        assertThatThrownBy(() -> fleet.db.update("UPDATE fleet_schema.dispatch_policy SET pickup_detour_percent = 160 WHERE version = ?",
            live.version())).as("published versions never change").isInstanceOf(DataIntegrityViolationException.class);
    }

    /** Decided 1 Nov 2026: the console sends only the mode, and every value and rule left out is the built-in one. */
    @Test
    void aModeAloneGetsTheBuiltInDispatch() {
        DispatchPolicyVersion shadow = (DispatchPolicyVersion) tx(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(),
            new DispatchPolicyInput("shadow", null, null, null, null, null, null, null, null)));
        assertThat(List.of(shadow.offerSeconds(), shadow.fleetStageSeconds(), shadow.radiusM(), shadow.pickupDetourPercent(),
            shadow.pidgeStageSeconds())).containsExactly(30, 120, 5000, 130, 600);
        assertThat(rules(shadow)).as("one rider at a time, up to 3 rounds, fair turns within 1.5 km").isEqualTo(DispatchRules.BUILT_IN);
        assertThat(tx(setup::setup).builtInDispatch()).isEqualTo(FleetAdminModels.BuiltInDispatch.current());
        assertThat(FleetAdminModels.BuiltInDispatch.current().offerRounds() * FleetAdminModels.BuiltInDispatch.current().offerSeconds())
            .as("every round gets its full time inside the fleet stage").isLessThanOrEqualTo(FleetAdminModels.BuiltInDispatch.current().fleetStageSeconds());
    }

    /**
     * Phase 4: how orders are offered goes with the policy. Kept unless sent (an emergency stop never changes it), within its
     * bounds, rounds that fit the fleet stage, and once riders have terms a change needs 14 days' notice, in Java and in the table.
     */
    @Test
    void offerRulesAreKeptUnlessSentMustFitTheStageAndChangeForRidersOnlyWithNotice() {
        DispatchPolicyVersion first = (DispatchPolicyVersion) tx(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(), policy("off", 130, null)));
        assertThat(rules(first)).as("today's rules: the three nearest at once, one round").isEqualTo(DispatchRules.TODAY);
        refused(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(), offering("shadow", 4, 1, 0, null)), 400, "VALIDATION_FAILED");
        refused(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(), offering("shadow", 1, 6, 0, null)), 400, "VALIDATION_FAILED");
        refused(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(), offering("shadow", 1, 3, 5001, null)), 400, "VALIDATION_FAILED");
        refused(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(), offering("shadow", 1, 4, 0, null)), 400, "VALIDATION_FAILED");
        DispatchPolicyVersion fair = (DispatchPolicyVersion) tx(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(),
            offering("shadow", 1, 3, 1500, null)));
        assertThat(rules(fair)).as("3 rounds of 30 s fit a 90 s stage").isEqualTo(new DispatchRules(1, 3, 1500));
        DispatchPolicyVersion kept = (DispatchPolicyVersion) tx(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(),
            offering("shadow", null, null, null, null)));
        assertThat(rules(kept)).as("not sent: the built-in rules").isEqualTo(DispatchRules.BUILT_IN);
        refused(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(), policy("shadow", 130, null)), 400, "VALIDATION_FAILED");

        RateCardVersion card = (RateCardVersion) tx(() -> setup.createRateCardDraft(ops, UUID.randomUUID(), card(Instant.now(), ranges())));
        tx(() -> setup.publishRateCard(ops, UUID.randomUUID(), card.version()));
        refused(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(), offering("shadow", 3, 1, 0, null)), 422, "RULES_NEED_NOTICE");
        DispatchPolicyVersion stop = (DispatchPolicyVersion) tx(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(),
            new DispatchPolicyInput("off", null, null, null, null, null, null, null, null)));
        assertThat(rules(stop)).as("the emergency stop needs no notice: it keeps the rules").isEqualTo(new DispatchRules(1, 3, 1500));
        Instant notice = Instant.now().plus(15, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MICROS);
        tx(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(), offering("shadow", 3, 1, 0, notice)));
        TermsChange change = new FleetPolicyStore(fleet.db, json).nextTermsChange().orElseThrow();
        assertThat(change.at()).isEqualTo(notice);
        assertThat(change.rulesBefore()).isEqualTo(new DispatchRules(1, 3, 1500));
        assertThat(change.rulesAfter()).isEqualTo(DispatchRules.TODAY);
        assertThat(change.detourAfter()).isEqualTo(change.detourBefore());

        assertThatThrownBy(() -> fleet.db.update("INSERT INTO fleet_schema.dispatch_policy (version, status, effective_from, published_at, "
            + "mode, offer_seconds, fleet_stage_seconds, radius_m, pickup_detour_percent, ranges, offers_at_once) VALUES ('2099-01-v1', "
            + "'PUBLISHED', now(), now(), 'off', 30, 90, 5000, 130, '{}', 2)")).as("the table holds the notice rule too")
            .isInstanceOf(DataIntegrityViolationException.class).hasMessageContaining("changes how orders are offered");
    }

    /**
     * Phase 5: ranking by travel time is a rule of how orders are offered, like the others: kept unless sent, and once riders
     * have terms, changed only with 14 days' notice, by the service and by the table's trigger alike.
     */
    @Test
    void rankingByTravelTimeIsARuleRidersGetNoticeOf() {
        DispatchPolicyVersion first = (DispatchPolicyVersion) tx(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(),
            travelTime("shadow", true, null)));
        assertThat(first.rankByTravelTime()).as("before any rate card riders have no terms: at once").isTrue();
        DispatchPolicyVersion kept = (DispatchPolicyVersion) tx(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(),
            offering("shadow", null, null, null, null)));
        assertThat(kept.rankByTravelTime()).as("not sent: kept as riders are shown it").isTrue();

        RateCardVersion card = (RateCardVersion) tx(() -> setup.createRateCardDraft(ops, UUID.randomUUID(), card(Instant.now(), ranges())));
        tx(() -> setup.publishRateCard(ops, UUID.randomUUID(), card.version()));
        refused(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(), travelTime("shadow", false, null)), 422, "RULES_NEED_NOTICE");
        DispatchPolicyVersion stop = (DispatchPolicyVersion) tx(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(),
            new DispatchPolicyInput("off", null, null, null, null, null, null, null, null)));
        assertThat(stop.rankByTravelTime()).as("the emergency stop keeps the rules").isTrue();
        Instant notice = Instant.now().plus(15, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MICROS);
        tx(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(), travelTime("shadow", false, notice)));
        TermsChange change = new FleetPolicyStore(fleet.db, json).nextTermsChange().orElseThrow();
        assertThat(change.at()).isEqualTo(notice);
        assertThat(change.rulesBefore().byTravelTime()).isTrue();
        assertThat(change.rulesAfter().byTravelTime()).isFalse();

        assertThatThrownBy(() -> fleet.db.update("INSERT INTO fleet_schema.dispatch_policy (version, status, effective_from, published_at, "
            + "mode, offer_seconds, fleet_stage_seconds, radius_m, pickup_detour_percent, ranges, rank_by_travel_time) VALUES ('2099-01-v1', "
            + "'PUBLISHED', now(), now(), 'off', 30, 90, 5000, 130, '{}', false)")).as("the table holds the notice rule too")
            .isInstanceOf(DataIntegrityViolationException.class).hasMessageContaining("changes how orders are offered");
    }

    /** Offers of 30 s in a 90 s fleet stage, the three nearest at once, ranked by travel time or not. */
    private static DispatchPolicyInput travelTime(String mode, boolean byTravelTime, Instant effectiveFrom) {
        return new DispatchPolicyInput(mode, 30, 90, 5000, 130, 500L, 1000L, 600, effectiveFrom, null, null, null, byTravelTime);
    }

    @Test
    void twoVersionsCannotStartAtTheSameMomentUnlessOneWasWithdrawn() {
        Instant start = Instant.now().plus(20, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MICROS);
        tx(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(), policy("off", 130, null)));
        tx(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(), policy("shadow", 150, start)));
        refused(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(), policy("shadow", 130, start)), 409, "START_TAKEN");
        tx(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(), policy("off", 130, null)));
        tx(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(), policy("off", 130, null)));
        DispatchPolicyVersion again = (DispatchPolicyVersion) tx(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(),
            policy("shadow", 130, start)));
        assertThat(again.effectiveFrom()).as("the stop withdrew the first, which frees its moment; two stops never collide").isEqualTo(start);

        RateCardVersion firstCard = (RateCardVersion) tx(() -> setup.createRateCardDraft(ops, UUID.randomUUID(), card(Instant.now(), ranges())));
        tx(() -> setup.publishRateCard(ops, UUID.randomUUID(), firstCard.version()));
        RateCardVersion one = (RateCardVersion) tx(() -> setup.createRateCardDraft(ops, UUID.randomUUID(), card(start, null)));
        RateCardVersion two = (RateCardVersion) tx(() -> setup.createRateCardDraft(ops, UUID.randomUUID(), card(start, null)));
        tx(() -> setup.publishRateCard(ops, UUID.randomUUID(), one.version()));
        refused(() -> setup.publishRateCard(ops, UUID.randomUUID(), two.version()), 409, "START_TAKEN");
    }

    @Test
    void anEmergencyStopWithdrawsVersionsScheduledForLaterSoDispatchStaysStopped() {
        tx(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(), policy("shadow", 130, null)));
        DispatchPolicyVersion scheduled = (DispatchPolicyVersion) tx(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(),
            policy("shadow", 150, Instant.now().plus(15, ChronoUnit.DAYS))));
        tx(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(), policy("shadow", 130, null)));
        assertThat(version(scheduled.version()).withdrawnAt()).as("only an immediate off withdraws").isNull();

        DispatchPolicyVersion stop = (DispatchPolicyVersion) tx(() -> setup.setDispatchPolicy(ops, UUID.randomUUID(), policy("off", 130, null)));
        assertThat(stop.withdrawnAt()).isNull();
        assertThat(version(scheduled.version()).withdrawnAt()).isEqualTo(stop.publishedAt());
        assertThat(fleet.db.queryForObject("SELECT withdrawn_by FROM fleet_schema.dispatch_policy WHERE version = ?", UUID.class,
            scheduled.version())).isEqualTo(ops.id());
        assertThat(fleet.db.queryForObject("SELECT summary FROM fleet_schema.admin_audit WHERE action = 'DISPATCH_POLICY_SET' AND target_id = ?",
            String.class, stop.version())).contains("withdrew " + scheduled.version() + " scheduled for " + scheduled.effectiveFrom());

        assertThatThrownBy(() -> fleet.db.update("UPDATE fleet_schema.dispatch_policy SET withdrawn_at = NULL, withdrawn_by = NULL "
            + "WHERE version = ?", scheduled.version())).as("a withdrawn version stays withdrawn").isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> fleet.db.update("UPDATE fleet_schema.dispatch_policy SET withdrawn_at = now(), withdrawn_by = ? "
            + "WHERE version = ?", ops.id(), stop.version())).as("a version in force cannot be withdrawn")
            .isInstanceOf(DataIntegrityViolationException.class);

        // Move every version 16 days into the past, so the scheduled date has passed: the stop is still in force.
        tx(() -> {
            fleet.db.execute("ALTER TABLE fleet_schema.dispatch_policy DISABLE TRIGGER dispatch_policy_notice");
            fleet.db.update("UPDATE fleet_schema.dispatch_policy SET effective_from = effective_from - INTERVAL '16 days', "
                + "published_at = published_at - INTERVAL '16 days', withdrawn_at = withdrawn_at - INTERVAL '16 days' WHERE status = 'PUBLISHED'");
            fleet.db.execute("ALTER TABLE fleet_schema.dispatch_policy ENABLE TRIGGER dispatch_policy_notice");
            return null;
        });
        assertThat(new FleetPolicyStore(fleet.db, json).currentDispatchPolicy().orElseThrow().version()).isEqualTo(stop.version());
        assertThat(tx(setup::setup).dispatchPolicy().mode()).isEqualTo("off");
    }

    @Test
    void pilotRidersAndKitchensAreUpsertedAndRemoved() {
        UUID rider = fleet.rider("Ravi Kumar", "+919876543210");
        UUID kitchen = UUID.randomUUID();
        FleetTestMode testMode = new FleetTestMode(fleet.db, FleetDatabase.properties(true));

        PilotRider added = (PilotRider) tx(() -> setup.addPilotRider(ops, UUID.randomUUID(), rider, new PilotNote(" First pilot rider ")));
        assertThat(added).extracting(PilotRider::name, PilotRider::status, PilotRider::note).containsExactly("Ravi Kumar", "PENDING", "First pilot rider");
        PilotRider again = (PilotRider) tx(() -> setup.addPilotRider(ops, UUID.randomUUID(), rider, null));
        assertThat(again.note()).isNull();
        assertThat(again.addedAt()).isEqualTo(added.addedAt());
        assertThat(testMode.riderAllowed(rider)).isTrue();
        refused(() -> setup.addPilotRider(ops, UUID.randomUUID(), UUID.randomUUID(), null), 404, "RIDER_NOT_FOUND");
        refused(() -> setup.addPilotRider(ops, UUID.randomUUID(), rider, new PilotNote("x".repeat(201))), 400, "VALIDATION_FAILED");

        tx(() -> setup.addPilotKitchen(ops, UUID.randomUUID(), kitchen, new PilotNote("Amma's Kitchen")));
        PilotKitchen renamed = (PilotKitchen) tx(() -> setup.addPilotKitchen(ops, UUID.randomUUID(), kitchen, new PilotNote("Amma's Kitchen, Madhapur")));
        assertThat(renamed.note()).isEqualTo("Amma's Kitchen, Madhapur");
        assertThat(testMode.kitchenAllowed(kitchen)).isTrue();
        FleetSetup listed = tx(setup::setup);
        assertThat(listed.testMode()).isTrue();
        assertThat(listed.pilotRiders()).extracting(PilotRider::riderId).containsExactly(rider);
        assertThat(listed.pilotKitchens()).extracting(PilotKitchen::chefId).containsExactly(kitchen);

        tx(() -> {
            setup.removePilotRider(ops, UUID.randomUUID(), rider);
            setup.removePilotRider(ops, UUID.randomUUID(), rider);
            setup.removePilotRider(ops, UUID.randomUUID(), UUID.randomUUID());
            setup.removePilotKitchen(ops, UUID.randomUUID(), kitchen);
            return null;
        });
        assertThat(testMode.riderAllowed(rider)).isFalse();
        assertThat(testMode.kitchenAllowed(kitchen)).isFalse();
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.admin_audit WHERE action = 'PILOT_RIDER_REMOVED' "
            + "AND rider_id = ?", Integer.class, rider)).as("the rider is on their audit trail").isEqualTo(2);
        assertThat(audited("PILOT_RIDER_REMOVED")).isEqualTo(3);
        assertThat(audited("PILOT_KITCHEN_ADDED")).isEqualTo(2);
        assertThat(audited("PILOT_KITCHEN_REMOVED")).isEqualTo(1);
    }

    private DispatchPolicyVersion version(String version) {
        return tx(setup::setup).dispatchPolicies().stream().filter(policy -> policy.version().equals(version)).findFirst().orElseThrow();
    }

    private <T> T tx(Supplier<T> work) {
        return transaction.execute(status -> work.get());
    }

    private void refused(Runnable work, int status, String code) {
        assertThatThrownBy(() -> tx(() -> {
            work.run();
            return null;
        })).isInstanceOfSatisfying(FleetApiException.class, error -> {
            assertThat(error.status()).isEqualTo(status);
            assertThat(error.code()).isEqualTo(code);
        });
    }

    private int audited(String action) {
        return fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.admin_audit WHERE action = ?", Integer.class, action);
    }

    /** The seeded draft's values. */
    private static RateCardDraft card(Instant effectiveFrom, Map<String, List<Long>> ranges) {
        return new RateCardDraft(4000L, 2000, 900L, 1000, 900L, 8, 150L, 8000L, 2000L, 900L, 10, effectiveFrom,
            Map.of("en", List.of("Pilot pay for Madhapur.")), "https://craves.in/riders/terms", ranges);
    }

    /** The seeded draft's declared ranges, by API name. */
    private static Map<String, List<Long>> ranges() {
        Map<String, List<Long>> ranges = new LinkedHashMap<>();
        ranges.put("basePaise", List.of(3000L, 6000L));
        ranges.put("baseDropM", List.of(1000L, 3000L));
        ranges.put("dropPerKmPaise", List.of(600L, 1500L));
        ranges.put("pickupFreeM", List.of(0L, 2500L));
        ranges.put("pickupPerKmPaise", List.of(0L, 1500L));
        ranges.put("waitFreeMinutes", List.of(5L, 10L));
        ranges.put("waitPerMinutePaise", List.of(100L, 300L));
        ranges.put("slotGuaranteePerHourPaise", List.of(0L, 15000L));
        ranges.put("cancellationFeePaise", List.of(0L, 5000L));
        ranges.put("returnPerKmPaise", List.of(0L, 1500L));
        ranges.put("unreachableWaitMinutes", List.of(5L, 15L));
        return ranges;
    }

    private static DispatchPolicyInput policy(String mode, int detour, Instant effectiveFrom) {
        return new DispatchPolicyInput(mode, 40, 60, 5000, detour, 500L, 1000L, 600, effectiveFrom);
    }

    /** Offers of 30 s in a 90 s fleet stage, with these rules (null: keep). */
    private static DispatchPolicyInput offering(String mode, Integer atOnce, Integer rounds, Integer bandM, Instant effectiveFrom) {
        return new DispatchPolicyInput(mode, 30, 90, 5000, 130, 500L, 1000L, 600, effectiveFrom, atOnce, rounds, bandM);
    }

    private static DispatchRules rules(DispatchPolicyVersion policy) {
        return new DispatchRules(policy.offersAtOnce(), policy.offerRounds(), policy.fairBandM());
    }
}
