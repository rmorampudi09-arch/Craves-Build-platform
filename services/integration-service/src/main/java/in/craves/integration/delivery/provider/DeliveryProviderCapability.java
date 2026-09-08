package in.craves.integration.delivery.provider;

/**
 * Provider-neutral feature vocabulary. This describes delivery-provider capabilities only; it
 * must never be used to encode Craves commercial routing priority or fee policy.
 */
public enum DeliveryProviderCapability {
    SERVICEABILITY,
    QUOTE,
    QUOTE_ETA,
    CREATE_DELIVERY,
    CANCEL_DELIVERY,
    TRACK,
    TRACKING_LINK,
    WEBHOOK_STATUS,
    LIVE_COURIER_LOCATION,
    PROVIDER_ETA,
    DELIVERY_VERIFICATION,
    PROOF_OF_DELIVERY,
    NDR_ACTION,
    RETURN_TRACKING,
    CREATE_RECONCILIATION,
    MULTI_STOP
}
