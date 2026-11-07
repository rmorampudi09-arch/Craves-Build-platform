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
 * M24d: inside the batch-hold (30) and promotion (32) aspects, outside the referral (35), finance (50) and options (55) aspects, which
 * join its transaction. A checkout with a company charge while the runtime is off is refused (409), never charged in full silently; one
 * with a promotion, referral benefits or menu options too is refused (one funding source besides the person; M10 prices without options).
 */
@Aspect
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 33)
public class CompanyShareCheckoutAspect {
    private final ObjectProvider<CompanyShareCheckout> services;
    private final TransactionTemplate tx;
    private final JdbcTemplate db;
    // The M10 calls hold a pooled connection (pool of 3): at most one company-share checkout at a time per replica.
    private final Semaphore oneAtATime = new Semaphore(1);

    public CompanyShareCheckoutAspect(ObjectProvider<CompanyShareCheckout> services, PlatformTransactionManager manager, JdbcTemplate db) {
        this.services = services;
        this.tx = new TransactionTemplate(manager);
        this.db = db;
    }

    @Around("execution(* in.craves.order.service.OrderService.checkout(..))")
    public Object checkout(ProceedingJoinPoint call) throws Throwable {
        var request = (CheckoutRequest) call.getArgs()[1];
        if (request == null || request.companyCharge() == null || request.companyCharge().isNull()) return call.proceed();
        var service = services.getIfAvailable();
        if (service == null) throw OrderApiException.conflict("COMPANY_SHARE_NOT_ENABLED", "Company payments at checkout are not enabled");
        if (present(request.promotion()) || present(request.referralBenefits())) {
            throw OrderApiException.conflict("COMPANY_SHARE_WITH_BENEFIT", "A company payment cannot be combined with an offer or referral benefits");
        }
        if (present(request.menuOptions())) {
            throw OrderApiException.conflict("COMPANY_SHARE_WITH_OPTIONS", "A company payment cannot be used with dish options yet");
        }
        var charge = CompanyShareCheckout.parse(request.companyCharge());
        String authorization = RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes web
            ? web.getRequest().getHeader(HttpHeaders.AUTHORIZATION) : null;
        if (!oneAtATime.tryAcquire(2, TimeUnit.SECONDS)) {
            throw OrderApiException.serviceUnavailable("COMPANY_SHARE_BUSY", "Checkout with a company payment is busy. Please try again.");
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
                service.reserve(result, charge, authorization);
                return result;
            });
        } finally {
            oneAtATime.release();
        }
    }

    private static boolean present(com.fasterxml.jackson.databind.JsonNode node) {
        return node != null && !node.isNull();
    }

    @Around("execution(* in.craves.order.service.PaymentCallbackService.markCheckoutPaid(..))")
    public Object paid(ProceedingJoinPoint call) throws Throwable {
        Object result = call.proceed();
        CompanyShareCheckout.markPaid(db, (UUID) call.getArgs()[0]);
        return result;
    }
}
