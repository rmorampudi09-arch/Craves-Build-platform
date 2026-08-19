package in.craves.catalog.web;

import in.craves.catalog.exception.ApiException;
import in.craves.catalog.security.CravesPrincipal;
import in.craves.catalog.service.DiscoveryCacheService;
import in.craves.catalog.service.KitchenScheduleService;
import in.craves.catalog.web.KitchenScheduleDtos.KitchenDateOverrideRequest;
import in.craves.catalog.web.KitchenScheduleDtos.KitchenDateOverrideResponse;
import in.craves.catalog.web.KitchenScheduleDtos.KitchenScheduleResponse;
import in.craves.catalog.web.KitchenScheduleDtos.KitchenScheduleUpdateRequest;
import java.time.LocalDate;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/kitchens/me/schedule")
public class KitchenScheduleController {
    private final KitchenScheduleService kitchenScheduleService;
    private final DiscoveryCacheService discoveryCacheService;

    public KitchenScheduleController(
        KitchenScheduleService kitchenScheduleService,
        DiscoveryCacheService discoveryCacheService
    ) {
        this.kitchenScheduleService = kitchenScheduleService;
        this.discoveryCacheService = discoveryCacheService;
    }

    @GetMapping
    public KitchenScheduleResponse get(@AuthenticationPrincipal CravesPrincipal principal) {
        return kitchenScheduleService.getMySchedule(principal);
    }

    @PutMapping
    public KitchenScheduleResponse replace(
        @AuthenticationPrincipal CravesPrincipal principal,
        @RequestBody KitchenScheduleUpdateRequest request
    ) {
        rejectNullWeeklyWindows(request);
        KitchenScheduleResponse response = kitchenScheduleService.replaceMySchedule(principal, request);
        discoveryCacheService.invalidateAllDiscovery();
        return response;
    }

    @GetMapping("/overrides/{serviceDate}")
    public KitchenDateOverrideResponse getOverride(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable LocalDate serviceDate
    ) {
        return kitchenScheduleService.getMyDateOverride(principal, serviceDate);
    }

    @PutMapping("/overrides/{serviceDate}")
    public KitchenDateOverrideResponse putOverride(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable LocalDate serviceDate,
        @RequestBody KitchenDateOverrideRequest request
    ) {
        rejectNullOverrideWindows(request);
        KitchenDateOverrideResponse response = kitchenScheduleService.putMyDateOverride(principal, serviceDate, request);
        discoveryCacheService.invalidateAllDiscovery();
        return response;
    }

    @DeleteMapping("/overrides/{serviceDate}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteOverride(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable LocalDate serviceDate
    ) {
        kitchenScheduleService.deleteMyDateOverride(principal, serviceDate);
        discoveryCacheService.invalidateAllDiscovery();
    }

    private static void rejectNullWeeklyWindows(KitchenScheduleUpdateRequest request) {
        if (request != null
            && request.weeklyWindows() != null
            && request.weeklyWindows().stream().anyMatch(java.util.Objects::isNull)) {
            throw ApiException.badRequest(
                "INVALID_SERVICE_WINDOW",
                "weeklyWindows cannot contain null entries"
            );
        }
    }

    private static void rejectNullOverrideWindows(KitchenDateOverrideRequest request) {
        if (request != null
            && request.windows() != null
            && request.windows().stream().anyMatch(java.util.Objects::isNull)) {
            throw ApiException.badRequest(
                "INVALID_SERVICE_WINDOW",
                "windows cannot contain null entries"
            );
        }
    }
}
