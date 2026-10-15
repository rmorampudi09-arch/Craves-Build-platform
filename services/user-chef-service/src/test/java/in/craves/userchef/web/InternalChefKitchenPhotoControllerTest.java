package in.craves.userchef.web;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import in.craves.userchef.exception.ApiException;
import in.craves.userchef.security.InternalRequestAuthorizer;
import in.craves.userchef.service.BlobDocumentStorageService.StoredDocumentBytes;
import in.craves.userchef.service.RegistrationKitchenPhotoService;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

class InternalChefKitchenPhotoControllerTest {
    private final RegistrationKitchenPhotoService service = mock(RegistrationKitchenPhotoService.class);
    private final InternalRequestAuthorizer authorizer = mock(InternalRequestAuthorizer.class);
    private final InternalChefKitchenPhotoController controller = new InternalChefKitchenPhotoController(service, authorizer);
    private final UUID identityId = UUID.randomUUID();

    @Test
    void rejectsMissingSecret() {
        doThrow(ApiException.unauthorized("INVALID_INTERNAL_SERVICE_CREDENTIAL", "Invalid internal service credential"))
            .when(authorizer).requireValid(null);

        ApiException error = assertThrows(ApiException.class, () -> controller.getKitchenPhoto(null, identityId, 1));

        assertEquals(401, error.getStatus());
        verify(service, never()).approvedKitchenPhoto(any(), anyInt());
    }

    @Test
    void returnsPhotoBytesWithStoredTypeAndNoStore() {
        byte[] png = {(byte) 0x89, 'P', 'N', 'G'};
        when(service.approvedKitchenPhoto(identityId, 2)).thenReturn(Optional.of(new StoredDocumentBytes("kitchen.png", "image/png", png)));

        ResponseEntity<byte[]> response = controller.getKitchenPhoto("secret", identityId, 2);

        assertEquals(200, response.getStatusCode().value());
        assertArrayEquals(png, response.getBody());
        assertEquals(MediaType.IMAGE_PNG, response.getHeaders().getContentType());
        assertEquals("no-store", response.getHeaders().getFirst(HttpHeaders.CACHE_CONTROL));
    }

    @Test
    void notFoundWhenServiceEmpty() {
        when(service.approvedKitchenPhoto(identityId, 1)).thenReturn(Optional.empty());

        ApiException error = assertThrows(ApiException.class, () -> controller.getKitchenPhoto("secret", identityId, 1));

        assertEquals(404, error.getStatus());
        assertEquals("KITCHEN_PHOTO_NOT_FOUND", error.getCode());
    }

    @Test
    void rejectsSlotThree() {
        ApiException error = assertThrows(ApiException.class, () -> controller.getKitchenPhoto("secret", identityId, 3));

        assertEquals(400, error.getStatus());
        verify(service, never()).approvedKitchenPhoto(any(), anyInt());
    }
}
