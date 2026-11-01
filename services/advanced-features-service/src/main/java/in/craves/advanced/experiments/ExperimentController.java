package in.craves.advanced.experiments;

import in.craves.advanced.experiments.ExperimentDtos.AnalyticsEventBatch;
import in.craves.advanced.experiments.ExperimentDtos.AnalyticsReceipt;
import in.craves.advanced.experiments.ExperimentDtos.ExperimentAssignment;
import in.craves.advanced.platform.security.CurrentUser;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** The signed-in person's variants, and their product-analytics events (kept only with consent). */
@RestController
@RequestMapping("/api/v1/advanced/experiments")
public class ExperimentController {
    private final ExperimentService service;

    public ExperimentController(ExperimentService service) {
        this.service = service;
    }

    /** {@code keys} is a comma-separated list of experiment keys, up to 20; variant is null when one is not running. */
    @GetMapping("/mine")
    public ResponseEntity<List<ExperimentAssignment>> myExperimentVariants(@RequestParam("keys") List<String> keys) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.assignments(CurrentUser.id(), keys));
    }

    @PostMapping("/events")
    public ResponseEntity<AnalyticsReceipt> recordAnalyticsEvents(@Valid @RequestBody AnalyticsEventBatch batch) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).cacheControl(CacheControl.noStore()).body(service.record(CurrentUser.id(), batch.events()));
    }
}
