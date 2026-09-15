package in.craves.integration.delivery.feedback;

import in.craves.integration.config.DeliveryIntelligenceProperties;
import in.craves.integration.delivery.DeliveryMetricsRepository;
import in.craves.integration.delivery.feedback.DeliveryFeedbackRepository.Claim;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DeliveryFeedbackProcessor {
    private final DeliveryFeedbackRepository repository;
    private final DeliveryMetricsRepository metrics;
    private final DeliveryFeedbackScorer scorer;
    private final DeliveryIntelligenceProperties intelligence;
    public DeliveryFeedbackProcessor(DeliveryFeedbackRepository repository, DeliveryMetricsRepository metrics,
                                    DeliveryFeedbackScorer scorer, DeliveryIntelligenceProperties intelligence) {
        this.repository=repository; this.metrics=metrics; this.scorer=scorer; this.intelligence=intelligence;
    }
    @Transactional(timeout = 10)
    public boolean process(Claim claim) {
        if (!repository.lock(claim)) return false;
        var evidence = repository.evidence(claim.id());
        if ("CANCELLED".equals(evidence.status())) {
            repository.complete(claim, "SKIPPED", "CANCELLATION_CAUSE_UNKNOWN");
            return true;
        }
        var context = scorer.context(evidence);
        var score = scorer.score(evidence);
        var result = metrics.insertOutcomeIfAbsent(context, score, evidence.terminalAt(),
            score.compositeScore() >= intelligence.getSuccessThreshold());
        repository.complete(claim, "RECORDED", result.newlyRecorded() ? "OUTCOME_RECORDED" : "ALREADY_RECORDED");
        return true;
    }
}
