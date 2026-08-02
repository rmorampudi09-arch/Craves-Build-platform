package in.craves.integration.payment;

import in.craves.integration.config.PaymentProviderProperties;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class CashfreePaymentExecutionInterceptor implements HandlerInterceptor {
    private final PaymentProviderProperties properties;

    public CashfreePaymentExecutionInterceptor(PaymentProviderProperties properties) {
        this.properties = properties;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!(handler instanceof HandlerMethod) || properties.paymentExecutionAllowed()) {
            return true;
        }
        String method = request.getMethod();
        String uri = request.getRequestURI();
        boolean createsCheckoutOrder = "POST".equalsIgnoreCase(method)
            && "/api/v1/payments/orders".equals(uri);
        boolean verifiesCheckoutOrder = "POST".equalsIgnoreCase(method)
            && uri.matches("/api/v1/payments/orders/[0-9a-fA-F-]{36}/verify");
        boolean createsSubscriptionOrder = "POST".equalsIgnoreCase(method)
            && uri.matches("/api/v1/subscription-payments/invoices/[0-9a-fA-F-]{36}/orders");
        if (createsCheckoutOrder || verifiesCheckoutOrder || createsSubscriptionOrder) {
            throw new ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Cashfree production payment execution is not enabled"
            );
        }
        return true;
    }
}
