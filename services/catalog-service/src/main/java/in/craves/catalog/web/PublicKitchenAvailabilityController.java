package in.craves.catalog.web;

import in.craves.catalog.service.KitchenScheduleService;
import in.craves.catalog.web.KitchenScheduleDtos.KitchenAvailabilityResponse;
import java.time.Instant;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/catalog/kitchens")
public class PublicKitchenAvailabilityController {
    private final KitchenScheduleService kitchenScheduleService;

    public PublicKitchenAvailabilityController(KitchenScheduleService kitchenScheduleService) {
        this.kitchenScheduleService = kitchenScheduleService;
    }

    @GetMapping("/{kitchenId}/availability")
    public KitchenAvailabilityResponse availability(
        @PathVariable UUID kitchenId,
        @RequestParam(required = false)
        @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
        Instant at
    ) {
        return kitchenScheduleService.availability(kitchenId, at);
    }
}
