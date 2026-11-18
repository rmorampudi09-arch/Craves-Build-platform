package in.craves.integration.fleet.dispatch;

import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LAT;
import static in.craves.integration.fleet.dispatch.FleetDispatchFixtures.KITCHEN_LNG;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import in.craves.integration.delivery.command.DeliveryCommandModels.DeliveryCommandMessage;
import in.craves.integration.delivery.command.DeliveryProviderRouter.DeliveryProviderTemporarilyUnavailableException;
import in.craves.integration.fleet.FleetDatabase;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetTestMode;
import in.craves.integration.fleet.client.RiderPushClient;
import in.craves.integration.fleet.client.RoadDistanceClient;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.OptionalLong;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DelegatingDataSource;

/**
 * What one look at an order costs the database, under the built-in rule (one rider at a time, 20 s, no limit on rounds,
 * fair turns within 1.5 km) with twelve free riders in the band and test mode off, as production runs. Counted: every
 * statement the look itself prepares. Ringing a phone (its token, then its push receipt) runs on its own thread, is two
 * statements an offer either way, and is left out.
 */
@EnabledIfEnvironmentVariable(named = "LEDGER_TEST_JDBC_URL", matches = ".+")
class FleetDispatchStatementsDatabaseTest {
    static final int RIDERS_IN_BAND = 12;
    /**
     * The same three looks before fair-turn standings were read in one statement: measured with this test on the commit
     * before (three statements a rider in the band, the policy read from the database on every look).
     */
    static final int OPENING_BEFORE = 47;
    static final int NEXT_ROUND_BEFORE = 49;
    static final int WAITING_BEFORE = 4;
    /** The opening look today, with the policy read from the database. */
    static final int OPENING_NOW = 12;

    final FleetDatabase fleet = new FleetDatabase();
    final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    final AtomicInteger statements = new AtomicInteger();
    final Thread looking = Thread.currentThread();
    final DataSource counted = new DelegatingDataSource(fleet.dataSource) {
        @Override
        public Connection getConnection() throws SQLException {
            Connection connection = super.getConnection();
            return (Connection) Proxy.newProxyInstance(Connection.class.getClassLoader(), new Class<?>[] {Connection.class},
                (proxy, method, args) -> {
                    if (Thread.currentThread() == looking
                        && (method.getName().startsWith("prepare") || method.getName().equals("createStatement"))) {
                        statements.incrementAndGet();
                    }
                    try {
                        return method.invoke(connection, args);
                    } catch (InvocationTargetException exception) {
                        throw exception.getCause();
                    }
                });
        }
    };
    String stageSweeper = "off";
    final UUID chefSubOrderId = UUID.fromString("0bde0101-1111-4111-8111-111111111111");
    final DeliveryCommandMessage command = FleetDispatchFixtures.command(chefSubOrderId);

    /** As merged, with the policy cache off: the standings alone. */
    @Test
    void withStandingsInOneStatementALookThatRanksTheBandCostsFarLess() {
        int[] now = looks(0);
        assertThat(now[0]).as("the look that opens the order: down at least 3 times").isLessThanOrEqualTo(OPENING_BEFORE / 3);
        assertThat(now[2]).as("the look after a decline: 32 fewer, the policy still read").isEqualTo(NEXT_ROUND_BEFORE - 32);
        assertThat(now[1]).as("the look while a rider decides never ranked anyone").isEqualTo(WAITING_BEFORE);
    }

    /** The whole change, with CRAVES_FLEET_DISPATCH_POLICY_CACHE_SECONDS at 5: both looks that rank are down at least 3 times. */
    @Test
    void withThePolicyCachedTooEveryLookThatRanksTheBandIsDownAtLeastThreeTimes() {
        int[] now = looks(5);
        assertThat(now[0]).as("the look that opens the order").isLessThanOrEqualTo(OPENING_BEFORE / 3);
        assertThat(now[2]).as("the look after a decline").isLessThanOrEqualTo(NEXT_ROUND_BEFORE / 3);
        assertThat(now[1]).as("the look while a rider decides: one fewer, the policy").isEqualTo(WAITING_BEFORE - 1);
    }

