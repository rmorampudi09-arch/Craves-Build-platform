package in.craves.notification.documents;

import static in.craves.notification.documents.DocumentModels.*;
import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

class DocumentPdfRendererTest {
    private final DocumentPdfRenderer renderer=new DocumentPdfRenderer(new DocumentSettings());
    @Test void createsReadableReceiptAndExampleArtifact() throws Exception {
        Snapshot snapshot=DocumentModelsTest.sample(Type.PAYMENT_RECEIPT,List.of(
            new Table("Order items",List.of("Item","Quantity","Unit price","Line total"),List.of(List.of("DEMO vegetable meal","2","120.50","241.00"))),
            new Table("Recorded charges (INR)",List.of("Charge","Amount"),List.of(List.of("Food subtotal","241.00"),List.of("Delivery fee","25.00"),List.of("Recorded order total","266.00")))));
        byte[] pdf=renderer.render(snapshot,UUID.fromString("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),"Asia/Kolkata");
        try(var loaded=Loader.loadPDF(pdf)) {
            assertEquals(1,loaded.getNumberOfPages());
            String text=new PDFTextStripper().getText(loaded);
            assertTrue(text.contains("Payment receipt")); assertTrue(text.contains("266.00")); assertTrue(text.contains("SYNTHETIC EXAMPLE"));
            assertFalse(text.contains("access_token")); assertFalse(text.contains("Bearer"));
        }
        save("craves-order-receipt-example.pdf",pdf);
    }
    @Test void repeatsHeadersAndKeepsAllStatementRowsAcrossPages() throws Exception {
        List<List<String>> rows=new ArrayList<>();
        for(int i=1;i<=180;i++) rows.add(List.of("DEMO-ENTRY-"+String.format("%03d",i),"APPROVED","125.50"));
        var snapshot=DocumentModelsTest.sample(Type.CHEF_EARNINGS_STATEMENT,List.of(new Table("Recorded chef entries",List.of("Entry reference","Status","Net recorded"),rows)));
        byte[] pdf=renderer.render(snapshot,UUID.fromString("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),"Asia/Kolkata");
        try(var loaded=Loader.loadPDF(pdf)) {
            assertTrue(loaded.getNumberOfPages()>1); assertTrue(loaded.getNumberOfPages()<30);
            String text=new PDFTextStripper().getText(loaded);
            for(int i=1;i<=180;i++) assertTrue(text.contains("DEMO-ENTRY-"+String.format("%03d",i)));
            assertTrue(text.contains("continued")); assertTrue(text.contains("Entry reference"));
        }
        save("craves-chef-statement-example.pdf",pdf);
    }
    @Test void longUnbrokenReferenceDoesNotOverflowPage() throws Exception {
        var snapshot=DocumentModelsTest.sample(Type.ORDER_SUMMARY,List.of(new Table("Long descriptions",List.of("Description","Amount"),
            List.of(List.of("A".repeat(750),"12.34")))));
        byte[] pdf=renderer.render(snapshot,UUID.randomUUID(),"Asia/Kolkata");
        try(var loaded=Loader.loadPDF(pdf)) { assertTrue(loaded.getNumberOfPages()<10); assertTrue(new PDFTextStripper().getText(loaded).contains("12.34")); }
    }
    @Test void unsupportedGlyphFailsInsteadOfSilentlyChangingCustomerData() {
        var snapshot=DocumentModelsTest.sample(Type.ORDER_SUMMARY,List.of(new Table("Items",List.of("Item"),List.of(List.of("\uD83C\uDF72")))));
        assertThrows(IllegalArgumentException.class,()->renderer.render(snapshot,UUID.randomUUID(),"Asia/Kolkata"));
    }
    private static void save(String name,byte[] pdf) throws Exception {
        Path folder=Path.of("target/document-examples"); Files.createDirectories(folder); Files.write(folder.resolve(name),pdf);
    }
}
