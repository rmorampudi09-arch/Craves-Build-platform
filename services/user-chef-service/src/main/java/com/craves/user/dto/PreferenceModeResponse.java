package com.craves.user.dto;

import java.time.LocalDateTime;

public record PreferenceModeResponse(String customerId, String discoveryMode, boolean vegOnly, boolean healthyOnly, String spiceTolerance, LocalDateTime updatedAt) {}