    /** CRAVES_FLEET_GPS_RULE reads its two terms in the candidate statement: enforce (and shadow, the same statement) costs what off costs. */
    @Test
    void theGpsRuleAddsNoStatementToALook() {
        assertThat(looks(0, "enforce")).containsExactly(OPENING_NOW, WAITING_BEFORE, NEXT_ROUND_BEFORE - 32);
    }

    /**
     * CRAVES_FLEET_STAGE_SWEEPER shadow or on: each look that leaves riders deciding stores its next check on the stage, one
     * statement. Off (every test above) stores nothing.
     */
    @Test
    void theStageSweeperAddsOneStatementToALookThatLeavesRidersDeciding() {
        stageSweeper = "on";
        assertThat(looks(0, "off")).containsExactly(OPENING_NOW + 1, WAITING_BEFORE + 1, NEXT_ROUND_BEFORE - 32 + 1);
    }

    private int[] looks(int policyCacheSeconds) {
        int[] now = looks(policyCacheSeconds, "off");
        if (policyCacheSeconds == 0) {
            assertThat(now[0]).as("OPENING_NOW is the look with the GPS rule off").isEqualTo(OPENING_NOW);
        }
        return now;
    }

    /** The looks at one order: the one that opens it, one while its rider decides, and the one after a decline. */
    private int[] looks(int policyCacheSeconds, String gpsRule) {
        JdbcTemplate db = new JdbcTemplate(counted);
        RoadDistanceClient roads = mock(RoadDistanceClient.class);
        when(roads.meters(anyDouble(), anyDouble(), anyDouble(), anyDouble())).thenReturn(3500);
        FleetPolicyStore policies = new FleetPolicyStore(db, json);
        policies.setDispatchPolicyCacheSeconds(policyCacheSeconds);
        FleetDispatcher dispatcher = new FleetDispatcher(db, new DataSourceTransactionManager(counted), policies,
            new FleetTestMode(db, FleetDatabase.properties(false)), roads, mock(RiderPushClient.class), json);
        dispatcher.setGpsRule(gpsRule);
        dispatcher.setStageSweeper(stageSweeper);
        FleetDispatchFixtures.policy(fleet.db, "live", 20, 300, 1, 0, 1500);
        FleetDispatchFixtures.kitchen(fleet.db, chefSubOrderId, false);
        for (int i = 1; i <= RIDERS_IN_BAND; i++) {
            FleetDispatchFixtures.riderOnShift(fleet, "+9198000000%02d".formatted(i), KITCHEN_LAT + 0.0005 * i, KITCHEN_LNG, 5, false);
        }
        int opening = look(dispatcher);
        assertThat(offers()).as("the first rider is asked").isOne();
        int waiting = look(dispatcher);
        assertThat(offers()).as("their rider is deciding").isOne();
        fleet.db.update("UPDATE fleet_schema.trip_offer SET state = 'DECLINED', decided_at = now()");
        int nextRound = look(dispatcher);
        assertThat(offers()).as("the next rider is asked").isEqualTo(2);
        System.out.println("FLEET_PASS_STATEMENTS policyCacheSeconds=" + policyCacheSeconds + " opening=" + opening + " (before "
            + OPENING_BEFORE + ") waiting=" + waiting + " (before " + WAITING_BEFORE + ") nextRound=" + nextRound + " (before "
            + NEXT_ROUND_BEFORE + ")");
        return new int[] {opening, waiting, nextRound};
    }

    private int look(FleetDispatcher dispatcher) {
        statements.set(0);
        assertThatThrownBy(() -> dispatcher.run(command, OptionalLong::empty, true))
            .isInstanceOf(DeliveryProviderTemporarilyUnavailableException.class);
        return statements.get();
    }

    private int offers() {
        return fleet.db.queryForObject("SELECT count(*) FROM fleet_schema.trip_offer", Integer.class);
    }
}
