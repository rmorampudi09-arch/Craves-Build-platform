package in.craves.auth.academy;

import in.craves.auth.admin.InternalAdminRoles;
import in.craves.auth.security.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.*;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/admin/academy")
@ConditionalOnProperty(name="craves.academy.enabled",havingValue="true")
public class AcademyController {
    private final AcademyService service;
    private final AcademyCatalog catalog;
    private final AcademySources sources;
    public AcademyController(AcademyService service,AcademyCatalog catalog,AcademySources sources) {
        this.service=service;this.catalog=catalog;this.sources=sources;
    }
    static CurrentUser requireAdmin(Authentication auth) {
        if(auth==null || !auth.isAuthenticated() || !(auth.getPrincipal() instanceof CurrentUser user))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Verified Craves session required");
        if(user.roles()==null || user.roles().stream().filter(Objects::nonNull).map(r->r.trim().toUpperCase(Locale.ROOT)).noneMatch(InternalAdminRoles.codes()::contains))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Internal administrator role required");
        return user;
    }
    private static boolean hasRole(CurrentUser user,String role) {
        return user.roles()!=null && user.roles().stream().filter(Objects::nonNull).anyMatch(r->r.trim().equalsIgnoreCase(role));
    }
    static CurrentUser requireManager(Authentication auth) {
        CurrentUser user=requireAdmin(auth);
        if(!hasRole(user,InternalAdminRoles.PLATFORM_ADMIN))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"PLATFORM_ADMIN required");
        return user;
    }
    static CurrentUser requireReporter(Authentication auth) {
        CurrentUser user=requireAdmin(auth);
        if(!(hasRole(user,InternalAdminRoles.PLATFORM_ADMIN)||hasRole(user,InternalAdminRoles.AUDIT_ADMIN)))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Platform or audit administrator required");
        return user;
    }
    private static <T> ResponseEntity<T> ok(T data) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("X-Content-Type-Options","nosniff").header("X-Robots-Tag","noindex, nofollow").body(data);
    }
    @GetMapping("/catalog") public ResponseEntity<?> catalog(Authentication auth) {requireAdmin(auth);return ok(catalog.publicCatalog());}
    @GetMapping("/me") public ResponseEntity<?> me(Authentication auth) {
        CurrentUser user=requireAdmin(auth);var result=service.state(user.identityId());
        result.put("canManage",hasRole(user,InternalAdminRoles.PLATFORM_ADMIN));
        result.put("canReport",(hasRole(user,InternalAdminRoles.PLATFORM_ADMIN)||hasRole(user,InternalAdminRoles.AUDIT_ADMIN)));
        return ok(result);
    }
    @PostMapping("/attempts") public ResponseEntity<?> attempt(Authentication auth,@Valid @RequestBody Attempt request) {
        var user=requireAdmin(auth);return ok(service.submit(user.identityId(),request.requestId(),request.courseId(),request.lessonId(),request.version(),request.answers()));
    }
    @PostMapping("/events") public ResponseEntity<?> event(Authentication auth,@Valid @RequestBody Activity request) {
        var user=requireAdmin(auth);service.event(user.identityId(),request.requestId(),request.courseId(),request.lessonId(),request.kind());return ok(Map.of("recorded",true));
    }
    @PutMapping("/preferences") public ResponseEntity<?> preferences(Authentication auth,@Valid @RequestBody Preferences request) {
        var user=requireAdmin(auth);service.preferences(user.identityId(),request.personalized());return ok(Map.of("saved",true));
    }
    @GetMapping("/sources/{courseId}/{index}") public ResponseEntity<?> source(Authentication auth,@PathVariable String courseId,@PathVariable int index) {
        var user=requireAdmin(auth);var source=sources.read(courseId,index);service.audit(user.identityId(),"SOURCE_READ",null);return ok(source);
    }
    @GetMapping("/plans") public ResponseEntity<?> plans(Authentication auth){requireAdmin(auth);return ok(service.plans());}
    @PutMapping("/plans") public ResponseEntity<?> save(Authentication auth,@Valid @RequestBody Plan request) {
        var user=requireManager(auth);service.savePlan(user.identityId(),request.id(),request.title(),request.service(),request.details(),request.status(),request.expectedRevision());return ok(Map.of("saved",true));
    }
    @DeleteMapping("/plans/{id}") public ResponseEntity<?> delete(Authentication auth,@PathVariable UUID id,@RequestParam int revision) {
        var user=requireManager(auth);if(revision<1)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Valid plan revision required");
        service.deletePlan(user.identityId(),id,revision);return ok(Map.of("deleted",true));
    }
    @GetMapping("/analytics") public ResponseEntity<?> analytics(Authentication auth,@RequestParam(defaultValue="0") int page) {
        var user=requireReporter(auth);if(page<0 || page>10000)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid page");return ok(service.analytics(user.identityId(),page));
    }
    public record Attempt(@NotNull UUID requestId,@NotBlank @Size(max=80) String courseId,@NotBlank @Size(max=100) String lessonId,@NotBlank @Size(max=64) String version,@NotNull @Size(min=1,max=20) List<@NotNull Integer> answers){}
    public record Activity(@NotNull UUID requestId,@NotBlank @Size(max=80) String courseId,@NotBlank @Size(max=100) String lessonId,@NotBlank @Size(max=30) String kind){}
    public record Preferences(@NotNull Boolean personalized){}
    public record Plan(@NotNull UUID id,@NotBlank @Size(max=160) String title,@NotBlank @Size(max=80) String service,@NotBlank @Size(max=8000) String details,@NotBlank @Size(max=20) String status,@Min(0) int expectedRevision){}
}
