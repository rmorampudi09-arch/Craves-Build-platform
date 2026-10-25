package in.craves.catalog.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.*;

import in.craves.catalog.service.MediaStorageService.StoredMedia;
import in.craves.catalog.service.UserChefKitchenPhotoClient.Photo;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Approved registration photos replace the kitchen's photos once; failures leave the kitchen to retry. */
class KitchenPhotoImporterTest {
    final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    final MediaStorageService media = mock(MediaStorageService.class);
    final UserChefKitchenPhotoClient client = mock(UserChefKitchenPhotoClient.class);
    final DiscoveryCacheService cache = mock(DiscoveryCacheService.class);
    final KitchenPhotoImporter importer = new KitchenPhotoImporter(
        jdbc, new TransactionTemplate(mock(PlatformTransactionManager.class)), media, client, cache);
    final UUID kitchenId = UUID.randomUUID();
    final UUID identityId = UUID.randomUUID();
    final Photo png = new Photo(new byte[] {1}, "image/png");
    final Photo jpeg = new Photo(new byte[] {2}, "image/jpeg");

    @BeforeEach
    void kitchenNotImportedYet() {
        kitchen(null);
        current("https://media.example/old-1.jpg", null);
        when(media.storeKitchenImage(eq(kitchenId), eq("registration-1.png"), any(), eq("image/png")))
            .thenReturn(new StoredMedia("media", "public/kitchens/k/kitchen/r1.png", "image/png", 1, "https://media.example/r1.png"));
        when(media.storeKitchenImage(eq(kitchenId), eq("registration-2.jpg"), any(), eq("image/jpeg")))
            .thenReturn(new StoredMedia("media", "public/kitchens/k/kitchen/r2.jpg", "image/jpeg", 1, "https://media.example/r2.jpg"));
    }

    void kitchen(OffsetDateTime importedAt) {
        Map<String, Object> row = new HashMap<>();
        row.put("identity_id", identityId);
        row.put("kitchen_photos_imported_at", importedAt);
        when(jdbc.queryForList(startsWith("SELECT identity_id, kitchen_photos_imported_at"), eq(kitchenId))).thenReturn(List.of(row));
    }

    void current(String slot1, String slot2) {
        Map<String, Object> row = new HashMap<>();
        row.put("kitchen_photo_url", slot1);
        row.put("kitchen_photo_2_url", slot2);
        row.put("kitchen_photos_imported_at", null);
        when(jdbc.queryForMap(startsWith("SELECT kitchen_photo_url, kitchen_photo_2_url, kitchen_photos_imported_at"), eq(kitchenId))).thenReturn(row);
    }

    @Test
    void registrationReplacesChefUpload() {
        when(client.fetch(identityId, 1)).thenReturn(Optional.of(png));
        when(client.fetch(identityId, 2)).thenReturn(Optional.of(jpeg));

        assertTrue(importer.importKitchen(kitchenId));

        verify(jdbc).update(startsWith("UPDATE catalog_schema.kitchen_profile SET kitchen_photo_url = COALESCE"),
            eq("https://media.example/r1.png"), eq("https://media.example/r2.jpg"), eq(kitchenId));
        verify(media).deleteByPublicUrl("https://media.example/old-1.jpg");
        verify(cache).invalidateAllDiscovery();
    }

    @Test
    void noRegistrationPhotosMarksImported() {
        when(client.fetch(eq(identityId), anyInt())).thenReturn(Optional.empty());

        assertFalse(importer.importKitchen(kitchenId));

        verify(jdbc).update(startsWith("UPDATE catalog_schema.kitchen_profile SET kitchen_photo_url = COALESCE"),
            eq(null), eq(null), eq(kitchenId));
        verify(media, never()).storeKitchenImage(any(), anyString(), any(), anyString());
        verify(media, never()).deleteByPublicUrl(anyString());
        verify(cache, never()).invalidateAllDiscovery();
    }

    @Test
    void failedFetchLeavesKitchenUnimported() {
        when(client.fetch(identityId, 1)).thenReturn(Optional.of(png));
        when(client.fetch(identityId, 2)).thenThrow(new IllegalStateException("user-chef answered 503"));

        assertThrows(IllegalStateException.class, () -> importer.importKitchen(kitchenId));

        verify(jdbc, never()).update(anyString(), any(Object[].class));
        verify(media, never()).storeKitchenImage(any(), anyString(), any(), anyString());
    }

    @Test
    void alreadyImportedIsSkipped() {
        kitchen(OffsetDateTime.now());

        assertFalse(importer.importKitchen(kitchenId));

        verifyNoInteractions(client, media, cache);
    }

    @Test
    void onlyOneSlotPresentKeepsTheOtherSlot() {
        current("https://media.example/old-1.jpg", "https://media.example/keep-2.jpg");
        when(client.fetch(identityId, 1)).thenReturn(Optional.of(png));
        when(client.fetch(identityId, 2)).thenReturn(Optional.empty());

        assertTrue(importer.importKitchen(kitchenId));

        verify(jdbc).update(startsWith("UPDATE catalog_schema.kitchen_profile SET kitchen_photo_url = COALESCE"),
            eq("https://media.example/r1.png"), eq(null), eq(kitchenId));
        verify(media).deleteByPublicUrl("https://media.example/old-1.jpg");
        verify(media, never()).deleteByPublicUrl("https://media.example/keep-2.jpg");
    }

    @Test
    void storedPhotosAreRemovedWhenTheWriteFails() {
        when(client.fetch(identityId, 1)).thenReturn(Optional.of(png));
        when(client.fetch(identityId, 2)).thenReturn(Optional.of(jpeg));
        when(jdbc.update(startsWith("UPDATE catalog_schema.kitchen_profile"), any(), any(), any())).thenThrow(new IllegalStateException("db down"));

        assertThrows(IllegalStateException.class, () -> importer.importKitchen(kitchenId));

        verify(media).deleteQuietly("public/kitchens/k/kitchen/r1.png");
        verify(media).deleteQuietly("public/kitchens/k/kitchen/r2.jpg");
        verify(media, never()).deleteByPublicUrl(anyString());
    }

    @Test
    void backfillImportsEveryUnimportedKitchenAndCountsFailures() {
        UUID broken = UUID.randomUUID();
        when(jdbc.queryForList(startsWith("SELECT id FROM catalog_schema.kitchen_profile WHERE kitchen_photos_imported_at IS NULL"), eq(UUID.class)))
            .thenReturn(List.of(kitchenId, broken));
        when(jdbc.queryForList(startsWith("SELECT identity_id, kitchen_photos_imported_at"), eq(broken))).thenThrow(new IllegalStateException("gone"));
        when(client.fetch(identityId, 1)).thenReturn(Optional.of(png));
        when(client.fetch(identityId, 2)).thenReturn(Optional.empty());

        KitchenPhotoImporter.Backfill result = importer.backfill();

        assertEquals(2, result.checked());
        assertEquals(1, result.imported());
        assertEquals(1, result.failed());
    }
}
