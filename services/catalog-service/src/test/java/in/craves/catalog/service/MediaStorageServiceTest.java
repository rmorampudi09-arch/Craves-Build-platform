package in.craves.catalog.service;

import in.craves.catalog.config.CatalogStorageProperties;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

class MediaStorageServiceTest {
    @Test void photosUseTheConfiguredContainerNotTheRootContainer() {
        var properties = new CatalogStorageProperties();
        properties.setEndpointValue("DefaultEndpointsProtocol=https;AccountName=stcravesmediatest;AccountKey="
            + Base64.getEncoder().encodeToString(new byte[32])
            + ";EndpointSuffix=core.windows.net;BlobEndpoint=https://stcravesmediatest.blob.core.windows.net/"); // as az CLI prints it
        properties.setMediaContainer("media");

        assertEquals("https://stcravesmediatest.blob.core.windows.net/media", new MediaStorageService(properties).publicBaseUrl());
    }

    @Test void aReplacedOrDeletedKitchenPhotoRemovesOnlyTheBlobOfItsOwnPublicUrl() {
        var properties = new CatalogStorageProperties();
        properties.setPublicMediaBaseUrl("https://media.craves.example/");
        var storage = spy(new MediaStorageService(properties));
        doNothing().when(storage).deleteQuietly(anyString());

        storage.deleteByPublicUrl("https://media.craves.example/public/kitchens/k1/chef/abc-me.png");
        verify(storage).deleteQuietly("public/kitchens/k1/chef/abc-me.png");

        storage.deleteByPublicUrl("https://elsewhere.example/public/kitchens/k1/chef/abc-me.png");
        storage.deleteByPublicUrl(null);
        verify(storage, times(1)).deleteQuietly(anyString());
    }

    @Test void sharedChefAvatarsAreNeverDeleted() {
        var properties = new CatalogStorageProperties();
        properties.setPublicMediaBaseUrl("https://media.craves.example/");
        var storage = spy(new MediaStorageService(properties));
        doNothing().when(storage).deleteQuietly(anyString());

        storage.deleteByPublicUrl("https://media.craves.example/public/chef-avatars/chef-avatar-04.jpg");
        verify(storage, never()).deleteQuietly(anyString());
    }

    @Test void chefAvatarUrlUsesThePublicMediaBase() {
        var properties = new CatalogStorageProperties();
        properties.setPublicMediaBaseUrl("https://media.craves.example/");
        var storage = new MediaStorageService(properties);

        assertEquals("https://media.craves.example/public/chef-avatars/chef-avatar-04.jpg", storage.chefAvatarUrl("chef-avatar-04"));
    }

    @Test void everyStoredPhotoIsCleanedAndAnUnreadableOneIsA400() {
        byte[] broken = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE1, 0x7F, 0x7F, 1, 2};
        in.craves.catalog.exception.ApiException error = org.junit.jupiter.api.Assertions.assertThrows(
            in.craves.catalog.exception.ApiException.class, () -> MediaStorageService.publishable(broken, "image/jpeg"));
        org.junit.jupiter.api.Assertions.assertEquals(400, error.getStatus());
        org.junit.jupiter.api.Assertions.assertEquals("PHOTO_UNREADABLE", error.getCode());
    }
}
