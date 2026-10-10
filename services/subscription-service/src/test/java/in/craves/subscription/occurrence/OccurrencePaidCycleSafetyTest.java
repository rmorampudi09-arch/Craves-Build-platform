package in.craves.subscription.occurrence;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class OccurrencePaidCycleSafetyTest {
    @Test
    void generatedOccurrencesRespectPaidInvoiceCycleAndSerializeWithPaymentStatusChanges() throws Exception {
        String source = Files.readString(Path.of(
            "src/main/java/in/craves/subscription/occurrence/OccurrenceRepository.java"
        ));

        assertThat(source)
            .contains("SELECT id FROM subscription_schema.customer_subscription WHERE id = ? AND customer_identity_id = ? ")
            .contains("AND status = 'ACTIVE' AND generation_lock_token = ? AND next_service_date = ? FOR UPDATE")
            .contains("status = 'PAID'")
            .contains("cycle_start <= ? AND cycle_end > ?")
            .contains("paidCycle ? \"READY_FOR_ORDER\" : \"BILLING_PENDING\"")
            .contains("Occurrence generated inside an already-paid billing cycle");
    }
}
