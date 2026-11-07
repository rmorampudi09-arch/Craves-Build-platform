package in.craves.order.advanced;

import in.craves.order.exception.OrderApiException;
import in.craves.order.web.ApiDtos.CheckoutRequest;
import in.craves.order.web.ApiDtos.CheckoutResponse;
import java.util.UUID;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * M24a: inside the batch-hold aspect (30), outside the referral (35) and finance aspects, which join its transaction. A checkout
 * with a promotion while the runtime is off is refused (409), never charged in full silently; one with referral benefits too is refused.
 */
@Aspect
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 32)
public class PromotionCheckoutAspect {
    private final ObjectProvider<PromotionCheckout> services;
    private final TransactionTemplate tx;
    private final JdbcTemplate db;
    // The M08 calls hold a pooled connection (pool of 3): at most one promotion checkout at a time per replica.
    private final Semaphore oneAtATime = new Semaphore(1);

    public PromotionCheckoutAspect(ObjectProvider<PromotionCheckout> services, PlatformTransactionManager manager, JdbcTemplate db) {
        this.services = services;
        this.tx = new TransactionTemplate(manager);
        this.db = db;
    }

    @Around("execution(* in.craves.order.service.OrderService.checkout(..))")
    public Object checkout(ProceedingJoinPoint call) throws Throwable {
        var request = (CheckoutRequest) call.getArgs()[1];
        if (request == null || request.promotion() == null || request.promotion().isNull()) return call.proceed();
        var service = services.getIfAvailable();
        if (service == null) throw OrderApiException.conflict("PROMOTIONS_NOT_ENABLED", "Offers at checkout are not enabled");
        if (request.referralBenefits() != null && !request.referralBenefits().isNull()) {
            throw OrderApiException.conflict("PROMOTION_WITH_REFERRAL", "An offer cannot be combined with referral benefits");
        }
        String code = PromotionCheckout.parse(request.promotion());
        String authorization = RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes web
            ? web.getRequest().getHeader(HttpHeaders.AUTHORIZATION) : null;
        if (!oneAtATime.tryAcquire(2, TimeUnit.SECONDS)) {
            throw OrderApiException.serviceUnavailable("PROMOTIONS_BUSY", "Checkout with an offer is busy. Please try again.");
        }
        try {
            return tx.execute(status -> {
                CheckoutResponse result;
                try {
                    result = (CheckoutResponse) call.proceed();
                } catch (RuntimeException | Error e) {
                    throw e;
                } catch (Throwable e) {
                    throw new IllegalStateException("Checkout creation failed", e);
                }
                service.reserve(result, code, authorization);
                return result;
            });
        } finally {
            oneAtATime.release();
        }
    }

    @Around("execution(* in.craves.order.service.PaymentCallbackService.markCheckoutPaid(..))")
    public Object paid(ProceedingJoinPoint call) throws Throwable {
        Object result = call.proceed();
        PromotionCheckout.markPaid(db, (UUID) call.getArgs()[0]);
        return result;
    }
}
