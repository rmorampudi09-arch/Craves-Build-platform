package in.craves.userchef.onboarding;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.userchef.email.AuthEmailProjectionService;
import in.craves.userchef.exception.ApiException;
import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.service.*;
import in.craves.userchef.web.ApiDtos.KycDocumentType;
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
        var auth=mock(AuthInternalClient.class);when(auth.requireVerifiedEmail(any(),anyString())).thenAnswer(call->call.getArgument(1));
        var projection=mock(AuthEmailProjectionService.class);
        var notifications=mock(NotificationInternalClient.class);
        var storage=mock(BlobDocumentStorageService.class);
        when(storage.uploadKycDocument(any(),any(),any())).thenReturn(
            new BlobDocumentStorageService.StoredDocument("documents","kyc/synthetic","photo.jpg","image/jpeg",20));
        applications=new ChefApplicationService(jdbc,storage,auth,notifications,projection,true);
        review=new ChefDocumentReviewService(jdbc,storage,notifications);
        service=new ChefOnboardingService(jdbc,new ObjectMapper().findAndRegisterModules(),applications,auth,projection,
            new SupportCaseService(jdbc),true,"8367366787","support@craves.in");
        content=new ChefOnboardingContentService(jdbc,storage);
        user=new CurrentUser(UUID.randomUUID(),"synthetic","+919000000000",List.of("CUSTOMER"));
        admin=new CurrentUser(UUID.randomUUID(),"admin","+919000000001",List.of("PLATFORM_ADMIN"));
    }
    <T> T run(Supplier<T> action) { return tx.execute(status->action.get()); }
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
        run(()->service.submit(user,version));
        assertThrows(ApiException.class,()->run(()->applications.approve(admin,applicationId)));
        for(var document:service.mine(user).documents())
            run(()->review.approve(admin,applicationId,document.id()));
        assertEquals("APPROVED",run(()->applications.approve(admin,applicationId)).status().name());
        assertTrue(service.mine(user).legacy());
        assertEquals(4,jdbc.queryForObject("SELECT count(*) FROM chef_kyc_document WHERE application_id=?",Integer.class,applicationId));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM chef_kyc_document WHERE application_id=? AND document_type IN ('APPLICANT_PHOTO','TAX_ID_CARD','SELECTED_PROOF_BACK')",Integer.class,applicationId));
    }
    @Test void aadhaarCannotSubmitWithoutItsBackButBankStatementIsSingleFile() {
        save(ProofKind.AADHAAR,"12345678901234");photos();upload(KycDocumentType.FSSAI_LICENSE);upload(KycDocumentType.SELECTED_PROOF_FRONT);
        assertEquals("documents",service.mine(user).resumeStep());
        assertThrows(ApiException.class,()->run(()->service.submit(user,service.mine(user).version())));
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
            VALUES (?,?,'9000000000','approved@example.test','Approved','Chef','Kitchen','Hyderabad','Telangana','APPROVED')
            """,id,user.identityId());
        UUID old=UUID.randomUUID();
        jdbc.update("INSERT INTO chef_kyc_document(id,application_id,identity_id,document_type,original_file_name,blob_container,blob_name,content_type,file_size_bytes,status) VALUES (?,?,?,'GOVERNMENT_ID_FRONT','old.jpg','documents','historical','image/jpeg',20,'APPROVED')",old,id,user.identityId());
        assertFalse(service.mine(user).legacy());
        assertEquals("personal",service.mine(user).resumeStep());
        save(ProofKind.PAN,"12345678901234");photos();upload(KycDocumentType.FSSAI_LICENSE);upload(KycDocumentType.SELECTED_PROOF_FRONT);
        assertThrows(ApiException.class,()->run(()->review.approve(admin,id,service.mine(user).documents().stream()
            .filter(document -> document.documentType()==KycDocumentType.KITCHEN_PHOTO_1).findFirst().orElseThrow().id())));
        run(()->service.submit(user,service.mine(user).version()));
        assertTrue(applications.listApplications(admin,in.craves.userchef.web.ApiDtos.ChefApplicationStatus.PENDING).stream().anyMatch(application -> id.equals(application.id())));
        for(var document:service.mine(user).documents()) {
            if(document.documentType()==KycDocumentType.GOVERNMENT_ID_FRONT) continue;
            run(()->review.approve(admin,id,document.id()));
        }
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
            run(()->service.submit(user,service.mine(user).version()));
            for(var document:service.mine(user).documents()) run(()->review.approve(admin,id,document.id()));
            assertEquals("APPROVED",run(()->applications.approve(admin,id)).status().name());
        }
    }

    @Test void contentIsPrivateUntilPublishedAndLanguageFilteringNeverPretendsTranslation() {
        var article=run(()->content.create(admin,new ContentRequest("te","How to apply","ARTICLE","Synthetic Telugu article for testing",null,null))).content();
        assertFalse(article.published());assertTrue(article.ready());
        assertTrue(content.published(user,"te").isEmpty());
        run(()->content.publish(admin,article.id(),new PublishRequest(article.version(),true)));
        assertTrue(content.published(user,"te").stream().anyMatch(item->item.id().equals(article.id())));
        assertFalse(content.published(user,"hi").stream().anyMatch(item->item.id().equals(article.id())));
        assertThrows(ApiException.class,()->run(()->content.publish(user,article.id(),new PublishRequest(1L,true))));
        assertThrows(ApiException.class,()->run(()->content.publish(admin,article.id(),new PublishRequest(1L,false))));
    }
}
