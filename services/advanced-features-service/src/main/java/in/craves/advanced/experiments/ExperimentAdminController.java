package in.craves.advanced.experiments;

import in.craves.advanced.experiments.ExperimentDtos.EventCounts;
import in.craves.advanced.experiments.ExperimentDtos.ExperimentDraftChange;
import in.craves.advanced.experiments.ExperimentDtos.ExperimentResults;
import in.craves.advanced.experiments.ExperimentDtos.ExperimentTransition;
import in.craves.advanced.experiments.ExperimentDtos.ExperimentView;
import in.craves.advanced.experiments.ExperimentDtos.NewExperiment;
import in.craves.advanced.platform.security.CurrentUser;
import in.craves.advanced.platform.security.Roles;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Staff run experiments and read aggregate, small-count-suppressed results. Nobody reads one person's events here. */
@RestController
@RequestMapping("/api/v1/advanced/experiments/admin")
public class ExperimentAdminController {
    private static final String[] EDITORS = {Roles.PLATFORM_ADMIN, Roles.OPERATIONS_ADMIN};
    private static final String[] READERS = {Roles.PLATFORM_ADMIN, Roles.OPERATIONS_ADMIN, Roles.AUDIT_ADMIN};
    private final ExperimentService service;

    public ExperimentAdminController(ExperimentService service) {
        this.service = service;
    }

    @GetMapping("/experiments")
    public ResponseEntity<List<ExperimentView>> listExperiments() {
        CurrentUser.requireAnyRole(READERS);
        return ok(service.list());
    }

    @GetMapping("/experiments/{key}")
    public ResponseEntity<ExperimentView> getExperiment(@PathVariable String key) {
        CurrentUser.requireAnyRole(READERS);
        return ok(service.get(key));
    }

    @PostMapping("/experiments")
    public ResponseEntity<ExperimentView> createExperiment(@Valid @RequestBody NewExperiment request) {
        UUID staff = CurrentUser.requireAnyRole(EDITORS);
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).body(service.create(staff, request));
    }

    @PutMapping("/experiments/{key}")
    public ResponseEntity<ExperimentView> changeExperimentDraft(@PathVariable String key, @Valid @RequestBody ExperimentDraftChange change) {
        UUID staff = CurrentUser.requireAnyRole(EDITORS);
        return ok(service.changeDraft(staff, key, change));
    }

    @PostMapping("/experiments/{key}/start")
    public ResponseEntity<ExperimentView> startExperiment(@PathVariable String key, @Valid @RequestBody ExperimentTransition request) {
        UUID staff = CurrentUser.requireAnyRole(EDITORS);
        return ok(service.start(staff, key, request.expectedVersion()));
    }

    @PostMapping("/experiments/{key}/stop")
    public ResponseEntity<ExperimentView> stopExperiment(@PathVariable String key, @Valid @RequestBody ExperimentTransition request) {
        UUID staff = CurrentUser.requireAnyRole(EDITORS);
        return ok(service.stop(staff, key, request.expectedVersion()));
    }

    @GetMapping("/experiments/{key}/results")
    public ResponseEntity<ExperimentResults> experimentResults(@PathVariable String key, @RequestParam("event") String event) {
        CurrentUser.requireAnyRole(READERS);
        return ok(service.results(key, event));
    }

    @GetMapping("/events/daily")
    public ResponseEntity<EventCounts> dailyEventCounts(@RequestParam("name") String name,
                                                        @RequestParam("from") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                                        @RequestParam("to") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        CurrentUser.requireAnyRole(READERS);
        return ok(service.daily(name, from, to));
    }

    private static <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
