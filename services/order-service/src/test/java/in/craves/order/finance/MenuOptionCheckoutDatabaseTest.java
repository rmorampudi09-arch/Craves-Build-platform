package in.craves.order.finance;

import com.fasterxml.jackson.databind.JsonNode;
import in.craves.order.advanced.MenuOptionCheckout;
import in.craves.order.advanced.MenuOptionCheckoutAspect;
import in.craves.order.exception.OrderApiException;
import in.craves.order.web.ApiDtos.CheckoutRequest;
import in.craves.order.web.ApiDtos.CheckoutResponse;
import java.lang.reflect.Constructor;
import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

/** M24c slice B: re-runs the checkout safety contract with the options aspect, then prices, freezes and refuses options on PostgreSQL. */
@org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable(named="LEDGER_TEST_JDBC_URL",matches=".+")
class MenuOptionCheckoutDatabaseTest extends FinancialCheckoutDatabaseTest {
 MockRestServiceServer server;final UUID group=UUID.randomUUID(),choice=UUID.randomUUID();
 @Override void registerAdditionalOwners(){
  var builder=RestClient.builder().baseUrl("http://adv");server=MockRestServiceServer.bindTo(builder).build();var client=builder.build();MenuOptionCheckout service;
  try{Constructor<MenuOptionCheckout> c=MenuOptionCheckout.class.getDeclaredConstructor(RestClient.class,String.class,org.springframework.jdbc.core.JdbcTemplate.class,com.fasterxml.jackson.databind.ObjectMapper.class);
   c.setAccessible(true);service=c.newInstance(client,"s3cret",jdbc,json);}catch(Exception e){throw new IllegalStateException(e);}
  context.getEnvironment().getPropertySources().addFirst(new org.springframework.core.env.MapPropertySource("options-test",Map.of("CRAVES_ADVANCED_CHECKOUT_OPTIONS_ENABLED","true")));
  context.registerBean(MenuOptionCheckout.class,()->service);context.registerBean(MenuOptionCheckoutAspect.class);
 }
 String quote(long base,long delta,long unit){return "{\"lines\":[{\"menuItemId\":\""+menu+"\",\"basePricePaise\":"+base+",\"choices\":[{\"groupId\":\""+group+"\",\"groupName\":\"Spice\",\"choiceId\":\""+choice
  +"\",\"choiceName\":\"Extra raita\",\"priceDeltaPaise\":"+delta+"}],\"unitPricePaise\":"+unit+",\"quantity\":1,\"totalPaise\":"+unit+",\"optionsVersion\":3,\"mealPeriod\":\"LUNCH\"}],\"totalPaise\":"+unit+"}";}
 void expectQuote(String body){server.expect(requestTo("http://adv/internal/v1/menu-options/checkout-quote")).andExpect(method(HttpMethod.POST)).andExpect(header("X-Craves-Internal-Secret","s3cret"))
  .andExpect(jsonPath("$.at").exists()).andExpect(jsonPath("$.lines[0].menuItemId").value(menu.toString())).andExpect(jsonPath("$.lines[0].quantity").value(1)).andExpect(jsonPath("$.lines[0].choiceIds[0]").value(choice.toString()))
  .andRespond(withSuccess(body,MediaType.APPLICATION_JSON));}
 JsonNode picks()throws Exception{return json.readTree("{\""+menu+"\":[\""+choice+"\"]}");}
 CheckoutResponse checkoutWithOptions()throws Exception{return orders.checkout(actor,new CheckoutRequest(address,"Options test",null,null,null,picks()));}
 void assertRolledBack(){assertEquals(0,count("checkout"));assertEquals(0,count("customer_order"));assertEquals(0,count("menu_option_checkout_line"));assertEquals(0,count("order_financial_snapshot"));assertEquals(1,count("cart_item"));}

