package in.craves.notification.service;

import in.craves.notification.api.NotificationPreferenceCategory;
import in.craves.notification.api.NotificationPreferenceResponse;
import in.craves.notification.api.UpdateNotificationPreferenceRequest;
import in.craves.notification.repository.NotificationPreferenceRepository;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@Service
public class NotificationPreferenceService {
    private final NotificationPreferenceRepository repository;

    public NotificationPreferenceService(NotificationPreferenceRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public List<NotificationPreferenceResponse> preferences(UUID identityId) {
        repository.ensureDefaults(identityId);
        return repository.findByIdentity(identityId);
    }

    @Transactional
    public List<NotificationPreferenceResponse> updatePreferences(UUID identityId, List<UpdateNotificationPreferenceRequest> updates) {
        repository.ensureDefaults(identityId);
        validateUniqueCategories(updates);
        for (UpdateNotificationPreferenceRequest update : updates) {
            repository.updatePreference(identityId, update);
        }
        return repository.findByIdentity(identityId);
    }

    private void validateUniqueCategories(List<UpdateNotificationPreferenceRequest> updates) {
        Set<NotificationPreferenceCategory> seen = EnumSet.noneOf(NotificationPreferenceCategory.class);
        for (UpdateNotificationPreferenceRequest update : updates) {
            if (!seen.add(update.category())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Duplicate notification preference category: " + update.category().name());
            }
        }
    }
}
