package in.craves.catalog.finance;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.catalog.config.CatalogDiscoveryProperties;
import in.craves.catalog.exception.ApiException;
import in.craves.catalog.security.CravesPrincipal;
import in.craves.catalog.service.*;
import in.craves.catalog.web.PublicCatalogBatchDtos.ResolveMenuItemsRequest;
import in.craves.catalog.web.SavedMenuItemDtos.ResolveSavedMenuItemsRequest;
import in.craves.catalog.web.FavoriteHomeFeedDtos.ResolveFavoriteHomeRequest;
import in.craves.catalog.web.BulkMenuAvailabilityDtos.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CatalogSellingGateTest {
    @Test void authorityOutageBlocksEveryPublicReadBeforeCatalogDataAccess() {
        var finance=mock(CatalogFinanceEligibility.class);
        when(finance.current()).thenThrow(new ApiException(503,"CATALOG_ELIGIBILITY_UNAVAILABLE","Unavailable"));
        var jdbc=mock(JdbcTemplate.class); var named=mock(NamedParameterJdbcTemplate.class);
        var catalog=new CatalogService(jdbc,mock(MediaStorageService.class),new CatalogDiscoveryProperties(),finance);
        UUID id=UUID.randomUUID();
        assertThrows(ApiException.class,()->catalog.getPublicKitchen(id));
        assertThrows(ApiException.class,()->catalog.getPublicMenuItem(id));
        assertThrows(ApiException.class,()->catalog.getPublicMenuItems(id));
        assertThrows(ApiException.class,()->catalog.discoverKitchens(null,null,"Hyderabad",null,null));
        assertThrows(ApiException.class,()->new PublicMenuBatchResolveService(named,finance).resolve(new ResolveMenuItemsRequest(List.of(id))));
        assertThrows(ApiException.class,()->new SavedMenuItemReadService(named,finance).resolve(new ResolveSavedMenuItemsRequest(List.of(id))));
        assertThrows(ApiException.class,()->new FavoriteHomeFeedService(named,finance).resolve(new ResolveFavoriteHomeRequest(List.of(id),List.of())));
        assertThrows(ApiException.class,()->new KitchenScheduleService(jdbc,new ObjectMapper(),finance).availability(id,Instant.now()));
        assertThrows(ApiException.class,()->new NearbyDiscoveryService(jdbc,new CatalogDiscoveryProperties(),finance).discoverKitchens(BigDecimal.ONE,BigDecimal.TEN,1000,0,1));
        verifyNoInteractions(jdbc,named);
    }
    @Test void bulkReopeningChecksChefRoleAndFinanceBeforeAnyMutation() {
        var finance=mock(CatalogFinanceEligibility.class); var jdbc=mock(NamedParameterJdbcTemplate.class);
        var service=new BulkMenuAvailabilityService(jdbc,finance);
        UUID chef=UUID.randomUUID(); var request=new BulkAvailabilityRequest(List.of(new AvailabilityChange(UUID.randomUUID(),true,"Test only")));
        assertThrows(ApiException.class,()->service.update(new CravesPrincipal(chef,"",Set.of("CUSTOMER")),request));
        verifyNoInteractions(finance,jdbc);
        doThrow(ApiException.conflict("CHEF_SELLING_NOT_READY","Test hold")).when(finance).requireChef(chef);
        assertThrows(ApiException.class,()->service.update(new CravesPrincipal(chef,"",Set.of("CHEF")),request));
        verify(finance).requireChef(chef);verifyNoInteractions(jdbc);
    }
}
