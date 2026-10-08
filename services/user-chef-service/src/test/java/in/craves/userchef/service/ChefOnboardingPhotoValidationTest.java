package in.craves.userchef.service;
import in.craves.userchef.config.DocumentStoreProperties;
import in.craves.userchef.exception.ApiException;
import in.craves.userchef.web.ApiDtos.KycDocumentType;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import static org.junit.jupiter.api.Assertions.*;
class ChefOnboardingPhotoValidationTest {
    @Test void kitchenPhotosMustBeImagesEvenWhenDocumentsPermitPdf() {
        var storage=new BlobDocumentStorageService(new DocumentStoreProperties());
        var pdf=new MockMultipartFile("file","kitchen.pdf","application/pdf","%PDF-1.7 test".getBytes());
        for(var type:new KycDocumentType[]{KycDocumentType.KITCHEN_PHOTO_1,KycDocumentType.KITCHEN_PHOTO_2})
            assertThrows(ApiException.class,()->storage.validatedBytes(type,pdf));
        assertTrue(storage.validatedBytes(KycDocumentType.FSSAI_LICENSE,pdf).length>0);
        var jpeg=new MockMultipartFile("file","kitchen.jpg","image/jpeg",new byte[]{(byte)0xff,(byte)0xd8,(byte)0xff,0});
        assertEquals(4,storage.validatedBytes(KycDocumentType.KITCHEN_PHOTO_1,jpeg).length);
    }
}
