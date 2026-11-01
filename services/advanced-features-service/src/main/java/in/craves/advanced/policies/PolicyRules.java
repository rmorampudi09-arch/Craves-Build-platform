package in.craves.advanced.policies;

import in.craves.advanced.platform.web.ApiProblem;
import in.craves.advanced.policies.PolicyDtos.CancelStage;
import in.craves.advanced.policies.PolicyDtos.CancellationCheck;
import in.craves.advanced.policies.PolicyDtos.CancellationPolicy;
import in.craves.advanced.policies.PolicyDtos.CancellationRule;
import in.craves.advanced.policies.PolicyDtos.CancellationVerdict;
import in.craves.advanced.policies.PolicyDtos.NotificationCap;
import in.craves.advanced.policies.PolicyDtos.NotificationCheck;
import in.craves.advanced.policies.PolicyDtos.NotificationFrequencyPolicy;
import in.craves.advanced.policies.PolicyDtos.NotificationVerdict;
import in.craves.advanced.policies.PolicyDtos.ProviderCandidate;
import in.craves.advanced.policies.PolicyDtos.ProviderRankingPolicy;
import in.craves.advanced.policies.PolicyDtos.ProviderRankingVerdict;
import in.craves.advanced.policies.PolicyDtos.RankedProvider;
import in.craves.advanced.policies.PolicyDtos.ServiceabilityCheck;
import in.craves.advanced.policies.PolicyDtos.ServiceabilityPolicy;
import in.craves.advanced.policies.PolicyDtos.ServiceabilityVerdict;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Validation of staff-entered documents (every problem at once, as 400 INVALID_POLICY) and the pure evaluators. */
final class PolicyRules {
    static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");
    private static final double EARTH_RADIUS_METERS = 6_371_008.8;

    private PolicyRules() { }

    // ----- validation (returns the normalized document) -----

    static ServiceabilityPolicy check(ServiceabilityPolicy p) {
        List<String> problems = new ArrayList<>();
        if (p.maxDistanceMeters() == null || p.maxDistanceMeters() < 1 || p.maxDistanceMeters() > 100_000) problems.add("maxDistanceMeters must be 1 to 100000");
        Map<String, Integer> cities = new LinkedHashMap<>();
        if (p.cityMaxDistanceMeters() != null) {
            if (p.cityMaxDistanceMeters().size() > 500) problems.add("at most 500 city limits");
            p.cityMaxDistanceMeters().forEach((city, limit) -> {
                String key = city(city);
                if (key == null) problems.add("city names must be 1 to 60 characters");
                else if (limit == null || limit < 1 || limit > 100_000) problems.add("city limit for " + key + " must be 1 to 100000");
                else if (cities.put(key, limit) != null) problems.add("city " + key + " is listed twice");
            });
        }
        List<String> paused = new ArrayList<>();
        for (String city : p.pausedCities() == null ? List.<String>of() : p.pausedCities()) {
            String key = city(city);
            if (key == null) problems.add("paused city names must be 1 to 60 characters");
            else if (!paused.contains(key)) paused.add(key);
        }
        if (paused.size() > 500) problems.add("at most 500 paused cities");
        fail(problems);
        return new ServiceabilityPolicy(p.maxDistanceMeters(), cities, paused);
    }

    static CancellationPolicy check(CancellationPolicy p) {
        List<String> problems = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        List<CancellationRule> rules = p.rules() == null ? List.of() : p.rules();
        if (rules.isEmpty()) problems.add("give at least one rule");
        for (CancellationRule r : rules) {
            if (r == null || r.stage() == null || r.cancelledBy() == null || r.allowed() == null) {
                problems.add("every rule needs stage, cancelledBy and allowed");
                continue;
            }
            if (!seen.add(r.stage() + "/" + r.cancelledBy())) problems.add("more than one rule for " + r.stage() + " by " + r.cancelledBy());
            if (r.allowed() && (r.foodRefundPercent() == null || r.foodRefundPercent() < 0 || r.foodRefundPercent() > 100
                    || r.deliveryFeeRefunded() == null || r.platformFeeRefunded() == null)) {
                problems.add("an allowed rule (" + r.stage() + " by " + r.cancelledBy() + ") needs foodRefundPercent 0-100, deliveryFeeRefunded and platformFeeRefunded");
            }
        }
        fail(problems);
        return new CancellationPolicy(rules.stream().map(r -> r.allowed() ? r : new CancellationRule(r.stage(), r.cancelledBy(), false, null, null, null)).toList());
    }

