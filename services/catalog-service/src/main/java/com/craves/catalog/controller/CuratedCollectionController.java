package com.craves.catalog.controller;

import com.craves.catalog.dto.CuratedCollectionRequest;
import com.craves.catalog.dto.CuratedCollectionResponse;
import com.craves.catalog.service.CuratedCollectionService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/catalog/collections")
public class CuratedCollectionController {
    private final CuratedCollectionService curatedCollectionService;
    public CuratedCollectionController(CuratedCollectionService curatedCollectionService) {
        this.curatedCollectionService = curatedCollectionService;
    }
    @GetMapping
    public ResponseEntity<List<CuratedCollectionResponse>> list() {
        return ResponseEntity.ok(curatedCollectionService.list());
    }
    @GetMapping("/{slug}")
    public ResponseEntity<CuratedCollectionResponse> get(@PathVariable String slug) {
        return ResponseEntity.ok(curatedCollectionService.get(slug));
    }
    @PostMapping
    public ResponseEntity<CuratedCollectionResponse> create(@Valid @RequestBody CuratedCollectionRequest request) {
        return ResponseEntity.ok(curatedCollectionService.create(request));
    }
}
