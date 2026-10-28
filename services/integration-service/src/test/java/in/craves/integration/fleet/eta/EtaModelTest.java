package in.craves.integration.fleet.eta;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

/**
 * integration-service's copy of the travel-time model against scikit-learn's own predictions
 * (ml/fleet-eta/testdata/golden.json, written by python -m fleet_eta golden), as services/fleet-engine's EtaModelTest holds
 * the engine's copy: the same features from the same inputs, and the same minutes, to the bit.
 */
class EtaModelTest {
    /** ml/fleet-eta/testdata/golden.json, found from the directory the tests run in (the module's, under Maven). */
    static Path golden() {
        for (Path dir = Path.of("").toAbsolutePath(); dir != null; dir = dir.getParent()) {
            Path candidate = dir.resolve("ml/fleet-eta/testdata/golden.json");
            if (Files.isRegularFile(candidate)) {
                return candidate;
            }
        }
        throw new IllegalStateException("ml/fleet-eta/testdata/golden.json not found above " + Path.of("").toAbsolutePath());
    }

    @Test
    void javaPredictsExactlyWhatScikitLearnDoes() throws Exception {
        JsonNode golden = new ObjectMapper().readTree(Files.readString(golden()));
        EtaModel model = EtaModel.parse(golden.get("model").toString());
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
            assertEquals(row.get("minutes").asDouble(), model.predict(python), 0.0, "row " + rows);
            rows++;
        }
        assertTrue(rows > 200);
    }

    @Test
    void aModelItCannotEvaluateSafelyIsRefused() {
        assertThrows(IllegalArgumentException.class, () -> EtaModel.parse("{\"format\":1,\"version\":\"v1\",\"features\":[\"metres\"]}"));
        assertThrows(IllegalArgumentException.class, () -> EtaModel.parse("[]"));
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
