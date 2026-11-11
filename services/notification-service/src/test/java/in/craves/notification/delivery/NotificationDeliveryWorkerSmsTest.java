package in.craves.notification.delivery;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import in.craves.notification.delivery.NotificationDeliveryModels.DeliveryResult;
import in.craves.notification.delivery.NotificationDeliveryModels.DeliveryWorkItem;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

/** Handbook 082: the worker sends what it can, skips what can never be sent and retries the rest. */
class NotificationDeliveryWorkerSmsTest {
    @Test
    @SuppressWarnings("unchecked")
    void sentSkippedAndRetriedSms() {
        NotificationDeliveryProperties properties = new NotificationDeliveryProperties();
        properties.setSmsEnabled(true);
        NotificationDeliveryRepository repository = mock(NotificationDeliveryRepository.class);
        Msg91SmsAdapter adapter = mock(Msg91SmsAdapter.class);
        ObjectProvider<Msg91SmsAdapter> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(adapter);
        DeliveryWorkItem sent = item(), skipped = item(), retried = item();
        when(repository.claim(eq("SMS"), anyInt(), anyInt(), anyInt())).thenReturn(List.of(sent, skipped, retried));
        DeliveryResult result = new DeliveryResult(Msg91SmsAdapter.PROVIDER, "req-1");
        when(adapter.send(sent)).thenReturn(result);
        when(adapter.send(skipped)).thenThrow(new Msg91SmsAdapter.SmsNotSent("A test number; SMS not sent"));
        IllegalStateException outage = new IllegalStateException("MSG91 SMS request failed or timed out");
        when(adapter.send(retried)).thenThrow(outage);

        new NotificationDeliveryWorker(properties, repository, mock(ObjectProvider.class), mock(ObjectProvider.class), provider).deliver();

        verify(repository).markSent(sent, result);
        verify(repository).skip(skipped, "A test number; SMS not sent");
        verify(repository, never()).markFailure(eq(skipped), anyInt(), anyInt(), any(), any());
        verify(repository).markFailure(retried, properties.getMaxAttempts(), properties.getRetryBaseSeconds(), Msg91SmsAdapter.PROVIDER, outage);
        verify(repository, never()).claim(eq("EMAIL"), anyInt(), anyInt(), anyInt());
        verify(repository, never()).claim(eq("PUSH"), anyInt(), anyInt(), anyInt());
    }

    private static DeliveryWorkItem item() {
        return new DeliveryWorkItem(UUID.randomUUID(), UUID.randomUUID(), "SMS", null, "Title", "Body", "ORDER", UUID.randomUUID(),
            Map.of(), 5, 1, UUID.randomUUID());
    }
}
