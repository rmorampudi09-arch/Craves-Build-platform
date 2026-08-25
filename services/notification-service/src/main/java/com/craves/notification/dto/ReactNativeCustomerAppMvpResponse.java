package com.craves.notification.dto;

import java.util.List;

public record ReactNativeCustomerAppMvpResponse(
        String customerId,
        boolean pushEnabled,
        String deepLinkBaseUrl,
        List<String> supportedScreens,
        List<String> notificationsPreview) {
}
