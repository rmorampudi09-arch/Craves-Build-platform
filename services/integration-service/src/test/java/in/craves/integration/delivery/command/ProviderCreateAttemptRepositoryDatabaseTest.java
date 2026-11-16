package in.craves.integration.delivery.command;

import static in.craves.integration.delivery.command.ProviderCreateAttemptRepository.INTENT;
import static in.craves.integration.delivery.command.ProviderCreateAttemptRepository.ORPHAN_SUSPECT;
import static in.craves.integration.delivery.command.ProviderCreateAttemptRepository.REJECTED;
import static in.craves.integration.delivery.command.ProviderCreateAttemptRepository.UNKNOWN;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.ProviderCreateAttemptRepository.Attempt;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.QuoteRequest;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.Stop;
import in.craves.integration.fleet.FleetDatabase;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/** The booking journal's rules on PostgreSQL with every migration: the two unique indexes, the compare-and-set and the claims. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class ProviderCreateAttemptRepositoryDatabaseTest {
    final FleetDatabase database = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final ProviderCreateAttemptRepository journal = new ProviderCreateAttemptRepository(database.db, new DeliveryCommandProperties());
    final DeliveryCommandRepository commands = new DeliveryCommandRepository(database.db, json);
    final UUID order = UUID.randomUUID();

    @Test
    void aCourierIsBookedAgainOnlyAfterRefusalsAndAtMostThreeTimes() {
        Attempt first = journal.begin(order, "borzo").orElseThrow();
        assertThat(first.attemptNo()).isEqualTo(1);
        assertThat(first.state()).isEqualTo(INTENT);
        assertThat(first.clientRef()).hasSize(27).matches("[0-9a-z]{26}1");
        assertThat(journal.begin(order, "borzo")).as("an unresolved attempt blocks the next").isEmpty();

        assertThat(journal.move(first, Set.of(INTENT), REJECTED, "refused", null)).isTrue();
        Attempt second = journal.begin(order, "borzo").orElseThrow();
        assertThat(second.clientRef()).isEqualTo(first.clientRef().substring(0, 26) + "2");
        journal.move(second, Set.of(INTENT), REJECTED, null, null);
        Attempt third = journal.begin(order, "borzo").orElseThrow();
        journal.move(third, Set.of(INTENT), REJECTED, null, null);
        assertThat(journal.begin(order, "borzo")).as("the cap of three").isEmpty();

        List<Attempt> rows = journal.forOrder(order);
        assertThat(rows).extracting(Attempt::attemptNo).containsExactly(1, 2, 3);
        assertThat(ProviderCreateAttemptRepository.bookable(rows)).isFalse();
        assertThat(ProviderCreateAttemptRepository.bookable(rows.subList(0, 2))).isTrue();
        assertThat(journal.find("borzo", first.clientRef())).map(Attempt::state).contains(REJECTED);
        assertThat(database.db.queryForObject("SELECT error FROM delivery_schema.provider_create_attempt WHERE client_ref = ?", String.class,
            first.clientRef())).isEqualTo("refused");
    }

    @Test
    void oneUnresolvedBookingPerOrderWhicheverTheCourier() {
        Attempt borzo = journal.begin(order, "borzo").orElseThrow();
        assertThat(journal.begin(order, "pidge")).as("INTENT blocks every courier").isEmpty();
        journal.move(borzo, Set.of(INTENT), UNKNOWN, "timeout", null);
        assertThat(journal.begin(order, "pidge")).as("UNKNOWN blocks every courier").isEmpty();

        journal.move(borzo, Set.of(UNKNOWN), ORPHAN_SUSPECT, null, Instant.now());
        assertThat(journal.begin(order, "pidge")).as("an orphan suspect lets the order move on").isPresent();
        assertThat(ProviderCreateAttemptRepository.bookable(List.of(journal.find("borzo", borzo.clientRef()).orElseThrow())))
            .as("but its own courier is not booked again").isFalse();
    }

    @Test
    void onlyOneOfTwoConcurrentCallersChangesARow() throws Exception {
        Attempt attempt = journal.begin(order, "borzo").orElseThrow();
        Callable<Boolean> move = () -> journal.move(attempt, Set.of(INTENT), UNKNOWN, null, null);
        var pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<Boolean>> results = pool.invokeAll(List.of(move, move));
            assertThat(List.of(results.get(0).get(), results.get(1).get())).containsExactlyInAnyOrder(true, false);
        } finally {
            pool.shutdown();
        }
    }

    @Test
    void confirmSaysHowTheBookingWasLearned() {
        Attempt answered = journal.begin(order, "borzo").orElseThrow();
        assertThat(journal.confirm(order, "borzo", "1250032")).isTrue();
        assertThat(journal.find("borzo", answered.clientRef())).map(Attempt::state).contains("CONFIRMED");
        assertThat(journal.confirm(order, "borzo", "1250032")).as("only once").isFalse();

        UUID other = UUID.randomUUID();
        Attempt lost = journal.begin(other, "borzo").orElseThrow();
        journal.move(lost, Set.of(INTENT), UNKNOWN, null, null);
        assertThat(journal.confirm(other, "borzo", "1250033")).isTrue();
        Attempt adopted = journal.find("borzo", lost.clientRef()).orElseThrow();
        assertThat(adopted.state()).isEqualTo("ADOPTED");
        assertThat(adopted.providerRef()).isEqualTo("1250033");
    }

    @Test
    void aStrayBookingIsKeptWithItsIdAndClosesItsCourier() {
        Attempt attempt = journal.begin(order, "pidge").orElseThrow();
        assertThat(journal.stray(order, "pidge", "PG-1")).isTrue();
        Attempt stray = journal.find("pidge", attempt.clientRef()).orElseThrow();
        assertThat(stray.state()).isEqualTo(ORPHAN_SUSPECT);
        assertThat(stray.providerRef()).isEqualTo("PG-1");
        assertThat(journal.claimDueChecks(5)).as("its id is known: nothing to look up").isEmpty();
    }

    @Test
    void aDueLookupGoesToOneCallerAndLeavesTheStateClockAlone() throws Exception {
        Attempt orphan = journal.begin(order, "borzo").orElseThrow();
        journal.move(orphan, Set.of(INTENT), ORPHAN_SUSPECT, null, Instant.now().minusSeconds(1));
        UUID refusedOrder = UUID.randomUUID();
        Attempt refused = journal.begin(refusedOrder, "borzo").orElseThrow();
        journal.move(refused, Set.of(INTENT), REJECTED, null, Instant.now().minusSeconds(1));
        database.db.update("UPDATE delivery_schema.provider_create_attempt SET updated_at = now() - INTERVAL '11 minutes'");
        Instant stateClock = journal.find("borzo", orphan.clientRef()).orElseThrow().updatedAt();

        var pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<List<Attempt>>> claims = pool.invokeAll(List.<Callable<List<Attempt>>>of(() -> journal.claimDueChecks(5),
                () -> journal.claimDueChecks(5)));
            assertThat(claims.get(0).get().size() + claims.get(1).get().size()).as("each due row to exactly one caller").isEqualTo(2);
        } finally {
            pool.shutdown();
        }
        assertThat(journal.claimDueChecks(5)).isEmpty();
        assertThat(journal.find("borzo", orphan.clientRef()).orElseThrow().updatedAt()).isEqualTo(stateClock);
        assertThat(nextCheckInSeconds(orphan)).as("an orphan suspect is due again in 5 minutes").isBetween(290, 300);
        assertThat(nextCheckInSeconds(refused)).as("a refusal is looked up once").isNull();

        journal.checkAgain(refused, Instant.now().minusSeconds(1));
        assertThat(journal.claimDueChecks(5)).extracting(Attempt::clientRef).containsExactly(refused.clientRef());
        journal.foundAt(refused, "1250040");
        Attempt found = journal.find("borzo", refused.clientRef()).orElseThrow();
        assertThat(found.providerRef()).isEqualTo("1250040");
        assertThat(ProviderCreateAttemptRepository.bookable(List.of(found))).as("a refusal that booked after all closes its courier").isFalse();

        database.db.update("UPDATE delivery_schema.provider_create_attempt SET created_at = now() - INTERVAL '121 minutes', next_check_at = now() "
            + "WHERE client_ref = ?", orphan.clientRef());
        assertThat(journal.claimDueChecks(5)).hasSize(1);
        assertThat(nextCheckInSeconds(orphan)).as("re-checks stop once the attempt is 2 hours old").isNull();
    }

    @Test
    void theSweepTakesOnlyUnresolvedRowsNobodyIsWorkingOn() {
        Attempt abandoned = journal.begin(order, "borzo").orElseThrow();
        command(order, "COMPLETED");
        UUID reconciling = UUID.randomUUID();
        Attempt held = journal.begin(reconciling, "borzo").orElseThrow();
        command(reconciling, "RECONCILIATION_PENDING");
        UUID fresh = UUID.randomUUID();
        Attempt recent = journal.begin(fresh, "borzo").orElseThrow();
        command(fresh, "DEAD_LETTER");
        database.db.update("UPDATE delivery_schema.provider_create_attempt SET updated_at = now() - INTERVAL '16 minutes' WHERE client_ref <> ?",
            recent.clientRef());

        assertThat(journal.sweepAbandoned()).isEqualTo(1);
        assertThat(journal.find("borzo", abandoned.clientRef())).map(Attempt::state).contains(ORPHAN_SUSPECT);
        assertThat(journal.find("borzo", held.clientRef())).map(Attempt::state).contains(INTENT);
        assertThat(journal.find("borzo", recent.clientRef())).map(Attempt::state).contains(INTENT);
        assertThat(journal.claimDueChecks(5)).extracting(Attempt::clientRef).containsExactly(abandoned.clientRef());
    }

    private Integer nextCheckInSeconds(Attempt attempt) {
        return database.db.queryForObject("SELECT CAST(extract(epoch FROM next_check_at - now()) AS integer) FROM "
            + "delivery_schema.provider_create_attempt WHERE client_ref = ?", Integer.class, attempt.clientRef());
    }

    private void command(UUID chefSubOrderId, String status) {
        UUID orderId = UUID.randomUUID();
        Stop stop = new Stop("Madhapur, Hyderabad", "Chef", "919999999991", new BigDecimal("17.4483"), new BigDecimal("78.3915"), null, null, null);
        commands.createOrFind(new DeliveryCommandMessage(UUID.randomUUID(), UUID.randomUUID(), orderId, orderId, chefSubOrderId,
            Instant.now().plusSeconds(600), Instant.now(), chefSubOrderId.toString(), 4.6, "Madhapur", 8, 4,
            new QuoteRequest("Packaged food", 2000, false, stop, stop)));
        if ("RECONCILIATION_PENDING".equals(status)) {
            // As the worker gets there: the table's constraint wants the reconciliation identity with that status.
            UUID id = commands.findByChefSubOrderId(chefSubOrderId).orElseThrow().id();
            commands.claim(id, 5);
            assertThat(commands.markReconciliationPending(id, "borzo", "ref", Instant.now(), "lost")).isTrue();
            return;
        }
        database.db.update("UPDATE delivery_schema.delivery_command SET status = ? WHERE chef_sub_order_id = ?", status, chefSubOrderId);
    }
}
