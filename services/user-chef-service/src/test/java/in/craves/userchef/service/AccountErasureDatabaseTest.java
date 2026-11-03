package in.craves.userchef.service;

import static in.craves.userchef.onboarding.ChefOnboardingDtos.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.userchef.config.AuthInternalClientProperties;
import in.craves.userchef.email.AuthEmailProjectionService;
import in.craves.userchef.exception.ApiException;
import in.craves.userchef.onboarding.ChefBankEnrollmentClient;
import in.craves.userchef.onboarding.ChefOnboardingController;
import in.craves.userchef.onboarding.ChefOnboardingService;
import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.security.InternalRequestAuthorizer;
import in.craves.userchef.service.AccountErasureService.Scope;
import in.craves.userchef.service.BlobDocumentStorageService.StoredDocument;
import in.craves.userchef.service.BlobDocumentStorageService.StoredDocumentBytes;
import in.craves.userchef.web.ApiDtos.KycDocumentType;
import in.craves.userchef.web.InternalChefKitchenPhotoController;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.support.TransactionTemplate;

/** Real Flyway schema, same disposable database and env as ChefOnboardingDatabaseTest. */
@EnabledIf("databaseConfigured")
class AccountErasureDatabaseTest {
    static final String DELETED = AccountErasureService.DELETED;
    static final List<String> CHEF_TABLES = List.of(
        "chef_application", "chef_onboarding_draft", "chef_onboarding_help", "chef_onboarding_visit",
        "chef_onboarding_document_history", "chef_onboarding_action_audit", "chef_kyc_document");

    JdbcTemplate jdbc;
    TransactionTemplate tx;
    AccountErasureService erasure;
    ChefOnboardingService onboarding;
    ChefApplicationService applications;
    RegistrationKitchenPhotoService kitchenPhotos;
    BlobDocumentStorageService storage;
    AuthInternalClient auth;
    NotificationInternalClient notifications;
    ChefDocumentReviewService reviews;
    CurrentUser person;
    CurrentUser admin;
    UUID bystander;

    static boolean databaseConfigured() { return System.getenv("ONBOARDING_TEST_DB_URL") != null; }

