package in.craves.order.finance;

import in.craves.order.service.CheckoutOperationService;
import in.craves.order.security.CravesPrincipal;
import in.craves.order.web.ApiDtos.*;
import in.craves.order.web.CheckoutOperationDtos.*;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Actual transactions plus existing finance/referral aspects; no external providers. */
@EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class CheckoutOperationDatabaseTest extends ReferralCheckoutIntegrationDatabaseTest {
    @Override void registerAdditionalOwners() {
        super.registerAdditionalOwners();
        context.registerBean(CheckoutOperationService.class);
    }
    CheckoutOperationService operations() { return context.getBean(CheckoutOperationService.class); }
    Request request() {
        var cart=orders.getCart(actor);
        return new Request(address,"Device checkout test",new CartSnapshotRequest(cart.id(),cart.items().stream()
            .map(item->new CartSnapshotItem(item.id(),item.quantity(),item.updatedAt())).toList()));
    }
    @Test void replayAfterLostResponseReturnsOneCheckoutWithoutTouchingNewCart() {
        var request=request();var key=UUID.randomUUID();var first=operations().execute(actor,key,request);
        orders.addCartItem(actor,new AddCartItemRequest(menu,2));
        assertEquals(first,operations().execute(actor,key,request));assertEquals(first,operations().get(actor,key));
        assertEquals(1,count("checkout"));assertEquals(1,count("checkout_operation"));
        assertEquals(2,orders.getCart(actor).items().getFirst().quantity());
        assertEquals(1,count("order_financial_snapshot"));assertEquals(1,count("referral_order_binding"));
    }
    @Test void changedSnapshotAndChangedPayloadCannotCreateAnotherOrder() {
        var request=request();var key=UUID.randomUUID();operations().execute(actor,key,request);
        assertThrows(RuntimeException.class,()->operations().execute(actor,key,new Request(address,"changed",request.expectedCart())));
        assertThrows(RuntimeException.class,()->operations().execute(actor,UUID.randomUUID(),request));
        assertEquals(1,count("checkout"));assertEquals(1,count("checkout_operation"));
    }
    @Test void failureRollsBackReceiptAndOrderAndPreservesCartForSameKeyRetry() {
        var request=request();var key=UUID.randomUUID();
        doThrow(new IllegalStateException("Synthetic quote failure")).when(finance).quote(any());
        assertThrows(RuntimeException.class,()->operations().execute(actor,key,request));
        assertEquals(0,count("checkout_operation"));assertEquals(0,count("checkout"));assertEquals(1,count("cart_item"));
        doAnswer(call->quote(call.getArgument(0))).when(finance).quote(any());
        assertNotNull(operations().execute(actor,key,request).checkoutId());assertEquals(1,count("checkout"));
    }
    @Test void receiptCannotBeReadByAnotherCustomer() {
        var key=UUID.randomUUID();operations().execute(actor,key,request());
        var other=new CravesPrincipal(UUID.randomUUID(),"",Set.of("CUSTOMER"));
        assertThrows(RuntimeException.class,()->operations().get(other,key));
    }
    @Test void simultaneousSameKeyCreatesOneCheckoutAndOneReceipt() throws Exception {
        var request=request();var key=UUID.randomUUID();var start=new CountDownLatch(1);
        try(var executor=Executors.newFixedThreadPool(2)) {
            var a=executor.submit(()->{start.await();return operations().execute(actor,key,request);});
            var b=executor.submit(()->{start.await();return operations().execute(actor,key,request);});
            start.countDown();assertEquals(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS));
        }
        assertEquals(1,count("checkout"));assertEquals(1,count("checkout_operation"));
        verify(finance,times(1)).quote(any());
    }
    @Test void aNewCartCanCreateNewOrderWhilePreviousOrderIsPaymentPending() {
        var first=operations().execute(actor,UUID.randomUUID(),request());
        orders.addCartItem(actor,new AddCartItemRequest(menu,1));
        var second=operations().execute(actor,UUID.randomUUID(),request());
        assertNotEquals(first.checkoutId(),second.checkoutId());assertEquals(2,count("checkout"));assertEquals(0,count("cart_item"));
    }
}
