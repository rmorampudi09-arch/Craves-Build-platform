package in.craves.integration.admin.deliveryexceptions;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import in.craves.integration.admin.deliveryexceptions.DeliveryExceptionService.Action;
import in.craves.integration.admin.deliveryexceptions.DeliveryExceptionService.Status;
import in.craves.integration.security.CravesPrincipal;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;

class DeliveryExceptionRulesTest {
    static int code(Throwable e) { return ((ResponseStatusException) e).getStatusCode().value(); }

    @Test void transitions() {
        assertThat(DeliveryExceptionService.next(Status.OPEN, Action.ACKNOWLEDGE)).isEqualTo(Status.ACKNOWLEDGED);
        assertThat(DeliveryExceptionService.next(Status.ACKNOWLEDGED, Action.ASSIGN)).isEqualTo(Status.ACKNOWLEDGED);
        assertThat(DeliveryExceptionService.next(Status.REASSIGNMENT_REQUESTED, Action.ACKNOWLEDGE)).isEqualTo(Status.ACKNOWLEDGED);
        assertThat(DeliveryExceptionService.next(Status.ACKNOWLEDGED, Action.REQUEST_REASSIGNMENT)).isEqualTo(Status.REASSIGNMENT_REQUESTED);
        assertThatThrownBy(() -> DeliveryExceptionService.next(Status.ACKNOWLEDGED, Action.ACKNOWLEDGE)).satisfies(e -> assertThat(code(e)).isEqualTo(409));
        for (Action a : Action.values()) {
            assertThatThrownBy(() -> DeliveryExceptionService.next(Status.RESOLVED, a)).satisfies(e -> assertThat(code(e)).isEqualTo(409));
            assertThatThrownBy(() -> DeliveryExceptionService.next(Status.DISMISSED, a)).satisfies(e -> assertThat(code(e)).isEqualTo(409));
        }
    }

    @Test void notes() {
        assertThat(DeliveryExceptionService.note("  a\nb ", false)).isEqualTo("a\nb");
        assertThat(DeliveryExceptionService.note(null, false)).isNull();
        assertThatThrownBy(() -> DeliveryExceptionService.note("", true)).satisfies(e -> assertThat(code(e)).isEqualTo(400));
        assertThatThrownBy(() -> DeliveryExceptionService.note("a\u0000b", false)).satisfies(e -> assertThat(code(e)).isEqualTo(400));
        assertThatThrownBy(() -> DeliveryExceptionService.note("x".repeat(1001), false)).satisfies(e -> assertThat(code(e)).isEqualTo(400));
    }

    static UsernamePasswordAuthenticationToken as(String role) {
        return new UsernamePasswordAuthenticationToken(new CravesPrincipal(UUID.randomUUID(), null, Set.of(role)), null, java.util.List.of());
    }

    @Test void flagOffHidesEveryRouteAndRolesAreEnforced() {
        var service = mock(DeliveryExceptionService.class);
        var off = new AdminDeliveryExceptionController(service, false);
        assertThatThrownBy(() -> off.listDeliveryExceptions(as("PLATFORM_ADMIN"), null, null, 30, 0)).satisfies(e -> assertThat(code(e)).isEqualTo(404));
        var on = new AdminDeliveryExceptionController(service, true);
        on.listDeliveryExceptions(as("SUPPORT_ADMIN"), null, null, 30, 0);
        var request = new AdminDeliveryExceptionController.OpenDeliveryExceptionRequest(UUID.randomUUID(), DeliveryExceptionService.Reason.OTHER, "x");
        assertThatThrownBy(() -> on.openDeliveryException(as("SUPPORT_ADMIN"), request)).satisfies(e -> assertThat(code(e)).isEqualTo(403));
        assertThatThrownBy(() -> on.openDeliveryException(as("CHEF"), request)).satisfies(e -> assertThat(code(e)).isEqualTo(403));
        assertThatThrownBy(() -> on.listDeliveryExceptions(as("OPERATIONS_ADMIN"), null, null, 101, 0)).satisfies(e -> assertThat(code(e)).isEqualTo(400));
        on.openDeliveryException(as("OPERATIONS_ADMIN"), request);
        verify(service).open(any(), eq(request.deliveryJobId()), eq(request.reason()), eq("x"));
    }
}
