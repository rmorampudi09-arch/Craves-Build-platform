package in.craves.notification.documents;

import static in.craves.notification.documents.DocumentModels.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.notification.security.CravesPrincipal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/documents")
public class DocumentController {
    private final DocumentSettings settings;
    private final DocumentRepository documents;
    private final DocumentEmailRepository emails;
    private final DocumentSourceClient sources;
    private final DocumentStorage storage;
    private final ObjectMapper mapper;
    public DocumentController(DocumentSettings settings,DocumentRepository documents,DocumentEmailRepository emails,
        DocumentSourceClient sources,DocumentStorage storage,ObjectMapper mapper) {
        this.settings=settings; this.documents=documents; this.emails=emails;
        this.sources=sources; this.storage=storage; this.mapper=mapper;
    }
    @GetMapping("/capabilities")
    public Map<String,Object> capabilities(Authentication auth) {
        principal(auth);
        return Map.of("enabled",settings.enabled,"emailEnabled",settings.enabled&&settings.emailEnabled,
            "types",Type.values(),"maxPeriodDays",31,"maxRows",MAX_ROWS,"taxInvoicesEnabled",false);
    }
    @PostMapping
    public ResponseEntity<Summary> create(Authentication auth,@RequestHeader("Authorization") String bearer,
        @RequestHeader("Idempotency-Key") String key,@RequestBody Request input) throws Exception {
        CravesPrincipal principal=active(auth); idempotencyKey(key);
        Request request=input.normalize();
        if(!principal.hasRole(request.type().chef()?"CHEF":"CUSTOMER"))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,"DOCUMENT_ROLE_REQUIRED");
        var old=documents.existing(principal.identityId(),key);
        if(old.isPresent()) return privateResponse(HttpStatus.OK,DocumentRepository.sameRequest(old.get(),request.fingerprint()));
        Snapshot source=sources.fetch(principal.identityId(),request,bearer);
        Summary result=documents.create(principal.identityId(),key,request,source,mapper.writeValueAsString(source));
        return privateResponse(HttpStatus.ACCEPTED,result);
    }
    @GetMapping
    public ResponseEntity<Page> list(Authentication auth,@RequestParam(defaultValue="25") int limit,
        @RequestParam(required=false) String cursor,@RequestParam(required=false) Type type,
        @RequestParam(required=false) String reference) {
        return privateResponse(HttpStatus.OK,documents.page(active(auth).identityId(),limit,cursor,type,reference));
    }
    @GetMapping("/{id}")
    public ResponseEntity<Summary> get(Authentication auth,@PathVariable UUID id) {
        return privateResponse(HttpStatus.OK,documents.own(active(auth).identityId(),id).summary());
    }
    @GetMapping(value="/{id}/download",produces=MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> download(Authentication auth,@PathVariable UUID id) {
        UUID owner=active(auth).identityId();
        Summary summary=documents.own(owner,id).summary();
        if(!"READY".equals(summary.status())||summary.bytes()==null) throw conflict("DOCUMENT_NOT_READY");
        byte[] bytes=storage.read(documents.blobKey(owner,id),summary.sha256(),summary.bytes());
        documents.audit(id,owner,"DOCUMENT_DOWNLOADED");
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL,"private, no-store, max-age=0")
            .header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=\"craves-"+id+".pdf\"")
            .header("X-Content-Type-Options","nosniff").header("Content-Security-Policy","sandbox")
            .contentType(MediaType.APPLICATION_PDF).contentLength(bytes.length).body(bytes);
    }
    @PostMapping("/{id}/email")
    public ResponseEntity<EmailSummary> email(Authentication auth,@PathVariable UUID id,
        @RequestHeader("Idempotency-Key") String key) {
        UUID owner=active(auth).identityId(); idempotencyKey(key);
        if(!settings.emailEnabled) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"DOCUMENT_EMAIL_DISABLED");
        return privateResponse(HttpStatus.ACCEPTED,emails.enqueue(owner,id,key));
    }
    @GetMapping("/{id}/emails")
    public ResponseEntity<List<EmailSummary>> emails(Authentication auth,@PathVariable UUID id) {
        return privateResponse(HttpStatus.OK,emails.list(active(auth).identityId(),id));
    }
    private CravesPrincipal active(Authentication auth) {
        CravesPrincipal principal=principal(auth);
        if(!settings.enabled) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"DOCUMENTS_DISABLED");
        return principal;
    }
    private static CravesPrincipal principal(Authentication auth) {
        if(auth==null||!auth.isAuthenticated()||!(auth.getPrincipal() instanceof CravesPrincipal principal)||principal.identityId()==null)
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"ACCESS_TOKEN_REQUIRED");
        if(!principal.hasAnyRole("CUSTOMER","CHEF")) throw new ResponseStatusException(HttpStatus.FORBIDDEN,"DOCUMENT_ROLE_REQUIRED");
        return principal;
    }
    private static <T> ResponseEntity<T> privateResponse(HttpStatus status,T value) {
        return ResponseEntity.status(status).header(HttpHeaders.CACHE_CONTROL,"private, no-store, max-age=0")
            .header("X-Content-Type-Options","nosniff").body(value);
    }
}
