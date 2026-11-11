package in.craves.integration.admin;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.integration.admin.AdminIntegrationInvestigationController.DeliveryInvestigationResponse;
import in.craves.integration.admin.AdminIntegrationInvestigationController.ProofPhoto;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.security.CravesPrincipal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;

/** Handbook E26 on PostgreSQL with every integration migration (LEDGER_TEST_JDBC_URL, as FleetDatabase). */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class AdminDeliveryProofDatabaseTest {
    private static final String REASON = "Customer says the parcel never arrived, ticket 5120";
    private static final String DELIVERED = """
        {"event_type":"order_changed","order":{"order_id":%d,"status":"completed","points":[{"address":"Kitchen road 1"},
          {"address":"12 Street","courier_visit_datetime":"2026-11-05T13:10:00+05:30","checkin_code":"4417",
           "sign_photo_url":"https://borzo.example/sign-%s.jpg","checkin":{"recipient_full_name":"%s"}}]}}""";

    private FleetDatabase database;
    private AdminIntegrationInvestigationController investigations;

    @BeforeEach
    void setUp() {
        database = new FleetDatabase();
        investigations = new AdminIntegrationInvestigationController(database.db);
    }

    @Test
    void theNewestWebhookWithProofIsShownAndTheReadIsAudited() {
        UUID subOrder = UUID.randomUUID();
        UUID command = command(subOrder);
        UUID job = job(subOrder);
        event(job, "e-1", "WEBHOOK", DELIVERED.formatted(1, "old", "First Try"), "2026-11-05T07:40:00Z");
        event(job, "e-2", "WEBHOOK", DELIVERED.formatted(1, "new", "Asha R"), "2026-11-05T07:41:00Z");
        event(job, "e-3", "WEBHOOK", "{\"event_type\":\"delivery_changed\",\"delivery\":{\"order_id\":\"1\",\"status\":\"finished\"}}",
            "2026-11-05T07:42:00Z");
        UUID correlation = UUID.randomUUID();

        DeliveryInvestigationResponse answer = investigations.delivery(as("SUPPORT_ADMIN"), command, REASON, correlation.toString()).getBody();

        assertThat(answer.command().idempotencyKey()).isEqualTo("cmd-" + command);
        assertThat(answer.job().deliveryJobId()).isEqualTo(job);
        assertThat(answer.proofOfDelivery()).isNotNull();
        assertThat(answer.proofOfDelivery().status()).isEqualTo("DELIVERED");
        assertThat(answer.proofOfDelivery().recipientName()).isEqualTo("Asha R");
        assertThat(answer.proofOfDelivery().occurredAt()).isEqualTo(OffsetDateTime.parse("2026-11-05T07:41:00Z"));
        assertThat(answer.proofOfDelivery().photos()).containsExactly(new ProofPhoto("SIGNATURE", "https://borzo.example/sign-new.jpg"));
        assertThat(database.db.queryForObject("SELECT count(*) FROM payment_schema.admin_investigation_audit WHERE correlation_id = ? "
            + "AND resource_type = 'DELIVERY_COMMAND' AND resource_id = ? AND action = 'INVESTIGATE'", Integer.class, correlation, command))
            .isEqualTo(1);

        // A later tracking poll keeps Borzo's order under delivery.providerMetadata; it is the newest proof now.
        event(job, "track-1", "TRACK", "{\"delivery\":{\"providerId\":\"borzo\",\"providerMetadata\":{\"order_id\":1,\"points\":[{},"
            + "{\"checkin\":{\"recipient_full_name\":\"Asha Rao\"}}]}}}", "2026-11-05T07:50:00Z");
        assertThat(investigations.delivery(as("PLATFORM_ADMIN"), command, REASON, null).getBody().proofOfDelivery().recipientName())
            .isEqualTo("Asha Rao");
    }

    @Test
    void aJobWithoutProofOrWithoutAJobAnswersNull() {
        UUID noJob = command(UUID.randomUUID());
        assertThat(investigations.delivery(as("OPERATIONS_ADMIN"), noJob, REASON, null).getBody().proofOfDelivery()).isNull();

        UUID subOrder = UUID.randomUUID();
        UUID command = command(subOrder);
        UUID job = job(subOrder);
        event(job, "e-9", "WEBHOOK", "{\"order\":{\"order_id\":9,\"points\":[{},{\"address\":\"12 Street\"}]}}", "2026-11-05T07:40:00Z");
        DeliveryInvestigationResponse answer = investigations.delivery(as("AUDIT_ADMIN"), command, REASON, null).getBody();
        assertThat(answer.job()).isNotNull();
        assertThat(answer.proofOfDelivery()).isNull();
    }

    private UUID command(UUID subOrder) {
        UUID id = UUID.randomUUID();
        database.db.update("INSERT INTO delivery_schema.delivery_command (id, chef_sub_order_id, order_id, command_type, status, dispatch_at, "
            + "idempotency_key, payload) VALUES (?, ?, ?, 'QUOTE_AND_CREATE', 'COMPLETED', now(), ?, '{}'::jsonb)",
            id, subOrder, UUID.randomUUID(), "cmd-" + id);
        return id;
    }

    private UUID job(UUID subOrder) {
        UUID id = UUID.randomUUID();
        database.db.update("INSERT INTO delivery_schema.delivery_job (id, chef_sub_order_id, order_id, provider_id, provider_delivery_id, status) "
            + "VALUES (?, ?, ?, 'borzo', ?, 'DELIVERED')", id, subOrder, UUID.randomUUID(), "1");
        return id;
    }

    private void event(UUID job, String providerEventId, String source, String payload, String occurredAt) {
        database.db.update("INSERT INTO delivery_schema.delivery_event (id, delivery_job_id, provider_id, provider_event_id, event_type, "
                + "normalized_status, payload, occurred_at, source) VALUES (?, ?, 'borzo', ?, 'order_changed', 'DELIVERED', ?::jsonb, ?::timestamptz, ?)",
            UUID.randomUUID(), job, providerEventId, payload, occurredAt, source);
    }

    private static Authentication as(String role) {
        return new UsernamePasswordAuthenticationToken(new CravesPrincipal(UUID.randomUUID(), null, Set.of(role)), null, List.of());
    }
}
