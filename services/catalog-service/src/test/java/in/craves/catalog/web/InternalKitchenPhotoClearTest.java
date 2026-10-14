package in.craves.catalog.web;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

import in.craves.catalog.config.InternalCatalogAccessProperties;
import in.craves.catalog.exception.ApiException;
import in.craves.catalog.security.InternalCatalogAuthorizer;
import in.craves.catalog.service.CatalogService;
import in.craves.catalog.service.DiscoveryCacheService;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

/** Support clears a kitchen photo slot so the chef can add a new photo; internal key only. */
class InternalKitchenPhotoClearTest {
    final CatalogService service = mock(CatalogService.class);
    final DiscoveryCacheService cache = mock(DiscoveryCacheService.class);
    final InternalCatalogAccessProperties properties = new InternalCatalogAccessProperties();
    final InternalCatalogController controller;
    final UUID kitchenId = UUID.randomUUID();

    InternalKitchenPhotoClearTest() {
        properties.setAccessValue("internal-test-key");
        controller = new InternalCatalogController(service, new InternalCatalogAuthorizer(properties), cache);
    }

    @Test
    void internalClearRequiresKey() {
        assertThrows(ApiException.class, () -> controller.clearKitchenPhoto(null, kitchenId, 1));
        assertThrows(ApiException.class, () -> controller.clearKitchenPhoto("wrong", kitchenId, 1));
        verifyNoInteractions(service, cache);
    }

    @Test
    void internalClearReturns204AndRefreshesDiscovery() {
        ResponseEntity<Void> response = controller.clearKitchenPhoto("internal-test-key", kitchenId, 2);

        assertEquals(204, response.getStatusCode().value());
        verify(service).clearKitchenPhotoSlot(kitchenId, 2);
        verify(cache).invalidateAllDiscovery();
    }

    @Test
    void internalClearRejectsSlotThree() {
        ApiException error = assertThrows(ApiException.class, () -> controller.clearKitchenPhoto("internal-test-key", kitchenId, 3));

        assertEquals(400, error.getStatus());
        verifyNoInteractions(service, cache);
    }
}
