package in.craves.supportassistant.knowledge;

import in.craves.supportassistant.web.SupportDtos.Audience;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class KnowledgeRepository {
    private final JdbcTemplate jdbcTemplate;

    public KnowledgeRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<KnowledgeDocument> search(Audience audience, String query, int limit) {
        return jdbcTemplate.query(
            """
            SELECT id, audience, title, source_type, source_ref, content,
                   ts_rank_cd(search_vector, websearch_to_tsquery('simple', ?)) AS rank
              FROM support_assistant_schema.knowledge_document
             WHERE active = TRUE
               AND audience IN (?, 'BOTH')
               AND search_vector @@ websearch_to_tsquery('simple', ?)
             ORDER BY rank DESC, updated_at DESC
             LIMIT ?
            """,
            (rs, rowNum) -> new KnowledgeDocument(
                rs.getObject("id", UUID.class),
                rs.getString("audience"),
                rs.getString("title"),
                rs.getString("source_type"),
                rs.getString("source_ref"),
                rs.getString("content")
            ),
            query,
            audience.name(),
            query,
            limit
        );
    }

    public List<KnowledgeDocument> fallback(Audience audience, int limit) {
        return jdbcTemplate.query(
            """
            SELECT id, audience, title, source_type, source_ref, content
              FROM support_assistant_schema.knowledge_document
             WHERE active = TRUE
               AND audience IN (?, 'BOTH')
             ORDER BY updated_at DESC, title ASC
             LIMIT ?
            """,
            (rs, rowNum) -> new KnowledgeDocument(
                rs.getObject("id", UUID.class),
                rs.getString("audience"),
                rs.getString("title"),
                rs.getString("source_type"),
                rs.getString("source_ref"),
                rs.getString("content")
            ),
            audience.name(),
            limit
        );
    }

    public void audit(
        UUID identityId,
        Audience audience,
        String questionSha256,
        String outcome,
        boolean aiInvoked,
        String contextTypes,
        String correlationId
    ) {
        jdbcTemplate.update(
            """
            INSERT INTO support_assistant_schema.conversation_audit
                (id, identity_id, audience, question_sha256, outcome, ai_invoked, context_types, correlation_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, now())
            """,
            UUID.randomUUID(),
            identityId,
            audience.name(),
            questionSha256,
            outcome,
            aiInvoked,
            contextTypes,
            correlationId
        );
    }

    public record KnowledgeDocument(
        UUID id,
        String audience,
        String title,
        String sourceType,
        String sourceRef,
        String content
    ) {}
}
