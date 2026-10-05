package in.craves.userchef.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockHttpServletRequest;
import static org.junit.jupiter.api.Assertions.*;

/** Real application-table authority in its own disposable schema; no financial or public schema is reset. */
@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class ChefFinanceApprovalDatabaseTest {
    final String key="SYNTHETIC_APPROVAL_DATABASE_SIGNING_KEY_20261005";
    final ObjectMapper json=new ObjectMapper().findAndRegisterModules().disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    JdbcTemplate jdbc; ChefFinanceApprovalController controller;
    @BeforeEach void setup() {
        String url=System.getenv("LEDGER_TEST_JDBC_URL");
        assertEquals("true",System.getenv("CRAVES_DISPOSABLE_TEST_DATABASE"));
        assertTrue("true".equals(System.getenv("GITHUB_ACTIONS")) || "true".equalsIgnoreCase(System.getenv("TF_BUILD")));
        assertTrue(url.matches("jdbc:postgresql://localhost:[0-9]+/chef_ledger_test"));
        String user=System.getenv("LEDGER_TEST_DB_USER"),password=System.getenv("LEDGER_TEST_DB_PASSWORD");
        var admin=new JdbcTemplate(new DriverManagerDataSource(url,user,password));
        assertEquals("chef_ledger_test",admin.queryForObject("SELECT current_database()",String.class));
        admin.execute("DROP SCHEMA IF EXISTS chef_finance_approval_test CASCADE");
        admin.execute("CREATE SCHEMA chef_finance_approval_test");
        var data=new DriverManagerDataSource(url+"?currentSchema=chef_finance_approval_test,public",user,password);
        // The application columns used by the authority originate in V1 and are unchanged by later additive migrations.
        Flyway.configure().dataSource(data).defaultSchema("chef_finance_approval_test").schemas("chef_finance_approval_test")
            .locations("classpath:db/migration").target("1").load().migrate();
        jdbc=new JdbcTemplate(data);controller=new ChefFinanceApprovalController(jdbc,json,key);
    }
    UUID insert(String status,String state,Instant reviewed) {
        UUID chef=UUID.randomUUID();
        jdbc.update("INSERT INTO chef_application(identity_id,phone_number,email,first_name,last_name,address_line1,city,state,status,reviewed_at) " +
            "VALUES (?,'9000000000','synthetic@example.test','Test','Chef','Test kitchen','Test city',?,?,?)",
            chef,state,status,reviewed==null?null:Timestamp.from(reviewed));return chef;
    }
    MockHttpServletRequest request(long delta) {
        byte[] raw=("{\"requestId\":\""+UUID.randomUUID()+"\"}").getBytes(java.nio.charset.StandardCharsets.UTF_8);
        String time=Long.toString(Instant.now().getEpochSecond()+delta);var request=new MockHttpServletRequest();
        request.setContent(raw);request.addHeader(ChefFinanceApprovalProtocol.TIME,time);
        request.addHeader(ChefFinanceApprovalProtocol.SIGNATURE,ChefFinanceApprovalProtocol.sign(key,"POST",time,raw));return request;
    }
    @Test void realApprovedApplicationsNeedNoNewFinanceBankOrDocumentApproval()throws Exception {
        UUID chef=insert("APPROVED","Telangana",Instant.now().minusSeconds(60));
        insert("PENDING","Telangana",null);insert("REJECTED","Telangana",null);
        var response=controller.read(request(0));assertEquals(200,response.getStatusCode().value());
        var node=json.readTree(response.getBody());assertTrue(node.path("complete").asBoolean());
        assertEquals(1,node.path("approvals").size());var approval=node.path("approvals").get(0);
        assertEquals(chef.toString(),approval.path("chefId").asText());assertEquals("36",approval.path("stateCode").asText());
        assertEquals(4,approval.size());assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM chef_kyc_document",Integer.class));
        assertTrue(ChefFinanceApprovalProtocol.matches(ChefFinanceApprovalProtocol.sign(key,"RESPONSE",
            response.getHeaders().getFirst(ChefFinanceApprovalProtocol.TIME),response.getBody()),
            response.getHeaders().getFirst(ChefFinanceApprovalProtocol.SIGNATURE)));
    }
    @Test void legacyApprovedRowsUseTheRecordedUpdateAndRevocationIsImmediate()throws Exception {
        UUID chef=insert("APPROVED","TS",null);Instant recorded=Instant.now().minusSeconds(120).truncatedTo(ChronoUnit.MICROS);
        jdbc.update("UPDATE chef_application SET updated_at=? WHERE identity_id=?",Timestamp.from(recorded),chef);
        var approval=json.readTree(controller.read(request(0)).getBody()).path("approvals").get(0);
        assertEquals(recorded,Instant.parse(approval.path("reviewedAt").asText()));
        jdbc.update("UPDATE chef_application SET status='REJECTED' WHERE identity_id=?",chef);
        assertTrue(json.readTree(controller.read(request(0)).getBody()).path("approvals").isEmpty());
    }
    @Test void realSourceDoesNotTreatUnsupportedStateOrExpiredAuthenticationAsApproval()throws Exception {
        insert("APPROVED","Andhra Pradesh",Instant.now().minusSeconds(60));
        var response=controller.read(request(0));assertEquals(200,response.getStatusCode().value());
        assertEquals("UNSUPPORTED",json.readTree(response.getBody()).path("approvals").get(0).path("stateCode").asText());
        var expired=controller.read(request(-60));assertEquals(401,expired.getStatusCode().value());
        assertTrue(expired.getHeaders().getFirst("Cache-Control").contains("no-store"));
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM chef_application WHERE status='APPROVED'",Integer.class));
    }
}
