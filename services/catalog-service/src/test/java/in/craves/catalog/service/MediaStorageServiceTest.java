package in.craves.catalog.service;

import in.craves.catalog.config.CatalogStorageProperties;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

class MediaStorageServiceTest {
    @Test void photosUseTheConfiguredContainerNotTheRootContainer() {
        var properties = new CatalogStorageProperties();
        properties.setEndpointValue("DefaultEndpointsProtocol=https;AccountName=stcravesmediatest;AccountKey="
            + Base64.getEncoder().encodeToString(new byte[32])
            + ";EndpointSuffix=core.windows.net;BlobEndpoint=https://stcravesmediatest.blob.core.windows.net/"); // as az CLI prints it
        properties.setMediaContainer("media");

        assertEquals("https://stcravesmediatest.blob.core.windows.net/media", new MediaStorageService(properties).publicBaseUrl());
    }
}
