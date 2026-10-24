package in.craves.userchef.service;

import in.craves.userchef.config.KitchenLaunchAlertProperties;
import in.craves.userchef.service.CustomerLaunchAlertService.WaitingCustomer;
import in.craves.userchef.service.CustomerLaunchAlertService.WaitingSpot;
import in.craves.userchef.service.KitchenLaunchDiscovery.NearbyKitchen;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Tells customers who tapped Notify me that a home kitchen now delivers to their spot, once, in the app inbox and
 * as a push. Safe on several replicas at once: notification-service keeps one notification per requestKey, and a
 * customer is marked told only after both requests were accepted, so a failure is simply tried again next run.
 */
@Component
public class KitchenLaunchAlertJob {
    private static final Logger log = LoggerFactory.getLogger(KitchenLaunchAlertJob.class);

    private final KitchenLaunchAlertProperties properties;
    private final CustomerLaunchAlertService alerts;
    private final KitchenLaunchDiscovery discovery;
    private final NotificationInternalClient notifications;

    public KitchenLaunchAlertJob(
        KitchenLaunchAlertProperties properties,
        CustomerLaunchAlertService alerts,
        KitchenLaunchDiscovery discovery,
        NotificationInternalClient notifications
    ) {
        this.properties = properties;
        this.alerts = alerts;
        this.discovery = discovery;
        this.notifications = notifications;
    }

    @Scheduled(
        initialDelayString = "${craves.kitchen-launch-alerts.initial-delay-ms:120000}",
        fixedDelayString = "${craves.kitchen-launch-alerts.fixed-delay-ms:900000}"
    )
    public void run() {
        if (!properties.isEnabled()) {
            return;
        }
        int told = 0;
        for (WaitingSpot spot : alerts.waitingSpots(Math.max(1, properties.getBatchSize()))) {
            Optional<NearbyKitchen> kitchen;
            try {
                // shortcut: asks at the ~110 m rounded spot, not each exact address; fine against a 10 km radius.
                kitchen = discovery.firstKitchen(spot.latitudeKey(), spot.longitudeKey());
            } catch (RuntimeException ex) {
                log.warn("Kitchen launch alerts paused this run; discovery failed: {}", ex.getMessage());
                return;
            }
            if (kitchen.isEmpty()) {
                continue;
            }
            for (WaitingCustomer customer : alerts.waitingAt(spot)) {
                if (tell(customer, spot, kitchen.get())) {
                    alerts.markNotified(customer.identityId(), spot, customer.createdAt());
                    told++;
                }
            }
        }
        if (told > 0) {
            log.info("Kitchen launch alerts sent to {} customers", told);
        }
    }

    private boolean tell(WaitingCustomer customer, WaitingSpot spot, NearbyKitchen kitchen) {
        // createdAt is part of the key, so a customer who asks again after a later closure gets a fresh notification.
        String requestKey = "kitchen-launch-" + customer.identityId() + "-" + spot.latitudeKey().toPlainString() + "-"
            + spot.longitudeKey().toPlainString() + "-" + customer.createdAt().getEpochSecond();
        String title = "Home chefs now cook near " + area(customer.areaName());
        String body = kitchen.name() + " now delivers to your address. Tap to see the menu.";
        boolean inApp = notifications.kitchenLaunched(customer.identityId(), requestKey + "-in-app", "IN_APP", title, body, kitchen.id());
        boolean push = notifications.kitchenLaunched(customer.identityId(), requestKey + "-push", "PUSH", title, body, kitchen.id());
        return inApp && push;
    }

    /** Same rule as the app's comingSoonTitle: a short area name, never a full address line. */
    static String area(String areaName) {
        String area = areaName == null ? "" : areaName.trim();
        return !area.isEmpty() && area.length() <= 28 && !area.contains(",") ? area : "you";
    }
}
