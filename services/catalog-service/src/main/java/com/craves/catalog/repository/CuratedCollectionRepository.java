package com.craves.catalog.repository;

import com.craves.catalog.entity.CuratedCollection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CuratedCollectionRepository extends JpaRepository<CuratedCollection, String> {
    List<CuratedCollection> findAllByOrderByPriorityAsc();
    Optional<CuratedCollection> findBySlug(String slug);
}
