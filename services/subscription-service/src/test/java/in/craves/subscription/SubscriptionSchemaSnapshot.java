package in.craves.subscription;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Only a catalog's outer constraint collection is unordered. Never sort nested key columns. */
final class SubscriptionSchemaSnapshot {
    private SubscriptionSchemaSnapshot() {}

    static JsonNode canonical(JsonNode schema) {
        if (!schema.isObject() || !schema.path("constraints").isArray()) {
            throw new IllegalArgumentException("Schema must contain the complete constraint array");
        }
        ObjectNode copy = schema.deepCopy();
        List<JsonNode> constraints = new ArrayList<>();
        copy.path("constraints").forEach(constraints::add);
        for (JsonNode constraint : constraints) {
            if (!constraint.isObject() || !constraint.path("relation").isTextual()
                || !constraint.path("name").isTextual() || !constraint.path("type").isTextual()) {
                throw new IllegalArgumentException("Constraint identity is incomplete");
            }
        }
        constraints.sort(Comparator.comparing((JsonNode c) -> c.path("relation").asText())
            .thenComparing(c -> c.path("name").asText())
            .thenComparing(c -> c.path("type").asText())
            .thenComparing(JsonNode::toString));
        ArrayNode output = copy.putArray("constraints");
        constraints.forEach(output::add);
        return copy;
    }
}
