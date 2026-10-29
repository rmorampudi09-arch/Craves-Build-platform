package in.craves.fleetengine.eta;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

/**
 * The travel-time model as Java evaluates it against scikit-learn's own predictions (ml/fleet-eta/testdata/golden.json,
 * written by python -m fleet_eta golden): the same features from the same inputs, and the same minutes, to the bit.
 * integration-service's copy of EtaModel is held to the same file.
 */
class EtaModelTest {
    static final Path GOLDEN = Path.of("../../ml/fleet-eta/testdata/golden.json");

    @Test
    void javaPredictsExactlyWhatScikitLearnDoes() throws Exception {
        JsonNode golden = new ObjectMapper().readTree(Files.readString(GOLDEN));
        EtaModel model = EtaModel.parse(golden.get("model").toString());
        assertEquals("golden-1", model.version());
        int rows = 0;
        for (JsonNode row : golden.get("rows")) {
            double[] python = new double[EtaModel.FEATURES.size()];
            for (int i = 0; i < python.length; i++) {
                python[i] = row.get("features").get(i).asDouble();
            }
            double[] java = EtaModel.features(row.get("leg").asInt(), row.get("fromLat").asDouble(), row.get("fromLng").asDouble(),
                row.get("toLat").asDouble(), row.get("toLng").asDouble(), row.get("atMs").asLong());
            for (int i = 0; i < python.length; i++) {
                assertEquals(python[i], java[i], Math.abs(python[i]) * 1e-12 + 1e-12, "row " + rows + " feature " + EtaModel.FEATURES.get(i));
            }
            double expected = row.get("minutes").asDouble();
            assertEquals(expected, model.predict(python), 0.0, "row " + rows + ": the same features give scikit-learn's minutes");
            // shown and ranked by: within the serving bounds (fleet_eta.model.serve), which one synthetic 42 km leg falls outside
            double served = Math.min(EtaModel.SERVED_MAX_MINUTES, Math.max(python[0] / EtaModel.MAX_METRES_PER_MINUTE, expected));
            assertEquals(served, model.minutes(row.get("leg").asInt(), row.get("fromLat").asDouble(), row.get("fromLng").asDouble(),
                row.get("toLat").asDouble(), row.get("toLng").asDouble(), row.get("atMs").asLong()), 1e-9, "row " + rows);
            rows++;
        }
        assertTrue(rows > 200);
    }

    static final String FEATURES = "[\"metres\",\"from_lat\",\"from_lng\",\"to_lat\",\"to_lng\",\"bearing_sin\",\"bearing_cos\","
        + "\"ist_hour\",\"ist_weekday\",\"leg\"]";

    static String model(String version, String features, String rate, String tree) {
        return "{\"format\":1,\"version\":\"" + version + "\",\"features\":" + features + ",\"init\":3,\"learning_rate\":" + rate
            + ",\"trees\":[" + tree + "]}";
    }

    static final String TREE = "{\"feature\":[0,0,0],\"threshold\":[1000,0,0],\"left\":[1,-1,-1],\"right\":[2,-1,-1],\"value\":[0,1,4]}";

    @Test
    void aModelItCannotEvaluateSafelyIsRefused() {
        EtaModel ok = EtaModel.parse(model("v1", FEATURES, "0.5", TREE));
        assertEquals(3.5, ok.predict(new double[] {500, 0, 0, 0, 0, 0, 1, 9, 2, 0}));
        assertEquals(5.0, ok.predict(new double[] {5000, 0, 0, 0, 0, 0, 1, 9, 2, 0}));
        String[] bad = {
            "not json",
            model("v1", FEATURES, "0.5", TREE).replace("\"format\":1", "\"format\":2"),
            model("a version with spaces", FEATURES, "0.5", TREE),
            model("v1", "[\"metres\"]", "0.5", TREE),
            model("v1", FEATURES, "0", TREE),
            model("v1", FEATURES, "1e999", TREE),
            model("v1", FEATURES, "0.5", TREE.replace("\"left\":[1,-1,-1]", "\"left\":[0,-1,-1]")), // a node pointing at itself
            model("v1", FEATURES, "0.5", TREE.replace("\"right\":[2,-1,-1]", "\"right\":[3,-1,-1]")), // a child past the end
            model("v1", FEATURES, "0.5", TREE.replace("\"feature\":[0,0,0]", "\"feature\":[10,0,0]")), // no such feature
            model("v1", FEATURES, "0.5", TREE.replace("\"value\":[0,1,4]", "\"value\":[0,1]")), // arrays of other lengths
            model("v1", FEATURES, "0.5", ""), // no trees
        };
        for (String json : bad) {
            assertThrows(IllegalArgumentException.class, () -> EtaModel.parse(json), json);
        }
    }

    @Test
    void featuresFollowIndianStandardTime() {
        double[] f = EtaModel.features(EtaModel.DROP, 17.4483, 78.3915, 17.4483, 78.3915, 1793160000000L); // Wed 28 Oct 2026 09:30 IST
        assertEquals(0, f[0]);
        assertEquals(9, f[7]);
        assertEquals(2, f[8]);
        assertEquals(1, f[9]);
        assertEquals(0, EtaModel.features(0, 0, 0, 0, 0, 1793125800000L)[7], "IST midnight is hour 0");
        assertEquals(6, EtaModel.features(0, 0, 0, 0, 0, 1793557799999L)[8], "a Sunday is 6");
        assertEquals(1.0, EtaModel.features(0, 17.0, 78.0, 17.1, 78.0, 0)[6], 1e-12, "due north: bearing cosine 1");
    }

    @Test
    void shownMinutesStayWithinWhatARideCanTake() {
        String flat = "{\"format\":1,\"version\":\"flat\",\"features\":[\"" + String.join("\",\"", EtaModel.FEATURES)
            + "\"],\"init\":%s,\"learning_rate\":1,\"trees\":[{\"feature\":[-2],\"threshold\":[-2],\"left\":[-1],"
            + "\"right\":[-1],\"value\":[0]}]}";
        double north = 17.4483 + 5000 / 111_194.93;
        double metres = EtaModel.features(EtaModel.DROP, 17.4483, 78.3915, north, 78.3915, 1793160000000L)[0];
        assertEquals(metres / 1000, EtaModel.parse(flat.formatted("0.5")).minutes(EtaModel.DROP, 17.4483, 78.3915, north, 78.3915,
            1793160000000L), 0.0, "no faster than 60 km/h");
        assertEquals(120, EtaModel.parse(flat.formatted("200")).minutes(EtaModel.DROP, 17.4483, 78.3915, north, 78.3915,
            1793160000000L), 0.0, "at most two hours");
        assertEquals(17, EtaModel.parse(flat.formatted("17")).minutes(EtaModel.DROP, 17.4483, 78.3915, north, 78.3915,
            1793160000000L), 0.0);
    }
}