 @Test void optionsRaiseTheLineBeforeFinancePricesItAndAreFrozen()throws Exception{
  expectQuote(quote(36900,4500,41400));var value=checkoutWithOptions();server.verify();
  // 414.00 food + 39.00 delivery + 20.70 food GST + 7.02 delivery GST: Finance priced the raised line, tax on the add-on as on the dish.
  assertEquals(new BigDecimal("480.72"),value.grandTotal());assertEquals(new BigDecimal("414.00"),value.foodSubtotal());
  var item=value.orders().getFirst().items().getFirst();assertEquals(new BigDecimal("414.00"),item.unitPrice());assertEquals(new BigDecimal("414.00"),item.lineTotal());
  assertEquals(new BigDecimal("480.72"),jdbc.queryForObject("SELECT grand_total FROM order_schema.customer_order",BigDecimal.class));
  verify(finance).quote(argThat(request->"414.00".equals(request.path("orders").get(0).path("items").get(0).path("customerUnit").asText())
   &&"414.00".equals(request.path("orders").get(0).path("items").get(0).path("chefBaseUnit").asText())));
  var read=MenuOptionCheckout.class.getMethod("read",org.springframework.jdbc.core.JdbcTemplate.class,com.fasterxml.jackson.databind.ObjectMapper.class,UUID.class);
  JsonNode frozen=(JsonNode)read.invoke(null,jdbc,json,value.id());
  assertEquals(1,frozen.path("lines").size());assertEquals(36900,frozen.path("lines").get(0).path("basePaise").asLong());assertEquals(41400,frozen.path("lines").get(0).path("unitPaise").asLong());
  assertEquals(choice.toString(),frozen.path("lines").get(0).path("choices").get(0).path("choiceId").asText());assertEquals("LUNCH",frozen.path("lines").get(0).path("mealPeriod").asText());
  // Slice D: the chosen options show with the line in the checkout, customer and chef history and the order document.
  var shown=java.util.List.of(new in.craves.order.web.ApiDtos.OrderItemChoice("Spice","Extra raita",new BigDecimal("45.00")));
  assertEquals(shown,item.chosenOptions());
  var history=new in.craves.order.service.OrderHistoryService(jdbc);
  assertEquals(shown,history.listCustomerOrders(actor,10,null,null).orders().getFirst().items().getFirst().chosenOptions());
  assertEquals(shown,history.listChefOrders(new in.craves.order.security.CravesPrincipal(chef,"",java.util.Set.of("CHEF")),10,null,null).orders().getFirst().items().getFirst().chosenOptions());
  var document=new in.craves.order.web.OrderDocumentSourceController(jdbc,true).order(actor,value.orders().getFirst().id(),false,"INR","Asia/Kolkata").getBody();
  assertTrue(json.writeValueAsString(document).contains("(Spice: Extra raita)"),"document names the chosen options");
  assertThrows(RuntimeException.class,()->jdbc.execute("UPDATE order_schema.menu_option_checkout_line SET unit_paise=1"));
  assertThrows(RuntimeException.class,()->jdbc.execute("DELETE FROM order_schema.menu_option_checkout_line"));
 }
 @Test void aBaseThatIsNotTheOrdersPriceRollsBackAndKeepsTheCart()throws Exception{
  expectQuote(quote(36000,4500,40500));
  assertEquals("MENU_OPTIONS_PRICE_CHANGED",assertThrows(OrderApiException.class,this::checkoutWithOptions).code());server.verify();assertRolledBack();
 }
 @Test void aUnitPriceTheOptionsDoNotExplainIsRefused()throws Exception{
  expectQuote(quote(36900,4500,50000));
  assertEquals("MENU_OPTIONS_CONTEXT_MISMATCH",assertThrows(OrderApiException.class,this::checkoutWithOptions).code());server.verify();assertRolledBack();
 }
 @Test void choicesM05RefusesRollBackWithItsCode()throws Exception{
  server.expect(requestTo("http://adv/internal/v1/menu-options/checkout-quote")).andRespond(withStatus(HttpStatus.CONFLICT).contentType(MediaType.APPLICATION_JSON).body("{\"code\":\"OUTSIDE_MEAL_PERIOD\"}"));
  assertEquals("MENU_OPTIONS_OUTSIDE_MEAL_PERIOD",assertThrows(OrderApiException.class,this::checkoutWithOptions).code());server.verify();assertRolledBack();
 }
 @Test void anUnreachableQuoteIsUnavailableNotFree()throws Exception{
  server.expect(requestTo("http://adv/internal/v1/menu-options/checkout-quote")).andRespond(withServerError());
  assertEquals("MENU_OPTIONS_UNAVAILABLE",assertThrows(OrderApiException.class,this::checkoutWithOptions).code());assertRolledBack();
 }
 @Test void optionsForADishNotInTheCartAreRefused()throws Exception{
  var request=new CheckoutRequest(address,"x",null,null,null,json.readTree("{\""+UUID.randomUUID()+"\":[]}"));
  assertEquals("MENU_OPTIONS_UNKNOWN_DISH",assertThrows(OrderApiException.class,()->orders.checkout(actor,request)).code());assertRolledBack();
 }
 @Test void optionsWithAnOfferAreRefused()throws Exception{
  var request=new CheckoutRequest(address,"x",null,null,json.readTree("{}"),picks());
  assertEquals("MENU_OPTIONS_WITH_BENEFIT",assertThrows(OrderApiException.class,()->orders.checkout(actor,request)).code());assertRolledBack();
 }
 @Test void malformedOptionsAre400()throws Exception{
  for(String bad:new String[]{"[]","{}","{\"not-a-uuid\":[]}","{\""+menu+"\":[\""+choice+"\",\""+choice+"\"]}","{\""+menu+"\":\"x\"}"}){
   var request=new CheckoutRequest(address,"x",null,null,null,json.readTree(bad));
   assertEquals("INVALID_MENU_OPTIONS",assertThrows(OrderApiException.class,()->orders.checkout(actor,request)).code(),bad);
  }
  assertRolledBack();
 }
}
