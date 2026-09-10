package in.craves.userchef.web;

import static org.assertj.core.api.Assertions.assertThat;

import in.craves.userchef.support.SupportCaseStatus;
import in.craves.userchef.web.SupportCaseDtos.SupportCaseDetailResponse;
import in.craves.userchef.web.SupportCaseDtos.SupportCaseMessageResponse;
import in.craves.userchef.web.SupportCaseDtos.SupportCaseStatusHistoryResponse;
import in.craves.userchef.web.SupportCaseDtos.SupportCaseSummaryResponse;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class RequesterSupportViewTest {
    @Test
    void hidesSupportAgentIdentityAssignmentAndInternalStatusNote() {
        UUID requesterId = UUID.fromString("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
        UUID supportId = UUID.fromString("11111111-2222-3333-4444-555555555555");
        UUID caseId = UUID.fromString("99999999-8888-7777-6666-555555555555");
        Instant now = Instant.parse("2026-08-19T14:30:00Z");
        SupportCaseSummaryResponse summary = new SupportCaseSummaryResponse(
            caseId,
            "CRV-ABC",
            requesterId,
            "CUSTOMER",
            null,
            "Order help",
            SupportCaseStatus.IN_PROGRESS,
            supportId,
            now,
            now,
            null,
            null,
            now,
            now
        );
        SupportCaseMessageResponse message = new SupportCaseMessageResponse(
            UUID.randomUUID(),
            supportId,
            "SUPPORT_ADMIN",
            "We are checking this for you.",
            false,
            now
        );
        SupportCaseStatusHistoryResponse history = new SupportCaseStatusHistoryResponse(
            UUID.randomUUID(),
            SupportCaseStatus.OPEN,
            SupportCaseStatus.IN_PROGRESS,
            supportId,
            "SUPPORT_ADMIN",
            "Internal investigation reference",
            now
        );

        SupportCaseDetailResponse redacted = RequesterSupportView.redact(
            new SupportCaseDetailResponse(summary, List.of(message), List.of(history))
        );

        assertThat(redacted.supportCase().assignedToIdentityId()).isNull();
        assertThat(redacted.messages().getFirst().senderIdentityId()).isNull();
        assertThat(redacted.messages().getFirst().senderRole()).isEqualTo("SUPPORT");
        assertThat(redacted.statusHistory().getFirst().actorIdentityId()).isNull();
        assertThat(redacted.statusHistory().getFirst().actorRole()).isEqualTo("SUPPORT");
        assertThat(redacted.statusHistory().getFirst().note()).isNull();
    }
}
