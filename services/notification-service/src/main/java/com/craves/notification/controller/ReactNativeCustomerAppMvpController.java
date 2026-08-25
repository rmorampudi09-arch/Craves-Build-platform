package com.craves.notification.controller;

import com.craves.notification.dto.ReactNativeCustomerAppMvpRequest;
import com.craves.notification.dto.ReactNativeCustomerAppMvpResponse;
import com.craves.notification.service.ReactNativeCustomerAppMvpService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/mobile/customer-app")
public class ReactNativeCustomerAppMvpController {

    private final ReactNativeCustomerAppMvpService service;

    public ReactNativeCustomerAppMvpController(ReactNativeCustomerAppMvpService service) {
        this.service = service;
    }

    @GetMapping("/bootstrap")
    public ResponseEntity<ReactNativeCustomerAppMvpResponse> bootstrap(@RequestParam String customerId) {
        return ResponseEntity.ok(service.bootstrap(customerId));
    }

    @PostMapping("/push-token")
    public ResponseEntity<ReactNativeCustomerAppMvpResponse> registerPush(@Valid @RequestBody ReactNativeCustomerAppMvpRequest request) {
        return ResponseEntity.ok(service.registerPush(request));
    }
}
