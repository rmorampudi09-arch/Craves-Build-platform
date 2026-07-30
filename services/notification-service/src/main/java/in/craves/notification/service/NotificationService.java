package in.craves.notification.service;

import in.craves.notification.api.AppNoticeResponse;
import in.craves.notification.api.CreateNotificationRequest;
import in.craves.notification.api.NotificationRequestResponse;
import in.craves.notification.domain.NotificationChannel;
import in.craves.notification.domain.NotificationStatus;
import in.craves.notification.repository.NotificationRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class NotificationService {
    private final NotificationRepository repository;

    public NotificationService(NotificationRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public NotificationRequestResponse create(CreateNotificationRequest request) {
        return repository.findByRequestKey(request.requestKey()).orElseGet(() -> createNew(request));
    }

    private NotificationRequestResponse createNew(CreateNotificationRequest request) {
        UUID requestId = UUID.randomUUID();
        NotificationChannel channel = request.channel() == null ? NotificationChannel.IN_APP : request.channel();
        if (channel == NotificationChannel.SMS) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Transactional SMS is not enabled; Firebase Phone Authentication remains the OTP channel"
            );
        }
        NotificationStatus initialStatus = channel == NotificationChannel.IN_APP
            ? NotificationStatus.SENT
            : NotificationStatus.PENDING;
        CreateNotificationRequest normalized = normalizeChannel(request, channel);
        NotificationRequestResponse created = repository.insertRequest(requestId, normalized, initialStatus);
        if (channel == NotificationChannel.IN_APP) {
            repository.createAppNotice(created.id(), normalized);
            repository.insertAttempt(
                created.id(),
                channel,
                "craves-in-app",
                1,
                NotificationStatus.SENT,
                null
            );
        }
        return repository.findByRequestKey(request.requestKey()).orElse(created);
    }

    public List<AppNoticeResponse> appNotices(UUID userId, int limit) {
        return repository.findAppNotices(userId, limit);
    }

    @Transactional
    public void markRead(UUID userId, UUID noticeId) {
        repository.markRead(userId, noticeId);
    }

    private static CreateNotificationRequest normalizeChannel(
        CreateNotificationRequest request,
        NotificationChannel channel
    ) {
        return new CreateNotificationRequest(
            request.requestKey(),
            request.sourceService(),
            request.eventType(),
            request.userId(),
            request.userRole(),
            channel,
            request.templateCode(),
            request.address(),
            request.title(),
            request.body(),
            request.targetType(),
            request.targetId(),
            request.payload(),
            request.priority()
        );
    }
}
