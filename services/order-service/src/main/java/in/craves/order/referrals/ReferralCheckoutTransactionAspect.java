package in.craves.order.referrals;
import in.craves.order.web.ApiDtos.CheckoutResponse;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Outer to the existing financial aspect: original totals, snapshot and referral event commit together. */
@Aspect @Component @Order(Ordered.HIGHEST_PRECEDENCE+40)
@ConditionalOnProperty(name="CRAVES_REFERRAL_SOURCE_ENABLED",havingValue="true")
public class ReferralCheckoutTransactionAspect {
    private final TransactionTemplate tx;private final ReferralCheckoutBinding bindings;
    public ReferralCheckoutTransactionAspect(PlatformTransactionManager manager,ReferralCheckoutBinding bindings){this.tx=new TransactionTemplate(manager);this.bindings=bindings;}
    @Around("execution(* in.craves.order.service.OrderService.checkout(..))")
    public Object checkout(ProceedingJoinPoint call){return tx.execute(status->{try{var result=(CheckoutResponse)call.proceed();bindings.bind(result);return result;}catch(RuntimeException|Error e){throw e;}catch(Throwable e){throw new IllegalStateException("Referral checkout source failed",e);}});}
}
