package in.craves.integration.fleet.dispatch;

import in.craves.integration.fleet.FleetPolicyStore.DispatchPolicy;
import in.craves.integration.fleet.FleetPolicyStore.RateCard;
import in.craves.integration.fleet.client.RoadDistanceClient;
import in.craves.integration.fleet.pay.FleetPay;
import in.craves.integration.fleet.pay.FleetPay.PayQuote;
import in.craves.integration.fleet.trip.FleetTripModels;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.OptionalLong;
import java.util.Random;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Replay (PLAN F15): recorded orders and their recorded Borzo/Pidge quotes, run through the fleet stage's decisions in
 * shadow with a synthetic rider pool. Nothing is offered, pushed or booked, and nothing is written to the database. Per
 * order: would riders have been eligible, the cost guard's answer, the locked rider pay against the 3PL price, the
 * distances. Totals give the break-even orders per paid rider-hour u* = C_h / (P_eff - v) from PLAN. Run by
 * FleetReplayRunner; docs/riders/REPLAY.md says how.
 */
public final class FleetReplay {
    static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    static final double ROAD_FACTOR = 1.3; // RoadDistanceClient's fallback: no Ola call during a replay

    private FleetReplay() {
    }

    /**
     * The pilot area is a circle around centerLat/centerLng (kitchens inside it); riders work the IST hours in shiftHours
     * (pairs of start and end hours) every day; each offered rider accepts with acceptRate; C_h is hourlyCostPaise.
     */
    public record Settings(LocalDate from, LocalDate to, double centerLat, double centerLng, double radiusKm, int riders,
                           List<int[]> shiftHours, double acceptRate, long hourlyCostPaise, long seed) {
    }

    /** One recorded order: when dispatch started, kitchen and drop, and the 3PL prices recorded for it (paise). */
    public record Order(UUID chefSubOrderId, Instant at, String area, double kitchenLat, double kitchenLng, double dropLat, double dropLng,
                        Long cheapestQuotePaise, String bookedProvider, Long bookedPricePaise) {
        /** What the 3PL leg cost (or would have): the booked courier's quote, else the cheapest recorded quote. */
        Long threePlPaise() {
            return bookedPricePaise != null ? bookedPricePaise : cheapestQuotePaise;
        }
    }

    /**
     * outcome: OFFERED (a rider accepted), DECLINED (offered, nobody accepted), COST_GUARD (riders near, too dear), NO_RIDERS.
     * Pay and pickup distance are the accepting rider's, else the nearest eligible rider's.
     */
    public record Row(Order order, int dropDistanceM, int eligibleRiders, String outcome, Integer pickupDistanceM, Long riderPayPaise,
                      Boolean costGuardPassed, Long fleetCostPaise) {
        boolean fleet() {
            return "OFFERED".equals(outcome);
        }
    }

    public record Report(Settings settings, String rateCardVersion, String policyVersion, long overheadPaise, long premiumPaise,
                         int radiusM, List<Row> rows, double paidRiderHours) {
        List<Row> fleetRows() {
            return rows.stream().filter(Row::fleet).toList();
        }

        /** P_eff: the mean 3PL price of the orders the fleet took (else of every order with a price). */
        Double pEffPaise() {
            List<Row> base = fleetRows().stream().filter(row -> row.order().threePlPaise() != null).toList();
            if (base.isEmpty()) {
                base = rows.stream().filter(row -> row.order().threePlPaise() != null).toList();
            }
            return base.isEmpty() ? null : base.stream().mapToLong(row -> row.order().threePlPaise()).average().orElse(0);
        }

        /** v: the mean rider pay plus the policy's per-order overhead (insurance share, payout fee, levy reserve). */
        Double vPaise() {
            return fleetRows().isEmpty() ? null : fleetRows().stream().mapToLong(Row::fleetCostPaise).average().orElse(0);
        }

        /** u* = C_h / (P_eff - v); null when the fleet never takes an order or never costs less than 3PL per order. */
        Double breakEvenOrdersPerRiderHour() {
            Double pEff = pEffPaise();
            Double v = vPaise();
            return pEff == null || v == null || pEff <= v ? null : settings.hourlyCostPaise() / (pEff - v);
        }

        double ordersPerRiderHour() {
            return paidRiderHours == 0 ? 0 : fleetRows().size() / paidRiderHours;
        }
    }