    static ProviderRankingPolicy check(ProviderRankingPolicy p) {
        List<String> problems = new ArrayList<>();
        for (Integer w : new Integer[] {p.priceWeight(), p.etaWeight(), p.reliabilityWeight()}) {
            if (w == null || w < 0 || w > 100) problems.add("priceWeight, etaWeight and reliabilityWeight must each be 0 to 100");
        }
        if (problems.isEmpty() && p.priceWeight() + p.etaWeight() + p.reliabilityWeight() == 0) problems.add("at least one weight must be above 0");
        List<String> disabled = new ArrayList<>();
        for (String provider : p.disabledProviders() == null ? List.<String>of() : p.disabledProviders()) {
            if (provider == null || !provider.matches("[A-Z0-9_]{2,30}")) problems.add("provider codes are 2-30 of A-Z, 0-9, _");
            else if (!disabled.contains(provider)) disabled.add(provider);
        }
        if (disabled.size() > 50) problems.add("at most 50 disabled providers");
        if (p.maxEtaMinutes() != null && (p.maxEtaMinutes() < 1 || p.maxEtaMinutes() > 1440)) problems.add("maxEtaMinutes must be 1 to 1440");
        fail(List.copyOf(new java.util.LinkedHashSet<>(problems)));
        return new ProviderRankingPolicy(p.priceWeight(), p.etaWeight(), p.reliabilityWeight(), disabled, p.maxEtaMinutes());
    }

    static NotificationFrequencyPolicy check(NotificationFrequencyPolicy p) {
        List<String> problems = new ArrayList<>();
        Map<String, NotificationCap> caps = p.categories() == null ? Map.of() : p.categories();
        if (caps.isEmpty()) problems.add("give at least one category");
        if (caps.size() > 100) problems.add("at most 100 categories");
        caps.forEach((category, cap) -> {
            if (!category.matches("[A-Z0-9_]{2,40}")) problems.add("category codes are 2-40 of A-Z, 0-9, _");
            if (cap == null || cap.maxPerDay() == null || cap.maxPerDay() < 0 || cap.maxPerDay() > 1000 || cap.minGapMinutes() == null
                    || cap.minGapMinutes() < 0 || cap.minGapMinutes() > 1440) {
                problems.add("category " + category + " needs maxPerDay 0-1000 and minGapMinutes 0-1440");
            }
        });
        boolean quiet = p.quietStart() != null || p.quietEnd() != null;
        if (quiet) {
            LocalTime start = time(p.quietStart());
            LocalTime end = time(p.quietEnd());
            if (start == null || end == null) problems.add("quietStart and quietEnd are both needed, as HH:mm India time");
            else if (start.equals(end)) problems.add("quietStart and quietEnd must differ");
        }
        List<String> exempt = new ArrayList<>();
        for (String category : p.quietExemptCategories() == null ? List.<String>of() : p.quietExemptCategories()) {
            if (category == null || !caps.containsKey(category)) problems.add("quiet-hour exemptions must name configured categories");
            else if (!exempt.contains(category)) exempt.add(category);
        }
        fail(List.copyOf(new java.util.LinkedHashSet<>(problems)));
        return new NotificationFrequencyPolicy(new LinkedHashMap<>(caps), quiet ? time(p.quietStart()).toString() : null,
                quiet ? time(p.quietEnd()).toString() : null, exempt);
    }

    // ----- evaluators -----

