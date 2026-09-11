package in.craves.notification.documents;

import static in.craves.notification.documents.DocumentModels.*;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

@Repository
public class DocumentEmailRepository {
    private static final String TABLE="notification_schema.pdf_document_email";
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final DocumentRepository documents;
    public DocumentEmailRepository(JdbcTemplate jdbc,PlatformTransactionManager manager,DocumentRepository documents) {
        this.jdbc=jdbc; this.documents=documents;
        this.tx=new TransactionTemplate(manager); this.tx.setTimeout(15);
    }
    public EmailSummary enqueue(UUID owner,UUID documentId,String key) {
        return tx.execute(ignored -> {
            DocumentRepository.lockOwner(jdbc,owner);
            Stored document=documents.own(owner,documentId);
            if(!"READY".equals(document.summary().status())) throw conflict("DOCUMENT_NOT_READY");
            var old=jdbc.query("SELECT * FROM "+TABLE+" WHERE document_id=? AND request_key=? AND owner_identity_id=?",
                this::map,documentId,key,owner);
            if(!old.isEmpty()) return old.getFirst();
            Integer uncertain=jdbc.queryForObject("SELECT count(*) FROM "+TABLE+
                " WHERE document_id=? AND status IN ('QUEUED','SENDING','UNKNOWN')",Integer.class,documentId);
            if(uncertain!=null && uncertain>0) throw conflict("EMAIL_PENDING_OR_OUTCOME_UNKNOWN");
            Integer recent=jdbc.queryForObject("SELECT count(*) FROM "+TABLE+
                " WHERE owner_identity_id=? AND created_at>now()-interval '1 day'",Integer.class,owner);
            if(recent!=null && recent>=20) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"DOCUMENT_EMAIL_LIMIT");
            UUID id=UUID.randomUUID();
            jdbc.update("INSERT INTO "+TABLE+" (id,document_id,owner_identity_id,request_key) VALUES (?,?,?,?)",id,documentId,owner,key);
            documents.audit(documentId,owner,"EMAIL_QUEUED");
            return get(owner,documentId,id);
        });
    }
    public EmailSummary get(UUID owner,UUID documentId,UUID id) {
        return jdbc.query("SELECT * FROM "+TABLE+" WHERE owner_identity_id=? AND document_id=? AND id=?",
            this::map,owner,documentId,id).stream().findFirst().orElseThrow(DocumentModels::missing);
    }
    public List<EmailSummary> list(UUID owner,UUID documentId) {
        documents.own(owner,documentId);
        return jdbc.query("SELECT * FROM "+TABLE+" WHERE owner_identity_id=? AND document_id=? ORDER BY created_at DESC,id DESC LIMIT 20",
            this::map,owner,documentId);
    }
    public Optional<EmailClaim> claim() {
        return tx.execute(ignored -> {
            var expired=jdbc.query("WITH stale AS (SELECT id FROM "+TABLE+
                " WHERE status='SENDING' AND lease_until<now() LIMIT 20 FOR UPDATE SKIP LOCKED) UPDATE "+TABLE+
                " m SET status='UNKNOWN',error_code='EMAIL_OUTCOME_UNKNOWN',lease_token=NULL,lease_until=NULL,updated_at=now()"+
                " FROM stale s WHERE m.id=s.id RETURNING m.document_id",(rs,n)->rs.getObject(1,UUID.class));
            for(UUID id:expired) documents.audit(id,null,"EMAIL_OUTCOME_UNKNOWN");
            UUID token=UUID.randomUUID();
            return jdbc.query("WITH candidate AS (SELECT id FROM "+TABLE+
                " WHERE status='QUEUED' ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED) UPDATE "+TABLE+
                " m SET status='SENDING',lease_token=?,lease_until=now()+interval '5 minutes',updated_at=now()"+
                " FROM candidate c WHERE m.id=c.id RETURNING m.*",(rs,n)->new EmailClaim(rs.getObject("id",UUID.class),
                rs.getObject("document_id",UUID.class),rs.getObject("owner_identity_id",UUID.class),token),token)
                .stream().findFirst();
        });
    }
    public void finish(EmailClaim claim,String status,String operationId,String code) {
        if(!List.of("ACCEPTED","FAILED","UNKNOWN").contains(status)) throw new IllegalArgumentException("Invalid email outcome");
        tx.executeWithoutResult(ignored -> {
            int changed=jdbc.update("UPDATE "+TABLE+" SET status=?,provider_operation_id=?,error_code=?,lease_token=NULL,lease_until=NULL,"+
                "updated_at=now() WHERE id=? AND status='SENDING' AND lease_token=?",status,operationId,code,claim.id(),claim.token());
            if(changed==1) documents.audit(claim.documentId(),null,"EMAIL_"+status);
        });
    }
    private EmailSummary map(ResultSet rs,int n) throws SQLException {
        return new EmailSummary(rs.getObject("id",UUID.class),rs.getObject("document_id",UUID.class),rs.getString("status"),
            DocumentRepository.instant(rs,"created_at"),DocumentRepository.instant(rs,"updated_at"),rs.getString("error_code"));
    }
}
