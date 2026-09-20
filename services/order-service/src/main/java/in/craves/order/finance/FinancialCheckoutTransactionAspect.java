package in.craves.order.finance;

import in.craves.order.exception.OrderApiException;
import in.craves.order.security.CravesPrincipal;
import in.craves.order.service.OrderService;
import in.craves.order.web.ApiDtos.CheckoutResponse;
import java.util.Set;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Explicit outer transaction: the existing checkout joins it; snapshots and the source outbox commit with the order. */
@Aspect
@Component
@Order(Ordered.HIGHEST_PRECEDENCE+50)
@ConditionalOnProperty(name="CRAVES_FINANCE_SOURCE_ENABLED",havingValue="true")
public class FinancialCheckoutTransactionAspect {
    private final TransactionTemplate transaction;private final OrderFinancialBindingService bindings;private final ObjectProvider<OrderService> orders;
    public FinancialCheckoutTransactionAspect(PlatformTransactionManager manager,OrderFinancialBindingService bindings,ObjectProvider<OrderService> orders){this.transaction=new TransactionTemplate(manager);this.bindings=bindings;this.orders=orders;}
    @Around("execution(* in.craves.order.service.OrderService.checkout(..))")
    public Object checkout(ProceedingJoinPoint call){
        return transaction.execute(status->{
            CheckoutResponse created;
            try{created=(CheckoutResponse)call.proceed();}
            catch(RuntimeException | Error e){throw e;}
            catch(Throwable checked){throw new IllegalStateException("Checkout creation failed",checked);}
            try{
                bindings.bind(created);
                return orders.getObject().getCheckout((CravesPrincipal)call.getArgs()[0],created.id());
            }catch(OrderApiException e){
                throw e;
            }catch(RuntimeException e){
                throw OrderApiException.serviceUnavailable(
                    "CHECKOUT_PRICING_UNAVAILABLE",
                    "Checkout pricing is temporarily unavailable. Please try again."
                );
            }
        });
    }
    @Around("execution(* in.craves.order.service.NotificationInternalClient.orderCreated(..))")
    public Object notifyCurrentTotals(ProceedingJoinPoint call)throws Throwable{
        CheckoutResponse original=(CheckoutResponse)call.getArgs()[0];
        if(!bindings.hasSnapshot(original.id()))return call.proceed();
        // Existing checkout callback runs after commit. Refresh its amounts so notification evidence matches the bound checkout.
        var owner=new CravesPrincipal(original.customerIdentityId(),"",Set.of("CUSTOMER"));
        return call.proceed(new Object[]{orders.getObject().getCheckout(owner,original.id())});
    }
}
