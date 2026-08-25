package com.craves.catalog.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "curated_collections")
public class CuratedCollection {
    @Id
    private String id;
    @Column(nullable = false, unique = true)
    private String slug;
    @Column(nullable = false)
    private String title;
    @Column(nullable = false)
    private String subtitle;
    @Column(nullable = false)
    private String heroTag;
    @Column(nullable = false, length = 4000)
    private String itemsCsv;
    @Column(nullable = false)
    private int priority;
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getSlug() { return slug; }
    public void setSlug(String slug) { this.slug = slug; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getSubtitle() { return subtitle; }
    public void setSubtitle(String subtitle) { this.subtitle = subtitle; }
    public String getHeroTag() { return heroTag; }
    public void setHeroTag(String heroTag) { this.heroTag = heroTag; }
    public String getItemsCsv() { return itemsCsv; }
    public void setItemsCsv(String itemsCsv) { this.itemsCsv = itemsCsv; }
    public int getPriority() { return priority; }
    public void setPriority(int priority) { this.priority = priority; }
}
