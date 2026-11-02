package in.craves.order.advanced;

import in.craves.order.exception.OrderApiException;
import in.craves.order.web.ApiDtos.CheckoutRequest;
import in.craves.order.web.ApiDtos.CheckoutResponse;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Outermost checkout aspect: the referral and finance aspects join its transaction, so a batch hold that cannot be
 * confirmed rolls back the whole checkout. A request with batchHolds while the runtime is off is refused (409), never ignored.
 */
@Aspect
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 30)
public class BatchHoldCheckoutAspect {
    private final ObjectProvider<BatchHoldCheckout> services;
    private final TransactionTemplate tx;
    // The confirm calls hold a pooled connection (pool of 3): at most one such checkout at a time per replica.
    private final Semaphore oneAtATime = new Semaphore(1);

    public BatchHoldCheckoutAspect(ObjectProvider<BatchHoldCheckout> services, PlatformTransactionManager manager) {
        this.services = services;
        this.tx = new TransactionTemplate(manager);
    }

    @Around("execution(* in.craves.order.service.OrderService.checkout(..))")
    public Object checkout(ProceedingJoinPoint call) throws Throwable {
        var request = (CheckoutRequest) call.getArgs()[1];
        if (request == null || request.batchHolds() == null || request.batchHolds().isNull()) return call.proceed();
        var service = services.getIfAvailable();
        if (service == null) throw OrderApiException.conflict("BATCH_HOLDS_NOT_ENABLED", "Batch holds at checkout are not enabled");
        var holds = BatchHoldCheckout.parse(request.batchHolds());
        String authorization = RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes web
            ? web.getRequest().getHeader(HttpHeaders.AUTHORIZATION) : null;
        if (!oneAtATime.tryAcquire(2, TimeUnit.SECONDS)) {
            throw OrderApiException.serviceUnavailable("BATCH_HOLDS_BUSY", "Checkout with batch holds is busy. Please try again.");
        }
        try {
            return runConfirmed(call, service, holds, authorization);
        } finally {
            oneAtATime.release();
        }
    }

    private Object runConfirmed(ProceedingJoinPoint call, BatchHoldCheckout service, java.util.Map<java.util.UUID, java.util.UUID> holds, String authorization) {
        return tx.execute(status -> {
            CheckoutResponse result;
            try {
                result = (CheckoutResponse) call.proceed();
            } catch (RuntimeException | Error e) {
                throw e;
            } catch (Throwable e) {
                throw new IllegalStateException("Checkout creation failed", e);
            }
            service.confirm(result, holds, authorization);
            return result;
        });
    }
}
