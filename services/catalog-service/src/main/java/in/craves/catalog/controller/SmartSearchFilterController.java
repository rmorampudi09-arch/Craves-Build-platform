package in.craves.catalog.controller;

import in.craves.catalog.dto.SmartSearchFilterRequest;
import in.craves.catalog.dto.SmartSearchFilterResponse;
import in.craves.catalog.service.SmartSearchFilterService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/catalog/search")
public class SmartSearchFilterController {

    private final SmartSearchFilterService service;

    public SmartSearchFilterController(SmartSearchFilterService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<SmartSearchFilterResponse> search(
        @RequestParam(required = false) String q,
        @RequestParam(required = false) Integer maxPrice,
        @RequestParam(required = false) Integer maxDeliveryMinutes
    ) {
        SmartSearchFilterRequest request = new SmartSearchFilterRequest(q, null, null, null, maxPrice, maxDeliveryMinutes, "ETA");
        return ResponseEntity.ok(service.search(request));
    }
}
