package com.craves.notification.service;

import com.craves.notification.dto.ReactNativeCustomerAppMvpRequest;
import com.craves.notification.dto.ReactNativeCustomerAppMvpResponse;
import com.craves.notification.entity.ReactNativeCustomerAppMvp;
import com.craves.notification.repository.ReactNativeCustomerAppMvpRepository;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class ReactNativeCustomerAppMvpService {

    private final ReactNativeCustomerAppMvpRepository repository;

    public ReactNativeCustomerAppMvpService(ReactNativeCustomerAppMvpRepository repository) {
        this.repository = repository;
    }

    public ReactNativeCustomerAppMvpResponse bootstrap(String customerId) {
        ReactNativeCustomerAppMvp state = repository.findByCustomerId(customerId);
        return map(state);
    }

    public ReactNativeCustomerAppMvpResponse registerPush(ReactNativeCustomerAppMvpRequest request) {
        repository.registerPush(request.customerId(), request.pushToken());
        return bootstrap(request.customerId());
    }

    private ReactNativeCustomerAppMvpResponse map(ReactNativeCustomerAppMvp state) {
        return new ReactNativeCustomerAppMvpResponse(
                state.customerId(),
                state.pushEnabled(),
                state.deepLinkBaseUrl(),
                state.supportedScreens(),
                state.notificationsPreview());
    }
}
