package in.craves.auth.admin;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

/** Handbook 008: the revoke route stays hidden (404) until its own switch is on, then needs the RBAC API switch too. */
class ChefRoleRevokeSwitchTest {
    @Test
    void offMeansNotFoundAndNothingIsTouched() {
        InternalAdminRbacProperties properties = new InternalAdminRbacProperties();
        properties.setApiEnabled(true);
        InternalAdminRoleRepository repository = mock(InternalAdminRoleRepository.class);
        InternalAdminRoleController controller = new InternalAdminRoleController(properties, repository, mock(StaffRoleGrantService.class));
        var request = new InternalAdminRoleController.ChefRoleRevokeRequest("Kitchen closed after complaints");

        assertThatThrownBy(() -> controller.revokeChefRole(null, UUID.randomUUID(), request, null))
            .isInstanceOf(ResponseStatusException.class).hasMessageContaining("404");

        properties.setChefRoleRevokeEnabled(true);
        properties.setApiEnabled(false);
        assertThatThrownBy(() -> controller.revokeChefRole(null, UUID.randomUUID(), request, null))
            .isInstanceOf(ResponseStatusException.class).hasMessageContaining("503");

        properties.setApiEnabled(true);
        assertThatThrownBy(() -> controller.revokeChefRole(null, UUID.randomUUID(), request, null))
            .isInstanceOf(ResponseStatusException.class).hasMessageContaining("401");
        verifyNoInteractions(repository);
    }
}
