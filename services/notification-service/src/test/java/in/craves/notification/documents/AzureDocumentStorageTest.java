package in.craves.notification.documents;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.azure.core.http.rest.Response;
import com.azure.storage.blob.BlobContainerClient;
import com.azure.storage.blob.models.BlobContainerProperties;
import com.azure.storage.blob.models.PublicAccessType;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class AzureDocumentStorageTest {
    private final BlobContainerClient container=mock(BlobContainerClient.class,RETURNS_DEEP_STUBS);
    private final BlobContainerProperties properties=mock(BlobContainerProperties.class);
    private final AzureDocumentStorage storage;

    AzureDocumentStorageTest() {
        DocumentSettings settings=new DocumentSettings();
        settings.enabled=true;
        storage=new AzureDocumentStorage(settings);
        ReflectionTestUtils.setField(storage,"container",container);
        when(container.getPropertiesWithResponse(isNull(),any(),any()).getValue()).thenReturn(properties);
    }

    @Test void privateContainerUploadsWithoutRequiringAclOwnerPermission() {
        byte[] pdf="%PDF-private-document".getBytes(StandardCharsets.US_ASCII);
        UUID owner=UUID.randomUUID(), id=UUID.randomUUID();
        String key=storage.put(owner,id,pdf);
        assertEquals(owner+"/"+id+"/"+DocumentModels.sha256(pdf)+".pdf",key);
        verify(container,never()).getAccessPolicyWithResponse(any(),any(),any());
        verify(container.getBlobClient(key).getBlockBlobClient()).uploadWithResponse(any(),any(),any());
    }

    @Test void publicBlobOrContainerAccessBlocksUpload() {
        for(PublicAccessType access:new PublicAccessType[]{PublicAccessType.BLOB,PublicAccessType.CONTAINER}) {
            when(properties.getBlobPublicAccess()).thenReturn(access);
            assertThrows(IllegalStateException.class,()->storage.put(UUID.randomUUID(),UUID.randomUUID(),"%PDF-123".getBytes(StandardCharsets.US_ASCII)));
        }
        verify(container,never()).getBlobClient(anyString());
    }

    @Test void failedPrivacyReadDoesNotAttemptUpload() {
        when(container.getPropertiesWithResponse(isNull(),any(),any())).thenThrow(new IllegalStateException("permission denied"));
        assertThrows(IllegalStateException.class,()->storage.put(UUID.randomUUID(),UUID.randomUUID(),"%PDF-123".getBytes(StandardCharsets.US_ASCII)));
        verify(container,never()).getBlobClient(anyString());
    }
}
