package in.craves.userchef.web;

import in.craves.userchef.location.OlaMapsClient.RoadDistance;
import in.craves.userchef.location.RoadDistanceService;
import in.craves.userchef.security.InternalRequestAuthorizer;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.UUID;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Integration-service asks here for the rider drop distance (PLAN F6). Ola failures answer 200 with source FALLBACK. */
@RestController
@RequestMapping("/internal/v1/maps")
public class InternalRoadDistanceController {
    private static final String INTERNAL_HEADER = "X-Craves-Internal-Secret";

    private final RoadDistanceService service;
    private final InternalRequestAuthorizer authorizer;

    public InternalRoadDistanceController(RoadDistanceService service, InternalRequestAuthorizer authorizer) {
        this.service = service;
        this.authorizer = authorizer;
    }

    @PostMapping("/road-distance")
    public RoadDistance roadDistance(
        @RequestHeader(name = INTERNAL_HEADER, required = false) String suppliedSecret,
        @Valid @RequestBody RoadDistanceRequest request
    ) {
        authorizer.requireValid(suppliedSecret);
        return service.distance(
            request.kitchenId(), request.addressId(),
            request.from().lat(), request.from().lng(), request.to().lat(), request.to().lng()
        );
    }

    public record RoadDistanceRequest(UUID kitchenId, UUID addressId, @NotNull @Valid Point from, @NotNull @Valid Point to) {
    }

    public record Point(
        @NotNull @DecimalMin("-90.0") @DecimalMax("90.0") BigDecimal lat,
        @NotNull @DecimalMin("-180.0") @DecimalMax("180.0") BigDecimal lng
    ) {
    }
}
