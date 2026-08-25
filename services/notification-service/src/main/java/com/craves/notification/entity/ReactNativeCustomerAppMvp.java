package com.craves.notification.entity;

import java.util.List;

public record ReactNativeCustomerAppMvp(
        String customerId,
        boolean pushEnabled,
        String deepLinkBaseUrl,
        List<String> supportedScreens,
        List<String> notificationsPreview) {
}
