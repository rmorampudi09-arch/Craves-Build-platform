package com.craves.order.repository;

import com.craves.order.entity.OrderTracking;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderTrackingRepository extends JpaRepository<OrderTracking, String> {
    List<OrderTracking> findByOrderIdOrderByOccurredAtAsc(String orderId);
}