    /** Recorded QUOTE_AND_CREATE commands whose dispatch started on the IST dates, with kitchens inside the pilot circle. */
    public static List<Order> load(JdbcTemplate jdbc, Settings settings) {
        List<Order> orders = jdbc.query("""
            SELECT c.chef_sub_order_id, c.dispatch_at,
                   COALESCE(c.payload->'deliveryRequest'->'pickup'->>'area', c.payload->>'area') AS area,
                   (c.payload->'deliveryRequest'->'pickup'->>'latitude')::float8 AS kitchen_lat,
                   (c.payload->'deliveryRequest'->'pickup'->>'longitude')::float8 AS kitchen_lng,
                   (c.payload->'deliveryRequest'->'dropoff'->>'latitude')::float8 AS drop_lat,
                   (c.payload->'deliveryRequest'->'dropoff'->>'longitude')::float8 AS drop_lng,
                   (SELECT min(q.quoted_cost) FROM delivery_schema.delivery_assignment a
                      JOIN delivery_schema.delivery_assignment_candidate q ON q.assignment_id = a.id
                     WHERE a.chef_sub_order_id = c.chef_sub_order_id AND q.quoted_cost IS NOT NULL) AS cheapest_quote,
                   j.provider_id AS booked_provider,
                   (SELECT min(q.quoted_cost) FROM delivery_schema.delivery_assignment a
                      JOIN delivery_schema.delivery_assignment_candidate q ON q.assignment_id = a.id
                     WHERE a.chef_sub_order_id = c.chef_sub_order_id AND q.provider_id = j.provider_id AND q.quoted_cost IS NOT NULL) AS booked_price
            FROM delivery_schema.delivery_command c
            LEFT JOIN delivery_schema.delivery_job j ON j.chef_sub_order_id = c.chef_sub_order_id
            WHERE c.command_type = 'QUOTE_AND_CREATE' AND c.dispatch_at >= ? AND c.dispatch_at < ?
            ORDER BY c.dispatch_at, c.chef_sub_order_id""", (row, n) -> {
            Double kitchenLat = (Double) row.getObject("kitchen_lat");
            Double kitchenLng = (Double) row.getObject("kitchen_lng");
            Double dropLat = (Double) row.getObject("drop_lat");
            Double dropLng = (Double) row.getObject("drop_lng");
            if (kitchenLat == null || kitchenLng == null || dropLat == null || dropLng == null) {
                return null;
            }
            return new Order(row.getObject("chef_sub_order_id", UUID.class), row.getTimestamp("dispatch_at").toInstant(), row.getString("area"),
                kitchenLat, kitchenLng, dropLat, dropLng, paise(row.getBigDecimal("cheapest_quote")), row.getString("booked_provider"),
                paise(row.getBigDecimal("booked_price")));
        }, Timestamp.from(settings.from().atStartOfDay(IST).toInstant()), Timestamp.from(settings.to().plusDays(1).atStartOfDay(IST).toInstant()));
        return orders.stream().filter(order -> order != null && RoadDistanceClient.straightLineMetres(settings.centerLat(), settings.centerLng(),
            order.kitchenLat(), order.kitchenLng()) <= settings.radiusKm() * 1000).toList();
    }

