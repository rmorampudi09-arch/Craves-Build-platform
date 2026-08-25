package com.craves.order.controller;

import com.craves.order.dto.ScheduledOrderRequest;
import com.craves.order.dto.ScheduledOrderResponse;
import com.craves.order.dto.TimeSlotResponse;
import com.craves.order.service.ScheduledOrderService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@Validated
public class ScheduledOrderController {

    private final ScheduledOrderService scheduledOrderService;

    public ScheduledOrderController(ScheduledOrderService scheduledOrderService) {
        this.scheduledOrderService = scheduledOrderService;
    }

    @GetMapping("/orders/slots")
    public ResponseEntity<List<TimeSlotResponse>> getSlots(
            @RequestHeader(name = "X-User-Id", required = false) String customerId,
            @RequestParam @NotBlank String chefId,
            @RequestParam @NotNull @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam @NotBlank String addressId) {
        return ResponseEntity.ok(scheduledOrderService.getAvailableSlots(customerId, chefId, date, addressId));
    }

    @PostMapping("/checkout/scheduled")
    public ResponseEntity<ScheduledOrderResponse> scheduleCheckout(
            @RequestHeader("X-User-Id") String customerId,
            @Valid @RequestBody ScheduledOrderRequest request) {
        return ResponseEntity.ok(scheduledOrderService.scheduleCheckout(customerId, request));
    }
}
