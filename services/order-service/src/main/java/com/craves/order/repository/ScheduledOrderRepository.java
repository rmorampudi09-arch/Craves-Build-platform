package com.craves.order.repository;

import com.craves.order.entity.ScheduledOrder;
import java.time.LocalDateTime;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ScheduledOrderRepository extends JpaRepository<ScheduledOrder, String> {

    @Query("""
            select count(so) from ScheduledOrder so
            where so.chefId = :chefId
              and so.status in ('SCHEDULED', 'LOCKED', 'CONFIRMED')
              and so.slotStart < :slotEnd
              and so.slotEnd > :slotStart
            """)
    long countReservedForChefBetween(
            @Param("chefId") String chefId,
            @Param("slotStart") LocalDateTime slotStart,
            @Param("slotEnd") LocalDateTime slotEnd);
}