    @BeforeEach void setup() {
        String url = System.getenv("ONBOARDING_TEST_DB_URL");
        assertEquals("true", System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE"));
        assertEquals("true", System.getenv("GITHUB_ACTIONS"));
        assertTrue(url.matches("jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]+/chef_onboarding_test"));
        var data = new DriverManagerDataSource(url, System.getenv("ONBOARDING_TEST_DB_USER"), System.getenv("ONBOARDING_TEST_DB_PASSWORD"));
        var root = new JdbcTemplate(data);
        assertEquals("chef_onboarding_test", root.queryForObject("SELECT current_database()", String.class));
        root.execute("CREATE SCHEMA IF NOT EXISTS onboarding_v2_test");
        Flyway.configure().dataSource(data).defaultSchema("onboarding_v2_test").schemas("onboarding_v2_test")
            .locations("classpath:db/migration").load().migrate();
        var scoped = new DriverManagerDataSource(url + "?currentSchema=onboarding_v2_test,public",
            System.getenv("ONBOARDING_TEST_DB_USER"), System.getenv("ONBOARDING_TEST_DB_PASSWORD"));
        jdbc = new JdbcTemplate(scoped);
        tx = new TransactionTemplate(new DataSourceTransactionManager(scoped));
        auth = mock(AuthInternalClient.class);
        when(auth.requireVerifiedEmail(any(), anyString())).thenAnswer(call -> call.getArgument(1));
        var projection = mock(AuthEmailProjectionService.class);
        storage = mock(BlobDocumentStorageService.class);
        when(storage.uploadKycDocument(any(), any(), any())).thenAnswer(call -> new StoredDocument(
            "documents", "kyc/" + UUID.randomUUID(), "photo.jpg", "image/jpeg", 20));
        when(storage.downloadKycDocument(anyString(), anyString(), anyString(), anyString(), org.mockito.ArgumentMatchers.anyLong()))
            .thenReturn(new StoredDocumentBytes("photo.jpg", "image/jpeg", new byte[] {1, 2, 3}));
        notifications = mock(NotificationInternalClient.class);
        applications = new ChefApplicationService(jdbc, storage, auth, notifications, projection, true);
        reviews = new ChefDocumentReviewService(jdbc, storage, notifications);
        var bank = mock(ChefBankEnrollmentClient.class);
        when(bank.requireEnrollment(anyString(), anyString())).thenReturn(UUID.randomUUID());
        onboarding = new ChefOnboardingService(jdbc, new ObjectMapper().findAndRegisterModules(), applications, auth, projection,
            new SupportCaseService(jdbc), bank, storage, true, true, "8367366787", "support@craves.in");
        kitchenPhotos = new RegistrationKitchenPhotoService(jdbc, storage);
        erasure = new AccountErasureService(jdbc);
        person = new CurrentUser(UUID.randomUUID(), "synthetic", "+919000000000", List.of("CUSTOMER", "CHEF"));
        admin = new CurrentUser(UUID.randomUUID(), "admin", "+919000000001", List.of("PLATFORM_ADMIN"));
        bystander = UUID.randomUUID();
    }

    <T> T run(Supplier<T> action) { return tx.execute(status -> action.get()); }
    Map<String, Integer> erase(Scope scope) { return run(() -> erasure.erase(person.identityId(), scope, UUID.randomUUID())); }
    int count(String sql, Object... args) { return jdbc.queryForObject("SELECT count(*) FROM " + sql, Integer.class, args); }
    String text(String sql, Object... args) { return jdbc.queryForObject(sql, String.class, args); }

    // ---- fixtures ----

    static Details details(String email, String first, String last) {
        return new Details(email, first, last, LocalDate.of(1990, 1, 1), "Spice Kitchen", "Home food",
            "12 Rose Street", "Block B", "Near the temple", "Hyderabad", "Telangana", "500001",
            new BigDecimal("17.4"), new BigDecimal("78.4"), ProofKind.PAN, null, "12345678901234", "te", null);
    }
    void save(String email, String first, String last) {
        long version = onboarding.mine(person).version();
        run(() -> onboarding.save(person, new SaveRequest(version, details(email, first, last))));
    }
    void upload(KycDocumentType type) {
        run(() -> applications.uploadDocument(person, type, new MockMultipartFile("file", "photo.jpg", "image/jpeg", new byte[] {1, 2, 3, 4})));
    }
    void uploadAll() {
        for (var type : List.of(KycDocumentType.KITCHEN_PHOTO_1, KycDocumentType.KITCHEN_PHOTO_2,
            KycDocumentType.FSSAI_LICENSE, KycDocumentType.SELECTED_PROOF_FRONT)) upload(type);
    }
    /** An applicant with a saved application, uploads, a callback request, a staff review note and two extra history rows. */
    void chefApplicant() {
        save("amma@example.test", "Lakshmi", "Devi");
        uploadAll();
        upload(KycDocumentType.KITCHEN_PHOTO_1); // a REPLACED history row
        run(() -> onboarding.requestHelp(person, new HelpRequest(UUID.randomUUID(), "Please call me about my FSSAI number")));
        UUID helpId = jdbc.queryForObject("SELECT id FROM chef_onboarding_help WHERE identity_id=?", UUID.class, person.identityId());
        run(() -> onboarding.updateHelp(admin, helpId, new HelpStatusRequest("CONTACTED")));
        UUID docId = jdbc.queryForObject("SELECT id FROM chef_kyc_document WHERE identity_id=? AND document_type='KITCHEN_PHOTO_1'",
            UUID.class, person.identityId());
        // History written by older code or a staff tool: contact keys inside the snapshot.
        jdbc.update("INSERT INTO chef_onboarding_document_history(id,document_id,identity_id,action,snapshot) VALUES (?,?,?,'REPLACED',?::jsonb)",
            UUID.randomUUID(), docId, person.identityId(),
            "{\"blob_name\":\"kyc/kept\",\"original_file_name\":\"id.jpg\",\"email\":\"amma@example.test\",\"phone_number\":\"+919000000000\"}");
        jdbc.update("INSERT INTO chef_onboarding_action_audit(id,identity_id,actor_id,action,version,reason,snapshot) VALUES (?,?,?,'APPLICATION_REOPENED',1,'Corrections asked',?::jsonb)",
            UUID.randomUUID(), person.identityId(), admin.identityId(),
            "{\"application\":{\"first_name\":\"Lakshmi\",\"phone_number\":\"+919000000000\",\"reference_code\":\"CRV-1\",\"address_line1\":\"12 Rose Street\"},"
                + "\"details\":{\"email\":\"amma@example.test\",\"fssaiNumber\":\"12345678901234\",\"city\":\"Hyderabad\"}}");
    }
    void approve() {
        jdbc.update("UPDATE chef_application SET status='APPROVED',reviewed_at=now(),reviewed_by_identity_id=? WHERE identity_id=?", admin.identityId(), person.identityId());
        jdbc.update("UPDATE chef_kyc_document SET status='APPROVED',review_reason='Checked',reviewed_by_identity_id=?,reviewed_at=now() WHERE identity_id=?", admin.identityId(), person.identityId());
    }
    void customer(UUID id) {
        jdbc.update("INSERT INTO customer_profile(identity_id,registered_phone_number,first_name,last_name,email) VALUES (?,'+919111111111','Asha','Rao','asha@example.test')", id);
        jdbc.update("INSERT INTO customer_address(identity_id,address_label,recipient_name,contact_phone_number,address_line1,address_line2,landmark,city,state,postal_code,latitude,longitude,is_default) VALUES (?,'HOME','Asha','+919111111111','5 Lake Road','Flat 2','Gate','Hyderabad','Telangana','500002',17.4,78.4,true)", id);
        jdbc.update("INSERT INTO customer_address(identity_id,address_label,recipient_name,contact_phone_number,address_line1,city,state,is_active) VALUES (?,'WORK','Asha','+919111111111','9 Park Street','Hyderabad','Telangana',false)", id);
        jdbc.update("INSERT INTO customer_favorite_chef(identity_id,chef_identity_id) VALUES (?,?)", id, UUID.randomUUID());
        jdbc.update("INSERT INTO customer_favorite_kitchen(identity_id,kitchen_id) VALUES (?,?)", id, UUID.randomUUID());
        jdbc.update("INSERT INTO customer_favorite_menu_item(identity_id,menu_item_id) VALUES (?,?)", id, UUID.randomUUID());
        jdbc.update("INSERT INTO customer_favorite_watch(identity_id,entity_type,entity_id,channel) VALUES (?,'KITCHEN',?,'PUSH')", id, UUID.randomUUID());
        jdbc.update("INSERT INTO customer_kitchen_launch_alert(identity_id,latitude_key,longitude_key,latitude,longitude,area_name) VALUES (?,17.400,78.400,17.4012,78.4001,'Kondapur')", id);
    }
    void outbox(UUID id, String role) { outbox(id, role, "PENDING"); }
    void outbox(UUID id, String role, String status) {
        jdbc.update("INSERT INTO notification_outbox(event_key,event_type,aggregate_type,aggregate_id,user_identity_id,user_role,title,body,status) VALUES (?,'TEST','TEST',?,?,?,'Hello Lakshmi','Your order 12 Rose Street',?)",
            "k-" + UUID.randomUUID(), UUID.randomUUID(), id, role, status);
    }
    /** One support case per role; the requester writes, staff answer, an internal note and history rows follow. */
    UUID supportCase(UUID id, String role, String subject) {
        UUID caseId = UUID.randomUUID();
        UUID staff = admin.identityId();
        jdbc.update("INSERT INTO support_case(id,case_number,requester_identity_id,requester_role,subject,assigned_to_identity_id) VALUES (?,?,?,?,?,?)",
            caseId, "T-" + caseId.toString().substring(0, 8), id, role, subject, staff);
        message(caseId, id, role, "My phone is +919000000000, call me");
        message(caseId, staff, "SUPPORT_ADMIN", "We will call you back");
        message(caseId, id, role, "Thanks, my address is 12 Rose Street");
        message(caseId, staff, "PLATFORM_ADMIN", "Internal: verified identity", true);
        jdbc.update("INSERT INTO support_case_status_history(id,case_id,old_status,new_status,actor_identity_id,actor_role,note) VALUES (?,?,'OPEN','IN_PROGRESS',?,'SUPPORT_ADMIN','Called the requester')", UUID.randomUUID(), caseId, staff);
        jdbc.update("INSERT INTO support_case_assignment_history(id,case_id,new_assignee_identity_id,actor_identity_id,actor_role) VALUES (?,?,?,?,'SUPPORT_ADMIN')", UUID.randomUUID(), caseId, staff, staff);
        return caseId;
    }
    void message(UUID caseId, UUID sender, String role, String body) { message(caseId, sender, role, body, false); }
    void message(UUID caseId, UUID sender, String role, String body, boolean internal) {
        jdbc.update("INSERT INTO support_case_message(id,case_id,sender_identity_id,sender_role,body,internal_note) VALUES (?,?,?,?,?,?)",
            UUID.randomUUID(), caseId, sender, role, body, internal);
    }
    List<String> rows(String sql, Object... args) {
        return jdbc.queryForList("SELECT j FROM (SELECT to_jsonb(t)::text AS j FROM (SELECT * FROM " + sql + ") t) x ORDER BY j", String.class, args);
    }
    List<String> chefRows(UUID id) {
        var all = new ArrayList<String>();
        for (String table : CHEF_TABLES) all.addAll(rows(table + " WHERE identity_id=?", id));
        return all;
    }
    List<String> everythingOf(UUID id) {
        var all = chefRows(id);
        for (String table : List.of("customer_profile", "customer_address", "customer_favorite_chef", "customer_favorite_kitchen",
            "customer_favorite_menu_item", "customer_favorite_watch", "customer_kitchen_launch_alert"))
            all.addAll(rows(table + " WHERE identity_id=?", id));
        all.addAll(rows("notification_outbox WHERE user_identity_id=?", id));
        all.addAll(rows("support_case WHERE requester_identity_id=?", id));
        all.addAll(rows("support_case_message WHERE sender_identity_id=?", id));
        return all;
    }

    // ---- tests ----

    @Test void customerScopeRemovesProfileAddressesFavouritesAndAlerts() {
        customer(person.identityId());
        customer(bystander);
        outbox(person.identityId(), "CUSTOMER");
        outbox(person.identityId(), "CHEF");
        outbox(bystander, "CUSTOMER");
        var bystanderBefore = everythingOf(bystander);

        var counts = erase(Scope.CUSTOMER);

        assertEquals(1, counts.get("customer_profile"));
        assertEquals(2, counts.get("customer_address"), "inactive addresses go too: hard delete");
        for (String table : List.of("customer_favorite_chef", "customer_favorite_kitchen", "customer_favorite_menu_item",
            "customer_favorite_watch", "customer_kitchen_launch_alert")) assertEquals(1, counts.get(table), table);
        assertEquals(1, counts.get("notification_outbox"));
        for (String table : List.of("customer_profile", "customer_address", "customer_favorite_chef", "customer_favorite_kitchen",
            "customer_favorite_menu_item", "customer_favorite_watch", "customer_kitchen_launch_alert"))
            assertEquals(0, count(table + " WHERE identity_id=?", person.identityId()), table);
        assertEquals(0, count("notification_outbox WHERE user_identity_id=? AND user_role='CUSTOMER'", person.identityId()));
        assertEquals(1, count("notification_outbox WHERE user_identity_id=? AND user_role='CHEF'", person.identityId()), "chef notices stay");
        assertEquals(bystanderBefore, everythingOf(bystander));
        assertFalse(counts.containsKey("chef_application"), "a customer erase never reports a chef table");
    }

    @Test void customerScopeLeavesChefApplicationAlone() {
        chefApplicant();
        approve();
        customer(person.identityId());
        outbox(person.identityId(), "CHEF");
        UUID chefCase = supportCase(person.identityId(), "CHEF", "Payout question");
        UUID helpCase = jdbc.queryForObject("SELECT support_case_id FROM chef_onboarding_help WHERE identity_id=?", UUID.class, person.identityId());
        var chefBefore = chefRows(person.identityId());
        var chefCaseBefore = rows("support_case_message WHERE case_id=?", chefCase);
        var helpCaseBefore = rows("support_case_message WHERE case_id=?", helpCase);
        var helpSubjectBefore = text("SELECT subject FROM support_case WHERE id=?", helpCase);

        erase(Scope.CUSTOMER);

        assertEquals(chefBefore, chefRows(person.identityId()));
        assertNull(jdbc.queryForObject("SELECT erased_at FROM chef_application WHERE identity_id=?", java.sql.Timestamp.class, person.identityId()));
        assertEquals(chefCaseBefore, rows("support_case_message WHERE case_id=?", chefCase));
        assertEquals("Payout question", text("SELECT subject FROM support_case WHERE id=?", chefCase));
        assertEquals(helpCaseBefore, rows("support_case_message WHERE case_id=?", helpCase), "the onboarding help case is chef-application data");
        assertEquals(helpSubjectBefore, text("SELECT subject FROM support_case WHERE id=?", helpCase));
        assertEquals(1, count("notification_outbox WHERE user_identity_id=? AND user_role='CHEF'", person.identityId()));
    }

    @Test void chefScopeAnonymisesApplicationAndKeepsKyc() {
        chefApplicant();
        approve();
        customer(person.identityId());
        outbox(person.identityId(), "CUSTOMER");
        for (String status : List.of("SENT", "PROCESSING", "DEAD")) outbox(person.identityId(), "CHEF", status);
        UUID chefCase = supportCase(person.identityId(), "CHEF", "Payout question");
        UUID customerCase = supportCase(person.identityId(), "CUSTOMER", "Wrong item");
        UUID helpCase = jdbc.queryForObject("SELECT support_case_id FROM chef_onboarding_help WHERE identity_id=?", UUID.class, person.identityId());
        var customerBefore = rows("customer_profile WHERE identity_id=?", person.identityId());
        var customerCaseBefore = rows("support_case_message WHERE case_id=?", customerCase);
        var kycBefore = rows("chef_kyc_document WHERE identity_id=?", person.identityId());
        var applicationBefore = jdbc.queryForMap("SELECT id,reference_code,status,reviewed_by_identity_id FROM chef_application WHERE identity_id=?", person.identityId());
        int audits = count("chef_onboarding_action_audit WHERE identity_id=?", person.identityId());
        assertTrue(kycBefore.size() >= 4);

        var counts = erase(Scope.CHEF);

        var application = jdbc.queryForMap("SELECT * FROM chef_application WHERE identity_id=?", person.identityId());
        for (String column : List.of("phone_number", "email", "first_name", "last_name", "address_line1", "city", "state"))
            assertEquals(DELETED, application.get(column), column);
        for (String column : List.of("address_line2", "landmark", "postal_code", "latitude", "longitude"))
            assertNull(application.get(column), column);
        assertNotNull(application.get("erased_at"));
        assertEquals(applicationBefore.get("id"), application.get("id"));
        assertEquals(applicationBefore.get("reference_code"), application.get("reference_code"));
        assertEquals("APPROVED", application.get("status"), "admin history stays true");
        assertEquals(applicationBefore.get("reviewed_by_identity_id"), application.get("reviewed_by_identity_id"));

        String draft = text("SELECT details::text FROM chef_onboarding_draft WHERE identity_id=?", person.identityId());
        for (String leaked : List.of("amma@example.test", "Lakshmi", "Devi", "Spice Kitchen", "Rose Street", "Hyderabad", "500001", "1990-01-01"))
            assertFalse(draft.contains(leaked), leaked);
        assertTrue(draft.contains("12345678901234") && draft.contains("PAN") && draft.contains("\"te\""), "evidence references stay");
        assertEquals("Deleted", text("SELECT phone_number FROM chef_onboarding_visit WHERE identity_id=?", person.identityId()));
        var help = jdbc.queryForMap("SELECT phone_number,message,details::text AS details,status,case_number FROM chef_onboarding_help WHERE identity_id=?", person.identityId());
        assertEquals(DELETED, help.get("phone_number"));
        assertEquals(DELETED, help.get("message"));
        assertFalse(help.get("details").toString().contains("Lakshmi"));
        assertEquals("RESOLVED", help.get("status"), "the callback request leaves the staff queue and frees the one-open-request slot");
        assertNotNull(help.get("case_number"));

        String history = text("SELECT string_agg(snapshot::text,' ') FROM chef_onboarding_document_history WHERE identity_id=?", person.identityId());
        assertTrue(history.contains("kyc/kept") && history.contains("id.jpg"), "KYC references stay");
        assertFalse(history.contains("amma@example.test") || history.contains("+919000000000"));
        String audit = text("SELECT string_agg(snapshot::text,' ') FROM chef_onboarding_action_audit WHERE identity_id=?", person.identityId());
        for (String leaked : List.of("amma@example.test", "Lakshmi", "Rose Street", "+919000000000"))
            assertFalse(audit.contains(leaked), leaked);
        assertTrue(audit.contains("CRV-1") && audit.contains("12345678901234"), "references stay in the audit");
        assertEquals(audits, count("chef_onboarding_action_audit WHERE identity_id=?", person.identityId()), "audit rows are never deleted");
        assertEquals(kycBefore, rows("chef_kyc_document WHERE identity_id=?", person.identityId()), "KYC rows untouched");

        assertEquals(customerBefore, rows("customer_profile WHERE identity_id=?", person.identityId()), "chef scope never touches customer rows");
        assertEquals(1, count("customer_address WHERE identity_id=? AND is_default", person.identityId()));
        assertEquals(1, count("notification_outbox WHERE user_identity_id=? AND user_role='CUSTOMER'", person.identityId()));
        assertEquals(0, count("notification_outbox WHERE user_identity_id=? AND user_role='CHEF'", person.identityId()));
        assertEquals(customerCaseBefore, rows("support_case_message WHERE case_id=?", customerCase));
        assertEquals(DELETED, text("SELECT subject FROM support_case WHERE id=?", chefCase));
        assertEquals(DELETED, text("SELECT subject FROM support_case WHERE id=?", helpCase));
        assertEquals(0, count("support_case_message WHERE case_id=? AND sender_identity_id=? AND body<>?", helpCase, person.identityId(), DELETED));

        assertEquals(1, counts.get("chef_application"));
        assertEquals(1, counts.get("chef_onboarding_draft"));
        assertEquals(1, counts.get("chef_onboarding_help"));
        assertEquals(1, counts.get("chef_onboarding_visit"));
        assertEquals(1, counts.get("chef_onboarding_document_history"));
        assertEquals(audits, counts.get("chef_onboarding_action_audit"));
        assertEquals(3, counts.get("notification_outbox"), "whatever their status");
        assertFalse(counts.containsKey("customer_profile"));
    }

    @Test void reapplyAfterChefErasureStartsAFreshDraft() {
        chefApplicant();
        long submittedVersion = onboarding.mine(person).version();
        run(() -> onboarding.submit(person, new ChefOnboardingController.SubmitRequest(submittedVersion, true, ChefOnboardingService.TERMS_VERSION), "Bearer test"));
        approve();
        jdbc.update("UPDATE chef_onboarding_draft SET fssai_reviewed_number='12345678901234',fssai_reviewed_by=?,fssai_reviewed_at=now() WHERE identity_id=?", admin.identityId(), person.identityId());
        var kycBefore = rows("chef_kyc_document WHERE identity_id=?", person.identityId());
        var oldEvidence = jdbc.queryForList("SELECT id,document_type,blob_name,status,review_reason,reviewed_by_identity_id,reviewed_at FROM chef_kyc_document WHERE identity_id=?", person.identityId());
        assertEquals(4, oldEvidence.size());
        UUID applicationId = jdbc.queryForObject("SELECT id FROM chef_application WHERE identity_id=?", UUID.class, person.identityId());
        erase(Scope.CHEF);
        assertNotNull(jdbc.queryForObject("SELECT erased_at FROM chef_application WHERE id=?", java.sql.Timestamp.class, applicationId));

        var state = onboarding.mine(person); // the person opens the application again

        var row = jdbc.queryForMap("SELECT status,erased_at,rejection_reason,reviewed_at,reviewed_by_identity_id FROM chef_application WHERE id=?", applicationId);
        assertEquals("PENDING", row.get("status"));
        assertNull(row.get("erased_at"));
        assertNull(row.get("reviewed_at"));
        assertNull(row.get("reviewed_by_identity_id"));
        assertEquals(applicationId, state.application().id());
        assertFalse(state.submitted());
        assertEquals("personal", state.resumeStep());
        assertEquals("DRAFT", state.progress().status());
        assertTrue(state.documents().isEmpty(), "evidence of the erased application is not offered to the new draft");
        assertTrue(state.version() > submittedVersion);
        assertEquals("te", state.details().language());
        assertNull(state.details().email());
        assertNull(state.details().firstName());
        var draft = jdbc.queryForMap("SELECT submitted,review_status,terms_version,terms_accepted_at,bank_enrollment_id,fssai_reviewed_number,fssai_reviewed_at,application_id FROM chef_onboarding_draft WHERE identity_id=?", person.identityId());
        assertEquals(false, draft.get("submitted"));
        assertEquals("DRAFT", draft.get("review_status"));
        assertNull(draft.get("terms_version"));
        assertNull(draft.get("bank_enrollment_id"));
        assertNull(draft.get("fssai_reviewed_number"));
        assertEquals(applicationId, draft.get("application_id"));
        // The old evidence is kept (rows and blobs) and only hidden.
        assertEquals(kycBefore.size(), count("chef_kyc_document WHERE application_id=? AND removed_at IS NOT NULL", applicationId));
        assertEquals(count("chef_kyc_document WHERE application_id=?", applicationId), kycBefore.size());
        assertEquals(kycBefore.size(), count("chef_onboarding_document_history WHERE identity_id=? AND action='REOPENED_AFTER_ERASURE'", person.identityId()));
        assertEquals(0, count("chef_kyc_document WHERE application_id=? AND removed_at IS NULL", applicationId));
        assertEquals(1, count("chef_application WHERE identity_id=?", person.identityId()));
        assertEquals(state.version(), onboarding.mine(person).version(), "opening it again changes nothing");

        // Save new details and upload the same evidence types again, although the old rows were APPROVED.
        save("amma2@example.test", "Lakshmi", "Rao");
        var saved = jdbc.queryForMap("SELECT first_name,last_name,email,address_line1,city FROM chef_application WHERE id=?", applicationId);
        assertEquals("Rao", saved.get("last_name"));
        assertEquals("amma2@example.test", saved.get("email"));
        assertEquals("12 Rose Street", saved.get("address_line1"));
        uploadAll();
        var fresh = onboarding.mine(person);
        assertEquals(4, fresh.documents().size());
        assertTrue(fresh.documents().stream().allMatch(d -> "UPLOADED".equals(d.status())));
        assertEquals("review", fresh.resumeStep());

        // One row per document type: re-uploading the same type overwrites the hidden row in place (unique
        // application_id + document_type). The kept KYC record of the erased application is the history snapshot taken
        // at reopening: old blob, status and reviewer stay readable from it, and the blobs stay in storage.
        for (var old : oldEvidence) {
            var kept = jdbc.queryForMap("SELECT snapshot->>'blob_name' AS blob_name, snapshot->>'status' AS status, snapshot->>'review_reason' AS review_reason, "
                + "snapshot->>'reviewed_by_identity_id' AS reviewer, snapshot->>'reviewed_at' AS reviewed_at, snapshot->>'document_type' AS document_type, snapshot->>'removed_at' AS removed_at "
                + "FROM chef_onboarding_document_history WHERE identity_id=? AND action='REOPENED_AFTER_ERASURE' AND document_id=?", person.identityId(), old.get("id"));
            assertEquals(old.get("blob_name"), kept.get("blob_name"), "old blob stays referenced");
            assertEquals("APPROVED", kept.get("status"));
            assertEquals(old.get("status"), kept.get("status"));
            assertEquals("Checked", kept.get("review_reason"));
            assertEquals(admin.identityId().toString(), kept.get("reviewer"));
            assertNotNull(kept.get("reviewed_at"));
            assertEquals(old.get("document_type"), kept.get("document_type"));
            assertNull(kept.get("removed_at"), "the snapshot is the evidence as it stood when the person left");
            assertNotEquals(old.get("blob_name"), text("SELECT blob_name FROM chef_kyc_document WHERE id=?", old.get("id")), "the live row now holds the new upload");
        }
        // Nothing later rewrites or deletes those history rows, a second erase included.
        assertEquals(4, count("chef_onboarding_document_history WHERE identity_id=? AND action='REOPENED_AFTER_ERASURE'", person.identityId()));
        // Even a snapshot that carried a personal key would be left alone: it is the KYC record.
        jdbc.update("INSERT INTO chef_onboarding_document_history(id,document_id,identity_id,action,snapshot) VALUES (?,?,?,'REOPENED_AFTER_ERASURE',?::jsonb)",
            UUID.randomUUID(), UUID.randomUUID(), person.identityId(), "{\"blob_name\":\"kyc/contaminated\",\"email\":\"x@example.test\"}");
        var keptRows = rows("chef_onboarding_document_history WHERE identity_id=? AND action='REOPENED_AFTER_ERASURE'", person.identityId());
        assertEquals(5, keptRows.size());
        erase(Scope.CHEF);
        erase(Scope.ALL);
        assertEquals(keptRows, rows("chef_onboarding_document_history WHERE identity_id=? AND action='REOPENED_AFTER_ERASURE'", person.identityId()));
    }

    @Test void anApplicationFromTheOldFormWithoutADraftAlsoReopensAsAFreshDraft() {
        UUID applicationId = UUID.randomUUID();
        jdbc.update("INSERT INTO chef_application(id,identity_id,phone_number,email,first_name,last_name,address_line1,city,state,status) VALUES (?,?,'+919000000000','old@example.test','Old','Chef','Kitchen','Hyderabad','Telangana','APPROVED')",
            applicationId, person.identityId());
        jdbc.update("INSERT INTO chef_kyc_document(id,application_id,identity_id,document_type,original_file_name,blob_container,blob_name,content_type,file_size_bytes,status) VALUES (?,?,?,'GOVERNMENT_ID_FRONT','id.jpg','documents','historical','image/jpeg',20,'APPROVED')",
            UUID.randomUUID(), applicationId, person.identityId());

        var counts = erase(Scope.CHEF);

        assertEquals(1, counts.get("chef_application"));
        assertEquals(0, counts.get("chef_onboarding_draft"));
        assertEquals("historical", text("SELECT blob_name FROM chef_kyc_document WHERE application_id=?", applicationId));
        var state = onboarding.mine(person);
        assertEquals("PENDING", text("SELECT status FROM chef_application WHERE id=?", applicationId));
        assertNull(state.details().firstName(), "the placeholder text is never offered to the form");
        assertNull(state.details().email());
        assertEquals("personal", state.resumeStep());
        assertTrue(state.documents().isEmpty());
        assertEquals(1, count("chef_onboarding_draft WHERE identity_id=? AND application_id=?", person.identityId(), applicationId));
        assertEquals("historical", text("SELECT blob_name FROM chef_kyc_document WHERE application_id=?", applicationId));
    }

    @Test void aRequestForHelpAfterReapplyingOpensANewCase() {
        chefApplicant();
        erase(Scope.CHEF);
        onboarding.mine(person);
        save("amma2@example.test", "Lakshmi", "Rao");
        var help = run(() -> onboarding.requestHelp(person, new HelpRequest(UUID.randomUUID(), "Second request after coming back")));
        assertEquals("OPEN", help.status());
        assertEquals("+919000000000", help.phoneNumber());
        assertEquals("Second request after coming back", help.message());
    }

    @Test void eraseTwiceIsDoneWithZeroCounts() {
        chefApplicant();
        approve();
        customer(person.identityId());
        outbox(person.identityId(), "CUSTOMER");
        outbox(person.identityId(), "CHEF");
        supportCase(person.identityId(), "CUSTOMER", "Wrong item");
        supportCase(person.identityId(), "CHEF", "Payout question");
        customer(bystander);

        var first = erase(Scope.ALL);
        assertTrue(first.values().stream().anyMatch(n -> n > 0));
        var afterFirst = everythingOf(person.identityId());
        var bystanderAfterFirst = everythingOf(bystander);
        var erasedAt = text("SELECT erased_at::text FROM chef_application WHERE identity_id=?", person.identityId());

        var second = erase(Scope.ALL);

        assertEquals(first.keySet(), second.keySet());
        second.forEach((table, n) -> assertEquals(0, n, table));
        assertEquals(afterFirst, everythingOf(person.identityId()));
        assertEquals(bystanderAfterFirst, everythingOf(bystander));
        assertEquals(erasedAt, text("SELECT erased_at::text FROM chef_application WHERE identity_id=?", person.identityId()));
        assertEquals(1, count("customer_profile WHERE identity_id=?", bystander));
        for (Scope scope : Scope.values()) erase(scope); // any scope on an erased person is still DONE
        assertEquals(afterFirst, everythingOf(person.identityId()));
    }

    @Test void aPersonWhoNeverAppliedOrSignedUpIsDoneWithZeroCounts() {
        for (Scope scope : Scope.values()) erase(scope).values().forEach(n -> assertEquals(0, n));
    }

    @Test void chefInternalKitchenPhotosRefuseAnErasedApplication() {
        chefApplicant();
        approve();
        var properties = new AuthInternalClientProperties();
        properties.setServiceSecret("unit-secret");
        var controller = new InternalChefKitchenPhotoController(kitchenPhotos, new InternalRequestAuthorizer(properties));
        assertEquals(200, controller.getKitchenPhoto("unit-secret", person.identityId(), 1).getStatusCode().value());
        erase(Scope.CUSTOMER);
        assertEquals(200, controller.getKitchenPhoto("unit-secret", person.identityId(), 2).getStatusCode().value(), "a customer erase leaves the chef's photos");

        erase(Scope.CHEF);

        for (int slot : new int[] {1, 2}) {
            var refused = assertThrows(ApiException.class, () -> controller.getKitchenPhoto("unit-secret", person.identityId(), slot));
            assertEquals(404, refused.getStatus());
            assertEquals("KITCHEN_PHOTO_NOT_FOUND", refused.getCode());
        }
        assertTrue(kitchenPhotos.approvedKitchenPhoto(person.identityId(), 1).isEmpty());
        // Applying again and being approved again serves the new photos.
        onboarding.mine(person);
        save("amma2@example.test", "Lakshmi", "Rao");
        uploadAll();
        approve();
        assertTrue(kitchenPhotos.approvedKitchenPhoto(person.identityId(), 1).isPresent());
    }

    @Test void supportCaseKeepsStaffMessages() {
        UUID customerCase = supportCase(person.identityId(), "CUSTOMER", "Wrong item, call +919000000000");
        UUID chefCase = supportCase(person.identityId(), "CHEF", "Payout for Lakshmi");
        UUID otherCase = supportCase(bystander, "CUSTOMER", "Cold food");
        var staffBefore = rows("support_case_message WHERE case_id IN (?,?) AND sender_role IN ('SUPPORT_ADMIN','PLATFORM_ADMIN')", customerCase, chefCase);
        var historyBefore = rows("support_case_status_history WHERE case_id IN (?,?)", customerCase, chefCase);
        var assignmentBefore = rows("support_case_assignment_history WHERE case_id IN (?,?)", customerCase, chefCase);
        var otherBefore = rows("support_case_message WHERE case_id=?", otherCase);
        assertEquals(4, staffBefore.size());

        var counts = erase(Scope.CUSTOMER);

        assertEquals(1, counts.get("support_case"));
        assertEquals(2, counts.get("support_case_message"));
        assertEquals(DELETED, text("SELECT subject FROM support_case WHERE id=?", customerCase));
        assertEquals(2, count("support_case_message WHERE case_id=? AND sender_identity_id=? AND body=?", customerCase, person.identityId(), DELETED));
        assertEquals("Payout for Lakshmi", text("SELECT subject FROM support_case WHERE id=?", chefCase), "the chef side is untouched by a customer erase");
        assertEquals(0, count("support_case_message WHERE case_id=? AND body=?", chefCase, DELETED));
        assertEquals(staffBefore, rows("support_case_message WHERE case_id IN (?,?) AND sender_role IN ('SUPPORT_ADMIN','PLATFORM_ADMIN')", customerCase, chefCase), "staff replies and internal notes stay");
        assertEquals(historyBefore, rows("support_case_status_history WHERE case_id IN (?,?)", customerCase, chefCase));
        assertEquals(assignmentBefore, rows("support_case_assignment_history WHERE case_id IN (?,?)", customerCase, chefCase));
        assertEquals(otherBefore, rows("support_case_message WHERE case_id=?", otherCase));
        // ids, numbers, status and order link stay
        assertEquals(1, count("support_case WHERE id=? AND status='OPEN' AND requester_identity_id=?", customerCase, person.identityId()));

        var chef = erase(Scope.CHEF);
        assertEquals(1, chef.get("support_case"));
        assertEquals(DELETED, text("SELECT subject FROM support_case WHERE id=?", chefCase));
        assertEquals(staffBefore, rows("support_case_message WHERE case_id IN (?,?) AND sender_role IN ('SUPPORT_ADMIN','PLATFORM_ADMIN')", customerCase, chefCase));
        assertEquals(historyBefore, rows("support_case_status_history WHERE case_id IN (?,?)", customerCase, chefCase));
        assertEquals(otherBefore, rows("support_case_message WHERE case_id=?", otherCase));
    }

    @Test void emailProjectionNeverWritesARealEmailIntoAnErasedApplication() {
        chefApplicant();
        customer(person.identityId());
        erase(Scope.CHEF);
        var projection = new in.craves.userchef.email.AuthEmailProjectionService(jdbc);
        long revision = 1;
        var event = new in.craves.userchef.email.AuthEmailProjectionService.Event(UUID.randomUUID(), person.identityId(), "new@example.test", true, revision,
            java.time.Instant.now().minusSeconds(30).truncatedTo(java.time.temporal.ChronoUnit.MICROS));

        var receipt = run(() -> projection.receive(event, "a".repeat(64)));

        assertEquals("APPLIED", receipt.status());
        assertEquals(DELETED, text("SELECT email FROM chef_application WHERE identity_id=?", person.identityId()), "an erased application is never refilled");
        assertNotNull(jdbc.queryForObject("SELECT erased_at FROM chef_application WHERE identity_id=?", java.sql.Timestamp.class, person.identityId()));
        assertEquals("new@example.test", text("SELECT email FROM customer_profile WHERE identity_id=?", person.identityId()), "the customer side still follows its login email");
        // A person who never erased still gets the new email on the application.
        CurrentUser other = new CurrentUser(bystander, "other", "+919000000009", List.of("CUSTOMER"));
        jdbc.update("INSERT INTO chef_application(id,identity_id,phone_number,email,first_name,last_name,address_line1,city,state) VALUES (?,?,'+919000000009','old@example.test','Other','Chef','Kitchen','Hyderabad','Telangana')", UUID.randomUUID(), bystander);
        var otherEvent = new in.craves.userchef.email.AuthEmailProjectionService.Event(UUID.randomUUID(), bystander, "other@example.test", true, revision,
            java.time.Instant.now().minusSeconds(30).truncatedTo(java.time.temporal.ChronoUnit.MICROS));
        run(() -> projection.receive(otherEvent, "b".repeat(64)));
        assertEquals("other@example.test", text("SELECT email FROM chef_application WHERE identity_id=?", other.identityId()));
    }

    @Test void anErasedApplicationCannotBeApprovedRejectedOrReviewedEvenWithAMatchingEmail() {
        chefApplicant();
        long version = onboarding.mine(person).version();
        run(() -> onboarding.submit(person, new ChefOnboardingController.SubmitRequest(version, true, ChefOnboardingService.TERMS_VERSION), "Bearer test"));
        UUID applicationId = jdbc.queryForObject("SELECT id FROM chef_application WHERE identity_id=?", UUID.class, person.identityId());
        for (var document : jdbc.queryForList("SELECT id FROM chef_kyc_document WHERE application_id=?", UUID.class, applicationId))
            jdbc.update("UPDATE chef_kyc_document SET status='APPROVED' WHERE id=?", document);
        jdbc.update("UPDATE chef_onboarding_draft SET fssai_reviewed_number='12345678901234',fssai_reviewed_by=?,fssai_reviewed_at=now() WHERE identity_id=?", admin.identityId(), person.identityId());
        assertEquals("PENDING", text("SELECT status FROM chef_application WHERE id=?", applicationId));
        erase(Scope.CHEF);
        // What the unguarded email projection used to do: the real email is back and matches the verified one.
        jdbc.update("UPDATE chef_application SET email='amma@example.test' WHERE id=?", applicationId);
        long draftVersion = jdbc.queryForObject("SELECT version FROM chef_onboarding_draft WHERE identity_id=?", Long.class, person.identityId());

        var approve = assertThrows(ApiException.class, () -> run(() -> applications.approve(admin, applicationId)));
        var reject = assertThrows(ApiException.class, () -> run(() -> applications.reject(admin, applicationId, new in.craves.userchef.web.ApiDtos.AdminDecisionRequest("Not suitable"))));
        var review = assertThrows(ApiException.class, () -> run(() -> onboarding.reviewAction(admin, applicationId, new ReviewAction(draftVersion, "START_REVIEW", null, null, null))));

        for (var refused : List.of(approve, reject, review)) {
            assertEquals(409, refused.getStatus());
            assertEquals("CHEF_APPLICATION_ERASED", refused.getCode());
        }
        org.mockito.Mockito.verify(auth, org.mockito.Mockito.never()).grantChefRole(any(), any());
        assertEquals("PENDING", text("SELECT status FROM chef_application WHERE id=?", applicationId));
        assertEquals(0, count("admin_chef_decision_audit WHERE application_id=?", applicationId));
        assertEquals(draftVersion, jdbc.queryForObject("SELECT version FROM chef_onboarding_draft WHERE identity_id=?", Long.class, person.identityId()));
        assertEquals("PENDING", text("SELECT review_status FROM chef_onboarding_draft WHERE identity_id=?", person.identityId()), "no review action got through");
    }

    @Test void anErasedApplicationsDocumentsCannotBeApprovedOrRejectedAndItsRowsStayAsTheyWere() {
        chefApplicant();
        UUID applicationId = jdbc.queryForObject("SELECT id FROM chef_application WHERE identity_id=?", UUID.class, person.identityId());
        UUID document = jdbc.queryForObject("SELECT id FROM chef_kyc_document WHERE application_id=? AND document_type='KITCHEN_PHOTO_1'", UUID.class, applicationId);
        UUID other = jdbc.queryForObject("SELECT id FROM chef_kyc_document WHERE application_id=? AND document_type='KITCHEN_PHOTO_2'", UUID.class, applicationId);
        // Before the erase the same calls are allowed: the document is awaiting review on a pending application.
        run(() -> reviews.approve(admin, applicationId, other));
        assertEquals("APPROVED", text("SELECT status FROM chef_kyc_document WHERE id=?", other));
        erase(Scope.CHEF);
        var before = rows("chef_kyc_document WHERE application_id=?", applicationId);
        int audits = count("admin_chef_document_decision_audit WHERE application_id=?", applicationId);
        assertEquals("UPLOADED", text("SELECT status FROM chef_kyc_document WHERE id=?", document));

        var approve = assertThrows(ApiException.class, () -> run(() -> reviews.approve(admin, applicationId, document)));
        var reject = assertThrows(ApiException.class, () -> run(() -> reviews.reject(admin, applicationId, document, "Photo is not clear enough")));

        for (var refused : List.of(approve, reject)) {
            assertEquals(409, refused.getStatus());
            assertEquals("CHEF_APPLICATION_ERASED", refused.getCode());
        }
        assertEquals(before, rows("chef_kyc_document WHERE application_id=?", applicationId), "locked KYC rows are unchanged");
        assertEquals(audits, count("admin_chef_document_decision_audit WHERE application_id=?", applicationId));
        org.mockito.Mockito.verify(notifications, org.mockito.Mockito.never()).chefDocumentRejected(any(), any(), any(), any(), any());
    }
}
