package in.craves.userchef.onboarding;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.userchef.email.AuthEmailProjectionService;
import in.craves.userchef.exception.ApiException;
import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.service.*;
import in.craves.userchef.web.ApiDtos.KycDocumentType;
import in.craves.userchef.web.ApiDtos.ChefApplicationStatus;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.support.TransactionTemplate;
import static in.craves.userchef.onboarding.ChefOnboardingDtos.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@EnabledIf("databaseConfigured")
class ChefOnboardingDatabaseTest {
    JdbcTemplate jdbc;
    TransactionTemplate tx;
    ChefOnboardingService service;
    ChefApplicationService applications;
    ChefDocumentReviewService review;
    ChefOnboardingContentService content;
    CurrentUser user;
    CurrentUser admin;
    ChefBankEnrollmentClient bank;
    AuthInternalClient auth;
    AuthEmailProjectionService projection;
    BlobDocumentStorageService storage;
    static boolean databaseConfigured() { return System.getenv("ONBOARDING_TEST_DB_URL")!=null; }
    @BeforeEach void setup() {
        String url=System.getenv("ONBOARDING_TEST_DB_URL");
        assertEquals("true",System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE"));
        assertEquals("true",System.getenv("GITHUB_ACTIONS"));
        assertTrue(url.matches("jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]+/chef_onboarding_test"));
        var data=new DriverManagerDataSource(url,System.getenv("ONBOARDING_TEST_DB_USER"),System.getenv("ONBOARDING_TEST_DB_PASSWORD"));
        var root=new JdbcTemplate(data);
        assertEquals("chef_onboarding_test",root.queryForObject("SELECT current_database()",String.class));
        root.execute("CREATE SCHEMA IF NOT EXISTS onboarding_v2_test");
        Flyway.configure().dataSource(data).defaultSchema("onboarding_v2_test").schemas("onboarding_v2_test")
            .locations("classpath:db/migration").load().migrate();
        var scoped=new DriverManagerDataSource(url+"?currentSchema=onboarding_v2_test,public",
            System.getenv("ONBOARDING_TEST_DB_USER"),System.getenv("ONBOARDING_TEST_DB_PASSWORD"));
        jdbc=new JdbcTemplate(scoped);tx=new TransactionTemplate(new DataSourceTransactionManager(scoped));
        auth=mock(AuthInternalClient.class);when(auth.requireVerifiedEmail(any(),anyString())).thenAnswer(call->call.getArgument(1));
        projection=mock(AuthEmailProjectionService.class);
        var notifications=mock(NotificationInternalClient.class);
        storage=mock(BlobDocumentStorageService.class);
        when(storage.uploadKycDocument(any(),any(),any())).thenReturn(
            new BlobDocumentStorageService.StoredDocument("documents","kyc/synthetic","photo.jpg","image/jpeg",20));
        applications=new ChefApplicationService(jdbc,storage,auth,notifications,projection,true);
        review=new ChefDocumentReviewService(jdbc,storage,notifications);
        bank=mock(ChefBankEnrollmentClient.class);when(bank.requireEnrollment(anyString(),anyString())).thenReturn(UUID.randomUUID());
        service=onboardingService(true);
        content=new ChefOnboardingContentService(jdbc,storage);
        user=new CurrentUser(UUID.randomUUID(),"synthetic","+919000000000",List.of("CUSTOMER"));
        admin=new CurrentUser(UUID.randomUUID(),"admin","+919000000001",List.of("PLATFORM_ADMIN"));
    }
    <T> T run(Supplier<T> action) { return tx.execute(status->action.get()); }
    ChefOnboardingService onboardingService(boolean bankRequired) {
        return new ChefOnboardingService(jdbc,new ObjectMapper().findAndRegisterModules(),applications,auth,projection,
            new SupportCaseService(jdbc),bank,storage,true,bankRequired,"8367366787","support@craves.in");
    }
    State save(ProofKind proof,String licence) {
        var version=service.mine(user).version();
        return run(()->service.save(user,new SaveRequest(version,ChefOnboardingPolicyTest.details(proof,licence))));
    }
    void upload(KycDocumentType type) {
        run(()->applications.uploadDocument(user,type,new MockMultipartFile("file","photo.jpg","image/jpeg",new byte[]{1,2,3,4})));
    }
    void photos() { upload(KycDocumentType.KITCHEN_PHOTO_1);upload(KycDocumentType.KITCHEN_PHOTO_2); }

    @Test void noLicencePersistsAtFssaiAndHelpDoesNotGrantApprovalOrChefRole() {
        save(null,null);photos();
        assertEquals("fssai",service.mine(user).resumeStep());
        var key=UUID.randomUUID();
        Help first=run(()->service.requestHelp(user,new HelpRequest(key,"Help me apply for an FSSAI registration")));
        Help retry=run(()->service.requestHelp(user,new HelpRequest(key,"Retry same request")));
        assertEquals(first.id(),retry.id());
        assertEquals("te",first.details().language());
        assertEquals("+919000000000",first.phoneNumber());
        assertEquals("fssai",service.mine(user).resumeStep());
        assertEquals("PENDING",jdbc.queryForObject("SELECT status FROM chef_application WHERE identity_id=?",String.class,user.identityId()));
        assertFalse(service.mine(user).submitted());
        assertFalse(applications.listApplications(admin,null).stream().anyMatch(a->user.identityId().equals(a.identityId())));
        run(()->service.updateHelp(admin,first.id(),new HelpStatusRequest("CONTACTED")));
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM chef_onboarding_help_audit WHERE help_id=?",Integer.class,first.id()));
    }
    @Test void panNeedsFourNewEvidenceFilesAndOnlyFinalAdminApprovalEnablesChef() {
        save(ProofKind.PAN,"12345678901234");photos();
        UUID applicationId=service.mine(user).application().id();
        assertThrows(ApiException.class,()->run(()->applications.approve(admin,applicationId)));
        upload(KycDocumentType.FSSAI_LICENSE);upload(KycDocumentType.SELECTED_PROOF_FRONT);
        assertEquals("review",service.mine(user).resumeStep());
        var version=service.mine(user).version();
        run(()->service.submit(user,new ChefOnboardingController.SubmitRequest(version,true,ChefOnboardingService.TERMS_VERSION),"Bearer test"));
        assertThrows(ApiException.class,()->run(()->applications.approve(admin,applicationId)));
        for(var document:service.mine(user).documents())
            run(()->review.approve(admin,applicationId,document.id()));
        run(()->service.reviewAction(admin,applicationId,new ReviewAction(service.mine(user).version(),"VERIFY_FSSAI","Checked official registration record","12345678901234",null)));
        assertEquals("APPROVED",run(()->applications.approve(admin,applicationId)).status().name());
        assertTrue(service.mine(user).legacy());
        assertEquals(4,jdbc.queryForObject("SELECT count(*) FROM chef_kyc_document WHERE application_id=?",Integer.class,applicationId));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM chef_kyc_document WHERE application_id=? AND document_type IN ('APPLICANT_PHOTO','TAX_ID_CARD','SELECTED_PROOF_BACK')",Integer.class,applicationId));
    }
    @Test void aadhaarCannotSubmitWithoutItsBackButBankStatementIsSingleFile() {
        save(ProofKind.AADHAAR,"12345678901234");photos();upload(KycDocumentType.FSSAI_LICENSE);upload(KycDocumentType.SELECTED_PROOF_FRONT);
        assertEquals("documents",service.mine(user).resumeStep());
        assertThrows(ApiException.class,()->run(()->service.submit(user,new ChefOnboardingController.SubmitRequest(service.mine(user).version(),true,ChefOnboardingService.TERMS_VERSION),"Bearer test")));
        upload(KycDocumentType.SELECTED_PROOF_BACK);
        assertEquals("review",service.mine(user).resumeStep());
        user=new CurrentUser(UUID.randomUUID(),"bank","+919000000002",List.of("CUSTOMER"));
        save(ProofKind.BANK_STATEMENT,"12345678901234");photos();upload(KycDocumentType.FSSAI_LICENSE);upload(KycDocumentType.SELECTED_PROOF_FRONT);
        assertEquals("review",service.mine(user).resumeStep());
        assertThrows(ApiException.class,()->upload(KycDocumentType.SELECTED_PROOF_BACK));
    }
    @Test void versionAndProofLocksPreventStaleTabsOrMismatchedDocuments() {
        save(ProofKind.PAN,null);
        long staleVersion=service.mine(user).version();
        save(ProofKind.PAN,null);
        assertThrows(ApiException.class,()->run(()->service.save(user,new SaveRequest(staleVersion,ChefOnboardingPolicyTest.details(ProofKind.PAN,null)))));
        upload(KycDocumentType.SELECTED_PROOF_FRONT);
        assertThrows(ApiException.class,()->save(ProofKind.AADHAAR,null));
        assertEquals(ProofKind.PAN,service.mine(user).details().proofKind());
    }
    @Test void existingApprovedChefCompletesAddedEvidenceWithoutLosingApprovalOrOldDocuments() {
        UUID id=UUID.randomUUID();
        jdbc.update("""
            INSERT INTO chef_application(id,identity_id,phone_number,email,first_name,last_name,address_line1,city,state,status)
            VALUES (?,?,'9000000000','chef@example.test','Test','Chef','Kitchen','Hyderabad','Telangana','APPROVED')
            """,id,user.identityId());
        UUID old=UUID.randomUUID();
        jdbc.update("INSERT INTO chef_kyc_document(id,application_id,identity_id,document_type,original_file_name,blob_container,blob_name,content_type,file_size_bytes,status) VALUES (?,?,?,'GOVERNMENT_ID_FRONT','old.jpg','documents','historical','image/jpeg',20,'APPROVED')",old,id,user.identityId());
        assertFalse(service.mine(user).legacy());
        assertEquals("personal",service.mine(user).resumeStep());
        save(ProofKind.PAN,"12345678901234");photos();upload(KycDocumentType.FSSAI_LICENSE);upload(KycDocumentType.SELECTED_PROOF_FRONT);
        assertThrows(ApiException.class,()->run(()->review.approve(admin,id,service.mine(user).documents().stream()
            .filter(document -> document.documentType()==KycDocumentType.KITCHEN_PHOTO_1).findFirst().orElseThrow().id())));
        run(()->service.submit(user,new ChefOnboardingController.SubmitRequest(service.mine(user).version(),true,ChefOnboardingService.TERMS_VERSION),"Bearer test"));
        assertTrue(applications.listApplications(admin,in.craves.userchef.web.ApiDtos.ChefApplicationStatus.PENDING).stream().anyMatch(application -> id.equals(application.id())));
        for(var document:service.mine(user).documents()) {
            if(document.documentType()==KycDocumentType.GOVERNMENT_ID_FRONT) continue;
            run(()->review.approve(admin,id,document.id()));
        }
        assertFalse(service.mine(user).legacy());
        assertTrue(applications.listApplications(admin,in.craves.userchef.web.ApiDtos.ChefApplicationStatus.PENDING).stream().anyMatch(application -> id.equals(application.id())),"FSSAI review remains visible after all upload decisions are approved");
        run(()->service.reviewAction(admin,id,new ReviewAction(service.mine(user).version(),"VERIFY_FSSAI","Checked official registration record","12345678901234",null)));
        assertTrue(service.mine(user).legacy());
        assertEquals("APPROVED",jdbc.queryForObject("SELECT status FROM chef_application WHERE id=?",String.class,id));
        assertEquals("historical",jdbc.queryForObject("SELECT blob_name FROM chef_kyc_document WHERE id=?",String.class,old));
        assertEquals("GOVERNMENT_ID_FRONT",jdbc.queryForObject("SELECT document_type FROM chef_kyc_document WHERE id=?",String.class,old));
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM chef_onboarding_draft WHERE identity_id=?",Integer.class,user.identityId()));
    }
    @Test void pendingAndRejectedLegacyApplicationsMustCompleteNewFlowBeforeApproval() {
        for(String status:List.of("PENDING","REJECTED")) {
            user=new CurrentUser(UUID.randomUUID(),"legacy-"+status,"+919000000003",List.of("CUSTOMER"));
            UUID id=UUID.randomUUID();
            jdbc.update("INSERT INTO chef_application(id,identity_id,phone_number,email,first_name,last_name,address_line1,city,state,status) VALUES (?,?,'9000000000','legacy@example.test','Existing','Chef','Kitchen','Hyderabad','Telangana',?)",id,user.identityId(),status);
            assertFalse(service.mine(user).legacy());
            assertEquals("personal",service.mine(user).resumeStep());
            assertThrows(ApiException.class,()->run(()->applications.approve(admin,id)));
            save(ProofKind.BANK_STATEMENT,"12345678901234");photos();upload(KycDocumentType.FSSAI_LICENSE);
            assertEquals("documents",service.mine(user).resumeStep());
            upload(KycDocumentType.SELECTED_PROOF_FRONT);
            run(()->service.submit(user,new ChefOnboardingController.SubmitRequest(service.mine(user).version(),true,ChefOnboardingService.TERMS_VERSION),"Bearer test"));
            for(var document:service.mine(user).documents()) run(()->review.approve(admin,id,document.id()));
            run(()->service.reviewAction(admin,id,new ReviewAction(service.mine(user).version(),"VERIFY_FSSAI","Checked official registration record","12345678901234",null)));
            assertEquals("APPROVED",run(()->applications.approve(admin,id)).status().name());
        }
    }

    @Test void deferredBankAllowsSubmissionRetryReviewAndApprovalWithoutBankProvider() {
        service=onboardingService(false);
        when(bank.requireEnrollment(anyString(),anyString())).thenThrow(new ApiException(503,"BANK_ENROLLMENT_UNAVAILABLE","Provider disabled"));
        save(ProofKind.PAN,"12345678901234");photos();upload(KycDocumentType.SELECTED_PROOF_FRONT);
        var before=service.mine(user);
        assertFalse(before.bankEnrollmentRequired());
        var request=new ChefOnboardingController.SubmitRequest(before.version(),true,ChefOnboardingService.TERMS_VERSION);
        State submitted=run(()->service.submit(user,request,"Bearer test"));
        State retried=run(()->service.submit(user,request,"Bearer test"));
        assertTrue(submitted.submitted());assertEquals(submitted.version(),retried.version());
        assertNull(jdbc.queryForObject("SELECT bank_enrollment_id FROM chef_onboarding_draft WHERE identity_id=?",UUID.class,user.identityId()));
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM chef_onboarding_action_audit WHERE identity_id=? AND action='BANK_ENROLLMENT_DEFERRED'",Integer.class,user.identityId()));
        assertTrue(applications.listApplications(admin,ChefApplicationStatus.PENDING).stream().anyMatch(a->submitted.application().id().equals(a.id())));
        assertFalse(service.review(admin,submitted.application().id()).bankEnrollmentRequired());
        assertThrows(ApiException.class,()->run(()->applications.approve(admin,submitted.application().id())));
        for(var document:submitted.documents()) run(()->review.approve(admin,submitted.application().id(),document.id()));
        assertThrows(ApiException.class,()->run(()->applications.approve(admin,submitted.application().id())));
        run(()->service.reviewAction(admin,submitted.application().id(),new ReviewAction(service.mine(user).version(),"VERIFY_FSSAI","Checked official registration record","12345678901234",null)));
        assertEquals("APPROVED",run(()->applications.approve(admin,submitted.application().id())).status().name());
        verifyNoInteractions(bank);
    }
    @Test void deferredBankStillRequiresTermsVerifiedEmailCompleteProofAndCurrentVersion() {
        service=onboardingService(false);
        save(ProofKind.AADHAAR,"12345678901234");photos();upload(KycDocumentType.SELECTED_PROOF_FRONT);
        var version=service.mine(user).version();
        assertThrows(ApiException.class,()->run(()->service.submit(user,new ChefOnboardingController.SubmitRequest(version,true,ChefOnboardingService.TERMS_VERSION),"Bearer test")));
        upload(KycDocumentType.SELECTED_PROOF_BACK);
        var current=service.mine(user).version();
        assertThrows(ApiException.class,()->run(()->service.submit(user,new ChefOnboardingController.SubmitRequest(current,false,ChefOnboardingService.TERMS_VERSION),"Bearer test")));
        assertThrows(ApiException.class,()->run(()->service.submit(user,new ChefOnboardingController.SubmitRequest(current,true,"outdated"),"Bearer test")));
        assertThrows(ApiException.class,()->run(()->service.submit(user,new ChefOnboardingController.SubmitRequest(current-1,true,ChefOnboardingService.TERMS_VERSION),"Bearer test")));
        when(auth.requireVerifiedEmail(any(),anyString())).thenThrow(ApiException.conflict("EMAIL_VERIFICATION_REQUIRED","Verify email"));
        assertThrows(ApiException.class,()->run(()->service.submit(user,new ChefOnboardingController.SubmitRequest(current,true,ChefOnboardingService.TERMS_VERSION),"Bearer test")));
        assertFalse(service.mine(user).submitted());verifyNoInteractions(bank);
    }
    @Test void deferredBankCorrectionResubmitsAndPreservesExistingEnrollmentReference() {
        save(ProofKind.PAN,"12345678901234");photos();upload(KycDocumentType.SELECTED_PROOF_FRONT);
        var submitted=run(()->service.submit(user,new ChefOnboardingController.SubmitRequest(service.mine(user).version(),true,ChefOnboardingService.TERMS_VERSION),"Bearer test"));
        UUID savedBank=jdbc.queryForObject("SELECT bank_enrollment_id FROM chef_onboarding_draft WHERE identity_id=?",UUID.class,user.identityId());
        service=onboardingService(false);clearInvocations(bank);
        run(()->service.reviewAction(admin,submitted.application().id(),new ReviewAction(submitted.version(),"REQUEST_INFORMATION","Clarify kitchen details",null,List.of("kitchen"))));
        save(ProofKind.PAN,"12345678901234");
        var resubmitted=run(()->service.submit(user,new ChefOnboardingController.SubmitRequest(service.mine(user).version(),true,ChefOnboardingService.TERMS_VERSION),"Bearer test"));
        assertTrue(resubmitted.submitted());assertEquals("PENDING",resubmitted.progress().status());
        assertEquals(savedBank,jdbc.queryForObject("SELECT bank_enrollment_id FROM chef_onboarding_draft WHERE identity_id=?",UUID.class,user.identityId()));
        verifyNoInteractions(bank);
    }
    @Test void requiredBankModeStillRejectsProviderOutageAndAdvertisesRequirement() {
        save(ProofKind.PAN,"12345678901234");photos();upload(KycDocumentType.SELECTED_PROOF_FRONT);
        assertTrue(service.mine(user).bankEnrollmentRequired());
        when(bank.requireEnrollment(anyString(),anyString())).thenThrow(new ApiException(503,"BANK_ENROLLMENT_UNAVAILABLE","Provider unavailable"));
        assertThrows(ApiException.class,()->run(()->service.submit(user,new ChefOnboardingController.SubmitRequest(service.mine(user).version(),true,ChefOnboardingService.TERMS_VERSION),"Bearer test")));
        assertFalse(service.mine(user).submitted());
    }
    @Test void partialBasicDraftSavesWithoutVerifyingEmailOrCreatingApplication() {
        Details partial=new Details("", "Only", "",null,null,null,null,null,null,null,null,null,null,null,null,null,null,"en",null);
        State first=run(()->service.saveDraft(user,new SaveRequest(0L,partial)));
        assertEquals("personal",first.resumeStep());assertNull(first.application().id());
        assertEquals("Only",service.mine(user).details().firstName());
        assertThrows(ApiException.class,()->run(()->service.save(user,new SaveRequest(first.version(),partial))));
    }
    @Test void termsAndBankEnrollmentAreRequiredByServerAndCorrectionKeepsDecisionHistory() {
        save(ProofKind.PAN,"12345678901234");photos();upload(KycDocumentType.SELECTED_PROOF_FRONT);
        long version=service.mine(user).version();
        assertThrows(ApiException.class,()->run(()->service.submit(user,new ChefOnboardingController.SubmitRequest(version,false,ChefOnboardingService.TERMS_VERSION),"Bearer test")));
        when(bank.requireEnrollment(anyString(),anyString())).thenThrow(ApiException.conflict("BANK_ENROLLMENT_REQUIRED","Missing bank"));
        assertThrows(ApiException.class,()->run(()->service.submit(user,new ChefOnboardingController.SubmitRequest(version,true,ChefOnboardingService.TERMS_VERSION),"Bearer test")));
        assertFalse(service.mine(user).submitted());
        doReturn(UUID.randomUUID()).when(bank).requireEnrollment(anyString(),anyString());
        State submitted=run(()->service.submit(user,new ChefOnboardingController.SubmitRequest(version,true,ChefOnboardingService.TERMS_VERSION),"Bearer test"));
        State retried=run(()->service.submit(user,new ChefOnboardingController.SubmitRequest(version,true,ChefOnboardingService.TERMS_VERSION),"Bearer test"));
        assertEquals(submitted.version(),retried.version());
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM chef_onboarding_action_audit WHERE identity_id=? AND action='SUBMITTED'",Integer.class,user.identityId()));
        assertEquals(ChefOnboardingService.TERMS_VERSION,jdbc.queryForObject("SELECT terms_version FROM chef_onboarding_draft WHERE identity_id=?",String.class,user.identityId()));
        assertThrows(ApiException.class,()->save(ProofKind.PAN,"12345678901234"));
        State correction=run(()->service.reviewAction(admin,submitted.application().id(),new ReviewAction(submitted.version(),"REQUEST_INFORMATION","Clarify your kitchen description",null,List.of("kitchen","documents"))));
        assertEquals("MORE_INFORMATION_REQUIRED",correction.progress().status());
        assertFalse(correction.submitted());
        assertThrows(ApiException.class,()->run(()->applications.reject(admin,submitted.application().id(),new in.craves.userchef.web.ApiDtos.AdminDecisionRequest("Corrections have not been resubmitted"))));
        save(ProofKind.PAN,"12345678901234");
        assertEquals("MORE_INFORMATION_REQUIRED",service.mine(user).progress().status());
        assertTrue(jdbc.queryForObject("SELECT count(*) FROM chef_onboarding_action_audit WHERE identity_id=?",Integer.class,user.identityId())>=3);
    }
    @Test void explicitCorrectionReopensRejectedApplicationAndRetainsRejectionEvidence() {
        save(ProofKind.PAN,"12345678901234");photos();upload(KycDocumentType.SELECTED_PROOF_FRONT);
        var before=service.mine(user);
        assertThrows(ApiException.class,()->run(()->applications.reject(admin,before.application().id(),new in.craves.userchef.web.ApiDtos.AdminDecisionRequest("Draft must not be rejected"))));
        var submitted=run(()->service.submit(user,new ChefOnboardingController.SubmitRequest(before.version(),true,ChefOnboardingService.TERMS_VERSION),"Bearer test"));
        run(()->applications.reject(admin,submitted.application().id(),new in.craves.userchef.web.ApiDtos.AdminDecisionRequest("Original rejection evidence")));
        var rejected=service.mine(user);assertEquals("REJECTED",rejected.application().status().name());
        var reopened=run(()->service.reviewAction(admin,rejected.application().id(),new ReviewAction(rejected.version(),"REQUEST_INFORMATION","Correct the kitchen description",null,List.of("kitchen"))));
        assertEquals("PENDING",reopened.application().status().name());assertEquals("MORE_INFORMATION_REQUIRED",reopened.progress().status());
        String prior=jdbc.queryForObject("SELECT snapshot->'application'->>'rejection_reason' FROM chef_onboarding_action_audit WHERE identity_id=? AND action='APPLICATION_REOPENED'",String.class,user.identityId());
        assertEquals("Original rejection evidence",prior);
        assertFalse(reopened.submitted());
    }
    @Test void uploadRemovalIsOwnedVersionedAndPreservesHistory() {
        save(ProofKind.PAN,null);photos();
        var before=service.mine(user);var document=before.documents().getFirst();
        assertThrows(ApiException.class,()->run(()->service.removeDocument(user,document.id(),before.version()-1)));
        State removed=run(()->service.removeDocument(user,document.id(),before.version()));
        assertFalse(removed.documents().stream().anyMatch(d->document.id().equals(d.id())));
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM chef_onboarding_document_history WHERE document_id=? AND action='REMOVED'",Integer.class,document.id()));
        assertThrows(ApiException.class,()->service.documentPreview(new CurrentUser(UUID.randomUUID(),"other","+919000000099",List.of("CUSTOMER")),document.id()));
    }

    @Test void reviewerRequestsNameSectionsAndApplicantSeesReferenceAndCallbackAfterReload() {
        save(ProofKind.PAN,"12345678901234");photos();upload(KycDocumentType.SELECTED_PROOF_FRONT);
        assertTrue(service.mine(user).application().referenceCode().matches("CRV-[0-9]{5,}"));
        Help help=run(()->service.requestHelp(user,new HelpRequest(UUID.randomUUID(),"Please call me about FSSAI")));
        var reloaded=service.mine(user).callbackRequest();
        assertEquals(help.caseNumber(),reloaded.caseNumber());assertEquals("OPEN",reloaded.status());
        var submitted=run(()->service.submit(user,new ChefOnboardingController.SubmitRequest(service.mine(user).version(),true,ChefOnboardingService.TERMS_VERSION),"Bearer test"));
        UUID id=submitted.application().id();
        assertThrows(ApiException.class,()->run(()->service.reviewAction(admin,id,new ReviewAction(submitted.version(),"REQUEST_INFORMATION","Retake photos",null,List.of()))));
        assertThrows(ApiException.class,()->run(()->service.reviewAction(admin,id,new ReviewAction(submitted.version(),"REQUEST_INFORMATION","Retake photos",null,List.of("menu")))));
        var correction=run(()->service.reviewAction(admin,id,new ReviewAction(submitted.version(),"REQUEST_INFORMATION","Retake photos",null,List.of("documents","kitchen"))));
        assertEquals(List.of("kitchen","documents"),correction.progress().sections());
        assertEquals(List.of("kitchen","documents"),service.mine(user).progress().sections());
        var resubmitted=run(()->service.submit(user,new ChefOnboardingController.SubmitRequest(service.mine(user).version(),true,ChefOnboardingService.TERMS_VERSION),"Bearer test"));
        assertEquals(List.of(),resubmitted.progress().sections());
        assertNull(jdbc.queryForObject("SELECT correction_sections FROM chef_onboarding_draft WHERE identity_id=?",String.class,user.identityId()));
    }
    @Test void otherGovernmentIdWithoutBackSideSubmitsWithFrontOnlyAndMinorsCannotSave() {
        var base=ChefOnboardingPolicyTest.details(ProofKind.OTHER_GOVERNMENT_ID,"12345678901234");
        java.util.function.Function<Boolean,Details> withBack=back->new Details(base.email(),base.firstName(),base.lastName(),base.dateOfBirth(),
            base.kitchenName(),base.kitchenDescription(),base.addressLine1(),null,null,base.city(),base.state(),base.postalCode(),
            base.latitude(),base.longitude(),base.proofKind(),base.otherGovernmentId(),base.fssaiNumber(),base.language(),back);
        run(()->service.save(user,new SaveRequest(0L,withBack.apply(false))));
        photos();upload(KycDocumentType.SELECTED_PROOF_FRONT);
        assertEquals(Boolean.FALSE,service.mine(user).details().proofHasBack());
        assertEquals("review",service.mine(user).resumeStep());
        assertFalse(service.mine(user).requiredDocuments().contains("SELECTED_PROOF_BACK"));
        var minor=new Details(base.email(),base.firstName(),base.lastName(),java.time.LocalDate.now().minusYears(16),base.kitchenName(),
            null,base.addressLine1(),null,null,base.city(),base.state(),base.postalCode(),base.latitude(),base.longitude(),
            base.proofKind(),base.otherGovernmentId(),base.fssaiNumber(),base.language(),false);
        var error=assertThrows(ApiException.class,()->run(()->service.saveDraft(user,new SaveRequest(service.mine(user).version(),minor))));
        assertEquals("APPLICANT_UNDER_18",error.getCode());
    }
    @Test void videosFallBackToEnglishOnlyWhenTheChosenLanguageHasNone() {
        var english=run(()->content.create(admin,new ContentRequest("en","How to apply in English","ARTICLE","Synthetic English article for testing",null,null))).content();
        run(()->content.publish(admin,english.id(),new PublishRequest(english.version(),true)));
        assertTrue(content.published(user,"kok").stream().allMatch(item->"en".equals(item.language())));
        assertTrue(content.published(user,"kok").stream().anyMatch(item->item.id().equals(english.id())));
        var konkani=run(()->content.create(admin,new ContentRequest("kok","Konkani guide","ARTICLE","Synthetic Konkani article for testing",null,null))).content();
        run(()->content.publish(admin,konkani.id(),new PublishRequest(konkani.version(),true)));
        assertTrue(content.published(user,"kok").stream().allMatch(item->"kok".equals(item.language())));
    }
    @Test void contentIsPrivateUntilPublishedAndLanguageFilteringNeverPretendsTranslation() {
        var article=run(()->content.create(admin,new ContentRequest("te","How to apply","ARTICLE","Synthetic Telugu article for testing",null,null))).content();
        assertFalse(article.published());assertTrue(article.ready());
        assertFalse(content.published(user,"te").stream().anyMatch(item->item.id().equals(article.id())));
        assertTrue(content.published(user,"te").stream().allMatch(item->"en".equals(item.language())),"Only the English fallback may appear");
        run(()->content.publish(admin,article.id(),new PublishRequest(article.version(),true)));
        assertTrue(content.published(user,"te").stream().anyMatch(item->item.id().equals(article.id())));
        assertFalse(content.published(user,"hi").stream().anyMatch(item->item.id().equals(article.id())));
        assertThrows(ApiException.class,()->run(()->content.publish(user,article.id(),new PublishRequest(1L,true))));
        assertThrows(ApiException.class,()->run(()->content.publish(admin,article.id(),new PublishRequest(1L,false))));
    }
}

