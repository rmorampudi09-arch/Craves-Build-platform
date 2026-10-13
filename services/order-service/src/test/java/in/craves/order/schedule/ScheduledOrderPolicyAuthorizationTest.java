package in.craves.order.schedule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.order.exception.OrderApiException;
import in.craves.order.security.CravesPrincipal;
import java.time.Clock;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

class ScheduledOrderPolicyAuthorizationTest {
    private final NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
    private final ScheduledOrderService service = new ScheduledOrderService(jdbc, new ObjectMapper(), Clock.systemUTC());
    private final UUID kitchenId = UUID.randomUUID();

    @Test
    void retiredAdminRoleCannotReadOrChangeSchedulePolicy() {
        CravesPrincipal legacy = actor("ADMIN");
        assertCode("ROLE_REQUIRED", () -> service.upsertPolicy(legacy, kitchenId, null, "Synthetic policy change"));
        assertCode("ROLE_REQUIRED", () -> service.getPolicy(legacy, kitchenId));
        assertCode("ROLE_REQUIRED", () -> service.upsertPolicy(actor("AUDIT_ADMIN"), kitchenId, null, "Synthetic policy change"));
        verifyNoInteractions(jdbc);
    }

    @Test
    void operationsAndAuditRolesPassTheirRoleGate() {
        assertCode("ADMIN_REASON_INVALID", () -> service.upsertPolicy(actor("OPERATIONS_ADMIN"), kitchenId, null, "short"));
        assertCode("SCHEDULE_POLICY_NOT_FOUND", () -> service.getPolicy(actor("AUDIT_ADMIN"), kitchenId));
    }

    private static CravesPrincipal actor(String role) {
        return new CravesPrincipal(UUID.randomUUID(), "+10000000000", Set.of(role));
    }

    private static void assertCode(String code, Executable call) {
        OrderApiException error = assertThrows(OrderApiException.class, call);
        assertEquals(code, error.code());
        if ("ROLE_REQUIRED".equals(code)) assertEquals(HttpStatus.FORBIDDEN, error.status());
    }
}
