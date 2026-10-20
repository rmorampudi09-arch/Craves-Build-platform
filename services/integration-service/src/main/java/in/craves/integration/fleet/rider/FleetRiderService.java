package in.craves.integration.fleet.rider;

import in.craves.integration.fleet.FleetApiException;
import in.craves.integration.fleet.FleetPolicyStore;
import in.craves.integration.fleet.FleetPolicyStore.RateCard;
import in.craves.integration.fleet.FleetProperties;
import in.craves.integration.fleet.rider.FleetRiderModels.LabelValue;
import in.craves.integration.fleet.rider.FleetRiderModels.Terms;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The rider API (contracts/openapi/rider-v1.yaml). Off unless CRAVES_FLEET_RIDER_API_ENABLED. */
@Service
@ConditionalOnProperty(name = {"craves.fleet.enabled", "craves.fleet.rider-api-enabled"}, havingValue = "true")
public class FleetRiderService {
    private final JdbcTemplate jdbc;
    private final FleetPolicyStore policies;
    private final FleetProperties properties;

    public FleetRiderService(JdbcTemplate jdbc, FleetPolicyStore policies, FleetProperties properties) {
        this.jdbc = jdbc;
        this.policies = policies;
        this.properties = properties;
    }

    @Transactional(readOnly = true)
    public Terms terms(UUID identityId) {
        return terms(currentRateCard(), rider(identityId).language(), properties.supportPhone());
    }

    /** Only the version in force can be accepted; anything else means the terms changed while the rider read them. */
    @Transactional
    public void acceptTerms(UUID identityId, String version) {
        Rider rider = rider(identityId);
        if (version == null || !version.equals(currentRateCard().version())) {
            throw FleetApiException.conflict("TERMS_CHANGED", "The terms changed. Please read the new version.");
        }
        jdbc.update("INSERT INTO fleet_schema.rider_terms_acceptance (rider_id, version, language) VALUES (?, ?, ?) "
            + "ON CONFLICT (rider_id, version) DO NOTHING", rider.id(), version, rider.language());
    }

    /** The rider linked to this signed-in identity. */
    Rider rider(UUID identityId) {
        return jdbc.query("SELECT id, name, phone, language, status FROM fleet_schema.rider WHERE identity_id = ?",
                (row, n) -> new Rider(row.getObject("id", UUID.class), row.getString("name"), row.getString("phone"),
                    row.getString("language"), row.getString("status")), identityId)
            .stream().findFirst().orElseThrow(() -> new FleetApiException(403, "NOT_A_RIDER", "This account is not a Craves rider."));
    }

    RateCard currentRateCard() {
        return policies.currentRateCard()
            .orElseThrow(() -> new FleetApiException(503, "TERMS_UNAVAILABLE", "The terms are not available yet. Call rider support."));
    }

    /**
     * Rate card lines come from the stored values, so the terms always show what pay uses. The summary of changes
     * is stored per language; te and hi fall back to English, and the labels stay English until they are translated.
     */
    static Terms terms(RateCard card, String language, String supportPhone) {
        String baseKm = km(card.baseDropM());
        List<LabelValue> rateCard = List.of(
            new LabelValue("Base pay, first " + baseKm + " km of the drop", rupees(card.basePaise())),
            new LabelValue("Each drop km after " + baseKm + " km", rupees(card.dropPerKmPaise())),
            new LabelValue(card.pickupFreeM() > 0 ? "Ride to the kitchen, each km after the first " + km(card.pickupFreeM()) + " km"
                : "Ride to the kitchen, each km", rupees(card.pickupPerKmPaise())),
            new LabelValue("Waiting at the kitchen, after " + card.waitFreeMinutes() + " free minutes",
                rupees(card.waitPerMinutePaise()) + " a minute"),
            new LabelValue("Guaranteed minimum in a booked slot", rupees(card.slotGuaranteePerHourPaise()) + " an hour"),
            new LabelValue("Declining or missing an offer", "Free"));
        List<LabelValue> grievance = List.of(
            new LabelValue("Craves rider support, every slot", supportPhone == null ? "" : supportPhone),
            new LabelValue("Telangana Grievance Redressal Officer", "Link added when the state portal opens"));
        List<String> summary = card.summaryOfChanges().getOrDefault(language, card.summaryOfChanges().getOrDefault("en", List.of()));
        return new Terms(card.version(), card.effectiveFrom(), summary, rateCard, grievance, card.fullTextUrl(), card.draft());
    }

    /** 4000 is "₹40"; 150 is "₹1.50". */
    static String rupees(long paise) {
        return paise % 100 == 0 ? "₹" + paise / 100 : "₹" + BigDecimal.valueOf(paise, 2).toPlainString();
    }

    /** 2000 is "2"; 1500 is "1.5". */
    static String km(int metres) {
        return BigDecimal.valueOf(metres, 3).stripTrailingZeros().toPlainString();
    }

    record Rider(UUID id, String name, String phone, String language, String status) {
    }
}