    static ServiceabilityVerdict serviceability(ServiceabilityPolicy p, int version, ServiceabilityCheck c) {
        long distance = Math.round(haversine(c.kitchenLatitude(), c.kitchenLongitude(), c.customerLatitude(), c.customerLongitude()));
        String city = city(c.city());
        int limit = city != null && p.cityMaxDistanceMeters().containsKey(city) ? p.cityMaxDistanceMeters().get(city) : p.maxDistanceMeters();
        if (city != null && p.pausedCities().contains(city)) return new ServiceabilityVerdict(false, "CITY_PAUSED", distance, limit, version);
        return new ServiceabilityVerdict(distance <= limit, distance <= limit ? "OK" : "TOO_FAR", distance, limit, version);
    }

    /** Order service status to the stage cancellation rules are written for; anything else cannot be cancelled. */
    static CancelStage stage(String status) {
        return switch (status) {
            case "PAID", "CHEF_ACCEPTANCE_PENDING" -> CancelStage.PLACED;
            case "CHEF_ACCEPTED", "PREPARING" -> CancelStage.COOKING;
            case "READY_FOR_PICKUP" -> CancelStage.READY;
            case "OUT_FOR_DELIVERY" -> CancelStage.ON_THE_WAY;
            default -> null;
        };
    }

    static CancellationVerdict cancellation(CancellationPolicy p, int version, CancellationCheck c) {
        CancelStage stage = stage(c.orderStatus());
        if (stage == null) return new CancellationVerdict(false, "NOT_CANCELLABLE", null, 0, 0, 0, 0, version);
        CancellationRule rule = p.rules().stream().filter(r -> r.stage() == stage && r.cancelledBy() == c.cancelledBy()).findFirst().orElse(null);
        if (rule == null) return new CancellationVerdict(false, "NO_RULE", stage, 0, 0, 0, 0, version);
        if (!rule.allowed()) return new CancellationVerdict(false, "NOT_ALLOWED", stage, 0, 0, 0, 0, version);
        long food = Math.multiplyExact(c.foodPaise(), (long) rule.foodRefundPercent()) / 100; // rounds down: never more than the rule says
        long delivery = rule.deliveryFeeRefunded() ? c.deliveryFeePaise() : 0;
        long platform = rule.platformFeeRefunded() ? c.platformFeePaise() : 0;
        // Never more than was paid, and the parts always add up to the total: fees give way first, then food.
        long excess = Math.max(0, food + delivery + platform - c.paidPaise());
        long cut = Math.min(platform, excess);
        platform -= cut;
        excess -= cut;
        cut = Math.min(delivery, excess);
        delivery -= cut;
        excess -= cut;
        food -= excess;
        return new CancellationVerdict(true, "OK", stage, food, delivery, platform, food + delivery + platform, version);
    }

    static ProviderRankingVerdict rank(ProviderRankingPolicy p, int version, List<ProviderCandidate> candidates) {
        List<RankedProvider> excluded = new ArrayList<>();
        List<ProviderCandidate> eligible = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (ProviderCandidate c : candidates) {
            if (!seen.add(c.provider())) continue; // the first quote per provider counts
            if (p.disabledProviders().contains(c.provider())) excluded.add(new RankedProvider(c.provider(), false, "DISABLED", 0));
            else if (p.maxEtaMinutes() != null && c.etaMinutes() > p.maxEtaMinutes()) excluded.add(new RankedProvider(c.provider(), false, "TOO_SLOW", 0));
            else eligible.add(c);
        }
        long minPrice = eligible.stream().mapToLong(ProviderCandidate::pricePaise).min().orElse(0);
        long maxPrice = eligible.stream().mapToLong(ProviderCandidate::pricePaise).max().orElse(0);
        int minEta = eligible.stream().mapToInt(ProviderCandidate::etaMinutes).min().orElse(0);
        int maxEta = eligible.stream().mapToInt(ProviderCandidate::etaMinutes).max().orElse(0);
        int weights = p.priceWeight() + p.etaWeight() + p.reliabilityWeight();
        List<RankedProvider> ranked = new ArrayList<>(eligible.stream().map(c -> {
            double price = maxPrice == minPrice ? 1 : (double) (maxPrice - c.pricePaise()) / (maxPrice - minPrice);
            double eta = maxEta == minEta ? 1 : (double) (maxEta - c.etaMinutes()) / (maxEta - minEta);
            double reliability = c.successRate() == null ? 0 : c.successRate(); // unknown reliability counts as the worst
            double score = (p.priceWeight() * price + p.etaWeight() * eta + p.reliabilityWeight() * reliability) / weights;
            return new RankedProvider(c.provider(), true, "OK", (int) Math.round(score * 1000));
        }).sorted(Comparator.comparingInt(RankedProvider::score).reversed().thenComparing(RankedProvider::provider)).toList());
        ranked.addAll(excluded);
        return new ProviderRankingVerdict(List.copyOf(ranked), version);
    }

