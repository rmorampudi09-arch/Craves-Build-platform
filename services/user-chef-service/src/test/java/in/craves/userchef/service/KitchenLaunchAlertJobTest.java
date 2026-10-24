package in.craves.userchef.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import in.craves.userchef.config.KitchenLaunchAlertProperties;
import in.craves.userchef.service.CustomerLaunchAlertService.WaitingCustomer;
import in.craves.userchef.service.CustomerLaunchAlertService.WaitingSpot;
import in.craves.userchef.service.KitchenLaunchDiscovery.NearbyKitchen;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class KitchenLaunchAlertJobTest {
    private static final WaitingSpot SPOT = new WaitingSpot(new BigDecimal("17.465"), new BigDecimal("78.357"));
    private static final UUID KITCHEN_ID = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final Instant ASKED_AT = Instant.parse("2026-10-24T10:00:00Z");

    private KitchenLaunchAlertProperties properties;
    private CustomerLaunchAlertService alerts;
    private KitchenLaunchDiscovery discovery;
    private NotificationInternalClient notifications;
    private KitchenLaunchAlertJob job;
    private UUID customerId;

    @BeforeEach
    void setUp() {
        properties = new KitchenLaunchAlertProperties();
        properties.setEnabled(true);
        alerts = mock(CustomerLaunchAlertService.class);
        discovery = mock(KitchenLaunchDiscovery.class);
        notifications = mock(NotificationInternalClient.class);
        job = new KitchenLaunchAlertJob(properties, alerts, discovery, notifications);
        customerId = UUID.randomUUID();
        when(alerts.waitingSpots(anyInt())).thenReturn(List.of(SPOT));
        when(alerts.waitingAt(SPOT)).thenReturn(List.of(new WaitingCustomer(customerId, "Kondapur", ASKED_AT)));
    }

    @Test
    void doesNothingWhileSwitchedOff() {
        properties.setEnabled(false);

        job.run();

        verifyNoInteractions(alerts, discovery, notifications);
    }

    @Test
    void keepsWaitingWhileNoKitchenDeliversThere() {
        when(discovery.firstKitchen(SPOT.latitudeKey(), SPOT.longitudeKey())).thenReturn(Optional.empty());

        job.run();

        verifyNoInteractions(notifications);
        verify(alerts, never()).markNotified(any(), any(), any());
    }

    @Test
    void tellsEachWaitingCustomerInTheInboxAndByPushThenMarksThemTold() {
        when(discovery.firstKitchen(SPOT.latitudeKey(), SPOT.longitudeKey()))
            .thenReturn(Optional.of(new NearbyKitchen(KITCHEN_ID, "Radha's Kitchen")));
        when(notifications.kitchenLaunched(any(), anyString(), anyString(), anyString(), anyString(), any())).thenReturn(true);

        job.run();

        String key = "kitchen-launch-" + customerId + "-17.465-78.357-" + ASKED_AT.getEpochSecond();
        String title = "Home chefs now cook near Kondapur";
        String body = "Radha's Kitchen now delivers to your address. Tap to see the menu.";
        verify(notifications).kitchenLaunched(customerId, key + "-in-app", "IN_APP", title, body, KITCHEN_ID);
        verify(notifications).kitchenLaunched(customerId, key + "-push", "PUSH", title, body, KITCHEN_ID);
        verify(alerts).markNotified(customerId, SPOT, ASKED_AT);
    }

    @Test
    void triesAgainNextRunWhenAnyRequestFails() {
        when(discovery.firstKitchen(SPOT.latitudeKey(), SPOT.longitudeKey()))
            .thenReturn(Optional.of(new NearbyKitchen(KITCHEN_ID, "Radha's Kitchen")));
        when(notifications.kitchenLaunched(any(), anyString(), eq("IN_APP"), anyString(), anyString(), any())).thenReturn(true);
        when(notifications.kitchenLaunched(any(), anyString(), eq("PUSH"), anyString(), anyString(), any())).thenReturn(false);

        job.run();

        verify(alerts, never()).markNotified(any(), any(), any());
    }

    @Test
    void stopsTheRunWhenCatalogCannotBeAsked() {
        when(discovery.firstKitchen(any(), any())).thenThrow(new IllegalStateException("CRAVES_DISCOVERY_BASE_URL is not set"));

        job.run();

        verify(alerts, never()).waitingAt(any());
        verifyNoInteractions(notifications);
    }

    @Test
    void namesTheAreaOnlyWhenItIsShort() {
        assertThat(KitchenLaunchAlertJob.area("Kondapur")).isEqualTo("Kondapur");
        assertThat(KitchenLaunchAlertJob.area("Plot 21, Kondapur, Hyderabad")).isEqualTo("you");
        assertThat(KitchenLaunchAlertJob.area("  ")).isEqualTo("you");
        assertThat(KitchenLaunchAlertJob.area(null)).isEqualTo("you");
    }
}
