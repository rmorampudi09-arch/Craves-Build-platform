package in.craves.notification.documents;

import static in.craves.notification.documents.DocumentModels.*;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Repository
public class DocumentJobRepository {
    private static final String TABLE = DocumentRepository.TABLE;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final DocumentRepository documents;
    public DocumentJobRepository(JdbcTemplate jdbc, PlatformTransactionManager manager, DocumentRepository documents) {
        this.jdbc=jdbc; this.documents=documents;
        this.tx=new TransactionTemplate(manager); this.tx.setTimeout(15);
    }
    public Optional<RenderClaim> claim() {
        return tx.execute(ignored -> {
            var exhausted = jdbc.query("WITH stale AS (SELECT id FROM " + TABLE +
                " WHERE status='RENDERING' AND lease_until<now() AND attempt_count>=5 LIMIT 20 FOR UPDATE SKIP LOCKED)" +
                " UPDATE " + TABLE + " d SET status='FAILED',error_code='RENDER_LEASE_EXHAUSTED',lease_token=NULL,lease_until=NULL" +
                " FROM stale s WHERE d.id=s.id RETURNING d.id",(rs,n)->rs.getObject(1,UUID.class));
            for (UUID id:exhausted) documents.audit(id,null,"RENDER_LEASE_EXHAUSTED");
            UUID token=UUID.randomUUID();
            return jdbc.query("WITH candidate AS (SELECT id FROM " + TABLE +
                " WHERE attempt_count<5 AND ((status='QUEUED' AND next_attempt_at<=now()) OR" +
                " (status='RENDERING' AND lease_until<now())) ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED)" +
                " UPDATE " + TABLE + " d SET status='RENDERING',lease_token=?,lease_until=now()+interval '5 minutes'," +
                " attempt_count=attempt_count+1,error_code=NULL FROM candidate c WHERE d.id=c.id RETURNING d.*",
                (rs,n)->new RenderClaim(DocumentRepository.stored(rs,n),token,rs.getInt("attempt_count")),token)
                .stream().findFirst();
        });
    }
    public boolean ready(RenderClaim claim,String blobKey,String hash,int size) {
        return Boolean.TRUE.equals(tx.execute(ignored -> {
            int changed=jdbc.update("UPDATE " + TABLE + " SET status='READY',blob_key=?,pdf_hash=?,byte_count=?," +
                "ready_at=now(),lease_token=NULL,lease_until=NULL,error_code=NULL WHERE id=? AND status='RENDERING' AND lease_token=?",
                blobKey,hash,size,claim.document().id(),claim.token());
            if(changed==1) documents.audit(claim.document().id(),null,"RENDER_READY");
            return changed==1;
        }));
    }
    public void failed(RenderClaim claim,String code,boolean permanent) {
        tx.executeWithoutResult(ignored -> {
            boolean terminal=permanent||claim.attempt()>=5;
            int changed=jdbc.update("UPDATE " + TABLE + " SET status=?,error_code=?,lease_token=NULL,lease_until=NULL," +
                "next_attempt_at=now()+(? * interval '1 second') WHERE id=? AND status='RENDERING' AND lease_token=?",
                terminal?"FAILED":"QUEUED",code,Math.min(600,15*(1<<claim.attempt())),claim.document().id(),claim.token());
            if(changed==1) documents.audit(claim.document().id(),null,terminal?"RENDER_FAILED":"RENDER_RETRY");
        });
    }
}
