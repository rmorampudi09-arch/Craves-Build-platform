package com.craves.catalog.controller;

import com.craves.catalog.dto.SmartFiltersDietaryDiscoveryRequest;
import com.craves.catalog.dto.SmartFiltersDietaryDiscoveryResponse;
import com.craves.catalog.service.SmartFiltersDietaryDiscoveryService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/catalog")
public class SmartFiltersDietaryDiscoveryController {

    private final SmartFiltersDietaryDiscoveryService service;

    public SmartFiltersDietaryDiscoveryController(SmartFiltersDietaryDiscoveryService service) {
        this.service = service;
    }

    @GetMapping("/filters")
    public ResponseEntity<Map<String, List<String>>> filters() {
        return ResponseEntity.ok(service.availableFilters());
    }

    @GetMapping("/discover")
    public ResponseEntity<SmartFiltersDietaryDiscoveryResponse> discover(
            @RequestParam(required = false, defaultValue = "false") boolean veg,
            @RequestParam(required = false, defaultValue = "false") boolean healthy,
            @RequestParam(required = false, defaultValue = "0") int maxDeliveryMins,
            @RequestParam(required = false, defaultValue = "0") int maxPrice,
            @RequestParam(required = false) String protein,
            @RequestParam(required = false) String occasion) {
        return ResponseEntity.ok(service.discover(new SmartFiltersDietaryDiscoveryRequest(veg, healthy, maxDeliveryMins, maxPrice, protein, occasion, null)));
    }

    @GetMapping("/collections/dietary")
    public ResponseEntity<List<String>> dietaryCollections() {
        return ResponseEntity.ok(service.dietaryCollections());
    }

    @PostMapping("/preferences/dietary")
    public ResponseEntity<Void> savePreferences(@Valid @RequestBody SmartFiltersDietaryDiscoveryRequest request) {
        service.savePreference(request.customerId(), request);
        return ResponseEntity.accepted().build();
    }
}
