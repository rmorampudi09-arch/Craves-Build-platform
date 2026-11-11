package in.craves.integration.fleet.trip;

import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LAT;
import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LNG;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.config.DeliveryIntelligenceProperties;
import in.craves.integration.delivery.DeliveryAssignmentRepository;
import in.craves.integration.delivery.DeliveryIntelligenceModels.AssignmentResponse;
import in.craves.integration.delivery.DeliveryIntelligenceModels.AssignmentStatus;
import in.craves.integration.delivery.DeliveryIntelligenceModels.CandidateStatus;
import in.craves.integration.delivery.DeliveryJsonSupport;
import in.craves.integration.delivery.DeliveryMetricsRepository;
import in.craves.integration.delivery.command.BorzoPidgeHandoffRepository;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandProperties;
import in.craves.integration.delivery.command.DeliveryCommandRepository;
import in.craves.integration.delivery.command.DeliveryOutboxRepository;
import in.craves.integration.delivery.command.DeliveryProviderRouter.DeliveryProviderTemporarilyUnavailableException;
import in.craves.integration.delivery.feedback.DeliveryFeedbackProcessor;
import in.craves.integration.delivery.feedback.DeliveryFeedbackRepository;
import in.craves.integration.delivery.feedback.DeliveryFeedbackScorer;
import in.craves.integration.delivery.status.DeliveryStatusRepository;
import in.craves.integration.delivery.status.DeliveryStatusUpdateService;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetStorage;
import in.craves.integration.fleet.FleetTestMode;
import in.craves.integration.fleet.client.DeliveryCodeClient;
import in.craves.integration.fleet.client.DeliveryCodeClient.Outcome;
import in.craves.integration.fleet.client.RiderPushClient;
import in.craves.integration.fleet.client.RoadDistanceClient;
import in.craves.integration.fleet.dispatch.FleetDispatchFixtures;
import in.craves.integration.fleet.dispatch.FleetDispatcher;
import java.util.List;
import java.util.Map;
import java.util.OptionalLong;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Craves riders in Delivery Intelligence against a real database: an accept records the order's assignment with every rider
 * asked, the delivery's outcome is scored from it, and the routing of couriers is never in its way.
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetIntelligenceDatabaseTest {
    final FleetDatabase fleet = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final TransactionTemplate transaction = new TransactionTemplate(fleet.transactions);
    final DeliveryAssignmentRepository assignments = new DeliveryAssignmentRepository(fleet.db, new DeliveryJsonSupport(json));
    FleetDispatcher dispatcher;
    FleetTripService trips;
    FleetIntelligence intelligence;
    DeliveryCommandMessage command;
    UUID chefSubOrderId;
    UUID nearest;
    UUID second;

    @BeforeEach
    void setUp() {
        FleetPolicyStore policies = new FleetPolicyStore(fleet.db, json);
        RoadDistanceClient roads = mock(RoadDistanceClient.class);
        when(roads.meters(anyDouble(), anyDouble(), anyDouble(), anyDouble())).thenReturn(3500);
        dispatcher = new FleetDispatcher(fleet.db, fleet.transactions, policies, new FleetTestMode(fleet.db, FleetDatabase.properties(true)),
            roads, mock(RiderPushClient.class), json);
        DeliveryOutboxRepository outbox = new DeliveryOutboxRepository(fleet.db, json);
        DeliveryCommandRepository commands = new DeliveryCommandRepository(fleet.db, json);
        FleetStatusBridge bridge = new FleetStatusBridge(fleet.db, outbox, commands, new DeliveryStatusUpdateService(List.of(),
            new DeliveryStatusRepository(fleet.db, json), outbox, new DeliveryCommandProperties(), json, new BorzoPidgeHandoffRepository(fleet.db)),
            json);
        intelligence = new FleetIntelligence(fleet.db, fleet.transactions);
        bridge.setIntelligence(intelligence);
        DeliveryCodeClient codes = mock(DeliveryCodeClient.class);
        when(codes.verify(any(), anyString())).thenReturn(new DeliveryCodeClient.Result(Outcome.VERIFIED, 0));
        trips = new FleetTripService(fleet.db, new FleetTripPay(fleet.db, policies, json, event -> { }), bridge, json, codes,
            mock(FleetStorage.class), fleet.transactions, mock(RiderPushClient.class));
        // One rider at a time, 20 s each, no limit on rounds in a 300 s stage.
        FleetDispatchFixtures.policy(fleet.db, "live", 20, 300, 1, 0, 0);
        nearest = FleetDispatchFixtures.riderOnShift(fleet, "+919800000001", KITCHEN_LAT + 0.001, KITCHEN_LNG, 5, false);
        second = FleetDispatchFixtures.riderOnShift(fleet, "+919800000002", KITCHEN_LAT + 0.005, KITCHEN_LNG, 5, false);
        chefSubOrderId = UUID.fromString("0bde0101-1111-4111-8111-111111111111");
        FleetDispatchFixtures.kitchen(fleet.db, chefSubOrderId, true);
        command = FleetDispatchFixtures.command(chefSubOrderId);
        commands.createOrFind(command); // the order's delivery command, as the scheduler stores it
    }

    @Test
    void anAcceptRecordsTheAssignmentWithEveryRiderAskedAndTheDeliveryIsScoredFromIt() throws Exception {
        UUID declined = offer(nearest);
        transaction.executeWithoutResult(status -> trips.decline(identity(nearest), declined));
        UUID accepted = offer(second);
        assertThat(count("delivery_assignment")).as("nothing before a rider is the courier").isZero();

        UUID tripId = UUID.fromString(transaction.execute(status -> trips.accept(identity(second), accepted, "a1")).tripId());

        Map<String, Object> job = fleet.db.queryForMap("SELECT id, provider_id, assignment_id, assigned_agent_id FROM delivery_schema.delivery_job "
            + "WHERE chef_sub_order_id = ?", chefSubOrderId);
        assertThat(job).containsEntry("provider_id", "craves_fleet").containsEntry("assigned_agent_id", second.toString());
        assertThat(dispatcher.run(command, OptionalLong::empty, true)).as("the stage is over: the rider's job").contains((UUID) job.get("id"));
        // As routing reads an assignment (DeliveryProviderRouter), so every stored value is one it knows.
        AssignmentResponse assignment = assignments.findByChefSubOrderId(chefSubOrderId).orElseThrow();
        assertThat(assignment.assignmentId()).isEqualTo(job.get("assignment_id"));
        assertThat(assignment.status()).isEqualTo(AssignmentStatus.ASSIGNED);
        assertThat(assignment.scoringVersion()).isEqualTo(FleetIntelligence.SCORING_VERSION);
        assertThat(assignment.selectedProviderId()).isEqualTo("craves_fleet");
        assertThat(assignment.selectedAgentId()).isEqualTo(second.toString());
        assertThat(assignment.selectedCandidateId()).isEqualTo(accepted);
        assertThat(assignment.rankedCandidates()).extracting(candidate -> candidate.candidateId() + " " + candidate.providerId() + " "
            + candidate.agentId() + " " + candidate.rank() + " " + candidate.status()).containsExactly(
            declined + " craves_fleet " + nearest + " 1 " + CandidateStatus.DECLINED, accepted + " craves_fleet " + second + " 2 " + CandidateStatus.ACCEPTED);
        // 4000 base + 1350 drop km; the pickup (straight line x 1.3) is inside the free km.
        assertThat(assignment.rankedCandidates().get(1).quotedCost()).isEqualByComparingTo("53.50");
        assertThat(assignment.rankedCandidates().get(1).pickupDistanceKm()).isBetween(0.5, 1.0);
        assertThat(assignment.rankedCandidates().get(1).providerMetadata().path("round").asInt()).isEqualTo(2);
        JsonNode context = json.readTree(fleet.db.queryForObject("SELECT request_context::text FROM delivery_schema.delivery_assignment", String.class));
        assertThat(context.path("orderId").asText()).isEqualTo(command.orderId().toString());
        assertThat(context.path("chefSubOrderId").asText()).isEqualTo(chefSubOrderId.toString());
        assertThat(context.path("distanceKm").asDouble()).isEqualTo(3.5);
        assertThat(context.path("area").asText()).isEqualTo("Madhapur");
        assertThat(List.of(context.path("orderHour").asInt(), context.path("dayOfWeek").asInt())).containsExactly(19, 1);

        intelligence.record(chefSubOrderId);
        assertThat(count("delivery_assignment_candidate")).as("recording again adds nothing").isEqualTo(2);

        // The rider delivers: the outcome is scored for craves_fleet from that assignment (it was a dead letter without one).
        trips.step(identity(second), tripId, "arrived-pickup", "s1");
        Thread.sleep(5);
        trips.step(identity(second), tripId, "picked-up", "s2");
        Thread.sleep(5);
        trips.step(identity(second), tripId, "arrived-drop", "s3");
        Thread.sleep(5);
        trips.deliveredByOtp(identity(second), tripId, "4821", "d1");
        DeliveryFeedbackRepository feedback = new DeliveryFeedbackRepository(fleet.db, json);
        DeliveryFeedbackProcessor processor = new DeliveryFeedbackProcessor(feedback, new DeliveryMetricsRepository(fleet.db,
            new DeliveryJsonSupport(json)), new DeliveryFeedbackScorer(), new DeliveryIntelligenceProperties());
        DeliveryFeedbackRepository.Claim claim = feedback.claim(1, 8).getFirst();
        assertThat(claim.id()).isEqualTo(job.get("id"));
        Boolean processed = transaction.execute(status -> processor.process(claim));
        assertThat(processed).isTrue();
        assertThat(fleet.db.queryForObject("SELECT status || ':' || result_code FROM delivery_schema.delivery_outcome_feedback WHERE "
            + "delivery_job_id = ?", String.class, job.get("id"))).isEqualTo("RECORDED:OUTCOME_RECORDED");
        assertThat(fleet.db.queryForObject("SELECT provider_id FROM delivery_schema.delivery_outcome_receipt WHERE delivery_id = ?", String.class,
            job.get("id"))).isEqualTo("craves_fleet");
    }

    /** No rider took it and a courier was booked: the riders asked first are listed on the courier's own assignment. */
    @Test
    void theRidersAskedBeforeACourierWasBookedJoinTheCouriersAssignment() {
        UUID asked = offer(nearest);
        fleet.db.update("UPDATE fleet_schema.trip_stage SET opened_at = now() - INTERVAL '301 seconds', deadline_at = now() - INTERVAL '1 second'");
        assertThat(dispatcher.run(command, OptionalLong::empty, true)).as("the 5 minutes are up: Borzo").isEmpty();
        intelligence.record(chefSubOrderId);
        assertThat(count("delivery_assignment")).as("no courier yet: routing makes the assignment").isZero();

        UUID routed = courierAssignment();
        intelligence.record(chefSubOrderId);
        intelligence.record(chefSubOrderId);

        AssignmentResponse assignment = assignments.findByChefSubOrderId(chefSubOrderId).orElseThrow();
        assertThat(assignment.assignmentId()).isEqualTo(routed);
        assertThat(assignment.scoringVersion()).isEqualTo("ROUTING_TEST");
        assertThat(assignment.selectedProviderId()).as("the courier stays the one selected").isEqualTo("borzo");
        assertThat(assignment.rankedCandidates()).extracting(candidate -> candidate.providerId() + " " + candidate.rank() + " " + candidate.status())
            .containsExactly("borzo 1 ACCEPTED", "craves_fleet 2 SKIPPED");
        assertThat(assignment.rankedCandidates().get(1).candidateId()).isEqualTo(asked);
        assertThat(assignment.rankedCandidates().get(1).agentId()).isEqualTo(nearest.toString());

        intelligence.forget(chefSubOrderId);
        assertThat(count("delivery_assignment")).as("only a rider's own assignment is ever forgotten").isOne();
    }

    /** A rider lost the order (FleetDispatchJobs books a courier): their assignment makes way for the ranking of couriers. */
    @Test
    void aRidersAssignmentIsForgottenBeforeACourierIsBookedInTheirPlace() {
        UUID accepted = offer(nearest);
        transaction.execute(status -> trips.accept(identity(nearest), accepted, "a1"));
        assertThat(count("delivery_assignment")).isOne();

        intelligence.forget(chefSubOrderId);

        assertThat(count("delivery_assignment")).isZero();
        assertThat(count("delivery_assignment_candidate")).isZero();
        assertThat(fleet.db.queryForObject("SELECT assignment_id FROM delivery_schema.delivery_job WHERE chef_sub_order_id = ?", UUID.class,
            chefSubOrderId)).isNull();
    }

    /** trip_offer is the record; Delivery Intelligence copies it, and a failure there never costs the rider their accept. */
    @Test
    void aFailureToRecordNeverFailsTheAccept() {
        fleet.db.execute("ALTER TABLE delivery_schema.delivery_assignment ADD CONSTRAINT no_riders CHECK (scoring_version <> '"
            + FleetIntelligence.SCORING_VERSION + "')");
        UUID accepted = offer(nearest);

        transaction.execute(status -> trips.accept(identity(nearest), accepted, "a1"));

        assertThat(fleet.db.queryForObject("SELECT state FROM fleet_schema.trip WHERE chef_sub_order_id = ?", String.class, chefSubOrderId))
            .isEqualTo("ASSIGNED");
        assertThat(fleet.db.queryForObject("SELECT provider_id FROM delivery_schema.delivery_job WHERE chef_sub_order_id = ?", String.class,
            chefSubOrderId)).isEqualTo("craves_fleet");
        assertThat(count("delivery_assignment")).isZero();
    }

    /** The order goes to the next rider in turn; returns the offer that rider holds. */
    private UUID offer(UUID rider) {
        assertThatThrownBy(() -> dispatcher.run(command, OptionalLong::empty, true)).isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        return fleet.db.queryForObject("SELECT id FROM fleet_schema.trip_offer WHERE rider_id = ? AND state = 'ACTIVE'", UUID.class, rider);
    }

    /** As routing leaves it once Borzo has the order: its own assignment, the Borzo candidate accepted, and the courier's job. */
    private UUID courierAssignment() {
        UUID assignment = UUID.randomUUID();
        UUID candidate = UUID.randomUUID();
        fleet.db.update("INSERT INTO delivery_schema.delivery_assignment (id, chef_sub_order_id, order_id, strategy, status, scoring_version, "
            + "selected_candidate_id, selected_provider_id, request_context) VALUES (?, ?, ?, 'GREEDY', 'ASSIGNED', 'ROUTING_TEST', ?, 'borzo', '{}')",
            assignment, chefSubOrderId, command.orderId(), candidate);
        fleet.db.update("INSERT INTO delivery_schema.delivery_assignment_candidate (id, assignment_id, provider_id, candidate_rank, "
            + "predicted_success_probability, combined_score, stored_avg, momentum, exploration_sample, provider_quality_score, proximity_score, "
            + "final_score, status) VALUES (?, ?, 'borzo', 1, 1, 80, 80, 'STABLE', 0, 80, 80, 80, 'ACCEPTED')", candidate, assignment);
        fleet.db.update("INSERT INTO delivery_schema.delivery_job (id, chef_sub_order_id, order_id, assignment_id, provider_id, provider_delivery_id, "
            + "status, booked_at, last_status_observed_at) VALUES (?, ?, ?, ?, 'borzo', 'bz-1', 'COURIER_ASSIGNED', now(), now())", UUID.randomUUID(),
            chefSubOrderId, command.orderId(), assignment);
        return assignment;
    }

    private UUID identity(UUID rider) {
        return fleet.db.queryForObject("SELECT identity_id FROM fleet_schema.rider WHERE id = ?", UUID.class, rider);
    }

    private int count(String table) {
        return fleet.db.queryForObject("SELECT count(*) FROM delivery_schema." + table, Integer.class);
    }
}
