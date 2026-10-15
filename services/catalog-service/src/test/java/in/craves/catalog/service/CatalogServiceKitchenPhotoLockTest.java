package in.craves.catalog.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import in.craves.catalog.config.CatalogDiscoveryProperties;
import in.craves.catalog.exception.ApiException;
import in.craves.catalog.finance.CatalogFinanceEligibility;
import in.craves.catalog.security.CravesPrincipal;
import in.craves.catalog.web.ApiDtos.KitchenPhotoKind;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.mock.web.MockMultipartFile;

/** Chefs can no longer replace or remove kitchen photos; only an empty slot can be filled. */
class CatalogServiceKitchenPhotoLockTest {
    static final String LOCKED = "Kitchen photos can't be changed. To change one, contact Craves support.";
    final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    final MediaStorageService media = mock(MediaStorageService.class);
    final CatalogService catalog = new CatalogService(jdbc, media, new CatalogDiscoveryProperties(), mock(CatalogFinanceEligibility.class));
    final CravesPrincipal chef = new CravesPrincipal(UUID.randomUUID(), "", Set.of("CHEF"));
    final UUID kitchenId = UUID.randomUUID();

    @Test
    void deleteKitchenPhotoIsLocked() {
        ApiException error = assertThrows(ApiException.class, () -> catalog.deleteKitchenPhoto(chef, KitchenPhotoKind.KITCHEN));

        assertEquals(409, error.getStatus());
        assertEquals("KITCHEN_PHOTOS_LOCKED", error.getCode());
        assertEquals(LOCKED, error.getMessage());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
        verifyNoInteractions(media);
    }

    @Test
    @SuppressWarnings("unchecked")
    void uploadIntoFullKitchenIsLockedBeforeStoringAnything() {
        when(jdbc.query(eq("SELECT id FROM catalog_schema.kitchen_profile WHERE identity_id = ?"), any(RowMapper.class), eq(chef.identityId())))
            .thenReturn(List.of(kitchenId));
        when(jdbc.queryForMap(startsWith("SELECT kitchen_photo_url, kitchen_photo_2_url"), eq(kitchenId)))
            .thenReturn(Map.of("kitchen_photo_url", "https://media.example/1.jpg", "kitchen_photo_2_url", "https://media.example/2.jpg"));

        ApiException error = assertThrows(ApiException.class, () -> catalog.uploadKitchenPhoto(
            chef, KitchenPhotoKind.KITCHEN, new MockMultipartFile("file", "k.jpg", "image/jpeg", new byte[] {1})));

        assertEquals(409, error.getStatus());
        assertEquals("KITCHEN_PHOTOS_LOCKED", error.getCode());
        verifyNoInteractions(media);
    }
}
