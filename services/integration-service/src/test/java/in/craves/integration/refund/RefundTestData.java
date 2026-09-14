package in.craves.integration.refund;

import in.craves.integration.config.RazorpayProviderProperties;
import in.craves.integration.refund.RefundModels.RefundWorkItem;
import java.math.BigDecimal;
import java.util.UUID;

final class RefundTestData {
    static final UUID ID=UUID.fromString("a2222222-2222-4222-8222-222222222222");
    static final UUID ORDER=UUID.fromString("b2222222-2222-4222-8222-222222222222");
    static final UUID CHEFORDER=UUID.fromString("c2222222-2222-4222-8222-222222222222");
    static final UUID OWNER=UUID.fromString("d2222222-2222-4222-8222-222222222222");
    static final UUID CHECKOUT=UUID.fromString("e2222222-2222-4222-8222-222222222222");
    static RefundWorkItem item(String kind,String prior,int attempts,String providerId) {
        return item(kind,prior,attempts,providerId,1,0);
    }
    static RefundWorkItem item(String kind,String prior,int attempts,String providerId,int totalReconciliations,int failures) {
        return new RefundWorkItem(ID,ORDER,CHECKOUT,CHEFORDER,OWNER,UUID.randomUUID(),null,"CRV123456",UUID.randomUUID(),
            new BigDecimal("12.34"),"INR","CHEF_DECLINED","PROCESSING",null,null,attempts,UUID.randomUUID(),
            "RAZORPAY","order_TestPayment","pay_TestPayment",providerId,kind,prior,null,null,null,totalReconciliations,failures,null);
    }
    static RazorpayProviderProperties properties(boolean paymentExecution) {
        return new RazorpayProviderProperties("PRODUCTION",true,paymentExecution,"rzp_live_UNIT_TEST",
            "NONSECRET_TEST_VALUE","NONSECRET_TEST_WEBHOOK","https://api.razorpay.com",
            "https://api.craves.in/api/v1/payments/webhooks/razorpay",true);
    }
}
