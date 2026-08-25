package com.craves.notification.dto;

import jakarta.validation.constraints.NotBlank;

public record ReactNativeCustomerAppMvpRequest(
        @NotBlank String customerId,
        @NotBlank String pushToken) {
}
