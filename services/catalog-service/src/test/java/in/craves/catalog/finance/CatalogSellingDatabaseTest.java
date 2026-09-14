package in.craves.catalog.finance;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.catalog.config.CatalogDiscoveryProperties;
import in.craves.catalog.exception.ApiException;
import in.craves.catalog.security.CravesPrincipal;
import in.craves.catalog.service.*;
import in.craves.catalog.web.ApiDtos.*;
import in.craves.catalog.web.PublicCatalogBatchDtos.ResolveMenuItemsRequest;
import in.craves.catalog.web.SavedMenuItemDtos.ResolveSavedMenuItemsRequest;
import in.craves.catalog.web.FavoriteHomeFeedDtos.ResolveFavoriteHomeRequest;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Destructive fixtures only in the dedicated disposable CI service container. */
@EnabledIfEnvironmentVariable(named="CRAVES_CATALOG_DISPOSABLE_DATABASE",matches="true")
class CatalogSellingDatabaseTest {
    JdbcTemplate jdbc; CatalogFinanceEligibility finance; CatalogService catalog; NearbyDiscoveryService nearby;
    final UUID allowed=UUID.randomUUID(), blocked=UUID.randomUUID(), kitchen=UUID.randomUUID(), hidden=UUID.randomUUID();
    final UUID dish=UUID.randomUUID(), hiddenDish=UUID.randomUUID();
    final BigDecimal latitude=new BigDecimal("17.4400000"), longitude=new BigDecimal("78.3900000");
    @BeforeEach void setup() {
        assertEquals("true",System.getenv("GITHUB_ACTIONS"),"Disposable CI only; never a local production tunnel");
        String url=System.getenv("CATALOG_TEST_JDBC_URL");
        assertEquals("jdbc:postgresql://localhost:5432/catalog_finance_test",url);
        var ds=new DriverManagerDataSource(url,"postgres",System.getenv("CATALOG_TEST_DB_PASSWORD"));
        jdbc=new JdbcTemplate(ds); jdbc.execute("DROP SCHEMA IF EXISTS catalog_schema CASCADE");
        var flyway=Flyway.configure().dataSource(ds).schemas("catalog_schema").defaultSchema("catalog_schema").locations("classpath:db/migration").load();
        assertTrue(flyway.migrate().migrationsExecuted>=7); assertEquals(0,flyway.migrate().migrationsExecuted); flyway.validate();
        finance=mock(CatalogFinanceEligibility.class); when(finance.current()).thenReturn(snapshot(List.of(allowed)));
        doAnswer(i -> { if (!finance.current().chefs().contains(i.getArgument(0))) throw ApiException.conflict("CHEF_SELLING_NOT_READY","Test hold"); return null; }).when(finance).requireChef(any());
        catalog=new CatalogService(jdbc,mock(MediaStorageService.class),new CatalogDiscoveryProperties(),finance);
        nearby=new NearbyDiscoveryService(jdbc,new CatalogDiscoveryProperties(),finance);
        seed(hidden,blocked,hiddenDish,"A blocked kitchen",latitude);
        seed(kitchen,allowed,dish,"Z allowed kitchen",latitude.add(new BigDecimal("0.001")));
    }
    void seed(UUID id,UUID chef,UUID menu,String name,BigDecimal lat) {
        jdbc.update("INSERT INTO catalog_schema.kitchen_profile(id,identity_id,kitchen_name,address_line1,city,state,latitude,longitude,status) VALUES (?,?,?,'Test fixture address','Hyderabad','Telangana',?,?,'ACTIVE')",id,chef,name,lat,longitude);
        jdbc.update("INSERT INTO catalog_schema.menu_item(id,kitchen_id,item_name,category,food_type,price,is_available,status,unit_package_weight_grams,thermobox_required) VALUES (?,?,'Fixture meal','Lunch','VEG',100,true,'ACTIVE',500,false)",menu,id);
    }
    CatalogFinanceEligibility.Snapshot snapshot(List<UUID> ids) {
        return new CatalogFinanceEligibility.Snapshot(UUID.randomUUID(),Instant.now(),true,UUID.randomUUID(),1,UUID.randomUUID().toString().replace("-","").repeat(2),ids);
    }
    @Test void sqlEligibilityAppliesBeforeNearestPaginationAndBothCounts() {
        var kitchens=nearby.discoverKitchens(latitude,longitude,1000,0,1);
        assertEquals(1,kitchens.page().totalElements()); assertEquals(List.of(kitchen),kitchens.kitchens().stream().map(k->k.id()).toList()); assertFalse(kitchens.page().hasNext());
        var meals=nearby.discoverMenuItems(latitude,longitude,1000,0,1);
        assertEquals(1,meals.page().totalElements()); assertEquals(dish,meals.menuItems().getFirst().id());
        assertTrue(nearby.discoverKitchens(latitude,longitude,1000,1,1).kitchens().isEmpty());
        assertTrue(nearby.discoverMenuItems(latitude,longitude,1000,1,1).menuItems().isEmpty());
        assertEquals(List.of(kitchen),catalog.discoverKitchens(null,null,"Hyderabad",null,null).kitchens().stream().map(k->k.id()).toList());
        assertEquals(List.of(kitchen),catalog.discoverKitchens(latitude,longitude,"Hyderabad",null,null).kitchens().stream().map(k->k.id()).toList());
    }
    @Test void allPublicSellingSurfacesRevokeWhilePrivateAndHistoricalReadsSurvive() {
        var named=new NamedParameterJdbcTemplate(jdbc);
        var batch=new PublicMenuBatchResolveService(named,finance);
        var saved=new SavedMenuItemReadService(named,finance);
        var favorites=new FavoriteHomeFeedService(named,finance);
        var schedules=new KitchenScheduleService(jdbc,new ObjectMapper().findAndRegisterModules(),finance);
        assertEquals(kitchen,catalog.getPublicKitchen(kitchen).id()); assertEquals(dish,catalog.getPublicMenuItem(dish).id());
        assertThrows(ApiException.class,()->catalog.getPublicKitchen(hidden)); assertThrows(ApiException.class,()->catalog.getPublicMenuItem(hiddenDish));
        assertThrows(ApiException.class,()->catalog.getPublicMenuItems(hidden));
        assertEquals(List.of(dish),batch.resolve(new ResolveMenuItemsRequest(List.of(hiddenDish,dish))).stream().map(m->m.id()).toList());
        var savedRows=saved.resolve(new ResolveSavedMenuItemsRequest(List.of(hiddenDish,dish))).items();
        assertFalse(savedRows.get(0).found()); assertNull(savedRows.get(0).price()); assertTrue(savedRows.get(1).found());
        var cards=favorites.resolve(new ResolveFavoriteHomeRequest(List.of(blocked,allowed),List.of(hidden,kitchen))).items();
        assertEquals(2,cards.stream().filter(c->c.exists()).count());
        cards.stream().filter(c->!c.exists()).forEach(c->{assertNull(c.kitchenId());assertNull(c.chefIdentityId());});
        assertThrows(ApiException.class,()->schedules.availability(hidden,Instant.now())); assertNotNull(schedules.availability(kitchen,Instant.now()));
        assertEquals(hidden,catalog.getInternalKitchen(hidden).id());
        assertEquals(hidden,catalog.getMyKitchen(new CravesPrincipal(blocked,"",Set.of("CHEF"))).id());
        when(finance.current()).thenReturn(snapshot(List.of()));
        assertTrue(nearby.discoverKitchens(latitude,longitude,1000,0,1).kitchens().isEmpty());
        assertTrue(batch.resolve(new ResolveMenuItemsRequest(List.of(dish))).isEmpty());
        assertThrows(ApiException.class,()->catalog.getPublicKitchen(kitchen));
        assertEquals(kitchen,catalog.getInternalKitchen(kitchen).id());
    }
    @Test void activeMutationRequiresEligibilityButDraftEditingAndClosingRemainAvailable() {
        var principal=new CravesPrincipal(blocked,"",Set.of("CHEF"));
        var draft=new KitchenProfileRequest("Fixture draft",null,null,null,null,"Fixture address",null,null,null,"Hyderabad","Telangana",null,latitude,longitude,KitchenStatus.DRAFT);
        assertEquals(KitchenStatus.DRAFT,catalog.upsertMyKitchen(principal,draft).status());
        var active=new KitchenProfileRequest(draft.kitchenName(),null,null,null,null,draft.addressLine1(),null,null,null,draft.city(),draft.state(),null,latitude,longitude,KitchenStatus.ACTIVE);
        assertThrows(ApiException.class,()->catalog.upsertMyKitchen(principal,active));
        assertFalse(catalog.updateAvailability(principal,hiddenDish,new AvailabilityRequest(false,"Fixture close")).available());
        assertThrows(ApiException.class,()->catalog.updateAvailability(principal,hiddenDish,new AvailabilityRequest(true,"Fixture reopen")));
        assertEquals("DRAFT",jdbc.queryForObject("SELECT status FROM catalog_schema.kitchen_profile WHERE id=?",String.class,hidden));
    }
}
