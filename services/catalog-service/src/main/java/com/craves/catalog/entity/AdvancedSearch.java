package com.craves.catalog.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;

@Entity
@Table(name = "advanced_search_index")
public class AdvancedSearch {
    @Id
    private String id;
    @Column(nullable = false)
    private String dishName;
    @Column(nullable = false)
    private String chefName;
    @Column(nullable = false)
    private String cuisine;
    @Column(nullable = false)
    private String locality;
    @Column(nullable = false)
    private boolean veg;
    @Column(nullable = false)
    private boolean healthy;
    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal price;
    @Column(nullable = false)
    private double rating;
    @Column(nullable = false)
    private int etaMinutes;
    @Column(nullable = false)
    private String tags;
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getDishName() { return dishName; }
    public void setDishName(String dishName) { this.dishName = dishName; }
    public String getChefName() { return chefName; }
    public void setChefName(String chefName) { this.chefName = chefName; }
    public String getCuisine() { return cuisine; }
    public void setCuisine(String cuisine) { this.cuisine = cuisine; }
    public String getLocality() { return locality; }
    public void setLocality(String locality) { this.locality = locality; }
    public boolean isVeg() { return veg; }
    public void setVeg(boolean veg) { this.veg = veg; }
    public boolean isHealthy() { return healthy; }
    public void setHealthy(boolean healthy) { this.healthy = healthy; }
    public BigDecimal getPrice() { return price; }
    public void setPrice(BigDecimal price) { this.price = price; }
    public double getRating() { return rating; }
    public void setRating(double rating) { this.rating = rating; }
    public int getEtaMinutes() { return etaMinutes; }
    public void setEtaMinutes(int etaMinutes) { this.etaMinutes = etaMinutes; }
    public String getTags() { return tags; }
    public void setTags(String tags) { this.tags = tags; }
}
