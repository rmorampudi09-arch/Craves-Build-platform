package in.craves.catalog.web;

import in.craves.catalog.config.InternalCatalogAccessProperties;
import in.craves.catalog.exception.ApiException;
import in.craves.catalog.security.InternalCatalogAuthorizer;
import in.craves.catalog.service.CatalogService;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class InternalCatalogAccessTest {
    @Test void historicalKitchenReadRequiresExistingInternalKeyAndNeverUsesPublicSellingGate() {
        var service = mock(CatalogService.class);
        var properties = new InternalCatalogAccessProperties(); properties.setAccessValue("internal-test-key");
        var controller = new InternalCatalogController(service,new InternalCatalogAuthorizer(properties));
        UUID kitchen = UUID.randomUUID();
        assertThrows(ApiException.class,() -> controller.getKitchen(null,kitchen));
        assertThrows(ApiException.class,() -> controller.getKitchen("wrong",kitchen));
        verifyNoInteractions(service);
        controller.getKitchen("internal-test-key",kitchen);
        verify(service).getInternalKitchen(kitchen);
        verify(service,never()).getPublicKitchen(any());
        properties.setAccessValue("");
        assertThrows(ApiException.class,() -> controller.getKitchen("internal-test-key",kitchen));
        verifyNoMoreInteractions(service);
    }
}
