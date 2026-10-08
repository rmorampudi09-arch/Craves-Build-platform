package in.craves.userchef.onboarding;

import in.craves.userchef.exception.ApiException;
import in.craves.userchef.web.ApiDtos.KycDocumentResponse;
import in.craves.userchef.web.ApiDtos.KycDocumentType;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static in.craves.userchef.onboarding.ChefOnboardingDtos.*;
import static org.junit.jupiter.api.Assertions.*;

class ChefOnboardingPolicyTest {
    static Details details(ProofKind proof,String licence) {
        return new Details("chef@example.test","Test","Chef",LocalDate.of(1990,1,1),"Kitchen","Description",
            "Test address",null,null,"Hyderabad","Telangana","500001",new BigDecimal("17.4"),new BigDecimal("78.4"),
            proof,proof==ProofKind.OTHER_GOVERNMENT_ID?"Voter ID":null,licence,"te",null);
    }
    static KycDocumentResponse doc(KycDocumentType type,String status) {
        return new KycDocumentResponse(UUID.randomUUID(),type,"image.jpg","documents","kyc/test","image/jpeg",20,status,
            null,null,Instant.now(),Instant.now());
    }
    @Test void singleFileChoicesNeverRequireBackOrSeparatePanOrApplicantPhoto() {
        for(var proof:List.of(ProofKind.PAN,ProofKind.BANK_STATEMENT)) {
            var required=ChefOnboardingPolicy.required(proof,null);
            assertEquals(3,required.size());
            assertFalse(required.contains(KycDocumentType.SELECTED_PROOF_BACK));
            assertFalse(required.contains(KycDocumentType.TAX_ID_CARD));
            assertFalse(required.contains(KycDocumentType.APPLICANT_PHOTO));
        }
    }
    @Test void twoSidedChoicesRequireBothSidesOfSameSelectedProof() {
        for(var proof:List.of(ProofKind.AADHAAR,ProofKind.OTHER_GOVERNMENT_ID)) {
            assertEquals(4,ChefOnboardingPolicy.required(proof,null).size());
            assertTrue(ChefOnboardingPolicy.required(proof,null).contains(KycDocumentType.SELECTED_PROOF_BACK));
        }
    }
    @Test void onlyAnOtherGovernmentIdCanBeMarkedAsHavingNoBackSide() {
        assertFalse(ChefOnboardingPolicy.required(ProofKind.OTHER_GOVERNMENT_ID,false).contains(KycDocumentType.SELECTED_PROOF_BACK));
        assertTrue(ChefOnboardingPolicy.required(ProofKind.OTHER_GOVERNMENT_ID,true).contains(KycDocumentType.SELECTED_PROOF_BACK));
        assertTrue(ChefOnboardingPolicy.required(ProofKind.AADHAAR,false).contains(KycDocumentType.SELECTED_PROOF_BACK));
    }
    @Test void applicantsMustBeAtLeastEighteen() {
        var today=LocalDate.of(2026,10,9);
        assertTrue(ChefOnboardingPolicy.adult(LocalDate.of(2008,10,9),today));
        assertFalse(ChefOnboardingPolicy.adult(LocalDate.of(2008,10,10),today));
        assertFalse(ChefOnboardingPolicy.adult(LocalDate.of(2008,2,29),LocalDate.of(2026,2,28)));
        assertTrue(ChefOnboardingPolicy.adult(LocalDate.of(2008,2,29),LocalDate.of(2026,3,1)));
        var minor=details(ProofKind.PAN,null);
        var young=new Details(minor.email(),minor.firstName(),minor.lastName(),LocalDate.now().minusYears(17),minor.kitchenName(),
            minor.kitchenDescription(),minor.addressLine1(),null,null,minor.city(),minor.state(),minor.postalCode(),minor.latitude(),
            minor.longitude(),minor.proofKind(),null,null,"te",null);
        assertEquals("APPLICANT_UNDER_18",assertThrows(ApiException.class,()->ChefOnboardingPolicy.validateDraft(young)).getCode());
    }
    @Test void chefWithoutFssaiAlwaysResumesFssaiRegardlessOfHelpOrContentAccess() {
        var docs=List.of(doc(KycDocumentType.KITCHEN_PHOTO_1,"APPROVED"),doc(KycDocumentType.KITCHEN_PHOTO_2,"UPLOADED"));
        assertEquals("fssai",ChefOnboardingPolicy.resume(details(null,null),docs,false));
        assertEquals("documents",ChefOnboardingPolicy.resume(details(ProofKind.PAN,"12345678901234"),docs,true));
    }
    @Test void rejectedLicenceAndPhotoReturnToTheirSpecificCorrectionStep() {
        var photos=List.of(doc(KycDocumentType.KITCHEN_PHOTO_1,"APPROVED"),doc(KycDocumentType.KITCHEN_PHOTO_2,"REJECTED"));
        assertEquals("kitchen-photos",ChefOnboardingPolicy.resume(details(ProofKind.PAN,"12345678901234"),photos,true));
        var rejected=List.of(doc(KycDocumentType.KITCHEN_PHOTO_1,"APPROVED"),doc(KycDocumentType.KITCHEN_PHOTO_2,"APPROVED"),
            doc(KycDocumentType.FSSAI_LICENSE,"REJECTED"),doc(KycDocumentType.SELECTED_PROOF_FRONT,"APPROVED"));
        assertEquals("waiting",ChefOnboardingPolicy.resume(details(ProofKind.PAN,"12345678901234"),rejected,true));
    }
    @Test void completedEvidenceIsReviewedBeforeItCanEnterWaiting() {
        var docs=ChefOnboardingPolicy.required(ProofKind.PAN,null).stream().map(type->doc(type,"UPLOADED")).toList();
        assertEquals("review",ChefOnboardingPolicy.resume(details(ProofKind.PAN,"12345678901234"),docs,false));
        assertEquals("waiting",ChefOnboardingPolicy.resume(details(ProofKind.PAN,"12345678901234"),docs,true));
    }
    @Test void languageAndFileSignatureChecksRejectUnsupportedInput() {
        assertEquals(23,ChefOnboardingPolicy.LANGUAGES.size());
        assertTrue(ChefOnboardingContentService.validVideoSignature("video/mp4",new byte[]{0,0,0,20,'f','t','y','p',0,0,0,0}));
        assertFalse(ChefOnboardingContentService.validVideoSignature("video/mp4","<html>bad</html>".getBytes()));
        assertTrue(ChefOnboardingContentService.validVideoSignature("video/webm",new byte[]{0x1a,0x45,(byte)0xdf,(byte)0xa3}));
        assertThrows(ApiException.class,()->ChefOnboardingService.requireEditor(
            new in.craves.userchef.security.CurrentUser(UUID.randomUUID(),"test","9000000000",List.of("CUSTOMER"))));
    }
}
