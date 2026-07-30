package in.craves.integration.payment;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class CashfreePaymentExecutionWebConfiguration implements WebMvcConfigurer {
    private final CashfreePaymentExecutionInterceptor interceptor;

    public CashfreePaymentExecutionWebConfiguration(CashfreePaymentExecutionInterceptor interceptor) {
        this.interceptor = interceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(interceptor).addPathPatterns("/api/v1/payments/orders/**");
    }
}
