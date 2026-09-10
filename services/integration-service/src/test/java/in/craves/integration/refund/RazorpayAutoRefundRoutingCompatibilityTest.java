package in.craves.integration.refund;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class RazorpayAutoRefundRoutingCompatibilityTest {
    @Test
    void refundIntakeFailsClosedToRazorpay() throws Exception {
        String source = Files.readString(Path.of(
            "src/main/java/in/craves/integration/refund/RefundRequestService.java"
        ));

        assertThat(source)
            .contains("requireRazorpayRouting")
            .contains("paymentRoutingProperties.razorpay()")
            .contains("Automatic refunds are restricted to Razorpay payment orders")
            .contains("'RAZORPAY'")
            .contains("NULL, ?, ?")
            .doesNotContain("\"CASHFREE\".equals(paymentOrder.provider()) ?");
    }

    @Test
    void refundWorkerClaimsOnlyActiveProviderRows() throws Exception {
        String repositorySource = Files.readString(Path.of(
            "src/main/java/in/craves/integration/refund/RefundRepository.java"
        ));
        String workerSource = Files.readString(Path.of(
            "src/main/java/in/craves/integration/refund/RefundExecutionWorker.java"
        ));

        assertThat(repositorySource)
            .contains("String activeProvider")
            .contains("AND provider = ?")
            .contains("FOR UPDATE SKIP LOCKED");
        assertThat(workerSource)
            .contains("paymentRoutingProperties.provider()")
            .contains("repository.claimBatch(")
            .contains("activeProvider.equalsIgnoreCase(workItem.provider())");
    }

    @Test
    void razorpayRefundClientUsesProviderIdempotencyHeader() throws Exception {
        String source = Files.readString(Path.of(
            "src/main/java/in/craves/integration/refund/RazorpayRefundClient.java"
        ));

        assertThat(source)
            .contains("X-Refund-Idempotency")
            .contains("/v1/payments/{paymentId}/refund")
            .contains("/v1/refunds/{refundId}")
            .doesNotContain("X-Razorpay-Idempotency-Key");
    }
}
