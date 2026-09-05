package in.craves.notification.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import in.craves.notification.api.AppNoticePageResponse;
import in.craves.notification.api.AppNoticeResponse;
import in.craves.notification.domain.AppNoticeCursor;
import in.craves.notification.repository.NotificationRepository;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class NotificationServiceInboxTest {
    private NotificationRepository repository;
    private NotificationService service;
    private UUID userId;

    @BeforeEach
    void setUp() {
        repository = mock(NotificationRepository.class);
        ImportantEmailPolicyProperties policy = mock(ImportantEmailPolicyProperties.class);
        service = new NotificationService(repository, policy);
        userId = UUID.fromString("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    }

    @Test
    void returnsStableCursorWhenAnotherPageExists() {
        AppNoticeResponse first = notice(
            "10000000-0000-0000-0000-000000000003",
            OffsetDateTime.of(2026, 8, 19, 19, 30, 3, 0, ZoneOffset.UTC)
        );
        AppNoticeResponse second = notice(
            "10000000-0000-0000-0000-000000000002",
            OffsetDateTime.of(2026, 8, 19, 19, 30, 2, 0, ZoneOffset.UTC)
        );
        AppNoticeResponse extra = notice(
            "10000000-0000-0000-0000-000000000001",
            OffsetDateTime.of(2026, 8, 19, 19, 30, 1, 0, ZoneOffset.UTC)
        );
        when(repository.findAppNoticesPage(eq(userId), eq(3), isNull(), eq(false)))
            .thenReturn(List.of(first, second, extra));

        AppNoticePageResponse page = service.appNoticePage(userId, 2, null, false);

        assertThat(page.notices()).containsExactly(first, second);
        assertThat(page.hasMore()).isTrue();
        assertThat(page.nextCursor()).isNotBlank();
        assertThat(AppNoticeCursorCodec.decode(page.nextCursor()))
            .isEqualTo(new AppNoticeCursor(second.createdAt(), second.id()));
    }

    @Test
    void rejectsInvalidPageSizeBeforeRepositoryAccess() {
        ResponseStatusException exception = catchThrowableOfType(
            () -> service.appNoticePage(userId, 0, null, false),
            ResponseStatusException.class
        );

        assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void rejectsMalformedCursorBeforeRepositoryAccess() {
        ResponseStatusException exception = catchThrowableOfType(
            () -> service.appNoticePage(userId, 20, "not-a-valid-cursor", false),
            ResponseStatusException.class
        );

        assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void markAllReadDelegatesAsIdempotentBulkOperation() {
        service.markAllRead(userId);

        verify(repository).markAllRead(userId);
    }

    private static AppNoticeResponse notice(String id, OffsetDateTime createdAt) {
        return new AppNoticeResponse(
            UUID.fromString(id),
            "Order update",
            "Your order status changed.",
            "ORDER_STATUS_CHANGED",
            "ORDER",
            UUID.fromString("99999999-8888-7777-6666-555555555555"),
            null,
            createdAt
        );
    }
}
