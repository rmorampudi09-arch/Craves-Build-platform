package in.craves.notification.documents;

import static in.craves.notification.documents.DocumentModels.*;
import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Base64;
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
public class DocumentRepository {
    static final String TABLE = "notification_schema.pdf_document";
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    public DocumentRepository(JdbcTemplate jdbc, PlatformTransactionManager manager) {
        this.jdbc = jdbc;
        this.tx = new TransactionTemplate(manager);
        this.tx.setTimeout(15);
    }
    public Optional<Stored> existing(UUID owner, String key) {
        return jdbc.query("SELECT * FROM " + TABLE + " WHERE owner_identity_id=? AND request_key=?",
            DocumentRepository::stored,owner,key).stream().findFirst();
    }
    public Stored own(UUID owner, UUID id) {
        return jdbc.query("SELECT * FROM " + TABLE + " WHERE owner_identity_id=? AND id=?",
            DocumentRepository::stored,owner,id).stream().findFirst().orElseThrow(DocumentModels::missing);
    }
    public static Summary sameRequest(Stored old, String fingerprint) {
        if (!old.fingerprint().equals(fingerprint)) throw conflict("IDEMPOTENCY_KEY_REUSED");
        return old.summary();
    }
    public Summary create(UUID owner, String key, Request request, Snapshot source, String json) {
        if (json.getBytes(StandardCharsets.UTF_8).length > 1048576) throw bad("DOCUMENT_SNAPSHOT_TOO_LARGE");
        return tx.execute(ignored -> {
            lockOwner(jdbc,owner);
            var old = existing(owner,key);
            if (old.isPresent()) return sameRequest(old.get(),request.fingerprint());
            Integer recent = jdbc.queryForObject("SELECT count(*) FROM " + TABLE +
                " WHERE owner_identity_id=? AND created_at>now()-interval '1 day'",Integer.class,owner);
            Integer active = jdbc.queryForObject("SELECT count(*) FROM " + TABLE +
                " WHERE owner_identity_id=? AND status IN ('QUEUED','RENDERING')",Integer.class,owner);
            if ((recent != null && recent >= 60) || (active != null && active >= 4))
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"DOCUMENT_REQUEST_LIMIT");
            UUID id = UUID.randomUUID();
            jdbc.update("INSERT INTO " + TABLE + " (id,owner_identity_id,request_key,request_hash,document_type," +
                "source_reference,currency,timezone,template_version,snapshot,snapshot_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                id,owner,key,request.fingerprint(),request.type().name(),source.reference(),source.currency(),
                request.timezone(),TEMPLATE_VERSION,json,sha256(json.getBytes(StandardCharsets.UTF_8)));
            audit(id,owner,"DOCUMENT_CREATED");
            return own(owner,id).summary();
        });
    }
    public Page page(UUID owner, int limit, String cursor, Type type, String reference) {
        if (limit < 1 || limit > 50) throw bad("INVALID_PAGE_SIZE");
        if (reference != null && reference.length() > 160) throw bad("INVALID_REFERENCE");
        Instant before = Instant.parse("9999-12-31T23:59:59Z");
        UUID beforeId = UUID.fromString("ffffffff-ffff-ffff-ffff-ffffffffffff");
        if (cursor != null) {
            try {
                if (cursor.length() > 180) throw new IllegalArgumentException();
                String[] parts = new String(Base64.getUrlDecoder().decode(cursor),StandardCharsets.UTF_8).split("\\|",-1);
                if (parts.length != 2) throw new IllegalArgumentException();
                before = Instant.parse(parts[0]); beforeId = UUID.fromString(parts[1]);
            } catch (RuntimeException ex) { throw bad("INVALID_CURSOR"); }
        }
        var rows = jdbc.query("SELECT * FROM " + TABLE +
            " WHERE owner_identity_id=? AND (created_at,id)<(?,?)" +
            " AND (?::varchar IS NULL OR document_type=?) AND (?::varchar IS NULL OR source_reference=?)" +
            " ORDER BY created_at DESC,id DESC LIMIT ?",DocumentRepository::summary,owner,Timestamp.from(before),beforeId,
            type == null ? null : type.name(),type == null ? null : type.name(),reference,reference,limit+1);
        boolean more = rows.size() > limit;
        List<Summary> items = List.copyOf(rows.subList(0,Math.min(limit,rows.size())));
        String next = more ? Base64.getUrlEncoder().withoutPadding().encodeToString(
            (items.getLast().createdAt()+"|"+items.getLast().id()).getBytes(StandardCharsets.UTF_8)) : null;
        return new Page(items,next);
    }
    public String blobKey(UUID owner, UUID id) {
        return jdbc.query("SELECT blob_key FROM " + TABLE + " WHERE id=? AND owner_identity_id=? AND status='READY'",
            (rs,n) -> rs.getString(1),id,owner).stream().findFirst().orElseThrow(() -> conflict("DOCUMENT_NOT_READY"));
    }
    public void audit(UUID id, UUID owner, String event) {
        jdbc.update("INSERT INTO notification_schema.pdf_document_audit(document_id,actor_identity_id,event_type) VALUES (?,?,?)",id,owner,event);
    }
    static void lockOwner(JdbcTemplate jdbc, UUID owner) {
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(?,4271))",rs -> { return null; },owner.toString());
    }
    static Stored stored(ResultSet rs, int n) throws SQLException {
        return new Stored(rs.getObject("id",UUID.class),rs.getObject("owner_identity_id",UUID.class),rs.getString("request_hash"),
            rs.getString("snapshot"),rs.getString("snapshot_hash"),rs.getString("timezone"),summary(rs,n));
    }
    static Summary summary(ResultSet rs, int n) throws SQLException {
        return new Summary(rs.getObject("id",UUID.class),Type.valueOf(rs.getString("document_type")),rs.getString("source_reference"),
            rs.getString("currency"),rs.getString("status"),instant(rs,"created_at"),instant(rs,"ready_at"),rs.getString("pdf_hash"),
            rs.getObject("byte_count",Long.class),rs.getString("template_version"),rs.getString("error_code"));
    }
    static Instant instant(ResultSet rs, String field) throws SQLException {
        Timestamp value = rs.getTimestamp(field); return value == null ? null : value.toInstant();
    }
}
