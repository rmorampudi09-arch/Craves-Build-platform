package in.craves.notification.documents;

import static in.craves.notification.documents.DocumentModels.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.notification.security.CravesPrincipal;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;

class DocumentControllerTest {
    final UUID owner=DocumentModelsTest.OWNER;
    final UUID id=UUID.fromString("22222222-2222-4222-8222-222222222222");
    final DocumentRepository docs=mock(DocumentRepository.class);
    final DocumentEmailRepository mail=mock(DocumentEmailRepository.class);
    final DocumentSourceClient source=mock(DocumentSourceClient.class);
    final DocumentStorage storage=mock(DocumentStorage.class);
    final DocumentSettings settings=new DocumentSettings();
    DocumentController api;
    @BeforeEach void setup() {
        settings.enabled=true;
        api=new DocumentController(settings,docs,mail,source,storage,new ObjectMapper().findAndRegisterModules());
    }
    UsernamePasswordAuthenticationToken auth(String role) {
        return new UsernamePasswordAuthenticationToken(new CravesPrincipal(owner,null,Set.of(role)),null,java.util.List.of());
    }
    @Test void anonymousAndWrongRoleCannotGenerate() {
        var request=new Request(Type.PAYMENT_RECEIPT,id,null,null,null,null);
        assertEquals(401,assertThrows(ResponseStatusException.class,()->api.create(null,"Bearer ignored","valid-request-key-01",request)).getStatusCode().value());
        assertEquals(403,assertThrows(ResponseStatusException.class,()->api.create(auth("CHEF"),"Bearer ignored","valid-request-key-01",request)).getStatusCode().value());
        verifyNoInteractions(source,docs,storage,mail);
    }
    @Test void disabledModuleDoesNotCallSourcesOrDatabase() {
        settings.enabled=false;
        assertEquals(503,assertThrows(ResponseStatusException.class,()->api.get(auth("CUSTOMER"),id)).getStatusCode().value());
        verifyNoInteractions(docs,source);
    }
    @Test void reusingSuccessfulKeyDoesNotCallLiveSources() throws Exception {
        var request=new Request(Type.ORDER_SUMMARY,id,null,null,null,null).normalize();
        var summary=new Summary(id,Type.ORDER_SUMMARY,id.toString(),"INR","QUEUED",Instant.now(),null,null,null,TEMPLATE_VERSION,null);
        when(docs.existing(owner,"valid-request-key-02")).thenReturn(Optional.of(new Stored(id,owner,request.fingerprint(),"{}","a".repeat(64),"Asia/Kolkata",summary)));
        assertEquals(id,api.create(auth("CUSTOMER"),"Bearer ignored","valid-request-key-02",request).getBody().id());
        verifyNoInteractions(source,storage,mail);
    }
    @Test void downloadUsesIdentityNotBrowserSuppliedOwnerAndSetsPrivateHeaders() {
        var summary=new Summary(id,Type.ORDER_SUMMARY,id.toString(),"INR","READY",Instant.now(),Instant.now(),"a".repeat(64),8L,TEMPLATE_VERSION,null);
        when(docs.own(owner,id)).thenReturn(new Stored(id,owner,"x","{}","a".repeat(64),"Asia/Kolkata",summary));
        when(docs.blobKey(owner,id)).thenReturn("opaque-owner-key");
        when(storage.read("opaque-owner-key","a".repeat(64),8)).thenReturn("%PDF-123".getBytes());
        var response=api.download(auth("CUSTOMER"),id);
        assertEquals("private, no-store, max-age=0",response.getHeaders().getCacheControl());
        assertTrue(response.getHeaders().getContentDisposition().getFilename().contains(id.toString()));
        verify(docs).audit(id,owner,"DOCUMENT_DOWNLOADED");
    }
    @Test void emailIsSeparatelyGatedAndNeverAcceptsAnAddress() {
        settings.emailEnabled=false;
        assertEquals(503,assertThrows(ResponseStatusException.class,()->api.email(auth("CUSTOMER"),id,"valid-email-key-01")).getStatusCode().value());
        verifyNoInteractions(mail);
    }
}
