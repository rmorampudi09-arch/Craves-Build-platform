package in.craves.catalog.service;

import in.craves.catalog.config.CatalogDiscoveryProperties;
import in.craves.catalog.exception.ApiException;
import in.craves.catalog.finance.CatalogFinanceEligibility;
import in.craves.catalog.security.CravesPrincipal;
import in.craves.catalog.service.MediaStorageService.StoredMedia;
import in.craves.catalog.web.ApiDtos.MenuItemImageResponse;
import java.math.BigDecimal;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockMultipartFile;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Destructive fixtures only in the dedicated disposable CI service container. */
@EnabledIfEnvironmentVariable(named="CRAVES_CATALOG_DISPOSABLE_DATABASE",matches="true")
class MenuImageDatabaseTest {
    JdbcTemplate jdbc; MediaStorageService media; CatalogService catalog;
    final UUID chef=UUID.randomUUID(), kitchen=UUID.randomUUID(), dish=UUID.randomUUID();
    final CravesPrincipal owner=new CravesPrincipal(chef,"",Set.of("CHEF"));
    final MockMultipartFile file=new MockMultipartFile("file","dish.png","image/png",new byte[]{1});

    @BeforeEach void setup() {
        assertEquals("true",System.getenv("GITHUB_ACTIONS"),"Disposable CI only; never a local production tunnel");
        String url=System.getenv("CATALOG_TEST_JDBC_URL");
        assertEquals("jdbc:postgresql://localhost:5432/catalog_finance_test",url);
        var ds=new DriverManagerDataSource(url,"postgres",System.getenv("CATALOG_TEST_DB_PASSWORD"));
        jdbc=new JdbcTemplate(ds); jdbc.execute("DROP SCHEMA IF EXISTS catalog_schema CASCADE");
        Flyway.configure().dataSource(ds).schemas("catalog_schema").defaultSchema("catalog_schema").locations("classpath:db/migration").load().migrate();
        media=mock(MediaStorageService.class);
        when(media.uploadMenuImage(any(),any(),any())).thenAnswer(i->{String blob="public/dishes/"+UUID.randomUUID();return new StoredMedia("media",blob,"image/png",1,"https://new.example/"+blob);});
        catalog=new CatalogService(jdbc,media,new CatalogDiscoveryProperties(),mock(CatalogFinanceEligibility.class));
        jdbc.update("INSERT INTO catalog_schema.kitchen_profile(id,identity_id,kitchen_name,address_line1,city,state,latitude,longitude,status) VALUES (?,?,'Photo kitchen','Test fixture address','Hyderabad','Telangana',?,?,'ACTIVE')",kitchen,chef,new BigDecimal("17.44"),new BigDecimal("78.39"));
        jdbc.update("INSERT INTO catalog_schema.menu_item(id,kitchen_id,item_name,category,food_type,price,is_available,status,unit_package_weight_grams,thermobox_required) VALUES (?,?,'Fixture meal','Lunch','VEG',100,true,'ACTIVE',500,false)",dish,kitchen);
    }

    List<MenuItemImageResponse> images() {
        return jdbc.query("SELECT id,is_primary,sort_order,blob_name FROM catalog_schema.menu_item_image WHERE menu_item_id=? ORDER BY sort_order",
            (rs,n)->new MenuItemImageResponse(rs.getObject("id",UUID.class),dish,"media",rs.getString("blob_name"),"image/png",1,null,rs.getInt("sort_order"),rs.getBoolean("is_primary"),null),dish);
    }

    @Test void fivePhotosThenLimitWithoutStoringTheSixth() {
        for (int i=0;i<5;i++) catalog.uploadMenuItemImage(owner,dish,file,false);
        var limit=assertThrows(ApiException.class,()->catalog.uploadMenuItemImage(owner,dish,file,false));
        assertEquals("MENU_IMAGE_LIMIT_REACHED",limit.getCode()); assertEquals(409,limit.getStatus());
        verify(media,times(5)).uploadMenuImage(any(),any(),any());
        assertEquals(1,images().stream().filter(MenuItemImageResponse::primary).count());
    }

    @Test void coverMovesAndRemovingTheCoverPromotesTheNextPhoto() {
        for (int i=0;i<3;i++) catalog.uploadMenuItemImage(owner,dish,file,false);
        var all=images(); assertTrue(all.get(0).primary());
        var item=catalog.setPrimaryMenuItemImage(owner,dish,all.get(2).id());
        assertEquals(List.of(all.get(2).id()),item.images().stream().filter(MenuItemImageResponse::primary).map(MenuItemImageResponse::id).toList());
        item=catalog.deleteMenuItemImage(owner,dish,all.get(2).id());
        assertEquals(2,item.images().size());
        assertEquals(all.get(0).id(),item.images().stream().filter(MenuItemImageResponse::primary).findFirst().orElseThrow().id());
        verify(media).deleteQuietly(all.get(2).blobName());
    }

    @Test void onlyTheOwningChefChangesPhotosAndUnknownPhotosAreRejected() {
        catalog.uploadMenuItemImage(owner,dish,file,false);
        var photo=images().getFirst().id();
        assertEquals("MENU_IMAGE_NOT_FOUND",assertThrows(ApiException.class,()->catalog.deleteMenuItemImage(owner,dish,UUID.randomUUID())).getCode());
        var stranger=new CravesPrincipal(UUID.randomUUID(),"",Set.of("CHEF"));
        assertThrows(ApiException.class,()->catalog.deleteMenuItemImage(stranger,dish,photo));
        assertThrows(ApiException.class,()->catalog.setPrimaryMenuItemImage(stranger,dish,photo));
        assertEquals(1,images().size()); verify(media,never()).deleteQuietly(anyString());
    }
}
