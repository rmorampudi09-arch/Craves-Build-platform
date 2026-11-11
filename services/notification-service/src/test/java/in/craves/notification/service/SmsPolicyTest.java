package in.craves.notification.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import in.craves.notification.api.CreateNotificationRequest;
import in.craves.notification.api.NotificationRequestResponse;
import in.craves.notification.domain.NotificationChannel;
import in.craves.notification.domain.NotificationStatus;
import in.craves.notification.repository.NotificationRepository;
import in.craves.notification.service.SmsPolicyProperties.SmsTemplate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.web.server.ResponseStatusException;

/** Handbook 082: an event goes out by SMS only with a template the owner listed; nothing is assumed. */
class SmsPolicyTest {
    private static final String TEMPLATE = "64ab12cd34ef56ab78cd90ef";

    @Test
    void onlyWellFormedEntriesAreKept() {
        var parsed = SmsPolicyProperties.parse(" order_created=" + TEMPLATE + ":orderNumber, kitchenName ;DELIVERY_DELIVERED=" + TEMPLATE
            + ";BAD=xyz;=" + TEMPLATE + ";REFUNDED=" + TEMPLATE + ":amount,amount;CHEF_REJECTED=" + TEMPLATE + ":1st;"
            + "ORDER_CREATED=" + TEMPLATE + ";PAYMENT_SUCCEEDED;KITCHEN_LAUNCHED_NEARBY=" + TEMPLATE);
        assertThat(parsed).containsOnlyKeys("ORDER_CREATED", "DELIVERY_DELIVERED");
        assertThat(parsed.get("ORDER_CREATED")).isEqualTo(new SmsTemplate(TEMPLATE, List.of("orderNumber", "kitchenName")));
        assertThat(parsed.get("DELIVERY_DELIVERED").variables()).isEmpty();
        assertThat(SmsPolicyProperties.parse(null)).isEmpty();
        assertThat(SmsPolicyProperties.parse("")).isEmpty();
    }

    @Test
    void offOrUnlistedMeansNoSms() {
        SmsPolicyProperties policy = policy(false);
        assertThat(policy.template("ORDER_CREATED")).isNull();
        policy.setEnabled(true);
        assertThat(policy.template("order_created")).isNotNull();
        assertThat(policy.template("REFUNDED")).isNull();
        assertThat(policy.accepts(request(NotificationChannel.SMS, "ORDER_CREATED", null))).isFalse();
        assertThat(policy.shouldFanOut(request(NotificationChannel.EMAIL, "ORDER_CREATED", UUID.randomUUID()), NotificationChannel.EMAIL)).isFalse();
        assertThat(policy.shouldFanOut(request(NotificationChannel.IN_APP, "ORDER_CREATED", UUID.randomUUID()), NotificationChannel.IN_APP)).isTrue();
        CreateNotificationRequest teamAlert = new CreateNotificationRequest("alert-1", "user-chef-service", "ORDER_CREATED", UUID.randomUUID(),
            "CHEF", NotificationChannel.IN_APP, null, null, "New chef", "Body", "TEAM_ALERT", null, Map.of(), 5);
        assertThat(policy.shouldFanOut(teamAlert, NotificationChannel.IN_APP)).isFalse();
    }

    @Test
    void directSmsIsRefusedUnlessItsEventHasATemplate() {
        NotificationService off = new NotificationService(mock(NotificationRepository.class), new ImportantEmailPolicyProperties(), policy(false));
        assertThatThrownBy(() -> off.create(request(NotificationChannel.SMS, "ORDER_CREATED", UUID.randomUUID())))
            .isInstanceOf(ResponseStatusException.class).hasMessageContaining("Firebase Phone Authentication");

        NotificationRepository repository = mock(NotificationRepository.class);
        NotificationService on = new NotificationService(repository, new ImportantEmailPolicyProperties(), policy(true));
        assertThatThrownBy(() -> on.create(request(NotificationChannel.SMS, "REFUNDED", UUID.randomUUID())))
            .isInstanceOf(ResponseStatusException.class).hasMessageContaining("No SMS template");
        when(repository.insertRequest(any(), any(), any())).thenReturn(response(NotificationChannel.SMS));
        on.create(request(NotificationChannel.SMS, "ORDER_CREATED", UUID.randomUUID()));
        verify(repository).insertRequest(any(), any(), eq(NotificationStatus.PENDING));
    }

    @Test
    void aListedInAppEventGetsOneSmsCopyWithItsOwnKey() {
        NotificationRepository repository = mock(NotificationRepository.class);
        when(repository.insertRequest(any(), any(), any())).thenReturn(response(NotificationChannel.IN_APP));
        NotificationService service = new NotificationService(repository, new ImportantEmailPolicyProperties(), policy(true));

        service.create(request(NotificationChannel.IN_APP, "ORDER_CREATED", UUID.randomUUID()));

        ArgumentCaptor<CreateNotificationRequest> created = ArgumentCaptor.forClass(CreateNotificationRequest.class);
        verify(repository, org.mockito.Mockito.times(2)).insertRequest(any(), created.capture(), any());
        CreateNotificationRequest sms = created.getAllValues().get(1);
        assertThat(sms.channel()).isEqualTo(NotificationChannel.SMS);
        assertThat(sms.requestKey()).isEqualTo("order-1-sms");
        assertThat(sms.address()).isNull();
        assertThat(sms.payload()).containsEntry("orderNumber", "CRV-1042");

        NotificationRepository unlisted = mock(NotificationRepository.class);
        when(unlisted.insertRequest(any(), any(), any())).thenReturn(response(NotificationChannel.IN_APP));
        new NotificationService(unlisted, new ImportantEmailPolicyProperties(), policy(true))
            .create(request(NotificationChannel.IN_APP, "REFUNDED", UUID.randomUUID()));
        verify(unlisted, org.mockito.Mockito.times(1)).insertRequest(any(), any(), any());
        verify(unlisted, never()).insertRequest(any(), org.mockito.ArgumentMatchers.argThat(r -> r.channel() == NotificationChannel.SMS), any());
    }

    private static SmsPolicyProperties policy(boolean enabled) {
        SmsPolicyProperties policy = new SmsPolicyProperties();
        policy.setEnabled(enabled);
        policy.setTemplates("ORDER_CREATED=" + TEMPLATE + ":orderNumber");
        return policy;
    }

    private static CreateNotificationRequest request(NotificationChannel channel, String eventType, UUID userId) {
        return new CreateNotificationRequest("order-1", "order-service", eventType, userId, "CUSTOMER", channel, "ORDER_CREATED_IN_APP",
            "+919999999999", "Order placed", "Your order was placed", "ORDER", UUID.randomUUID(), Map.of("orderNumber", "CRV-1042"), 5);
    }

    private static NotificationRequestResponse response(NotificationChannel channel) {
        return new NotificationRequestResponse(UUID.randomUUID(), "order-1", UUID.randomUUID(), channel, NotificationStatus.PENDING,
            "Order placed", "Your order was placed", "ORDER", UUID.randomUUID(), OffsetDateTime.now(), OffsetDateTime.now());
    }
}
