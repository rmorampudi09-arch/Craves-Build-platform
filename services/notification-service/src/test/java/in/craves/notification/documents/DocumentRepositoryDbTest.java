package in.craves.notification.documents;

import static in.craves.notification.documents.DocumentModels.*;
import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

@EnabledIfEnvironmentVariable(named="DOCUMENT_TEST_JDBC_URL",matches=".+")
class DocumentRepositoryDbTest {
    private JdbcTemplate jdbc;
    private DocumentRepository documents;
    private DocumentJobRepository jobs;
    private DocumentEmailRepository emails;
    private final ObjectMapper mapper=new ObjectMapper().findAndRegisterModules();
    private final UUID owner=DocumentModelsTest.OWNER;
    @BeforeEach void setup() throws Exception {
        String url=System.getenv("DOCUMENT_TEST_JDBC_URL");
        assertTrue(url.endsWith("/pdf_module_test"),"Tests refuse any database except disposable pdf_module_test");
        var data=new DriverManagerDataSource(url,System.getenv("DOCUMENT_TEST_DB_USER"),System.getenv("DOCUMENT_TEST_DB_PASSWORD"));
        jdbc=new JdbcTemplate(data);
        jdbc.execute("DROP SCHEMA IF EXISTS notification_schema CASCADE"); jdbc.execute("CREATE SCHEMA notification_schema");
        try(var input=new ClassPathResource("db/migration/V6__private_pdf_documents.sql").getInputStream()) {
            jdbc.execute(new String(input.readAllBytes(),StandardCharsets.UTF_8));
        }
        var manager=new DataSourceTransactionManager(data);
        documents=new DocumentRepository(jdbc,manager); jobs=new DocumentJobRepository(jdbc,manager,documents);
        emails=new DocumentEmailRepository(jdbc,manager,documents);
    }
    private Summary create(String key) throws Exception {
        Snapshot snapshot=DocumentModelsTest.sample(Type.PAYMENT_RECEIPT,List.of());
        Request request=new Request(Type.PAYMENT_RECEIPT,UUID.fromString(snapshot.reference()),null,null,null,null).normalize();
        return documents.create(owner,key,request,snapshot,mapper.writeValueAsString(snapshot));
    }
    private Summary ready() throws Exception {
        Summary summary=create(UUID.randomUUID().toString()); RenderClaim claim=jobs.claim().orElseThrow();
        assertEquals(summary.id(),claim.document().id());
        String hash="a".repeat(64);
        assertTrue(jobs.ready(claim,owner+"/"+summary.id()+"/"+hash+".pdf",hash,100));
        return documents.own(owner,summary.id()).summary();
    }
    @Test void sameKeyReturnsSameImmutableDocument() throws Exception {
        Summary first=create("same-request-key-00001"); Summary second=create("same-request-key-00001");
        assertEquals(first.id(),second.id());
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM notification_schema.pdf_document",Integer.class));
        assertThrows(RuntimeException.class,()->DocumentRepository.sameRequest(documents.own(owner,first.id()),"different"));
    }
    @Test void anotherIdentityCannotReadOrListDocument() throws Exception {
        Summary first=create(UUID.randomUUID().toString()); UUID other=UUID.randomUUID();
        assertThrows(RuntimeException.class,()->documents.own(other,first.id()));
        assertEquals(0,documents.page(other,10,null,null,null).items().size());
        assertThrows(RuntimeException.class,()->emails.enqueue(other,first.id(),UUID.randomUUID().toString()));
    }
    @Test void cursorPagesHaveNoDuplicatesOrMissingRows() throws Exception {
        for(int i=0;i<3;i++) create(UUID.randomUUID().toString());
        Page first=documents.page(owner,2,null,null,null); assertEquals(2,first.items().size()); assertNotNull(first.nextCursor());
        Page next=documents.page(owner,2,first.nextCursor(),null,null); assertEquals(1,next.items().size()); assertNull(next.nextCursor());
        var ids=new HashSet<UUID>(); first.items().forEach(row->ids.add(row.id())); next.items().forEach(row->ids.add(row.id())); assertEquals(3,ids.size());
        assertThrows(RuntimeException.class,()->documents.page(owner,2,"broken",null,null));
    }
    @Test void staleRenderClaimCannotPublishOverNewClaim() throws Exception {
        Summary summary=create(UUID.randomUUID().toString()); var old=jobs.claim().orElseThrow();
        jdbc.update("UPDATE notification_schema.pdf_document SET lease_until=now()-interval '1 minute' WHERE id=?",summary.id());
        var current=jobs.claim().orElseThrow(); assertNotEquals(old.token(),current.token());
        assertFalse(jobs.ready(old,"old.pdf","a".repeat(64),100));
        assertTrue(jobs.ready(current,"new.pdf","b".repeat(64),100));
        assertEquals("b".repeat(64),documents.own(owner,summary.id()).summary().sha256());
    }
    @Test void retryBudgetTerminatesFailedJob() throws Exception {
        Summary summary=create(UUID.randomUUID().toString());
        jdbc.update("UPDATE notification_schema.pdf_document SET attempt_count=4 WHERE id=?",summary.id());
        var claim=jobs.claim().orElseThrow(); assertEquals(5,claim.attempt()); jobs.failed(claim,"TEST_FAILURE",false);
        assertEquals("FAILED",documents.own(owner,summary.id()).summary().status()); assertTrue(jobs.claim().isEmpty());
    }
    @Test void issuedArtifactAndSnapshotCannotBeRewritten() throws Exception {
        Summary summary=ready();
        assertThrows(DataAccessException.class,()->jdbc.update("UPDATE notification_schema.pdf_document SET snapshot='{}' WHERE id=?",summary.id()));
        assertThrows(DataAccessException.class,()->jdbc.update("UPDATE notification_schema.pdf_document SET pdf_hash=? WHERE id=?","c".repeat(64),summary.id()));
        assertThrows(DataAccessException.class,()->jdbc.update("DELETE FROM notification_schema.pdf_document_audit WHERE document_id=?",summary.id()));
    }
    @Test void emailRequestIsIdempotentAndUnknownOutcomeNeverRequeues() throws Exception {
        Summary summary=ready(); String key="email-request-00000001";
        var first=emails.enqueue(owner,summary.id(),key); assertEquals(first.id(),emails.enqueue(owner,summary.id(),key).id());
        assertThrows(RuntimeException.class,()->emails.enqueue(owner,summary.id(),"another-email-key-0001"));
        var claim=emails.claim().orElseThrow();
        jdbc.update("UPDATE notification_schema.pdf_document_email SET lease_until=now()-interval '1 minute' WHERE id=?",claim.id());
        assertTrue(emails.claim().isEmpty()); assertEquals("UNKNOWN",emails.get(owner,summary.id(),claim.id()).status());
        assertThrows(RuntimeException.class,()->emails.enqueue(owner,summary.id(),"another-email-key-0002"));
        emails.finish(claim,"ACCEPTED","test-operation",null);
        assertEquals("UNKNOWN",emails.get(owner,summary.id(),claim.id()).status());
    }
    @Test void acceptedEmailIsNotReportedAsDelivered() throws Exception {
        Summary summary=ready(); emails.enqueue(owner,summary.id(),"email-request-00000002"); var claim=emails.claim().orElseThrow();
        emails.finish(claim,"ACCEPTED","test-provider-operation",null);
        assertEquals("ACCEPTED",emails.get(owner,summary.id(),claim.id()).status());
        assertTrue(emails.claim().isEmpty());
    }
    @Test void activeGenerationQuotaIsAtomicPerOwner() throws Exception {
        for(int i=0;i<4;i++) create(UUID.randomUUID().toString());
        assertThrows(RuntimeException.class,()->create(UUID.randomUUID().toString()));
        assertEquals(4,jdbc.queryForObject("SELECT count(*) FROM notification_schema.pdf_document",Integer.class));
    }
    @Test void simultaneousWorkersClaimDistinctDocuments() throws Exception {
        create(UUID.randomUUID().toString()); create(UUID.randomUUID().toString());
        try(var pool=java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var a=pool.submit(()->jobs.claim().orElseThrow()); var b=pool.submit(()->jobs.claim().orElseThrow());
            assertNotEquals(a.get().document().id(),b.get().document().id());
        }
    }
}
