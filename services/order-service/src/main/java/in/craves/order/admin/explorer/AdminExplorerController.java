package in.craves.order.admin.explorer;

import in.craves.order.security.CravesPrincipal;
import in.craves.adminexplorer.ExplorerQuery;
import in.craves.adminexplorer.ExplorerEngine;
import in.craves.adminexplorer.ExplorerRateLimiter;
import org.springframework.context.annotation.Import;
import java.time.Instant;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

/** Bulk analytics is limited to platform/audit administrators; no role grant is implied by navigation. */
@RestController
@Import(ExplorerEngine.class)
@RequestMapping("/api/v1/admin/explorer/orders")
public class AdminExplorerController {
    private static final org.slf4j.Logger LOG=org.slf4j.LoggerFactory.getLogger(AdminExplorerController.class);
    private final ExplorerEngine engine;
    private final boolean enabled;
    public AdminExplorerController(ExplorerEngine engine, @Value("${CRAVES_ADMIN_EXPLORER_ENABLED:false}") boolean enabled) {
        this.engine=engine; this.enabled=enabled;
    }
    public record Error(String code, String message, UUID correlationId) {}
    @PostMapping("/query") public ResponseEntity<?> query(Authentication authentication, @RequestBody ExplorerQuery.Request request) {
        if (authentication == null || !authentication.isAuthenticated() || !(authentication.getPrincipal() instanceof CravesPrincipal actor))
            return error(401,"AUTHENTICATION_REQUIRED","A verified Craves administrator session is required");
        if (!actor.hasAnyRole("PLATFORM_ADMIN", "AUDIT_ADMIN"))
            return error(403,"EXPLORER_ACCESS_REQUIRED","Platform or audit administrator access is required for bulk records");
        if (!enabled) return error(503,"EXPLORER_NOT_ENABLED","This explorer is awaiting activation by the release owner");
        ExplorerQuery query;
        try { query=ExplorerQuery.parse(request,ExplorerEngine.DATASET,Instant.now()); }
        catch (IllegalArgumentException e) { return error(400,"INVALID_EXPLORER_QUERY",e.getMessage()); }
        try {
            ExplorerEngine.Result response=engine.read(actor.identityId(), query);
            return ResponseEntity.ok().headers(headers()).header("X-Correlation-ID",response.correlationId().toString()).body(response);
        } catch (ExplorerRateLimiter.Limited e) {
            UUID id=UUID.randomUUID();
            return ResponseEntity.status(429).headers(headers()).header("Retry-After",Integer.toString(e.retryAfter())).header("X-Correlation-ID",id.toString())
                .body(new Error("EXPLORER_RATE_LIMITED","Reporting capacity is limited to 20 reads per minute for this dataset. Please retry shortly",id));
        } catch (ExplorerEngine.Busy e) { return error(429,"EXPLORER_BUSY","Two reports are already running. Please retry shortly"); }
        catch (RuntimeException e) {
            UUID id=UUID.randomUUID();
            LOG.warn("Explorer {} failed; correlation={}; exceptionType={}",ExplorerEngine.DATASET,id,e.getClass().getSimpleName());
            return ResponseEntity.status(503).headers(headers()).header("X-Correlation-ID",id.toString()).body(new Error("EXPLORER_UNAVAILABLE","The report or its audit could not be completed. No replacement values were returned",id));
        }
    }
    private static HttpHeaders headers() {
        HttpHeaders h=new HttpHeaders();h.setCacheControl("no-store");h.set("X-Content-Type-Options","nosniff");h.set("X-Robots-Tag","noindex, nofollow");return h;
    }
    private static ResponseEntity<Error> error(int status,String code,String message) {
        UUID id=UUID.randomUUID(); return ResponseEntity.status(status).headers(headers()).header("X-Correlation-ID",id.toString()).body(new Error(code,message,id));
    }
}