    /**
     * The fleet stage in shadow, in time order: riders on shift and free at the order's time, inside the policy radius,
     * the 3 nearest offered (FleetDispatcher), pay locked per rider (FleetPay), the cost guard against the cheapest
     * recorded quote. A rider who takes an order is busy for the trip's estimated minutes and ends at the drop.
     */
    public static Report run(List<Order> orders, RateCard card, DispatchPolicy policy, Settings settings) {
        Random random = new Random(settings.seed());
        List<Rider> pool = new ArrayList<>();
        for (int i = 0; i < settings.riders(); i++) {
            // Uniform in the pilot circle.
            double r = settings.radiusKm() * 1000 * Math.sqrt(random.nextDouble());
            double angle = 2 * Math.PI * random.nextDouble();
            pool.add(new Rider(settings.centerLat() + r * Math.cos(angle) / 111_320.0,
                settings.centerLng() + r * Math.sin(angle) / (111_320.0 * Math.cos(Math.toRadians(settings.centerLat())))));
        }
        List<Row> rows = new ArrayList<>();
        for (Order order : orders.stream().sorted(Comparator.comparing(Order::at)).toList()) {
            int dropM = (int) Math.round(RoadDistanceClient.straightLineMetres(order.kitchenLat(), order.kitchenLng(), order.dropLat(),
                order.dropLng()) * ROAD_FACTOR);
            boolean onShift = onShift(order.at(), settings.shiftHours());
            List<Candidate> near = pool.stream().filter(rider -> onShift && !rider.busyUntil.isAfter(order.at()))
                .map(rider -> new Candidate(rider, RoadDistanceClient.straightLineMetres(rider.lat, rider.lng, order.kitchenLat(), order.kitchenLng())))
                .filter(candidate -> candidate.metres() <= policy.radiusM())
                .sorted(Comparator.comparingDouble(Candidate::metres)).toList();
            OptionalLong quote = order.cheapestQuotePaise() == null ? OptionalLong.empty() : OptionalLong.of(order.cheapestQuotePaise());
            Candidate taker = null;
            PayQuote takerPay = null;
            PayQuote nearestPay = null;
            boolean anyPassed = false;
            int offered = 0;
            for (Candidate candidate : near) {
                if (offered == FleetDispatcher.OFFERS_AT_ONCE) {
                    break;
                }
                PayQuote pay = FleetPay.quote(card, dropM, FleetPay.pickupDistanceM(candidate.metres(), policy.pickupDetourPercent()));
                nearestPay = nearestPay == null ? pay : nearestPay;
                if (!FleetPay.costGuardPasses(pay.totalPaise(), policy.perOrderOverheadPaise(), quote, policy.costGuardPremiumPaise())) {
                    continue;
                }
                anyPassed = true;
                offered++;
                if (taker == null && random.nextDouble() < settings.acceptRate()) {
                    taker = candidate;
                    takerPay = pay;
                }
            }
            String outcome = near.isEmpty() ? "NO_RIDERS" : !anyPassed ? "COST_GUARD" : taker == null ? "DECLINED" : "OFFERED";
            PayQuote shown = takerPay != null ? takerPay : nearestPay;
            if (taker != null) {
                taker.rider().busyUntil = order.at().plusSeconds(60L * FleetTripModels.estMinutes(takerPay.pickupDistanceM(), dropM));
                taker.rider().lat = order.dropLat();
                taker.rider().lng = order.dropLng();
            }
            rows.add(new Row(order, dropM, near.size(), outcome, shown == null ? null : shown.pickupDistanceM(),
                shown == null ? null : shown.totalPaise(), near.isEmpty() ? null : anyPassed,
                taker == null ? null : takerPay.totalPaise() + policy.perOrderOverheadPaise()));
        }
        return new Report(settings, card.version(), policy.version(), policy.perOrderOverheadPaise(), policy.costGuardPremiumPaise(),
            policy.radiusM(), List.copyOf(rows), paidRiderHours(settings));
    }

    /** One line per order, for a spreadsheet. Money in paise. */
    public static String csv(Report report) {
        StringBuilder out = new StringBuilder("chef_sub_order_id,dispatch_at_ist,area,drop_distance_m,eligible_riders,fleet_eligible,outcome,"
            + "cost_guard,pickup_distance_m,rider_pay_paise,fleet_cost_paise,three_pl_paise,booked_provider,saving_paise\n");
        for (Row row : report.rows()) {
            Order order = row.order();
            Long threePl = order.threePlPaise();
            out.append(order.chefSubOrderId()).append(',').append(order.at().atZone(IST).toLocalDateTime()).append(',')
                .append(csvText(order.area())).append(',').append(row.dropDistanceM()).append(',').append(row.eligibleRiders()).append(',')
                .append(row.eligibleRiders() > 0).append(',').append(row.outcome()).append(',')
                .append(row.costGuardPassed() == null ? "" : row.costGuardPassed() ? "PASS" : "FAIL").append(',')
                .append(blank(row.pickupDistanceM())).append(',').append(blank(row.riderPayPaise())).append(',')
                .append(blank(row.fleetCostPaise())).append(',').append(blank(threePl)).append(',').append(csvText(order.bookedProvider()))
                .append(',').append(row.fleetCostPaise() == null || threePl == null ? "" : String.valueOf(threePl - row.fleetCostPaise())).append('\n');
        }
        return out.toString();
    }

