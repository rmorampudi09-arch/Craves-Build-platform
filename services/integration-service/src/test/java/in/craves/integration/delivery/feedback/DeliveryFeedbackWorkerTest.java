package in.craves.integration.delivery.feedback;

import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
import in.craves.integration.config.DeliveryIntelligenceProperties;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class DeliveryFeedbackWorkerTest {
    @Test void disabledIntelligencePreservesPendingWork() {
        var repo=mock(DeliveryFeedbackRepository.class); var processor=mock(DeliveryFeedbackProcessor.class);
        var intelligence=new DeliveryIntelligenceProperties(); intelligence.setEnabled(false);
        new DeliveryFeedbackWorker(repo,processor,new DeliveryFeedbackProperties(),intelligence).run();
        verifyNoInteractions(repo,processor);
    }
    @Test void oneBrokenOutcomeDoesNotStopFollowingOutcomes() {
        var repo=mock(DeliveryFeedbackRepository.class); var processor=mock(DeliveryFeedbackProcessor.class);
        var bad=new DeliveryFeedbackRepository.Claim(UUID.randomUUID(),UUID.randomUUID(),1);
        var good=new DeliveryFeedbackRepository.Claim(UUID.randomUUID(),UUID.randomUUID(),1);
        when(repo.claim(1,8)).thenReturn(List.of(bad),List.of(good),List.of());
        when(processor.process(bad)).thenThrow(new IllegalStateException("simulated"));
        var worker=new DeliveryFeedbackWorker(repo,processor,new DeliveryFeedbackProperties(),new DeliveryIntelligenceProperties());
        worker.run(); verify(repo).failed(bad,8); verify(processor).process(good);
        assertThat(worker.lastSuccessfulPoll()).isNotNull();
    }
    @Test void batchSizeBoundsEachPoll() {
        var repo=mock(DeliveryFeedbackRepository.class); var processor=mock(DeliveryFeedbackProcessor.class);
        var claim=new DeliveryFeedbackRepository.Claim(UUID.randomUUID(),UUID.randomUUID(),1);
        when(repo.claim(1,8)).thenReturn(List.of(claim));
        var properties=new DeliveryFeedbackProperties(); properties.setBatchSize(3);
        new DeliveryFeedbackWorker(repo,processor,properties,new DeliveryIntelligenceProperties()).run();
        verify(processor,times(3)).process(claim);
    }
}
