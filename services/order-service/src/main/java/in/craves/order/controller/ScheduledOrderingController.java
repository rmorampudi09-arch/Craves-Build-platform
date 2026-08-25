package in.craves.order.controller;

import in.craves.order.dto.ScheduledOrderingRequest;
import in.craves.order.dto.ScheduledOrderingResponse;
import in.craves.order.service.ScheduledOrderingService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/orders/scheduled")
@Validated
public class ScheduledOrderingController {

    private final ScheduledOrderingService scheduledOrderingService;

    public ScheduledOrderingController(ScheduledOrderingService scheduledOrderingService) {
        this.scheduledOrderingService = scheduledOrderingService;
    }

    @GetMapping("/slots")
    public List<String> getAvailableSlots(@RequestParam("chefId") Long chefId,
                                          @RequestParam("date") String date,
                                          @RequestParam("zone") String zone) {
        return scheduledOrderingService.getAvailableSlots(chefId, date, zone);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ScheduledOrderingResponse createScheduledOrder(@RequestHeader("X-Customer-Id") Long customerId,
                                                          @Valid @RequestBody ScheduledOrderingRequest request) {
        return scheduledOrderingService.createScheduledOrder(customerId, request);
    }

    @GetMapping
    public List<ScheduledOrderingResponse> listScheduledOrders(@RequestHeader("X-Customer-Id") Long customerId) {
        return scheduledOrderingService.listScheduledOrders(customerId);
    }

    @PatchMapping("/{scheduledOrderId}")
    public ScheduledOrderingResponse updateScheduledOrder(@RequestHeader("X-Customer-Id") Long customerId,
                                                          @PathVariable Long scheduledOrderId,
                                                          @Valid @RequestBody ScheduledOrderingRequest request) {
        return scheduledOrderingService.updateScheduledOrder(customerId, scheduledOrderId, request);
    }

    @DeleteMapping("/{scheduledOrderId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancelScheduledOrder(@RequestHeader("X-Customer-Id") Long customerId,
                                     @PathVariable Long scheduledOrderId) {
        scheduledOrderingService.cancelScheduledOrder(customerId, scheduledOrderId);
    }
}
