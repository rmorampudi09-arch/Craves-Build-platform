package in.craves.notification.email;

import static org.junit.jupiter.api.Assertions.*;
import in.craves.notification.documents.DocumentBrand;
import java.io.StringReader;
import java.util.concurrent.atomic.AtomicInteger;
import javax.swing.text.MutableAttributeSet;
import javax.swing.text.html.HTML;
import javax.swing.text.html.HTMLEditorKit;
import javax.swing.text.html.parser.ParserDelegator;
import org.junit.jupiter.api.Test;

class VerificationEmailTemplateTest {
    @Test void canonicalBrandAndRequiredSecurityTextAreRenderedInHtmlAndPlainText() throws Exception {
        var content=VerificationEmailTemplate.render("804729");
        assertEquals("Verify your email for Craves",VerificationEmailTemplate.SUBJECT);
        assertTrue(content.html().contains(VerificationEmailTemplate.PREHEADER));
        assertArrayEquals(DocumentBrand.logo(),content.logo());
        assertTrue(content.html().contains("cid:"+VerificationEmailTemplate.LOGO_CID));
        for(String fragment:new String[]{"804729","This code expires in 10 minutes.","Craves will never ask you to send your verification code through chat, phone or social media.","If you did not request this verification, you can safely ignore this email.","craves.in"}) {
            assertTrue(content.html().contains(fragment)); assertTrue(content.plainText().contains(fragment));
        }
        assertFalse(content.html().contains("123456")); assertFalse(content.html().contains("<script"));
        assertTrue(content.html().contains("max-width:560px")); assertTrue(content.html().contains("lang=\"en\""));
        assertEquals("EmailContent[REDACTED]",content.toString());
        AtomicInteger images=new AtomicInteger();
        new ParserDelegator().parse(new StringReader(content.html()),new HTMLEditorKit.ParserCallback(){
            @Override public void handleSimpleTag(HTML.Tag tag, MutableAttributeSet attributes, int position) {
                if(tag==HTML.Tag.IMG) { images.incrementAndGet(); assertEquals("Craves",attributes.getAttribute(HTML.Attribute.ALT)); }
            }
        },true);
        assertEquals(1,images.get());
    }
    @Test void templateRejectsMarkupAndUnboundedInput() {
        assertThrows(IllegalArgumentException.class,()->VerificationEmailTemplate.render("<img>"));
        assertThrows(IllegalArgumentException.class,()->VerificationEmailTemplate.render("1234567"));
        assertThrows(IllegalArgumentException.class,()->VerificationEmailTemplate.render(null));
    }
    @Test void messageUsesApprovedInlineLogoAndDisablesEngagementTracking() throws Exception {
        var properties=new in.craves.notification.delivery.NotificationDeliveryProperties();properties.setAcsEmailSenderAddress("sender@example.test");
        var message=new VerificationEmailTransport(properties).prepareMessage(VerificationEmailSecurityTest.dto());
        assertEquals(VerificationEmailTemplate.SUBJECT,message.getSubject());
        assertEquals(Boolean.TRUE,message.isUserEngagementTrackingDisabled());
        assertEquals(1,message.getAttachments().size());
        assertEquals(VerificationEmailTemplate.LOGO_CID,message.getAttachments().getFirst().getContentId());
        assertArrayEquals(DocumentBrand.logo(),message.getAttachments().getFirst().getContent().toBytes());
    }
    @Test void saturatedTransportRejectsWithoutQueueAndReleasesPermitsAfterFailure() {
        var capacity=new java.util.concurrent.Semaphore(0);
        var transport=new VerificationEmailTransport(new in.craves.notification.delivery.NotificationDeliveryProperties(),capacity);
        assertEquals(VerificationEmailTransport.Outcome.UNAVAILABLE,transport.send(VerificationEmailSecurityTest.dto()));
        assertEquals(0,capacity.availablePermits());capacity.release();
        assertEquals(VerificationEmailTransport.Outcome.UNAVAILABLE,transport.send(VerificationEmailSecurityTest.dto()));
        assertEquals(1,capacity.availablePermits());
    }
    @Test void absentAcsConfigurationNeverCallsProvider() {
        var transport=new VerificationEmailTransport(new in.craves.notification.delivery.NotificationDeliveryProperties());
        assertFalse(transport.configured()); assertEquals(VerificationEmailTransport.Outcome.UNAVAILABLE,transport.send(VerificationEmailSecurityTest.dto()));
        assertThrows(IllegalStateException.class,()->new VerificationEmailSettings("short",true));
    }
}
