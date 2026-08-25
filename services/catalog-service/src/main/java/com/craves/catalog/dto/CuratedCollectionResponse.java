package com.craves.catalog.dto;

public record CuratedCollectionResponse(String id, String slug, String title, String subtitle, String heroTag, String itemsCsv, int priority) {}
