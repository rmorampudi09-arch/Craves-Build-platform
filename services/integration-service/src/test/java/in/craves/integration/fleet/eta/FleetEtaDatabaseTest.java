package in.craves.integration.fleet.eta;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.fleet.FleetDatabase;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.dao.DataIntegrityViolationException;

/**
 * Phase 5, the travel-time model's switch (craves.fleet.eta.*) against a real database: the version named is loaded from
 * fleet_schema.eta_model, as python -m fleet_eta sql writes it, with its ranking verdict; shadow is never shown and never
 * ranks; live shows its minutes, and may rank only with a ranking judged better; a missing or unreadable version leaves
 * today's rule; live, the model is published where the fleet engine reads it.
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetEtaDatabaseTest {
    final FleetDatabase fleet = new FleetDatabase();

    String goldenModel() throws Exception {
        return new ObjectMapper().readTree(Files.readString(EtaModelTest.golden())).get("model").toString();
    }

    /** As python -m fleet_eta sql writes it (fleet_eta/model.py publish_sql), with the ranking judgement it was trained with. */
    void publish(String version, String model, String ranking) {
        fleet.db.execute("INSERT INTO fleet_schema.eta_model (version, model, metrics)\nVALUES ('" + version + "', $eta_model$" + model
            + "$eta_model$::jsonb, $eta_model${\"heldOutTest\":{\"verdict\":\"better\",\"rankingVerdict\":\"" + ranking
            + "\"}}$eta_model$::jsonb)\nON CONFLICT (version) DO NOTHING;\n");
    }

    void publish(String version, String model) {
        publish(version, model, "better");
    }

    @Test
    void aLiveModelIsLoadedFromItsRowShownAndPublishedForTheEngine() throws Exception {
        publish("golden-1", goldenModel());
        FleetEta eta = new FleetEta(fleet.db, "live", " golden-1 ");
        Map<String, byte[]> published = new ConcurrentHashMap<>();
        eta.publishTo(published::put);
        EtaModel model = eta.shown();
        assertThat(model).isNotNull();
        assertThat(model.version()).isEqualTo("golden-1");
        assertThat(eta.ranking()).as("judged to rank riders well").isSameAs(model);
        assertThat(eta.model()).isSameAs(model);
        double[] row = EtaModel.features(EtaModel.PICKUP, 17.4483, 78.3915, 17.46, 78.36, 1793160000000L);
        assertThat(model.predict(row)).isEqualTo(EtaModel.parse(goldenModel()).predict(row));
        long deadline = System.currentTimeMillis() + 3_000;
        while (!eta.published() && System.currentTimeMillis() < deadline) {
            Thread.sleep(10);
        }
        assertThat(eta.published()).as("the engine has it, so it may be asked to rank by it").isTrue();
        assertThat(published).containsKey("model:eta:golden-1");
        assertThat(EtaModel.parse(new String(published.get("model:eta:golden-1"), StandardCharsets.UTF_8)).version())
            .as("the engine reads the same version, as Postgres returns it").isEqualTo("golden-1");
    }

    @Test
    void aModelNotJudgedToRankBetterIsShownButNeverDecidesWhoHearsFirst() throws Exception {
        publish("golden-1", goldenModel(), "not-better");
        FleetEta eta = new FleetEta(fleet.db, "live", "golden-1");
        assertThat(eta.shown()).isNotNull();
        assertThat(eta.ranking()).isNull();
    }

    @Test
    void shadowLoadsTheModelButNeitherShowsNorRanksIt() throws Exception {
        publish("golden-1", goldenModel());
        FleetEta eta = new FleetEta(fleet.db, "shadow", "golden-1");
        assertThat(eta.model()).isNotNull();
        assertThat(eta.shown()).isNull();
        assertThat(eta.ranking()).isNull();
    }

    @Test
    void offOrAnUnknownModeLoadsNothing() throws Exception {
        publish("golden-1", goldenModel());
        for (String mode : new String[] {"off", "false", "", "sideways"}) {
            FleetEta eta = new FleetEta(fleet.db, mode, "golden-1");
            assertThat(eta.mode()).isEqualTo("off");
            assertThat(eta.model()).isNull();
            assertThat(eta.shown()).isNull();
            assertThat(eta.ranking()).isNull();
        }
    }

    @Test
    void aMissingOrUnreadableVersionKeepsTodaysRule() throws Exception {
        assertThat(new FleetEta(fleet.db, "live", "nope").shown()).as("no such row").isNull();
        assertThat(new FleetEta(fleet.db, "live", "").shown()).as("no version set").isNull();
        publish("bad-1", goldenModel().replace("\"version\":\"golden-1\"", "\"version\":\"bad-1\"").replace("\"ist_hour\"", "\"hour\""));
        assertThat(new FleetEta(fleet.db, "live", "bad-1").shown()).as("features it can't feed").isNull();
        assertThatThrownBy(() -> publish("other-1", goldenModel())).as("a row holds the version it names")
            .isInstanceOf(DataIntegrityViolationException.class);
    }
}
