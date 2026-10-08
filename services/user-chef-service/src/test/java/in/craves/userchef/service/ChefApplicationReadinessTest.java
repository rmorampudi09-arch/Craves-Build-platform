package in.craves.userchef.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import in.craves.userchef.exception.ApiException;
import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.web.ApiDtos.*;
import in.craves.userchef.web.ChefApplicationReadinessController;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ChefApplicationReadinessTest {
    private final ChefApplicationService applications = mock(ChefApplicationService.class);
    private final AuthInternalClient auth = mock(AuthInternalClient.class);
    private final ChefApplicationReadinessService service = new ChefApplicationReadinessService(applications, auth);
    private final CurrentUser user = new CurrentUser(UUID.randomUUID(), "test-firebase", "+919876543210", List.of("CUSTOMER"));
    private final UUID applicationId = UUID.randomUUID();
    private final Instant saved = Instant.parse("2026-10-01T00:00:00Z");

    @Test void unsignedRequestsNeverReadPrivateState() {
        assertEquals(401, assertThrows(ApiException.class, () -> service.getReadiness(null)).getStatus());
        verifyNoInteractions(applications, auth);
    }

    @Test void absentApplicationHasFourMissingRequirementsWithoutCallingEmailAuthority() {
        when(applications.getMyApplication(user)).thenReturn(application(ChefApplicationStatus.NOT_SUBMITTED));
        var result = service.getReadiness(user);
        assertFalse(result.approvalReady());
        assertEquals("NOT_CHECKED", result.emailStatus());
        assertEquals(4, result.requiredDocumentCount());
        assertEquals(0, result.uploadedDocumentCount());
        assertTrue(result.documents().stream().allMatch(item -> item.status().equals("MISSING")));
        assertEquals(5, result.blockingIssues().size());
        assertNull(result.lastSavedAt());
        verifyNoInteractions(auth);
        verify(applications, never()).listMyApplicationEvidence(any());
    }

    @Test void onlyPendingApplicationWithVerifiedEmailAndFourApprovedModernDocumentsIsReady() {
        setup(ChefApplicationStatus.PENDING, modern("APPROVED"));
        var response = new ChefApplicationReadinessController(service).get(user);
        var result = response.getBody();
        assertEquals("no-store", response.getHeaders().getCacheControl());
        assertNotNull(result);
        assertTrue(result.approvalReady());
        assertEquals(4, result.approvedDocumentCount());
        assertTrue(result.blockingIssues().isEmpty());
        assertEquals(saved.plusSeconds(60), result.lastSavedAt());
        verify(auth).requireVerifiedEmail(user.identityId(), "chef@example.test");
        verify(applications).getMyApplication(user);
        verify(applications).listMyApplicationEvidence(user);
        verify(applications).requiredApplicationDocuments(applicationId, false);
        verify(applications).onboardingSubmissionBlocked(applicationId);
        verifyNoMoreInteractions(auth, applications);
    }

    @Test void uploadedEvidenceAndLegacyEvidenceCannotCountAsApproved() {
        setup(ChefApplicationStatus.PENDING, List.of(document(KycDocumentType.AADHAAR_CARD, "APPROVED"),
            document(KycDocumentType.PAN_CARD, "APPROVED"), document(KycDocumentType.APPLICANT_PHOTO, "UPLOADED")));
        var result = service.getReadiness(user);
        assertFalse(result.approvalReady());
        assertEquals(1, result.uploadedDocumentCount());
        assertEquals(0, result.approvedDocumentCount());
        assertEquals(3, result.documents().stream().filter(item -> item.status().equals("MISSING")).count());
        assertTrue(result.documents().stream().noneMatch(item -> item.documentType() == KycDocumentType.AADHAAR_CARD));
    }

    @Test void rejectedDocumentExplainsRepairAndRemainsBlocking() {
        setup(ChefApplicationStatus.PENDING, List.of(document(KycDocumentType.TAX_ID_CARD, "REJECTED")));
        var result = service.getReadiness(user);
        assertFalse(result.approvalReady());
        assertEquals("Please upload a legible copy", result.documents().stream()
            .filter(item -> item.documentType() == KycDocumentType.TAX_ID_CARD).findFirst().orElseThrow().rejectionReason());
        assertTrue(result.blockingIssues().stream().anyMatch(item -> item.code().equals("DOCUMENT_REJECTED")));
    }

    @Test void unverifiedEmailBlocksButAuthorityOutageIsNotMisrepresentedAsUnverified() {
        setup(ChefApplicationStatus.PENDING, modern("APPROVED"));
        when(auth.requireVerifiedEmail(any(), any())).thenThrow(ApiException.conflict("EMAIL_VERIFICATION_REQUIRED", "Verify"));
        assertFalse(service.getReadiness(user).approvalReady());
        assertEquals("VERIFICATION_REQUIRED", service.getReadiness(user).emailStatus());
        var outage = new ApiException(503, "EMAIL_AUTHORITY_UNAVAILABLE", "Unavailable");
        doThrow(outage).when(auth).requireVerifiedEmail(any(), any());
        assertSame(outage, assertThrows(ApiException.class, () -> service.getReadiness(user)));
    }

    @Test void terminalApplicationsCannotBecomeReadyForAnotherApproval() {
        for (var status : List.of(ChefApplicationStatus.APPROVED, ChefApplicationStatus.REJECTED)) {
            setup(status, modern("APPROVED"));
            assertFalse(service.getReadiness(user).approvalReady());
            assertEquals(status, service.getReadiness(user).applicationStatus());
        }
    }

    @Test void unknownDocumentStatesFailClosed() {
        setup(ChefApplicationStatus.PENDING, List.of(document(KycDocumentType.APPLICANT_PHOTO, "INVALID")));
        assertEquals(503, assertThrows(ApiException.class, () -> service.getReadiness(user)).getStatus());
    }

    @Test void newSingleFileProofUsesFourRequirementsAndCannotApproveAnUnsubmittedDraft() {
        var required = java.util.EnumSet.of(KycDocumentType.SELECTED_PROOF_FRONT, KycDocumentType.KITCHEN_PHOTO_1,
            KycDocumentType.KITCHEN_PHOTO_2, KycDocumentType.FSSAI_LICENSE);
        setup(ChefApplicationStatus.PENDING, required.stream().map(type -> document(type, "APPROVED")).toList());
        when(applications.requiredApplicationDocuments(applicationId, false)).thenReturn(required);
        when(applications.onboardingFssaiVerified(applicationId)).thenReturn(true);
        when(applications.onboardingSubmissionBlocked(applicationId)).thenReturn(true);
        var result = service.getReadiness(user);
        assertEquals(4, result.requiredDocumentCount());
        assertEquals(4, result.approvedDocumentCount());
        assertFalse(result.approvalReady());
        assertTrue(result.blockingIssues().stream().anyMatch(item -> item.code().equals("ONBOARDING_NOT_SUBMITTED")));
        when(applications.onboardingSubmissionBlocked(applicationId)).thenReturn(false);
        assertTrue(service.getReadiness(user).approvalReady());
    }

    @Test void newTwoSidedProofRequiresFiveDocumentsIncludingTheBack() {
        var required = java.util.EnumSet.of(KycDocumentType.SELECTED_PROOF_FRONT, KycDocumentType.SELECTED_PROOF_BACK,
            KycDocumentType.KITCHEN_PHOTO_1, KycDocumentType.KITCHEN_PHOTO_2, KycDocumentType.FSSAI_LICENSE);
        setup(ChefApplicationStatus.PENDING, required.stream().filter(type -> type != KycDocumentType.SELECTED_PROOF_BACK)
            .map(type -> document(type, "APPROVED")).toList());
        when(applications.requiredApplicationDocuments(applicationId, false)).thenReturn(required);
        when(applications.onboardingFssaiVerified(applicationId)).thenReturn(true);
        var result = service.getReadiness(user);
        assertEquals(5, result.requiredDocumentCount());
        assertFalse(result.approvalReady());
        assertTrue(result.blockingIssues().stream().anyMatch(item -> item.documentType() == KycDocumentType.SELECTED_PROOF_BACK));
    }

    private void setup(ChefApplicationStatus status, List<KycDocumentResponse> documents) {
        when(applications.getMyApplication(user)).thenReturn(application(status));
        when(applications.requiredApplicationDocuments(applicationId, false)).thenReturn(ChefApplicationService.REQUIRED_APPLICATION_DOCUMENTS);
        when(applications.onboardingSubmissionBlocked(applicationId)).thenReturn(false);
        when(applications.listMyApplicationEvidence(user)).thenReturn(documents);
        when(auth.requireVerifiedEmail(user.identityId(), "chef@example.test")).thenReturn("chef@example.test");
    }

    private List<KycDocumentResponse> modern(String status) {
        return List.of(KycDocumentType.APPLICANT_PHOTO, KycDocumentType.GOVERNMENT_ID_FRONT,
            KycDocumentType.GOVERNMENT_ID_BACK, KycDocumentType.TAX_ID_CARD).stream().map(type -> document(type, status)).toList();
    }

    private KycDocumentResponse document(KycDocumentType type, String status) {
        return new KycDocumentResponse(UUID.randomUUID(), type, "private.png", "private-container", "private-blob",
            "image/png", 100, status, "REJECTED".equals(status) ? "Please upload a legible copy" : null,
            null, saved, saved.plusSeconds(60));
    }

    private ChefApplicationResponse application(ChefApplicationStatus status) {
        return new ChefApplicationResponse(status == ChefApplicationStatus.NOT_SUBMITTED ? null : applicationId,
            user.identityId(), user.phoneNumber(), "chef@example.test", "Test", "Chef", "Test road", null, null,
            "Hyderabad", "Telangana", "500081", null, null, status, null,
            status == ChefApplicationStatus.NOT_SUBMITTED ? null : saved, null, null, List.of());
    }
}
