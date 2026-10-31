package in.craves.advanced.platform.data;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Append-only audit trail, written in the caller's transaction. */
@Component
public class Audit {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public Audit(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public void record(String module, UUID actor, String action, String entityType, Object entityId, Map<String, ?> details) {
        try {
            jdbc.update("INSERT INTO adv_platform.audit_event (module, actor_id, action, entity_type, entity_id, details, correlation_id) "
                            + "VALUES (?,?,?,?,?,CAST(? AS jsonb),?)",
                    module, actor, action, entityType, String.valueOf(entityId), json.writeValueAsString(details == null ? Map.of() : details),
                    MDC.get("correlationId"));
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException(ex);
        }
    }
}