    static NotificationVerdict notification(NotificationFrequencyPolicy p, int version, NotificationCheck c, Instant now) {
        Instant at = c.at() == null ? now : c.at();
        NotificationCap cap = p.categories().get(c.category());
        if (cap == null) return new NotificationVerdict(false, "NOT_CONFIGURED", null, version);
        // A send dated after `at` (a caller clock running ahead) counts as sent at `at`, so it is never ignored.
        List<Instant> recent = c.sentAt().stream().map(t -> t.isAfter(at) ? at : t).filter(t -> t.isAfter(at.minus(Duration.ofDays(1))))
                .sorted(Comparator.reverseOrder()).toList();
        String reason = null;
        Instant next = at;
        if (recent.size() >= cap.maxPerDay()) {
            reason = "DAILY_LIMIT";
            // The send that must age out of the 24-hour window before one more fits; with maxPerDay 0 nothing ever fits.
            next = cap.maxPerDay() == 0 ? null : max(next, recent.get(cap.maxPerDay() - 1).plus(Duration.ofDays(1)));
        }
        if (!recent.isEmpty() && cap.minGapMinutes() > 0 && recent.get(0).plus(Duration.ofMinutes(cap.minGapMinutes())).isAfter(at)) {
            if (reason == null) reason = "TOO_SOON";
            if (next != null) next = max(next, recent.get(0).plus(Duration.ofMinutes(cap.minGapMinutes())));
        }
        boolean quietApplies = p.quietStart() != null && !p.quietExemptCategories().contains(c.category());
        if (quietApplies && quiet(p, at)) {
            if (reason == null) reason = "QUIET_HOURS";
            if (next != null) next = max(next, quietEnds(p, at));
        }
        if (reason != null && next != null && quietApplies && quiet(p, next)) next = quietEnds(p, next); // never suggest a time inside quiet hours
        return reason == null ? new NotificationVerdict(true, "OK", at, version) : new NotificationVerdict(false, reason, next, version);
    }

    // ----- helpers -----

    static boolean quiet(NotificationFrequencyPolicy p, Instant at) {
        LocalTime t = at.atZone(INDIA).toLocalTime();
        LocalTime start = LocalTime.parse(p.quietStart());
        LocalTime end = LocalTime.parse(p.quietEnd());
        return start.isBefore(end) ? !t.isBefore(start) && t.isBefore(end) : !t.isBefore(start) || t.isBefore(end);
    }

    /** The next quiet-hours end after {@code at} (India time). */
    static Instant quietEnds(NotificationFrequencyPolicy p, Instant at) {
        ZonedDateTime local = at.atZone(INDIA);
        ZonedDateTime end = local.with(LocalTime.parse(p.quietEnd()));
        return (end.isAfter(local) ? end : end.plusDays(1)).toInstant();
    }

    static double haversine(double lat1, double lon1, double lat2, double lon2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
    }

    private static Instant max(Instant a, Instant b) {
        return a.isAfter(b) ? a : b;
    }

    private static String city(String city) {
        if (city == null) return null;
        String key = city.strip().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
        return key.isEmpty() || key.length() > 60 || key.chars().anyMatch(Character::isISOControl) ? null : key;
    }

    private static LocalTime time(String value) {
        try {
            return value != null && value.matches("\\d{2}:\\d{2}") ? LocalTime.parse(value) : null;
        } catch (DateTimeParseException ex) {
            return null;
        }
    }

    private static void fail(List<String> problems) {
        if (!problems.isEmpty()) throw new ApiProblem(400, "INVALID_POLICY", "The policy cannot be saved", problems);
    }
}
