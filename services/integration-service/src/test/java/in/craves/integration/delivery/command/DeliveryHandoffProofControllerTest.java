package in.craves.integration.delivery.command;

import in.craves.integration.delivery.InternalRequestAuthorizer;
import in.craves.integration.web.DeliveryHandoffProofController;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DeliveryHandoffProofControllerTest {
    final DeliveryHandoffProofRepository repository = mock(DeliveryHandoffProofRepository.class);
    final UUID job = UUID.randomUUID(), event = UUID.randomUUID();
    @Test void absentAndIncorrectCredentialsNeverReadEvidence() {
        var controller = new DeliveryHandoffProofController(new InternalRequestAuthorizer("TEST_ONLY"), repository);
        for (String supplied : new String[] {null, "", "WRONG"}) {
            assertEquals(401, assertThrows(ResponseStatusException.class,
                () -> controller.find(supplied, job, event)).getStatusCode().value());
        }
        verifyNoInteractions(repository);
    }
    @Test void missingConfiguredCredentialFailsClosedBeforeRead() {
        var controller = new DeliveryHandoffProofController(new InternalRequestAuthorizer(""), repository);
        assertEquals(503, assertThrows(ResponseStatusException.class,
            () -> controller.find("TEST_ONLY", job, event)).getStatusCode().value());
        verifyNoInteractions(repository);
    }
    @Test void authoritativeAbsenceIsVersionedAndNeverCached() {
        when(repository.find(job,event)).thenReturn(Optional.empty());
        var response = new DeliveryHandoffProofController(new InternalRequestAuthorizer("TEST_ONLY"), repository)
            .find("TEST_ONLY", job, event);
        assertEquals("no-store", response.getHeaders().getCacheControl());
        assertEquals("NOT_CONFIRMED", response.getBody().state());
        assertEquals("1.0", response.getBody().proofVersion());
        assertEquals(job, response.getBody().deliveryJobId());
        assertEquals(event, response.getBody().eventId());
        assertNull(response.getBody().event());
    }
}
