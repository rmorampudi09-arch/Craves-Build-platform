package in.craves.catalog.web;

import in.craves.catalog.security.CravesPrincipal;
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

    public KitchenScheduleController(KitchenScheduleService kitchenScheduleService) {
        this.kitchenScheduleService = kitchenScheduleService;
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
        return kitchenScheduleService.replaceMySchedule(principal, request);
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
        return kitchenScheduleService.putMyDateOverride(principal, serviceDate, request);
    }

    @DeleteMapping("/overrides/{serviceDate}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteOverride(
        @AuthenticationPrincipal CravesPrincipal principal,
        @PathVariable LocalDate serviceDate
    ) {
        kitchenScheduleService.deleteMyDateOverride(principal, serviceDate);
    }
}
