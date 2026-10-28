package in.craves.integration.fleet;

import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * craves.fleet.* in application.yml. The four flags only switch code paths on and are all off by default.
 * authBaseUrl and internalServiceKey reach auth-service's RIDER grant; without both, no call is made.
 * storageEndpoint and storageContainer are the same settings user-chef-service uses for KYC documents.
 * supportPhone is the rider support line shown in the terms and the app; supportWhatsappUrl the riders' group.
 * minAppVersion blocks going online (never a running shift) unless a rider has an override. insuranceLabel describes
 * the group accident cover on the rider's profile; claims go to the support line. tripShiftCredentialEnabled (P2-01, off)
 * lets trip steps carry the shift credential, and tells the app to send them from its native outbox (features).
 * idlePollSeconds (P2-04, 5 to 30, default 10) is how often a phone waiting for offers uploads (/locations nextPollSec).
 * callbackUploadsEnabled (P2-10, off) tells phones to upload on location callbacks with short wake locks instead of holding
 * one wake lock for the whole shift (/locations callbackUploads). privacyNoticeVersion and privacyNoticeUrl (P2-09) are
 * the privacy notice in force and where its text is; riders accept a new version before they continue. Unset: no notice.
 */
@ConfigurationProperties("craves.fleet")
public record FleetProperties(
    boolean enabled,
    boolean riderApiEnabled,
    boolean locationIngestEnabled,
    boolean payoutExecutionEnabled,
    @DefaultValue("true") boolean testMode,
    String authBaseUrl,
    String internalServiceKey,
    String storageEndpoint,
    @DefaultValue("documents") String storageContainer,
    String supportPhone,
    String supportWhatsappUrl,
    @DefaultValue("1.0.0") String minAppVersion,
    String insuranceLabel,
    boolean tripShiftCredentialEnabled,
    @DefaultValue("10") int idlePollSeconds,
    boolean callbackUploadsEnabled,
    String privacyNoticeVersion,
    String privacyNoticeUrl
) {
    public FleetProperties {
        // rider_privacy_acceptance.version is VARCHAR(40): a longer version could never be accepted and would hold every rider.
        if (privacyNoticeVersion != null && privacyNoticeVersion.trim().length() > 40) {
            LoggerFactory.getLogger(FleetProperties.class).error("CRAVES_ALERT alert=FLEET_PRIVACY_NOTICE_VERSION_TOO_LONG length={} "
                + "(no privacy notice is shown; use at most 40 characters)", privacyNoticeVersion.trim().length());
            privacyNoticeVersion = null;
        }
    }
}
