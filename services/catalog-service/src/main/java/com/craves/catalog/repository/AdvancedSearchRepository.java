package com.craves.catalog.repository;

import com.craves.catalog.entity.AdvancedSearch;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AdvancedSearchRepository extends JpaRepository<AdvancedSearch, String> {

    @Query("""
            select a from AdvancedSearch a
            where (:query is null or lower(a.dishName) like lower(concat('%', :query, '%'))
                   or lower(a.chefName) like lower(concat('%', :query, '%'))
                   or lower(a.cuisine) like lower(concat('%', :query, '%')))
              and (:vegOnly = false or a.veg = true)
              and (:healthyOnly = false or a.healthy = true)
              and (:maxPrice is null or a.price <= :maxPrice)
            order by a.rating desc, a.etaMinutes asc
            """)
    List<AdvancedSearch> search(@Param("query") String query,
                                @Param("vegOnly") boolean vegOnly,
                                @Param("healthyOnly") boolean healthyOnly,
                                @Param("maxPrice") BigDecimal maxPrice);

    List<AdvancedSearch> findTop10ByDishNameContainingIgnoreCaseOrChefNameContainingIgnoreCase(String dishName, String chefName);
}
