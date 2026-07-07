package in.craves.notification.service;

import in.craves.notification.api.AppNoticeResponse;
import in.craves.notification.api.CreateNotificationRequest;
import in.craves.notification.api.NotificationRequestResponse;
import in.craves.notification.domain.NotificationChannel;
import in.craves.notification.domain.NotificationStatus;
import in.craves.notification.repository.NotificationRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
        NotificationStatus initialStatus = channel == NotificationChannel.IN_APP ? NotificationStatus.SENT : NotificationStatus.PENDING;
        NotificationRequestResponse created = repository.insertRequest(requestId, normalizeChannel(request, channel), initialStatus);
        if (channel == NotificationChannel.IN_APP) {
            repository.createAppNotice(created.id(), normalizeChannel(request, channel));
            repository.insertAttempt(created.id(), channel, "craves-in-app", 1, NotificationStatus.SENT, null);
        } else {
            repository.insertAttempt(created.id(), channel, providerName(channel), 1, NotificationStatus.PENDING, "Provider adapter not enabled yet; request persisted for retry.");
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

    private static CreateNotificationRequest normalizeChannel(CreateNotificationRequest request, NotificationChannel channel) {
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

    private static String providerName(NotificationChannel channel) {
        return switch (channel) {
            case EMAIL -> "azure-communication-services";
            case PUSH -> "firebase-cloud-messaging";
            case SMS -> "business-sms-provider";
            case IN_APP -> "craves-in-app";
        };
    }
}
