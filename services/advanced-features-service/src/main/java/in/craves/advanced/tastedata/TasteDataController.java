package in.craves.advanced.tastedata;

import in.craves.advanced.platform.data.PersonalDataContributor;
import in.craves.advanced.platform.data.Sql;
import in.craves.advanced.platform.module.ModuleRuntime;
import in.craves.advanced.platform.security.CurrentUser;
import in.craves.advanced.platform.web.ApiProblem;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/advanced/my-taste-data")
public class TasteDataController {
    public record Consent(@NotNull Boolean personalization, @NotNull Boolean productAnalytics, Instant updatedAt) { }

    public record ErasureReceipt(UUID receiptId, int recordsErased, List<String> modules, Instant erasedAt) { }

    private final List<PersonalDataContributor> contributors;
    private final ModuleRuntime runtime;
    private final JdbcTemplate jdbc;
    private final Clock clock;

    public TasteDataController(List<PersonalDataContributor> contributors, ModuleRuntime runtime, JdbcTemplate jdbc, Clock clock) {
        this.contributors = contributors;
        this.runtime = runtime;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @GetMapping("/consent")
    public ResponseEntity<Consent> consent() {
        return ok(consentOf(CurrentUser.id()));
    }

    @PutMapping("/consent")
    public ResponseEntity<Consent> setConsent(@Valid @RequestBody Consent consent) {
        UUID person = CurrentUser.id();
        jdbc.update("INSERT INTO adv_taste_data.consent (person_id, personalization, product_analytics, updated_at) VALUES (?,?,?,?) "
                        + "ON CONFLICT (person_id) DO UPDATE SET personalization = EXCLUDED.personalization, "
                        + "product_analytics = EXCLUDED.product_analytics, updated_at = EXCLUDED.updated_at",
                person, consent.personalization(), consent.productAnalytics(), Sql.ts(clock.instant()));
        return ok(consentOf(person));
    }

    /** Everything the advanced features keep about the caller, module by module. Modules that are switched off are skipped. */
    @GetMapping("/export")
    public ResponseEntity<Map<String, Object>> export() {
        UUID person = CurrentUser.id();
        Map<String, Object> export = new LinkedHashMap<>();
        export.put("personId", person);
        export.put("exportedAt", clock.instant());
        export.put("consent", consentOf(person));
        for (PersonalDataContributor contributor : contributors) {
            if (usable(contributor.moduleId())) export.put(contributor.moduleId(), contributor.export(person));
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header("Content-Disposition", "attachment; filename=\"craves-taste-data.json\"").body(export);
    }

    /** Erases the caller's own data in every module. Requires the header {@code X-Confirm-Erase: ERASE}. */
    @DeleteMapping
    @Transactional
    public ResponseEntity<ErasureReceipt> erase(@RequestHeader(value = "X-Confirm-Erase", required = false) String confirm) {
        if (!"ERASE".equals(confirm)) throw ApiProblem.badRequest("CONFIRMATION_REQUIRED", "Send X-Confirm-Erase: ERASE to erase your data");
        UUID person = CurrentUser.id();
        int total = jdbc.update("DELETE FROM adv_taste_data.consent WHERE person_id = ?", person);
        List<String> modules = new ArrayList<>();
        for (PersonalDataContributor contributor : contributors) {
            if (!usable(contributor.moduleId())) continue;
            total += contributor.erase(person);
            modules.add(contributor.moduleId());
        }
        Instant now = clock.instant();
        UUID receipt = UUID.randomUUID();
        jdbc.update("INSERT INTO adv_taste_data.erasure_receipt (id, person_id, records, modules, created_at) VALUES (?,?,?,?,?)",
                receipt, person, total, modules.toArray(String[]::new), Sql.ts(now));
        return ok(new ErasureReceipt(receipt, total, modules, now));
    }

    private boolean usable(String moduleId) {
        return runtime.modules().stream().filter(m -> m.id().equals(moduleId)).findFirst().map(module -> {
            try {
                runtime.ensureReady(module);
                return true;
            } catch (ApiProblem unavailable) {
                return false;
            }
        }).orElse(false);
    }

    private Consent consentOf(UUID person) {
        return jdbc.query("SELECT personalization, product_analytics, updated_at FROM adv_taste_data.consent WHERE person_id = ?",
                (rs, i) -> new Consent(rs.getBoolean(1), rs.getBoolean(2), Sql.instant(rs, "updated_at")), person)
                .stream().findFirst().orElse(new Consent(false, false, null));
    }

    private static <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