    /** The replay report for people: settings, outcomes, money and the break-even line. */
    public static String markdown(Report report) {
        Settings s = report.settings();
        List<Row> rows = report.rows();
        List<Row> fleet = report.fleetRows();
        long count = rows.size();
        long withPrice = rows.stream().filter(row -> row.order().threePlPaise() != null).count();
        long threePlAll = rows.stream().filter(row -> row.order().threePlPaise() != null).mapToLong(row -> row.order().threePlPaise()).sum();
        long replaced = fleet.stream().filter(row -> row.order().threePlPaise() != null).mapToLong(row -> row.order().threePlPaise()).sum();
        long fleetCost = fleet.stream().filter(row -> row.order().threePlPaise() != null).mapToLong(Row::fleetCostPaise).sum();
        long hourly = Math.round(s.hourlyCostPaise() * report.paidRiderHours());
        Double uStar = report.breakEvenOrdersPerRiderHour();
        StringBuilder out = new StringBuilder();
        out.append("# Fleet replay ").append(s.from()).append(" to ").append(s.to()).append("\n\n")
            .append("Shadow replay of recorded orders through the fleet stage. Nothing was offered, pushed or booked.\n\n")
            .append("## Settings\n\n| | |\n|---|---|\n")
            .append(String.format(Locale.ROOT, "| Pilot area | %.4f, %.4f, radius %.1f km |%n", s.centerLat(), s.centerLng(), s.radiusKm()))
            .append("| Synthetic riders | ").append(s.riders()).append(", on shift ").append(hours(s.shiftHours()))
            .append(" IST, accept rate ").append(String.format(Locale.ROOT, "%.0f%%", s.acceptRate() * 100)).append(", seed ").append(s.seed()).append(" |\n")
            .append("| Rate card / dispatch policy | ").append(report.rateCardVersion()).append(" / ").append(report.policyVersion())
            .append(" (radius ").append(report.radiusM()).append(" m, overhead ").append(rupees(report.overheadPaise())).append(", cost-guard premium ")
            .append(rupees(report.premiumPaise())).append(") |\n")
            .append("| C_h (fixed cost per paid rider-hour) | ").append(rupees(s.hourlyCostPaise())).append(" |\n\n")
            .append("## Outcomes\n\n| Outcome | Orders |\n|---|---|\n");
        for (String outcome : List.of("OFFERED", "DECLINED", "COST_GUARD", "NO_RIDERS")) {
            out.append("| ").append(outcome).append(" | ").append(rows.stream().filter(row -> outcome.equals(row.outcome())).count()).append(" |\n");
        }
        out.append("| Total | ").append(count).append(" (").append(withPrice).append(" with a recorded 3PL price) |\n\n")
            .append("## Money (orders with a recorded 3PL price)\n\n| | |\n|---|---|\n")
            .append("| 3PL for every order | ").append(rupees(threePlAll)).append(" |\n")
            .append("| 3PL price of the orders riders took | ").append(rupees(replaced)).append(" |\n")
            .append("| Rider pay + overhead for those orders | ").append(rupees(fleetCost)).append(" |\n")
            .append(String.format(Locale.ROOT, "| Paid rider-hours x C_h | %.1f h x %s = %s |%n", report.paidRiderHours(), rupees(s.hourlyCostPaise()),
                rupees(hourly)))
            .append("| Saving (+) or loss (-) against 3PL only | ").append(rupees(replaced - fleetCost - hourly)).append(" |\n\n")
            .append("## Break-even\n\n")
            .append("u* = C_h / (P_eff - v), PLAN \"Setting the numbers\". P_eff is the mean 3PL price of the orders riders took, v the mean ")
            .append("rider pay plus the per-order overhead.\n\n| | |\n|---|---|\n")
            .append("| P_eff | ").append(report.pEffPaise() == null ? "no 3PL price" : rupees(Math.round(report.pEffPaise()))).append(" |\n")
            .append("| v | ").append(report.vPaise() == null ? "no fleet order" : rupees(Math.round(report.vPaise()))).append(" |\n")
            .append("| u* (break-even orders per paid rider-hour) | ").append(uStar == null ? "none: the fleet never costs less per order" : String.format(Locale.ROOT, "%.2f", uStar)).append(" |\n")
            .append(String.format(Locale.ROOT, "| u (replayed orders per paid rider-hour) | %.2f |%n", report.ordersPerRiderHour()))
            .append("| Pilot gate (u >= 1.2 x u*) | ").append(uStar == null ? "not met" : report.ordersPerRiderHour() >= 1.2 * uStar ? "met" : "not met").append(" |\n\n")
            .append("## Limits\n\n")
            .append("- Drop distance is straight line x 1.3 (Ola's fallback); pickup is straight line x the policy's detour.\n")
            .append("- Riders start at random points in the area (seeded), stay on shift for the whole hours given, take the trip's estimated minutes ")
            .append("and wait at the drop. Kitchen waiting and slot top-ups are not modelled.\n")
            .append("- The 3PL price is the booked courier's recorded quote, else the cheapest recorded quote; the cost guard uses the cheapest. ")
            .append("Failed or cancelled 3PL trips are not priced in, so P_eff is a floor.\n")
            .append("- Test mode is ignored: every kitchen in the area is replayed.\n");
        return out.toString();
    }

