package in.craves.integration.fleet.rider;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;

/** Shapes of contracts/openapi/rider-v1.yaml. Optional fields are left out when absent. */
public final class FleetRiderModels {
    private FleetRiderModels() {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Terms(String version, Instant effectiveFrom, List<String> summaryOfChanges, List<LabelValue> rateCardLines,
                        List<LabelValue> grievanceLines, String fullTextUrl, boolean draft) {
    }

    public record LabelValue(String label, String value) {
    }

    public record AcceptTerms(String version) {
    }
}
