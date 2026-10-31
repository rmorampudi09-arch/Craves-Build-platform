package in.craves.advanced.experiments;

import in.craves.advanced.experiments.ExperimentDtos.AnalyticsEvent;
import in.craves.advanced.experiments.ExperimentDtos.AnalyticsReceipt;
import in.craves.advanced.experiments.ExperimentDtos.EventCounts;
import in.craves.advanced.experiments.ExperimentDtos.ExperimentAssignment;
import in.craves.advanced.experiments.ExperimentDtos.ExperimentDraftChange;
import in.craves.advanced.experiments.ExperimentDtos.ExperimentResults;
import in.craves.advanced.experiments.ExperimentDtos.ExperimentStatus;
import in.craves.advanced.experiments.ExperimentDtos.ExperimentView;
import in.craves.advanced.experiments.ExperimentDtos.NewExperiment;
import in.craves.advanced.experiments.ExperimentDtos.VariantResult;
import in.craves.advanced.experiments.ExperimentRepository.Counts;
import in.craves.advanced.experiments.ExperimentRepository.Stored;
import in.craves.advanced.platform.data.Audit;
import in.craves.advanced.platform.data.PersonalDataContributor;
import in.craves.advanced.platform.web.ApiProblem;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ExperimentService implements PersonalDataContributor {
    static final Duration OLDEST_EVENT = Duration.ofDays(7);
    static final Duration CLOCK_SKEW = Duration.ofMinutes(5);
    static final int MAX_KEYS = 20;
    /** shortcut: a fixed technical abuse cap, not a product rule; make it a setting if real use comes near it. */
    static final int MAX_EVENTS_PER_DAY = 1000;
    static final int MAX_REPORT_DAYS = 92;
    private static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");

    private final ExperimentRepository repository;
    private final Audit audit;
    private final Clock clock;

    public ExperimentService(ExperimentRepository repository, Audit audit, Clock clock) {
        this.repository = repository;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<ExperimentView> list() {
        return repository.all().stream().map(Stored::view).toList();
    }

    @Transactional(readOnly = true)
    public ExperimentView get(String key) {
        return find(key, false).view();
    }

    @Transactional
    public ExperimentView create(UUID staff, NewExperiment request) {
        ExperimentRules.checkVariants(request.variants());
        if (!repository.insert(request.key(), request.description().strip(), request.variants(), staff, clock.instant())) {
            throw ApiProblem.conflict("EXPERIMENT_EXISTS", "An experiment with this key already exists");
        }
        audit.record(ExperimentsModule.ID, staff, "EXPERIMENT_CREATED", "experiment", request.key(), Map.of("variants", request.variants()));
        return get(request.key());
    }

    @Transactional
    public ExperimentView changeDraft(UUID staff, String key, ExperimentDraftChange change) {
        Stored current = find(key, true);
        checkVersion(current, change.expectedVersion());
        if (current.view().status() != ExperimentStatus.DRAFT) {
            throw ApiProblem.conflict("EXPERIMENT_NOT_DRAFT", "Only a draft can change; stop it and create a new experiment");
        }
        ExperimentRules.checkVariants(change.variants());
        repository.updateDraft(key, change.description().strip(), change.variants(), staff, clock.instant());
        audit.record(ExperimentsModule.ID, staff, "EXPERIMENT_CHANGED", "experiment", key, Map.of("variants", change.variants()));
        return get(key);
    }

    @Transactional
    public ExperimentView start(UUID staff, String key, long expectedVersion) {
        return transition(staff, key, expectedVersion, ExperimentStatus.DRAFT, ExperimentStatus.RUNNING);
    }

    @Transactional
    public ExperimentView stop(UUID staff, String key, long expectedVersion) {
        return transition(staff, key, expectedVersion, ExperimentStatus.RUNNING, ExperimentStatus.STOPPED);
    }

    /** Nothing is stored here: the variant comes from the experiment's salt and the person id. */
    @Transactional(readOnly = true)
    public List<ExperimentAssignment> assignments(UUID person, List<String> keys) {
        List<String> asked = keys.stream().map(String::strip).filter(key -> !key.isEmpty()).distinct().toList();
        if (asked.isEmpty()) throw ApiProblem.badRequest("KEYS_REQUIRED", "Name at least one experiment");
        if (asked.size() > MAX_KEYS) throw ApiProblem.badRequest("TOO_MANY_KEYS", "Ask for at most " + MAX_KEYS + " experiments");
        Map<String, Stored> found = repository.byKeys(asked).stream().collect(Collectors.toMap(s -> s.view().key(), Function.identity()));
        return asked.stream().map(key -> {
            Stored stored = found.get(key);
            boolean running = stored != null && stored.view().status() == ExperimentStatus.RUNNING;
            return new ExperimentAssignment(key, running ? ExperimentRules.assign(stored.salt(), person, stored.view().variants()) : null);
        }).toList();
    }

    /**
     * Keeps the events only when the person turned on product analytics; otherwise they are dropped unread.
     * The variant is worked out here, never taken from the app. Retries with the same eventId are recorded once.
     */
    @Transactional
    public AnalyticsReceipt record(UUID person, List<AnalyticsEvent> events) {
        Instant now = clock.instant();
        List<String> invalid = events.stream().filter(event -> event.occurredAt().isBefore(now.minus(OLDEST_EVENT))
                        || event.occurredAt().isAfter(now.plus(CLOCK_SKEW)) || !ExperimentRules.validProperties(event.properties()))
                .map(event -> event.eventId().toString()).toList();
        if (!invalid.isEmpty()) {
            throw new ApiProblem(400, "INVALID_EVENTS", "Events must be from the last 7 days and have flat, short properties", invalid);
        }
        repository.lockPerson(person);
        if (!repository.analyticsConsent(person)) return new AnalyticsReceipt(events.size(), 0, false);
        if (repository.receivedSince(person, now.minus(Duration.ofDays(1))) + events.size() > MAX_EVENTS_PER_DAY) {
            throw new ApiProblem(429, "ANALYTICS_LIMIT", "Too many analytics events from this account today; try again later");
        }
        List<String> keys = events.stream().map(AnalyticsEvent::experimentKey).filter(key -> key != null).distinct().toList();
        Map<String, Stored> experiments = keys.isEmpty() ? Map.of()
                : repository.byKeys(keys).stream().collect(Collectors.toMap(s -> s.view().key(), Function.identity()));
        int recorded = 0;
        for (AnalyticsEvent event : events) {
            Stored experiment = event.experimentKey() == null ? null : experiments.get(event.experimentKey());
            // Drafts never had anyone in them, so an event naming one is kept without the experiment.
            boolean counted = experiment != null && experiment.view().status() != ExperimentStatus.DRAFT;
            String variant = counted ? ExperimentRules.assign(experiment.salt(), person, experiment.view().variants()) : null;
            recorded += repository.insertEvent(person, event.eventId(), event.name(), counted ? event.experimentKey() : null, variant,
                    event.properties(), event.occurredAt(), now);
        }
        return new AnalyticsReceipt(events.size(), recorded, true);
    }

    /** People who sent any event under the experiment, per variant, and how many of them sent {@code eventName}. */
    @Transactional(readOnly = true)
    public ExperimentResults results(String key, String eventName) {
        Stored stored = find(key, false);
        if (eventName == null || !eventName.matches(ExperimentDtos.EVENT_NAME)) throw ApiProblem.badRequest("INVALID_EVENT_NAME", "Name the event to measure");
        Map<String, Counts> counts = repository.results(key, eventName).stream().collect(Collectors.toMap(Counts::variant, Function.identity()));
        List<VariantResult> variants = stored.view().variants().stream().map(variant -> {
            Counts c = counts.getOrDefault(variant.key(), new Counts(variant.key(), 0, 0, 0));
            Long withEvent = ExperimentRules.suppress(c.peopleWithEvent());
            // Event counts are hidden with their people count, so a few people's many events never show.
            return new VariantResult(variant.key(), ExperimentRules.suppress(c.people()), withEvent, withEvent == null ? null : c.events());
        }).toList();
        return new ExperimentResults(key, eventName, ExperimentRules.MIN_REPORTED, variants);
    }

    /** {@code from} and {@code to} are India dates, both included. */
    @Transactional(readOnly = true)
    public EventCounts daily(String eventName, LocalDate from, LocalDate to) {
        if (eventName == null || !eventName.matches(ExperimentDtos.EVENT_NAME)) throw ApiProblem.badRequest("INVALID_EVENT_NAME", "Name the event to count");
        if (from == null || to == null || to.isBefore(from) || from.plusDays(MAX_REPORT_DAYS).isBefore(to.plusDays(1))) {
            throw ApiProblem.badRequest("INVALID_RANGE", "Give from and to dates at most " + MAX_REPORT_DAYS + " days apart");
        }
        return new EventCounts(eventName, ExperimentRules.MIN_REPORTED,
                repository.daily(eventName, from.atStartOfDay(INDIA).toInstant(), to.plusDays(1).atStartOfDay(INDIA).toInstant()));
    }

    @Override
    public String moduleId() {
        return ExperimentsModule.ID;
    }

    @Override
    public Map<String, Object> export(UUID person) {
        Map<String, Object> export = new LinkedHashMap<>();
        export.put("events", repository.eventsOf(person));
        return export;
    }

    @Override
    public int erase(UUID person) {
        repository.lockPerson(person);
        return repository.deleteEventsOf(person);
    }

    private ExperimentView transition(UUID staff, String key, long expectedVersion, ExperimentStatus from, ExperimentStatus to) {
        Stored current = find(key, true);
        checkVersion(current, expectedVersion);
        if (current.view().status() != from) {
            throw ApiProblem.conflict("EXPERIMENT_STATUS", "The experiment is " + current.view().status() + ", not " + from);
        }
        repository.transition(key, to, staff, clock.instant());
        audit.record(ExperimentsModule.ID, staff, to == ExperimentStatus.RUNNING ? "EXPERIMENT_STARTED" : "EXPERIMENT_STOPPED",
                "experiment", key, Map.of());
        return get(key);
    }

    private Stored find(String key, boolean forUpdate) {
        return repository.one(key, forUpdate).orElseThrow(() -> ApiProblem.notFound("EXPERIMENT_NOT_FOUND", "No experiment with this key"));
    }

    private static void checkVersion(Stored current, long expected) {
        if (current.view().version() != expected) {
            throw new ApiProblem(412, "VERSION_MISMATCH", "This changed since you loaded it; reload and try again");
        }
    }
}
