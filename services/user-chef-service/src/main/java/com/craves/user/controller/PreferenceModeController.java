package com.craves.user.controller;

import com.craves.user.dto.PreferenceModeRequest;
import com.craves.user.dto.PreferenceModeResponse;
import com.craves.user.service.PreferenceModeService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users/me/preferences")
public class PreferenceModeController {
    private final PreferenceModeService preferenceModeService;
    public PreferenceModeController(PreferenceModeService preferenceModeService) {
        this.preferenceModeService = preferenceModeService;
    }
    @GetMapping
    public ResponseEntity<PreferenceModeResponse> get(@RequestHeader("X-User-Id") String customerId) {
        return ResponseEntity.ok(preferenceModeService.get(customerId));
    }
    @PutMapping
    public ResponseEntity<PreferenceModeResponse> put(@RequestHeader("X-User-Id") String customerId,
                                                      @Valid @RequestBody PreferenceModeRequest request) {
        return ResponseEntity.ok(preferenceModeService.upsert(customerId, request));
    }
}
