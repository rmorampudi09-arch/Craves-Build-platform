package in.craves.notification.documents;

import static org.junit.jupiter.api.Assertions.*;
import java.io.ByteArrayInputStream;
import java.util.List;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.junit.jupiter.api.Test;

class DocumentBrandTest {
    @Test void defaultLogoIsExactlyTheApprovedCustomerWebLogo() throws Exception {
        byte[] logo=DocumentBrand.logo();
        assertEquals(DocumentBrand.SHA256,DocumentModels.sha256(logo));
        var image=ImageIO.read(new ByteArrayInputStream(logo));
        assertEquals(112,image.getWidth()); assertEquals(112,image.getHeight());
    }
    @Test void actualGeneratedPdfEmbedsLogoOnEveryPage() throws Exception {
        var source=DocumentModelsTest.sample(DocumentModels.Type.ORDER_SUMMARY,List.of());
        byte[] output=new DocumentPdfRenderer(new DocumentSettings()).render(source,UUID.randomUUID(),"Asia/Kolkata");
        try(var pdf=Loader.loadPDF(output)) {
            for(var page:pdf.getPages()) {
                boolean found=false;
                for(var name:page.getResources().getXObjectNames()) {
                    if(page.getResources().getXObject(name) instanceof PDImageXObject logo) {
                        found=logo.getWidth()==112 && logo.getHeight()==112;
                    }
                }
                assertTrue(found,"Approved Craves logo must be embedded, not fetched remotely");
            }
        }
    }
}
