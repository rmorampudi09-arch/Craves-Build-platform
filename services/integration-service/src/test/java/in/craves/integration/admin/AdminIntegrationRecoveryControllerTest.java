package in.craves.integration.admin;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import in.craves.integration.admin.AdminIntegrationRecoveryService.RecoverySource;
import in.craves.integration.admin.AdminIntegrationRecoveryService.ReplayResponse;
import in.craves.integration.security.CravesPrincipal;
import java.time.OffsetDateTime;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;

class AdminIntegrationRecoveryControllerTest {
    @Test
    void supportAdminCannotReplayCashfreeDeadLetter() {
        AdminIntegrationRecoveryService service = mock(AdminIntegrationRecoveryService.class);
        AdminIntegrationRecoveryController controller = new AdminIntegrationRecoveryController(service);
        CravesPrincipal principal = new CravesPrincipal(UUID.randomUUID(), null, Set.of("SUPPORT_ADMIN"));
        var authentication = new UsernamePasswordAuthenticationToken(principal, null, Set.of());

        assertThatThrownBy(() -> controller.replay(
            authentication,
            "cashfree",
            UUID.randomUUID(),
            "Investigating payment callback recovery",
            UUID.randomUUID().toString()
        )).isInstanceOf(ResponseStatusException.class)
          .satisfies(error -> org.assertj.core.api.Assertions.assertThat(
              ((ResponseStatusException) error).getStatusCode().value()
          ).isEqualTo(403));
    }

    @Test
    void paymentsAdminCanReplayCashfreeDeadLetter() {
        AdminIntegrationRecoveryService service = mock(AdminIntegrationRecoveryService.class);
        AdminIntegrationRecoveryController controller = new AdminIntegrationRecoveryController(service);
        UUID actor = UUID.randomUUID();
        UUID item = UUID.randomUUID();
        UUID correlation = UUID.randomUUID();
        CravesPrincipal principal = new CravesPrincipal(actor, null, Set.of("PAYMENTS_ADMIN"));
        var authentication = new UsernamePasswordAuthenticationToken(principal, null, Set.of());
        when(service.replay(eq(RecoverySource.CASHFREE), eq(item), eq(actor), any(), eq(correlation)))
            .thenReturn(new ReplayResponse(
                RecoverySource.CASHFREE,
                item,
                "RECEIVED",
                0,
                correlation,
                OffsetDateTime.now()
            ));

        controller.replay(
            authentication,
            "cashfree",
            item,
            "Replay approved after payment provider recovery",
            correlation.toString()
        );

        verify(service).replay(
            eq(RecoverySource.CASHFREE),
            eq(item),
            eq(actor),
            eq("Replay approved after payment provider recovery"),
            eq(correlation)
        );
    }
}
