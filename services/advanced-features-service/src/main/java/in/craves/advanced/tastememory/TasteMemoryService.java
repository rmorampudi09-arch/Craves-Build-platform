package in.craves.advanced.tastememory;

import in.craves.advanced.platform.data.Cursor;
import in.craves.advanced.platform.data.PersonalDataContributor;
import in.craves.advanced.platform.web.ApiProblem;
import in.craves.advanced.tastememory.TasteMemoryDtos.RememberedDish;
import in.craves.advanced.tastememory.TasteMemoryDtos.RememberedDishPage;
import in.craves.advanced.tastememory.TasteMemoryDtos.RememberedDishRequest;
import in.craves.advanced.tastememory.TasteMemoryDtos.TasteProfile;
import in.craves.advanced.tastememory.TasteMemoryDtos.TasteProfileRequest;
import java.time.Clock;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Remembers only what the person asks to remember (no inference), so it does not depend on the personalization consent. */
@Service
public class TasteMemoryService implements PersonalDataContributor {
    static final int MAX_DISHES = 500;
    private final TasteMemoryRepository repository;
    private final Clock clock;

    public TasteMemoryService(TasteMemoryRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public TasteProfile profile(UUID person) {
        return repository.profile(person).orElse(new TasteProfile(null, null, null, null));
    }

    @Transactional
    public TasteProfile saveProfile(UUID person, TasteProfileRequest request) {
        repository.saveProfile(person, request, note(request.note()), clock.instant());
        return profile(person);
    }

    @Transactional
    public RememberedDish rememberDish(UUID person, UUID menuItemId, RememberedDishRequest request) {
        if (!repository.saveDish(person, menuItemId, request, note(request.note()), MAX_DISHES, clock.instant())) {
            throw ApiProblem.conflict("MEMORY_FULL", "You already keep " + MAX_DISHES + " dishes; forget some first");
        }
        return repository.dish(person, menuItemId).orElseThrow();
    }

    @Transactional
    public void forgetDish(UUID person, UUID menuItemId) {
        repository.forgetDish(person, menuItemId);
    }

    @Transactional(readOnly = true)
    public List<RememberedDish> lookup(UUID person, List<UUID> menuItemIds) {
        return repository.dishes(person, menuItemIds.stream().distinct().toList());
    }

    @Transactional(readOnly = true)
    public RememberedDishPage recent(UUID person, String cursor, int limit) {
        Cursor position = Cursor.decode(cursor);
        List<RememberedDish> rows = repository.recent(person, position == null ? null : position.at(), position == null ? null : position.id(),
                limit + 1);
        if (rows.size() <= limit) return new RememberedDishPage(rows, null);
        RememberedDish last = rows.get(limit - 1);
        return new RememberedDishPage(rows.subList(0, limit), new Cursor(last.updatedAt(), last.menuItemId()).encode());
    }

    @Override
    public String moduleId() {
        return TasteMemoryModule.ID;
    }

    @Override
    public Map<String, Object> export(UUID person) {
        Map<String, Object> export = new LinkedHashMap<>();
        export.put("profile", repository.profile(person).orElse(null));
        List<RememberedDish> dishes = new ArrayList<>();
        for (List<RememberedDish> page = repository.recent(person, null, null, 200); !page.isEmpty();
             page = repository.recent(person, page.get(page.size() - 1).updatedAt(), page.get(page.size() - 1).menuItemId(), 200)) {
            dishes.addAll(page);
        }
        export.put("dishes", dishes);
        return export;
    }

    @Override
    public int erase(UUID person) {
        return repository.eraseAll(person);
    }

    private static String note(String note) {
        return note == null || note.isBlank() ? null : note.strip();
    }
}
