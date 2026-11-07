package in.craves.order.advanced;

import in.craves.order.exception.OrderApiException;
import in.craves.order.finance.FinancialCheckoutTransactionAspect;
import in.craves.order.security.CravesPrincipal;
import in.craves.order.service.OrderService;
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
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * M24c: inside the finance aspect (50), so the raised lines exist before Finance binds them; it joins the outer checkout transaction.
 * A checkout with {@code menuOptions} while the runtime is off is refused (409), never sold at the base price silently. Without the
 * Finance source the fee and tax would stay those of the base price, so that is refused too; so are a promotion and referral benefits.
 */
@Aspect
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 55)
public class MenuOptionCheckoutAspect {
    private final ObjectProvider<MenuOptionCheckout> services;
    private final ObjectProvider<OrderService> orders;
    private final TransactionTemplate tx;
    private final ObjectProvider<FinancialCheckoutTransactionAspect> finance;
    // The M05 call holds a pooled connection (pool of 3): at most one options checkout at a time per replica.
    private final Semaphore oneAtATime = new Semaphore(1);

    public MenuOptionCheckoutAspect(ObjectProvider<MenuOptionCheckout> services, ObjectProvider<OrderService> orders, PlatformTransactionManager manager,
                                    ObjectProvider<FinancialCheckoutTransactionAspect> finance) {
        this.services = services;
        this.orders = orders;
        this.tx = new TransactionTemplate(manager);
        this.finance = finance;
    }

    @Around("execution(* in.craves.order.service.OrderService.checkout(..))")
    public Object checkout(ProceedingJoinPoint call) throws Throwable {
        var request = (CheckoutRequest) call.getArgs()[1];
        if (request == null || request.menuOptions() == null || request.menuOptions().isNull()) return call.proceed();
        var service = services.getIfAvailable();
        if (service == null) throw OrderApiException.conflict("MENU_OPTIONS_NOT_ENABLED", "Choosing options at checkout is not enabled");
        // The Finance aspect itself, not the switch's text: only its bind re-prices fee and tax from the raised lines.
        if (finance.getIfAvailable() == null) throw OrderApiException.conflict("MENU_OPTIONS_NOT_ENABLED", "Choosing options at checkout is not enabled");
        if ((request.promotion() != null && !request.promotion().isNull()) || (request.referralBenefits() != null && !request.referralBenefits().isNull())) {
            throw OrderApiException.conflict("MENU_OPTIONS_WITH_BENEFIT", "Options cannot be combined with an offer or referral benefits yet");
        }
        var picks = MenuOptionCheckout.parse(request.menuOptions());
        if (!oneAtATime.tryAcquire(2, TimeUnit.SECONDS)) {
            throw OrderApiException.serviceUnavailable("MENU_OPTIONS_BUSY", "Checkout with options is busy. Please try again.");
        }
        try {
            return tx.execute(status -> {
                CheckoutResponse created;
                try {
                    created = (CheckoutResponse) call.proceed();
                } catch (RuntimeException | Error e) {
                    throw e;
                } catch (Throwable e) {
                    throw new IllegalStateException("Checkout creation failed", e);
                }
                service.apply(created, picks);
                return orders.getObject().getCheckout((CravesPrincipal) call.getArgs()[0], created.id());
            });
        } finally {
            oneAtATime.release();
        }
    }
}
