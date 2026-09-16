package in.craves.subscription;

import static org.junit.jupiter.api.Assertions.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

class SubscriptionSchemaSnapshotTest {
    private final ObjectMapper json = new ObjectMapper();
    private ObjectNode fixture() throws Exception {
        return (ObjectNode) json.readTree("""
            {"constraints":[
              {"relation":"a_very_long_table_name","name":"first","type":"u","definition":"UNIQUE (a,b)","keys":["a","b"],"validated":true},
              {"relation":"a_very_long_table_name","name":"second","type":"c","definition":"CHECK (n>0)","validated":true}],
             "columns":[{"name":"a","position":1},{"name":"b","position":2}]}
            """);
    }
    private JsonNode canonical(JsonNode schema) { return SubscriptionSchemaSnapshot.canonical(schema); }

    @Test void outerConstraintPermutationPassesWithoutMutatingInput() throws Exception {
        ObjectNode original=fixture(), reordered=original.deepCopy();
        ArrayNode items=(ArrayNode)reordered.get("constraints"); JsonNode first=items.remove(0);items.add(first);
        assertEquals(canonical(original),canonical(reordered));
        assertEquals("second",reordered.path("constraints").get(0).path("name").asText());
    }
    @Test void definitionChangeFails() throws Exception {
        ObjectNode changed=fixture();((ObjectNode)changed.path("constraints").get(0)).put("definition","UNIQUE (b,a)");
        assertNotEquals(canonical(fixture()),canonical(changed));
    }
    @Test void missingConstraintFails() throws Exception {
        ObjectNode changed=fixture();((ArrayNode)changed.get("constraints")).remove(0);
        assertNotEquals(canonical(fixture()),canonical(changed));
    }
    @Test void extraConstraintFails() throws Exception {
        ObjectNode changed=fixture();ObjectNode extra=changed.path("constraints").get(0).deepCopy();extra.put("name","extra");
        ((ArrayNode)changed.get("constraints")).add(extra);assertNotEquals(canonical(fixture()),canonical(changed));
    }
    @Test void duplicateMultiplicityFails() throws Exception {
        ObjectNode changed=fixture();((ArrayNode)changed.get("constraints")).add(changed.path("constraints").get(0).deepCopy());
        assertNotEquals(canonical(fixture()),canonical(changed));
    }
    @Test void nestedCompositeColumnOrderRemainsSignificant() throws Exception {
        ObjectNode changed=fixture();((ObjectNode)changed.path("constraints").get(0)).putArray("keys").add("b").add("a");
        assertNotEquals(canonical(fixture()),canonical(changed));
    }
    @Test void structuralFieldsAreNotDiscarded() throws Exception {
        ObjectNode changed=fixture();((ObjectNode)changed.path("constraints").get(0)).put("validated",false);
        assertNotEquals(canonical(fixture()),canonical(changed));
        changed=fixture();((ObjectNode)changed.path("columns").get(0)).put("position",3);
        assertNotEquals(canonical(fixture()),canonical(changed));
    }
    @Test void missingIdentityCannotBecomePassingEmptyEvidence() throws Exception {
        assertThrows(IllegalArgumentException.class,()->canonical(json.createObjectNode()));
        ObjectNode changed=fixture();((ObjectNode)changed.path("constraints").get(0)).remove("name");
        assertThrows(IllegalArgumentException.class,()->canonical(changed));
    }
}
