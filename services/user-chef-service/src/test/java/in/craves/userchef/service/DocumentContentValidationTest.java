package in.craves.userchef.service;

import in.craves.userchef.config.DocumentStoreProperties;
import in.craves.userchef.exception.ApiException;
import in.craves.userchef.web.ApiDtos.KycDocumentType;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DocumentContentValidationTest {
    @Test void explicitEndpointCannotReplaceTheConfiguredDocumentsContainerWithRoot() {
        for(String suffix:java.util.List.of("", ";BlobEndpoint=https://fixtureonly.blob.core.windows.net", ";BlobEndpoint=https://fixtureonly.blob.core.windows.net/")) {
            var properties=new DocumentStoreProperties();
            properties.setDocumentsContainer("documents");
            properties.setEndpointValue("DefaultEndpointsProtocol=https;AccountName=fixtureonly;AccountKey=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=;EndpointSuffix=core.windows.net"+suffix);
            var storage=new BlobDocumentStorageService(properties);
            com.azure.storage.blob.BlobContainerClient container=org.springframework.test.util.ReflectionTestUtils.invokeMethod(storage,"documentsContainer");
            assertNotNull(container);
            assertEquals("documents",container.getBlobContainerName());
            assertEquals("https://fixtureonly.blob.core.windows.net/documents",container.getBlobContainerUrl());
            assertTrue(container.getBlobClient("kyc/fixture/identity.png").getBlobUrl().startsWith("https://fixtureonly.blob.core.windows.net/documents/"));
        }
    }
    BlobDocumentStorageService service=new BlobDocumentStorageService(new DocumentStoreProperties());
    MockMultipartFile file(String type,byte[] bytes) {return new MockMultipartFile("file","synthetic-test-only",type,bytes);}
    @Test void acceptsAllowedSignaturesWithoutContactingStorage() {
        for(var entry:java.util.Map.of("application/pdf","%PDF-1.7\nTEST ONLY","image/png","\u0089PNG\r\n\u001a\nTEST ONLY","image/jpeg","\u00ff\u00d8\u00ffTEST ONLY").entrySet()) {
            byte[] bytes=entry.getValue().getBytes(StandardCharsets.ISO_8859_1);
            assertArrayEquals(bytes,service.validatedBytes(KycDocumentType.GOVERNMENT_ID_FRONT,file(entry.getKey(),bytes)));
        }
    }
    @Test void renamedHtmlOrExecutableCannotPassContentTypeLabel() {
        for(String type:java.util.List.of("application/pdf","image/png","image/jpeg"))
            assertThrows(ApiException.class,()->service.validatedBytes(KycDocumentType.GOVERNMENT_ID_FRONT,file(type,"<html>not a document</html>".getBytes(StandardCharsets.US_ASCII))));
    }
    @Test void mismatchedSupportedTypeAlsoFails() {
        assertThrows(ApiException.class,()->service.validatedBytes(KycDocumentType.GOVERNMENT_ID_FRONT,file("image/jpeg","%PDF-1.7".getBytes(StandardCharsets.US_ASCII))));
    }
    @Test void photoRequiresAnImageAndEmptyOrUnknownFileIsRejected() {
        assertThrows(ApiException.class,()->service.validatedBytes(KycDocumentType.APPLICANT_PHOTO,file("application/pdf","%PDF-1.7".getBytes(StandardCharsets.US_ASCII))));
        assertThrows(ApiException.class,()->service.validatedBytes(KycDocumentType.GOVERNMENT_ID_FRONT,file("image/png",new byte[0])));
        assertThrows(ApiException.class,()->service.validatedBytes(KycDocumentType.GOVERNMENT_ID_FRONT,file("image/svg+xml",new byte[]{1})));
    }
    @Test void liesAboutStreamSizeCannotBypassBound() throws Exception {
        var props=new DocumentStoreProperties();props.setKycMaxFileSizeBytes(16);var bounded=new BlobDocumentStorageService(props);
        MultipartFile value=mock(MultipartFile.class);when(value.isEmpty()).thenReturn(false);when(value.getSize()).thenReturn(5L);
        when(value.getContentType()).thenReturn("application/pdf");when(value.getInputStream()).thenReturn(new ByteArrayInputStream(new byte[100]));
        assertThrows(ApiException.class,()->bounded.validatedBytes(KycDocumentType.GOVERNMENT_ID_FRONT,value));
    }
    @Test void truncatedReadIsRejected() throws Exception {
        MultipartFile value=mock(MultipartFile.class);when(value.isEmpty()).thenReturn(false);when(value.getSize()).thenReturn(50L);
        when(value.getContentType()).thenReturn("application/pdf");when(value.getInputStream()).thenReturn(new ByteArrayInputStream("%PDF-1.7".getBytes(StandardCharsets.US_ASCII)));
        assertThrows(ApiException.class,()->service.validatedBytes(KycDocumentType.GOVERNMENT_ID_FRONT,value));
    }
}
