package in.craves.integration.delivery.status;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.integration.delivery.command.DeliveryCommandProperties;
import in.craves.integration.delivery.pidge.PidgeApiClient;
import in.craves.integration.delivery.status.DeliveryStatusRepository.WebhookWorkItem;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.test.util.ReflectionTestUtils;

class PidgeCallbackReadBackTest {
    final DeliveryCommandProperties properties = new DeliveryCommandProperties();

    @Test
    void theFlagIsOffByDefaultReadTrimmedInAnyCaseAndAcceptsOnlyItsThreeValues() {
        assertThat(properties.getWebhookVerifyFetch()).isEqualTo("off");
        for (String off : new String[] {"", "  ", null, "OFF", "off "}) {
            properties.setWebhookVerifyFetch(off);
            assertThat(properties.getWebhookVerifyFetch()).as("[%s]", off).isEqualTo("off");
            ReflectionTestUtils.invokeMethod(properties, "validate");
        }
        properties.setWebhookVerifyFetch(" Shadow");
        assertThat(properties.getWebhookVerifyFetch()).isEqualTo("shadow");
        properties.setWebhookVerifyFetch("ENFORCE ");
        assertThat(properties.getWebhookVerifyFetch()).isEqualTo("enforce");
        ReflectionTestUtils.invokeMethod(properties, "validate");
        properties.setWebhookVerifyFetch("on");
        assertThatThrownBy(() -> ReflectionTestUtils.invokeMethod(properties, "validate")).hasMessageContaining("webhookVerifyFetch");
    }

    @Test
    void theBeanAndItsThreadExistOnlyInShadowOrEnforce() throws InterruptedException {
        ApplicationContextRunner runner = new ApplicationContextRunner().withUserConfiguration(Wiring.class);
        for (String off : new String[] {null, "", "off", " OFF ", "on"}) {
            (off == null ? runner : runner.withPropertyValues("craves.delivery-command.webhook-verify-fetch=" + off))
                .run(context -> assertThat(context).as("[%s]", off).hasNotFailed().doesNotHaveBean(PidgeCallbackReadBack.class));
        }
        for (String on : new String[] {"shadow", " Enforce "}) {
            AtomicReference<Thread> thread = new AtomicReference<>();
            runner.withPropertyValues("craves.delivery-command.webhook-verify-fetch=" + on).run(context -> {
                assertThat(context).as("[%s]", on).hasSingleBean(PidgeCallbackReadBack.class);
                CompletableFuture<Thread> ran = new CompletableFuture<>();
                assertThat(context.getBean(PidgeCallbackReadBack.class).submit(() -> ran.complete(Thread.currentThread()))).isTrue();
                thread.set(ran.get(10, java.util.concurrent.TimeUnit.SECONDS));
                assertThat(thread.get().getName()).isEqualTo("pidge-webhook-read-back");
            });
            // Closing the context stops the thread.
            thread.get().join(10_000);
            assertThat(thread.get().isAlive()).isFalse();
        }
    }

    @Test
    void withoutTheBeanTheProcessorAsksNothingNewOfItsCollaborators() {
        DeliveryStatusRepository repository = mock(DeliveryStatusRepository.class);
        DeliveryStatusUpdateService statusService = mock(DeliveryStatusUpdateService.class);
        WebhookWorkItem pidgeFinal = new WebhookWorkItem(UUID.randomUUID(), "pidge", "event-1", new ObjectMapper().createObjectNode(), 1);
        when(repository.claimWebhookBatch(anyInt(), anyInt(), anyInt())).thenReturn(List.of(pidgeFinal));
        when(statusService.processWebhook(pidgeFinal)).thenReturn(
            new DeliveryStatusUpdateService.ProcessingResult(UUID.randomUUID(), true, false, "APPLIED"));

        new DeliveryWebhookProcessor(repository, mock(DeliveryLeaseRecoveryRepository.class), statusService, properties).process();

        verify(statusService).processWebhook(pidgeFinal);
        verify(statusService, never()).heard(any());
        verify(statusService, never()).hasJob(any());
        verify(statusService, never()).processAfterReadBack(any(), any());
        verify(statusService, never()).failAfterReadBack(any(), anyInt(), any(), any());
        verify(repository, never()).releaseWebhook(any(), anyInt(), anyInt());
        verify(repository, never()).lockWebhookClaim(any(), anyInt());
    }

    @Configuration(proxyBeanMethods = false)
    @Import(PidgeCallbackReadBack.class)
    static class Wiring {
        @Bean
        PidgeApiClient pidgeApiClient() {
            return mock(PidgeApiClient.class);
        }
    }
}
