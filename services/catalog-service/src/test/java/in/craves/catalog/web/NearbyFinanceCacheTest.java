package in.craves.catalog.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.catalog.config.*;
import in.craves.catalog.exception.ApiException;
import in.craves.catalog.finance.CatalogFinanceEligibility;
import in.craves.catalog.service.*;
import in.craves.catalog.web.DiscoveryDtos.*;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class NearbyFinanceCacheTest {
    @Test void freshAuthorityPrecedesCacheAndRevocationCannotReuseOldPage() {
        var finance = mock(CatalogFinanceEligibility.class);
        var service = mock(NearbyDiscoveryService.class);
        var redis = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked") ValueOperations<String,String> values = mock(ValueOperations.class);
        when(redis.opsForValue()).thenReturn(values);
        var stored = new HashMap<String,String>();
        when(values.get(anyString())).thenAnswer(i -> stored.get(i.getArgument(0)));
        doAnswer(i -> { stored.put(i.getArgument(0), i.getArgument(1)); return null; })
            .when(values).set(anyString(), anyString(), any(Duration.class));
        var cacheProperties = new DiscoveryCacheProperties(); cacheProperties.setEnabled(true);
        var cache = new DiscoveryCacheService(redis, new ObjectMapper().findAndRegisterModules(), cacheProperties, new SimpleMeterRegistry());
        var privacy = new PublicCatalogPrivacyProperties(); privacy.setPrivacyEnforcementEnabled(true);
        var controller = new NearbyDiscoveryController(service, cache, privacy, finance);
        UUID chef = UUID.randomUUID();
        var allowed = new CatalogFinanceEligibility.Snapshot(UUID.randomUUID(),Instant.now(),true,UUID.randomUUID(),1,"a".repeat(64),List.of(chef));
        var revoked = new CatalogFinanceEligibility.Snapshot(UUID.randomUUID(),Instant.now(),true,allowed.policyId(),2,"b".repeat(64),List.of());
        when(finance.current()).thenReturn(allowed,allowed,revoked).thenThrow(new ApiException(503,"UNAVAILABLE","Unavailable"));
        var item = new NearbyKitchenSummaryResponse(UUID.randomUUID(),"Test kitchen","Test",null,"Area","City","State",BigDecimal.ONE,BigDecimal.TEN,10,1);
        var page = new NearbyKitchenDiscoveryResponse(BigDecimal.ONE,BigDecimal.TEN,1000,new PageMetadata(0,1,1,1,false),List.of(item));
        var empty = new NearbyKitchenDiscoveryResponse(BigDecimal.ONE,BigDecimal.TEN,1000,new PageMetadata(0,1,0,0,false),List.of());
        when(service.discoverKitchens(any(),any(),anyInt(),any(),any(),anyInt(),anyInt(),eq(allowed))).thenReturn(page);
        when(service.discoverKitchens(any(),any(),anyInt(),any(),any(),anyInt(),anyInt(),eq(revoked))).thenReturn(empty);
        var first = read(controller); assertNull(first.kitchens().getFirst().latitude()); assertNull(first.kitchens().getFirst().longitude());
        var order = inOrder(finance,values); order.verify(finance).current(); order.verify(values,times(2)).get(anyString());
        assertEquals(first,read(controller));
        assertTrue(read(controller).kitchens().isEmpty());
        verify(service,times(1)).discoverKitchens(any(),any(),anyInt(),any(),any(),anyInt(),anyInt(),eq(allowed));
        verify(service,times(1)).discoverKitchens(any(),any(),anyInt(),any(),any(),anyInt(),anyInt(),eq(revoked));
        clearInvocations(redis,values);
        assertThrows(ApiException.class,() -> read(controller));
        verifyNoInteractions(redis,values);
        verify(finance,times(4)).current();
        assertEquals(2,stored.size());
    }
    private NearbyKitchenDiscoveryResponse read(NearbyDiscoveryController controller) {
        return controller.discoverKitchens(BigDecimal.ONE,BigDecimal.TEN,1000,null,null,null,null,null,null,null,DiscoveryCriteria.KitchenSort.DISTANCE_ASC,0,1);
    }
}
