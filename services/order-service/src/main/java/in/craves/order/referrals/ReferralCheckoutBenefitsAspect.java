package in.craves.order.referrals;
import in.craves.order.web.ApiDtos.CheckoutRequest;
import in.craves.order.web.ApiDtos.CheckoutResponse;
import java.util.UUID;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.*;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
/** Optional request is rejected when its runtime is absent; it can never silently charge the full amount. */
@Aspect @Component @Order(Ordered.HIGHEST_PRECEDENCE+35)
public class ReferralCheckoutBenefitsAspect {
    private final org.springframework.jdbc.core.JdbcTemplate db;private final ObjectProvider<ReferralCheckoutBenefits> services;private final TransactionTemplate tx;
    public ReferralCheckoutBenefitsAspect(ObjectProvider<ReferralCheckoutBenefits> services,PlatformTransactionManager manager,org.springframework.jdbc.core.JdbcTemplate db){this.db=db;this.services=services;this.tx=new TransactionTemplate(manager);}
    @Around("execution(* in.craves.order.service.OrderService.checkout(..))")
    public Object checkout(ProceedingJoinPoint call) throws Throwable {
        var request=(CheckoutRequest)call.getArgs()[1];if(request==null || request.referralBenefits()==null || request.referralBenefits().isNull())return call.proceed();
        var service=services.getIfAvailable();if(service==null)throw ReferralCheckoutBenefits.conflict("Referral checkout benefits are not enabled");
        return tx.execute(s->{try{var result=(CheckoutResponse)call.proceed();service.prepare(result,request.referralBenefits());return result.withReferralBenefits();}catch(RuntimeException|Error e){throw e;}catch(Throwable e){throw new IllegalStateException(e);}});
    }
    @Around("execution(* in.craves.order.service.OrderService.getCheckout(..))")
    public Object read(ProceedingJoinPoint call) throws Throwable {
        var result=(CheckoutResponse)call.proceed();var service=services.getIfAvailable();
        return Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM order_schema.referral_checkout_benefit WHERE checkout_id=?)",Boolean.class,result.id()))?result.withReferralBenefits():result;
    }
    @Around("execution(* in.craves.order.service.PaymentCallbackService.markCheckoutPaid(..))")
    public Object paid(ProceedingJoinPoint call) throws Throwable {
        var service=services.getIfAvailable();
        if(service==null && Boolean.TRUE.equals(db.queryForObject("SELECT EXISTS(SELECT 1 FROM order_schema.referral_checkout_benefit WHERE checkout_id=?)",Boolean.class,(UUID)call.getArgs()[0])))throw ReferralCheckoutBenefits.conflict("Referral funding runtime must be restored before fulfilment");
        if(service!=null && !service.requestConsumption((UUID)call.getArgs()[0]))throw ReferralCheckoutBenefits.conflict("Referral funding confirmation is pending");
        return call.proceed();
    }
}
