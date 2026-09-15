package in.craves.userchef.email;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import in.craves.userchef.exception.ApiException;
import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.service.AuthInternalClient;
import in.craves.userchef.service.BlobDocumentStorageService;
import in.craves.userchef.service.ChefApplicationService;
import in.craves.userchef.service.CustomerProfileService;
import in.craves.userchef.service.NotificationInternalClient;
import in.craves.userchef.web.ApiDtos;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

@EnabledIfEnvironmentVariable(named="EMAIL_TEST_DB_URL",matches=".+")
class AuthEmailProjectionDbTest {
    DriverManagerDataSource data;JdbcTemplate jdbc;TransactionTemplate tx;AuthEmailProjectionService projection;AuthInternalClient auth;
    CustomerProfileService profiles;ChefApplicationService chefs;NotificationInternalClient notifications;
    final Instant verifiedAt=Instant.now().minusSeconds(30).truncatedTo(ChronoUnit.MICROS);
    @BeforeEach void disposableDatabaseOnly() {
        String url=System.getenv("EMAIL_TEST_DB_URL");
        assertEquals("true",System.getenv("GITHUB_ACTIONS"),"Destructive suite must run in disposable GitHub CI");
        assertEquals("true",System.getenv("EMAIL_TEST_DISPOSABLE"));
        assertTrue(url.matches("jdbc:postgresql://(?:localhost|127\\.0\\.0\\.1):[0-9]+/craves_email_test"));
        var admin=new JdbcTemplate(new DriverManagerDataSource(url,System.getenv("EMAIL_TEST_DB_USER"),System.getenv("EMAIL_TEST_DB_PASSWORD")));
        admin.execute("CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public");
        resetPublicExplorerFixture(admin);
        admin.execute("DROP SCHEMA IF EXISTS email_userchef_test CASCADE");admin.execute("CREATE SCHEMA email_userchef_test");
        data=new DriverManagerDataSource(url+"?currentSchema=email_userchef_test,public",System.getenv("EMAIL_TEST_DB_USER"),System.getenv("EMAIL_TEST_DB_PASSWORD"));jdbc=new JdbcTemplate(data);
        flyway(null).migrate();tx=new TransactionTemplate(new DataSourceTransactionManager(data));projection=new AuthEmailProjectionService(jdbc);
        auth=mock(AuthInternalClient.class);notifications=mock(NotificationInternalClient.class);profiles=new CustomerProfileService(jdbc,auth,projection);
        chefs=new ChefApplicationService(jdbc,mock(BlobDocumentStorageService.class),auth,notifications,projection);
    }
    Flyway flyway(String target) {
        var config=Flyway.configure().dataSource(data).schemas("email_userchef_test").defaultSchema("email_userchef_test").locations("classpath:db/migration");
        if(target!=null)config.target(target);return config.load();
    }
    @Test void cleanUpgradeReplayDoNotInventVerificationFromLegacyProfile() {
        flyway(null).validate();assertEquals(0,flyway(null).migrate().migrationsExecuted);
        resetPublicExplorerFixture(jdbc);
        jdbc.execute("DROP SCHEMA email_userchef_test CASCADE");jdbc.execute("CREATE SCHEMA email_userchef_test");assertEquals(10,flyway("10").migrate().migrationsExecuted);
        UUID id=UUID.randomUUID();insertProfile(id,"legacy-unverified@example.test");assertEquals(3,flyway(null).migrate().migrationsExecuted);flyway(null).validate();
        assertEquals(0,flyway(null).migrate().migrationsExecuted);assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM auth_email_projection",Integer.class));
        assertEquals("legacy-unverified@example.test",profiles.getProfile(user(id)).email());
        assertEquals(13,jdbc.queryForObject("SELECT count(*) FROM flyway_schema_history WHERE success AND version IS NOT NULL",Integer.class));
        assertNotNull(jdbc.queryForObject("SELECT to_regclass('public.admin_explorer_audit')::text",String.class));
        assertNotNull(jdbc.queryForObject("SELECT to_regclass('public.admin_explorer_admission')::text",String.class));
    }
    private static void resetPublicExplorerFixture(JdbcTemplate database) {
        // V11 deliberately uses public. Drop only its fixture objects, preserving public PostGIS under the strict disposable DB guard.
        database.execute("DROP TABLE IF EXISTS public.admin_explorer_admission CASCADE");
        database.execute("DROP TABLE IF EXISTS public.admin_explorer_audit CASCADE");
        database.execute("DROP FUNCTION IF EXISTS public.reject_admin_explorer_audit_mutation()");
    }
    @Test void eventBeforeProfileCreationIsRetainedAndAppliedOnNullEmailProfileWrite() {
        UUID id=UUID.randomUUID();receive(event(id,1,"verified@example.test"),"a");
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM customer_profile",Integer.class));
        var response=tx.execute(ignored->profiles.upsertProfile(user(id),new ApiDtos.CustomerProfileRequest("Test","User",null)));
        assertEquals("verified@example.test",response.email());verifyNoInteractions(auth);
    }
    @Test void replacementSynchronizesExistingCustomerAndChefWithoutChangingBusinessStatus() {
        UUID id=UUID.randomUUID();insertProfile(id,"old@example.test");UUID app=insertChef(id,"old@example.test");
        receive(event(id,1,"new@example.test"),"b");assertEquals("new@example.test",profiles.getProfile(user(id)).email());
        assertEquals("new@example.test",chefs.getMyApplication(user(id)).email());assertEquals("PENDING",jdbc.queryForObject("SELECT status FROM chef_application WHERE id=?",String.class,app));
    }
    @Test void duplicatesStaleConflictingEventsAndImmutableReceipts() {
        UUID id=UUID.randomUUID();var first=event(id,2,"new@example.test");assertEquals("APPLIED",receive(first,"c").status());
        assertEquals("DUPLICATE",receive(first,"c").status());assertThrows(ApiException.class,()->receive(first,"d"));
        var old=event(id,1,"old@example.test");assertEquals("STALE",receive(old,"e").status());assertEquals("new@example.test",projection.projectedEmail(id));
        assertEquals("DUPLICATE",receive(event(id,2,"new@example.test"),"f").status());
        assertThrows(ApiException.class,()->receive(event(id,2,"conflict@example.test"),"1"));
        assertEquals(3,jdbc.queryForObject("SELECT count(*) FROM auth_email_projection_receipt",Integer.class));
        assertThrows(RuntimeException.class,()->jdbc.update("DELETE FROM auth_email_projection_receipt WHERE event_id=?",first.eventId()));
        assertThrows(RuntimeException.class,()->jdbc.update("UPDATE auth_email_projection SET email_revision=1 WHERE identity_id=?",id));
    }
    @Test void concurrentRevisionsConvergeWithoutCrossIdentityWrites() throws Exception {
        UUID id=UUID.randomUUID(),other=UUID.randomUUID();insertProfile(id,"old@example.test");insertProfile(other,"other@example.test");
        try(var executor=Executors.newFixedThreadPool(2)) {
            var a=executor.submit(()->receive(event(id,1,"first@example.test"),"2"));var b=executor.submit(()->receive(event(id,2,"second@example.test"),"3"));
            a.get(10,TimeUnit.SECONDS);b.get(10,TimeUnit.SECONDS);
        }
        assertEquals("second@example.test",profiles.getProfile(user(id)).email());assertEquals("other@example.test",profiles.getProfile(user(other)).email());
    }
    @Test void concurrentNewProfileAndProjectionCannotLoseLatestEmail() throws Exception {
        UUID id=UUID.randomUUID();CountDownLatch entered=new CountDownLatch(1),release=new CountDownLatch(1);
        when(auth.requireVerifiedEmail(id,"old@example.test")).thenAnswer(ignored->{entered.countDown();assertTrue(release.await(5,TimeUnit.SECONDS));return "old@example.test";});
        try(var executor=Executors.newFixedThreadPool(2)) {
            var create=executor.submit(()->tx.execute(ignored->profiles.upsertProfile(user(id),new ApiDtos.CustomerProfileRequest("Test","User","old@example.test"))));
            assertTrue(entered.await(5,TimeUnit.SECONDS));var update=executor.submit(()->receive(event(id,2,"latest@example.test"),"4"));
            release.countDown();create.get(10,TimeUnit.SECONDS);update.get(10,TimeUnit.SECONDS);
        } finally {release.countDown();}
        assertEquals("latest@example.test",profiles.getProfile(user(id)).email());
    }
    @Test void arbitraryProfileEmailIsRejectedWhileOmittedEmailPreservesExistingCanonical() {
        UUID id=UUID.randomUUID();insertProfile(id,"verified@example.test");
        when(auth.requireVerifiedEmail(id,"unverified@example.test")).thenThrow(ApiException.conflict("EMAIL_VERIFICATION_REQUIRED","Verify email"));
        assertThrows(ApiException.class,()->tx.execute(ignored->profiles.upsertProfile(user(id),new ApiDtos.CustomerProfileRequest("Test","User","unverified@example.test"))));
        assertEquals("verified@example.test",tx.execute(ignored->profiles.upsertProfile(user(id),new ApiDtos.CustomerProfileRequest("Test","User",null))).email());
    }
    @Test void chefSubmissionUsesAuthenticatedOwnerAndRequiresAuthVerification() {
        UUID id=UUID.randomUUID();when(auth.requireVerifiedEmail(id,"verified@example.test")).thenReturn("verified@example.test");
        var response=tx.execute(ignored->chefs.submitApplication(user(id),application("verified@example.test")));
        assertEquals(id,response.identityId());assertEquals("verified@example.test",response.email());verify(auth).requireVerifiedEmail(id,"verified@example.test");
        UUID missing=UUID.randomUUID();when(auth.requireVerifiedEmail(missing,"unverified@example.test")).thenThrow(ApiException.conflict("EMAIL_VERIFICATION_REQUIRED","Verify email"));
        assertThrows(ApiException.class,()->tx.execute(ignored->chefs.submitApplication(user(missing),application("unverified@example.test"))));
        assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM chef_application WHERE identity_id=?",Integer.class,missing));
    }
    @Test void chefApprovalRechecksCanonicalEmailBeforeGrantOrStatusChange() {
        UUID id=UUID.randomUUID();UUID app=insertChef(id,"old@example.test");CurrentUser admin=new CurrentUser(UUID.randomUUID(),"ci-admin","+910000000002",List.of("CHEF_ADMIN"));
        when(auth.requireVerifiedEmail(id,"old@example.test")).thenThrow(ApiException.conflict("EMAIL_VERIFICATION_REQUIRED","Verify email"));
        assertThrows(ApiException.class,()->tx.execute(ignored->chefs.approve(admin,app)));verify(auth,never()).grantChefRole(any(),any());
        assertEquals("PENDING",jdbc.queryForObject("SELECT status FROM chef_application WHERE id=?",String.class,app));verifyNoInteractions(notifications);
    }
    @Test void wrongRoleCannotApproveBeforeAnyEmailLookup() {
        UUID id=UUID.randomUUID();UUID app=insertChef(id,"verified@example.test");
        assertEquals(403,assertThrows(ApiException.class,()->tx.execute(ignored->chefs.approve(user(UUID.randomUUID()),app))).getStatus());verifyNoInteractions(auth);
    }
    private AuthEmailProjectionService.Receipt receive(AuthEmailProjectionService.Event event,String token){return tx.execute(ignored->projection.receive(event,token.repeat(64)));}
    private AuthEmailProjectionService.Event event(UUID id,long revision,String email){return new AuthEmailProjectionService.Event(UUID.randomUUID(),id,email,true,revision,verifiedAt);}
    private CurrentUser user(UUID id){return new CurrentUser(id,"ci-user","+910000000001",List.of("CUSTOMER"));}
    private void insertProfile(UUID id,String email){jdbc.update("INSERT INTO customer_profile(id,identity_id,registered_phone_number,first_name,last_name,email) VALUES (?,?,?,'Test','User',?)",UUID.randomUUID(),id,"+910000000001",email);}
    private UUID insertChef(UUID id,String email){UUID app=UUID.randomUUID();jdbc.update("INSERT INTO chef_application(id,identity_id,phone_number,email,first_name,last_name,address_line1,city,state) VALUES (?,?,?,?,'Test','Chef','Test','Hyderabad','Telangana')",app,id,"+910000000001",email);return app;}
    private ApiDtos.ChefApplicationRequest application(String email){return new ApiDtos.ChefApplicationRequest(email,"Test","Chef","Test",null,null,"Hyderabad","Telangana",null,null,null);}
}
