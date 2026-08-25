package in.craves.order.controller;

import in.craves.order.dto.ScheduledOrderRequest;
import in.craves.order.dto.ScheduledOrderResponse;
import in.craves.order.service.ScheduledOrderService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/orders/scheduled")
public class ScheduledOrderController {
    private final ScheduledOrderService service;
    public ScheduledOrderController(ScheduledOrderService service) { this.service = service; }
    @PostMapping
    public ResponseEntity<ScheduledOrderResponse> create(@Valid @RequestBody ScheduledOrderRequest request) {
        return ResponseEntity.ok(service.create(request));
    }
    @GetMapping
    public ResponseEntity<List<ScheduledOrderResponse>> list(@RequestParam UUID customerId) {
        return ResponseEntity.ok(service.list(customerId));
    }
}
