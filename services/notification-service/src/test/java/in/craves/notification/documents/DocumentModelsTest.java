package in.craves.notification.documents;

import static in.craves.notification.documents.DocumentModels.*;
import static org.junit.jupiter.api.Assertions.*;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class DocumentModelsTest {
    static final UUID OWNER=UUID.fromString("11111111-1111-4111-8111-111111111111");
    static Snapshot sample(Type type,List<Table> tables) {
        return new Snapshot(1,type,OWNER,"22222222-2222-4222-8222-222222222222","INR",Instant.parse("2026-09-01T06:00:00Z"),
            List.of(new Field("Kitchen","DEMO Home Kitchen"),new Field("Order status","PAID")),tables,
            "SYNTHETIC EXAMPLE - not a customer transaction. Not a GST tax invoice.");
    }
    @Test void normalizesCustomerRequestWithoutBusinessRepricing() {
        Request request=new Request(Type.PAYMENT_RECEIPT,OWNER,null,null,null,null).normalize();
        assertEquals("INR",request.currency()); assertEquals("Asia/Kolkata",request.timezone());
        assertEquals(request.fingerprint(),request.normalize().fingerprint());
    }
    @Test void periodUsesLocalCalendarBoundaries() {
        Request request=new Request(Type.CHEF_EARNINGS_STATEMENT,null,LocalDate.parse("2026-09-01"),LocalDate.parse("2026-10-01"),null,null).normalize();
        assertEquals(Instant.parse("2026-08-31T18:30:00Z"),request.start());
        assertEquals(Instant.parse("2026-09-30T18:30:00Z"),request.end());
    }
    @Test void rejectsUnboundedPeriod() {
        assertThrows(RuntimeException.class,()->new Request(Type.CHEF_ORDER_STATEMENT,null,LocalDate.parse("2026-01-01"),LocalDate.parse("2026-03-01"),null,null).normalize());
    }
    @Test void rejectsMixedSourceAndPeriod() {
        assertThrows(RuntimeException.class,()->new Request(Type.CHEF_ORDER_STATEMENT,OWNER,LocalDate.parse("2026-09-01"),LocalDate.parse("2026-09-02"),null,null).normalize());
        assertThrows(RuntimeException.class,()->new Request(Type.ORDER_SUMMARY,OWNER,LocalDate.parse("2026-09-01"),null,null,null).normalize());
    }
    @Test void rejectsMissingSourceAndInvalidTimezone() {
        assertThrows(RuntimeException.class,()->new Request(Type.ORDER_SUMMARY,null,null,null,null,null).normalize());
        assertThrows(RuntimeException.class,()->new Request(Type.ORDER_SUMMARY,OWNER,null,null,"not/a/zone",null).normalize());
    }
    @Test void idempotencyRequiresBoundedOpaqueKey() {
        assertDoesNotThrow(()->idempotencyKey("test-request-00000001"));
        assertThrows(RuntimeException.class,()->idempotencyKey("short"));
        assertThrows(RuntimeException.class,()->idempotencyKey("bad\r\nrequest-key-1234"));
    }
    @Test void refusesOtherOwnerSnapshot() {
        assertThrows(RuntimeException.class,()->sample(Type.PAYMENT_RECEIPT,List.of()).validated(UUID.randomUUID(),Type.PAYMENT_RECEIPT,"INR"));
    }
    @Test void refusesTypeAndCurrencyMismatch() {
        assertThrows(RuntimeException.class,()->sample(Type.PAYMENT_RECEIPT,List.of()).validated(OWNER,Type.ORDER_SUMMARY,"INR"));
        assertThrows(RuntimeException.class,()->sample(Type.PAYMENT_RECEIPT,List.of()).validated(OWNER,Type.PAYMENT_RECEIPT,"USD"));
    }
    @Test void refusesMalformedTableAndControlCharacters() {
        Snapshot row=sample(Type.ORDER_SUMMARY,List.of(new Table("Items",List.of("Item","Amount"),List.of(List.of("Only one cell")))));
        assertThrows(RuntimeException.class,()->row.validated(OWNER,Type.ORDER_SUMMARY,"INR"));
        Snapshot control=sample(Type.ORDER_SUMMARY,List.of(new Table("Items",List.of("Item"),List.of(List.of("bad\u0000text")))));
        assertThrows(RuntimeException.class,()->control.validated(OWNER,Type.ORDER_SUMMARY,"INR"));
    }
    @Test void fingerprintIncludesDocumentMeaning() {
        var a=new Request(Type.ORDER_SUMMARY,OWNER,null,null,null,null).normalize();
        var b=new Request(Type.PAYMENT_RECEIPT,OWNER,null,null,null,null).normalize();
        assertNotEquals(a.fingerprint(),b.fingerprint());
    }
}
