package in.craves.integration.fleet.dispatch;

import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LAT;
import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LNG;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryCommandRepository;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.dispatch.FleetReplay.Order;
import in.craves.integration.fleet.dispatch.FleetReplay.Settings;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/** The replay reads recorded delivery commands and their Borzo/Pidge quotes for IST dates and the pilot circle, and writes nothing. */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetReplayDatabaseTest {
    final FleetDatabase fleet = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final DeliveryCommandRepository commands = new DeliveryCommandRepository(fleet.db, json);
    final Settings settings = new Settings(LocalDate.parse("2026-10-19"), LocalDate.parse("2026-10-19"), KITCHEN_LAT, KITCHEN_LNG, 5, 3,
        FleetReplay.parseHours("11-15,19-23"), 1.0, 4000, 1);

    @Test
    void recordedOrdersInTheAreaAndDatesComeWithTheirCheapestAndBookedQuotes() {
        UUID booked = recorded("2026-10-19 12:00:00+05:30", KITCHEN_LAT);
        quote(booked, "borzo", "95.50", 1);
        quote(booked, "pidge", "80.00", 2);
        fleet.db.update("INSERT INTO delivery_schema.delivery_job (id, chef_sub_order_id, order_id, provider_id, provider_delivery_id, status) "
            + "VALUES (?, ?, ?, 'borzo', 'B-1', 'DELIVERED')", UUID.randomUUID(), booked, UUID.randomUUID());
        UUID unquoted = recorded("2026-10-19 23:59:00+05:30", KITCHEN_LAT);
        recorded("2026-10-20 00:01:00+05:30", KITCHEN_LAT);
        recorded("2026-10-19 13:00:00+05:30", KITCHEN_LAT + 0.1); // 11 km north: outside the pilot area
        long before = fleet.db.queryForObject("SELECT count(*) FROM delivery_schema.delivery_command", Long.class);

        List<Order> orders = FleetReplay.load(fleet.db, settings);

        assertThat(orders).extracting(Order::chefSubOrderId).containsExactly(booked, unquoted);
        Order first = orders.get(0);
        assertThat(first.cheapestQuotePaise()).isEqualTo(8000);
        assertThat(first.bookedProvider()).isEqualTo("borzo");
        assertThat(first.bookedPricePaise()).isEqualTo(9550);
        assertThat(first.threePlPaise()).as("what the 3PL leg cost").isEqualTo(9550);
        assertThat(first.area()).isEqualTo("Madhapur");
        assertThat(first.kitchenLat()).isEqualTo(KITCHEN_LAT);
        assertThat(first.dropLat()).isEqualTo(17.46);
        assertThat(orders.get(1).cheapestQuotePaise()).isNull();
        assertThat(fleet.db.queryForObject("SELECT count(*) FROM delivery_schema.delivery_command", Long.class)).isEqualTo(before);
    }

    private UUID recorded(String dispatchAt, double kitchenLat) {
        UUID chefSubOrderId = UUID.randomUUID();
        DeliveryCommandMessage command = FleetDispatchFixtures.command(chefSubOrderId);
        var pickup = command.deliveryRequest().pickup();
        var moved = new in.craves.integration.delivery.provider.DeliveryProviderAdapter.Stop(pickup.address(), pickup.contactName(),
            pickup.contactPhone(), BigDecimal.valueOf(kitchenLat), pickup.longitude(), null, null, pickup.note(), pickup.addressLine1(),
            pickup.addressLine2(), pickup.landmark(), pickup.area(), pickup.city(), pickup.state(), pickup.postalCode(), pickup.country());
        var request = command.deliveryRequest();
        commands.createOrFind(new DeliveryCommandMessage(command.commandId(), command.sourceEventId(), command.correlationId(), command.orderId(),
            chefSubOrderId, command.readyAt(), command.dispatchAt(), command.idempotencyKey(), command.distanceKm(), command.area(),
            command.orderHour(), command.dayOfWeek(), new in.craves.integration.delivery.provider.DeliveryProviderAdapter.QuoteRequest(
                request.matter(), request.totalWeightGrams(), request.thermoboxRequired(), moved, request.dropoff(), request.items(),
                request.declaredGoodsValue(), request.paymentCollectionMode(), request.pickupLocationReference())));
        fleet.db.update("UPDATE delivery_schema.delivery_command SET dispatch_at = CAST(? AS timestamptz) WHERE chef_sub_order_id = ?", dispatchAt,
            chefSubOrderId);
        return chefSubOrderId;
    }

    private void quote(UUID chefSubOrderId, String provider, String rupees, int rank) {
        fleet.db.update("INSERT INTO delivery_schema.delivery_assignment (id, chef_sub_order_id, order_id, strategy, status, scoring_version, "
            + "request_context) VALUES (?, ?, ?, 'GREEDY', 'ASSIGNED', 'test', '{}') ON CONFLICT (chef_sub_order_id) DO NOTHING",
            UUID.randomUUID(), chefSubOrderId, UUID.randomUUID());
        fleet.db.update("INSERT INTO delivery_schema.delivery_assignment_candidate (id, assignment_id, provider_id, candidate_rank, quoted_cost, "
            + "currency, predicted_success_probability, combined_score, stored_avg, momentum, exploration_sample, provider_quality_score, "
            + "proximity_score, final_score, status) SELECT ?, id, ?, ?, ?, 'INR', 0, 0, 0, 'INSUFFICIENT_DATA', 0, 0, 0, 0, 'RANKED' "
            + "FROM delivery_schema.delivery_assignment WHERE chef_sub_order_id = ?", UUID.randomUUID(), provider, rank, new BigDecimal(rupees),
            chefSubOrderId);
    }
}
