package in.craves.integration.resilience;

import in.craves.integration.delivery.borzo.BorzoApiClient.BorzoApiException;
import in.craves.integration.delivery.provider.DeliveryProviderAdapter.ProviderCreateUncertainException;
import in.craves.integration.delivery.shiprocket.ShiprocketTransport.ShiprocketApiException;
import java.io.IOException;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;

@Component
public class ProviderFailureClassifier {
    public boolean isTransient(Throwable error) {
        Throwable current = error;
        int depth = 0;
        while (current != null && depth++ < 12) {
            if (current instanceof ProviderCreateUncertainException) {
                return true;
            }
            if (current instanceof BorzoApiException borzo) {
                if (transientStatus(borzo.getProviderStatus() == null ? null : borzo.getProviderStatus().value())) {
                    return true;
                }
            }
            if (current instanceof ShiprocketApiException shiprocket) {
                if (transientStatus(shiprocket.httpStatus()) || shiprocket.isRetryableRead()) {
                    return true;
                }
            }
            if (current instanceof ResourceAccessException || current instanceof IOException) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    private static boolean transientStatus(Integer status) {
        return status != null && (status == 408 || status == 429 || status >= 500);
    }
}
