package com.craves.catalog.service;

import com.craves.catalog.dto.CuratedCollectionRequest;
import com.craves.catalog.dto.CuratedCollectionResponse;
import com.craves.catalog.entity.CuratedCollection;
import com.craves.catalog.repository.CuratedCollectionRepository;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CuratedCollectionService {
    private final CuratedCollectionRepository curatedCollectionRepository;
    public CuratedCollectionService(CuratedCollectionRepository curatedCollectionRepository) {
        this.curatedCollectionRepository = curatedCollectionRepository;
    }
    @Transactional(readOnly = true)
    public List<CuratedCollectionResponse> list() {
        return curatedCollectionRepository.findAllByOrderByPriorityAsc().stream().map(this::map).collect(Collectors.toList());
    }
    @Transactional(readOnly = true)
    public CuratedCollectionResponse get(String slug) {
        return curatedCollectionRepository.findBySlug(slug).map(this::map).orElseThrow(() -> new IllegalArgumentException("Collection not found"));
    }
    @Transactional
    public CuratedCollectionResponse create(CuratedCollectionRequest request) {
        CuratedCollection collection = new CuratedCollection();
        collection.setId(UUID.randomUUID().toString());
        collection.setSlug(request.slug());
        collection.setTitle(request.title());
        collection.setSubtitle(request.subtitle());
        collection.setHeroTag(request.heroTag());
        collection.setItemsCsv(request.itemsCsv());
        collection.setPriority(request.priority());
        curatedCollectionRepository.save(collection);
        return map(collection);
    }
    private CuratedCollectionResponse map(CuratedCollection collection) {
        return new CuratedCollectionResponse(collection.getId(), collection.getSlug(), collection.getTitle(), collection.getSubtitle(), collection.getHeroTag(), collection.getItemsCsv(), collection.getPriority());
    }
}
