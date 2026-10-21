package in.craves.integration.fleet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class FleetRulesTest {
    static final Instant NOW = Instant.parse("2026-10-20T06:30:00Z");
    static final String APPEAL = "+914000000000";

    @Test
    void masksPhonesAccountsUpiAndPlates() {
        assertThat(FleetRules.maskPhone("+919876543210")).isEqualTo("+91 98xxxxx210");
        assertThat(FleetRules.maskAccount("123456784321")).isEqualTo("xxxxxx4321");
        assertThat(FleetRules.maskUpi("ravi.kumar@okaxis")).isEqualTo("ra****@okaxis");
        assertThat(FleetRules.maskVehicle("TS 09 EA 1234")).isEqualTo("TS09xx1234");
        assertThat(FleetRules.adminName(null, UUID.fromString("12345678-0000-4000-8000-000000000000"))).isEqualTo("Admin 12345678");
    }

    @Test
    void holderNameMatchesTheKycNameIgnoringOrderCaseTitlesAndPunctuation() {
        assertThat(FleetRules.sameName("KUMAR RAVI", "Ravi Kumar")).isTrue();
        assertThat(FleetRules.sameName("Mr. Ravi  Kumar", "ravi kumar")).isTrue();
        assertThat(FleetRules.sameName("Smt. Sita-Devi", "SITA DEVI")).isTrue();
        assertThat(FleetRules.sameName("R Kumar", "Ravi Kumar")).as("an initial is not the name").isFalse();
        assertThat(FleetRules.sameName("Ravi Kumar Reddy", "Ravi Kumar")).isFalse();
        assertThat(FleetRules.sameName("Mr.", "Mr.")).as("nothing left to compare").isFalse();
    }

    @Test
    void safetyPauseSuspendsNowWithAReviewWithin72Hours() {
        assertThat(after("SAFETY_PAUSE", "ACTIVE", null, NOW.plus(Duration.ofHours(72)), null)).isEqualTo("SUSPENDED");
        refused(() -> after("SAFETY_PAUSE", "ACTIVE", null, NOW.plus(Duration.ofHours(73)), null), "REVIEW_BY_TOO_LATE");
        refused(() -> after("SAFETY_PAUSE", "ACTIVE", null, null, null), "REVIEW_BY_TOO_LATE");
        refused(() -> after("SAFETY_PAUSE", "ACTIVE", null, NOW.minusSeconds(1), null), "REVIEW_BY_TOO_LATE");
        refused(() -> after("SAFETY_PAUSE", "PENDING", null, NOW.plus(Duration.ofHours(1)), null), "INVALID_STATUS_TRANSITION");
    }

    @Test
    void noticeNeedsSevenDaysAndChangesNothing() {
        assertThat(after("NOTICE", "ACTIVE", NOW.plus(Duration.ofDays(7)), null, null)).as("the rider keeps working").isEqualTo("ACTIVE");
        assertThat(after("NOTICE", "SUSPENDED", NOW.plus(Duration.ofDays(8)), null, null)).isEqualTo("SUSPENDED");
        refused(() -> after("NOTICE", "ACTIVE", NOW.plus(Duration.ofDays(7)).minusSeconds(1), null, null), "NOTICE_DEADLINE_TOO_SOON");
        refused(() -> after("NOTICE", "ACTIVE", null, null, null), "NOTICE_DEADLINE_TOO_SOON");
    }

    @Test
    void everyKindButRestoreNeedsAnAppealPhone() {
        refused(() -> FleetRules.statusAfter("NOTICE", "ACTIVE", NOW.plus(Duration.ofDays(8)), null, " ", null, NOW), "APPEAL_PHONE_REQUIRED");
        assertThat(FleetRules.statusAfter("RESTORE", "SUSPENDED", null, null, null, null, NOW)).isEqualTo("ACTIVE");
    }

    @Test
    void restoreActivatesPendingRidersAndClosesNoticesOrPauses() {
        assertThat(after("RESTORE", "PENDING", null, null, null)).isEqualTo("ACTIVE");
        assertThat(after("RESTORE", "SUSPENDED", null, null, null)).isEqualTo("ACTIVE");
        assertThat(after("RESTORE", "DEACTIVATED", null, null, null)).isEqualTo("ACTIVE");
        assertThat(after("RESTORE", "ACTIVE", null, null, NOW.plus(Duration.ofDays(3)))).as("withdraws an open notice").isEqualTo("ACTIVE");
        refused(() -> after("RESTORE", "ACTIVE", null, null, null), "INVALID_STATUS_TRANSITION");
    }

    @Test
    void deactivationNeedsAPassedNoticeOrASafetyPauseAndIsNeverAutomatic() {
        assertThat(after("DEACTIVATE", "SUSPENDED", null, null, null)).isEqualTo("DEACTIVATED");
        assertThat(after("DEACTIVATE", "ACTIVE", null, null, NOW)).isEqualTo("DEACTIVATED");
        refused(() -> after("DEACTIVATE", "ACTIVE", null, null, null), "NOTICE_REQUIRED");
        refused(() -> after("DEACTIVATE", "ACTIVE", null, null, NOW.plusSeconds(1)), "NOTICE_REQUIRED");
        refused(() -> after("DEACTIVATE", "PENDING", null, null, null), "INVALID_STATUS_TRANSITION");
        refused(() -> after("DEACTIVATE", "DEACTIVATED", null, null, null), "INVALID_STATUS_TRANSITION");
    }

    private static String after(String kind, String current, Instant deadline, Instant reviewBy, Instant openNoticeDeadline) {
        return FleetRules.statusAfter(kind, current, deadline, reviewBy, APPEAL, openNoticeDeadline, NOW);
    }

    private static void refused(org.assertj.core.api.ThrowableAssert.ThrowingCallable call, String code) {
        assertThatThrownBy(call).isInstanceOfSatisfying(FleetApiException.class, error -> assertThat(error.code()).isEqualTo(code));
    }
}