    static boolean onShift(Instant at, List<int[]> shiftHours) {
        ZonedDateTime local = at.atZone(IST);
        double hour = local.getHour() + local.getMinute() / 60.0;
        return shiftHours.stream().anyMatch(range -> hour >= range[0] && hour < range[1]);
    }

    static double paidRiderHours(Settings settings) {
        long days = settings.to().toEpochDay() - settings.from().toEpochDay() + 1;
        return (double) settings.riders() * days * settings.shiftHours().stream().mapToInt(range -> range[1] - range[0]).sum();
    }

    /** "11-15,19-23" as hour pairs. */
    static List<int[]> parseHours(String text) {
        List<int[]> ranges = new ArrayList<>();
        for (String part : text.split(",")) {
            String[] ends = part.trim().split("-");
            int start = Integer.parseInt(ends[0].trim());
            int end = Integer.parseInt(ends[1].trim());
            if (start < 0 || end > 24 || end <= start) {
                throw new IllegalArgumentException("Shift hours must look like 11-15,19-23");
            }
            ranges.add(new int[] {start, end});
        }
        return List.copyOf(ranges);
    }

    private static String hours(List<int[]> ranges) {
        return String.join(", ", ranges.stream().map(range -> String.format(Locale.ROOT, "%02d:00-%02d:00", range[0], range[1])).toList());
    }

    static String rupees(long paise) {
        return (paise < 0 ? "-" : "") + String.format(Locale.ROOT, "₹%,d.%02d", Math.abs(paise) / 100, Math.abs(paise) % 100);
    }

    private static Long paise(BigDecimal rupees) {
        return rupees == null ? null : rupees.movePointRight(2).setScale(0, java.math.RoundingMode.HALF_UP).longValue();
    }

    private static String blank(Object value) {
        return value == null ? "" : value.toString();
    }

    private static String csvText(String value) {
        return value == null ? "" : "\"" + value.replace("\"", "\"\"") + "\"";
    }

    private static final class Rider {
        double lat;
        double lng;
        Instant busyUntil = Instant.EPOCH;

        Rider(double lat, double lng) {
            this.lat = lat;
            this.lng = lng;
        }
    }

    private record Candidate(Rider rider, double metres) {
    }
}
