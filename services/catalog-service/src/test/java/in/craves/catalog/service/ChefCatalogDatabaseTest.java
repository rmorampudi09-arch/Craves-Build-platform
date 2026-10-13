package in.craves.catalog.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import in.craves.catalog.config.CatalogDiscoveryProperties;
import in.craves.catalog.exception.ApiException;
import in.craves.catalog.finance.CatalogFinanceEligibility;
import in.craves.catalog.security.CravesPrincipal;
import in.craves.catalog.service.MediaStorageService.StoredMedia;
import in.craves.catalog.web.ApiDtos.*;
import in.craves.catalog.web.BulkMenuAvailabilityDtos.AvailabilityChange;
import in.craves.catalog.web.BulkMenuAvailabilityDtos.BulkAvailabilityRequest;
import in.craves.catalog.web.FavoriteHomeFeedDtos.ResolveFavoriteHomeRequest;
import in.craves.catalog.web.PublicCatalogBatchDtos.ResolveMenuItemsRequest;
import in.craves.catalog.web.SavedMenuItemDtos.ResolveSavedMenuItemsRequest;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockMultipartFile;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Destructive fixtures only in the dedicated disposable CI service container. */
@EnabledIfEnvironmentVariable(named="CRAVES_CATALOG_DISPOSABLE_DATABASE",matches="true")
class ChefCatalogDatabaseTest {
    JdbcTemplate jdbc; MediaStorageService media; CatalogFinanceEligibility finance; CatalogService catalog;
    NamedParameterJdbcTemplate named;
    final UUID chef=UUID.randomUUID(), kitchen=UUID.randomUUID(), dish=UUID.randomUUID(), dish2=UUID.randomUUID();
    final UUID otherChef=UUID.randomUUID(), otherKitchen=UUID.randomUUID(), otherDish=UUID.randomUUID();
    final CravesPrincipal owner=new CravesPrincipal(chef,"",Set.of("CHEF"));
    final CravesPrincipal stranger=new CravesPrincipal(otherChef,"",Set.of("CHEF"));
    final BigDecimal latitude=new BigDecimal("17.4400000"), longitude=new BigDecimal("78.3900000");
    final MockMultipartFile file=new MockMultipartFile("file","photo.png","image/png",new byte[]{1});
    final ObjectMapper json=new ObjectMapper().findAndRegisterModules();

    @BeforeEach void setup() {
        assertEquals("true",System.getenv("GITHUB_ACTIONS"),"Disposable CI only; never a local production tunnel");
        String url=System.getenv("CATALOG_TEST_JDBC_URL");
        assertEquals("jdbc:postgresql://localhost:5432/catalog_finance_test",url);
        var ds=new DriverManagerDataSource(url,"postgres",System.getenv("CATALOG_TEST_DB_PASSWORD"));
        jdbc=new JdbcTemplate(ds); jdbc.execute("DROP SCHEMA IF EXISTS catalog_schema CASCADE");
        Flyway.configure().dataSource(ds).schemas("catalog_schema").defaultSchema("catalog_schema").locations("classpath:db/migration").load().migrate();
        named=new NamedParameterJdbcTemplate(jdbc);
        media=mock(MediaStorageService.class);
        when(media.uploadKitchenImage(any(),any(),any())).thenAnswer(i->{String blob="public/kitchens/"+i.getArgument(0)+"/"+i.getArgument(1).toString().toLowerCase()+"/"+UUID.randomUUID();return new StoredMedia("media",blob,"image/png",1,"https://media.example/"+blob);});
        when(media.uploadMenuImage(any(),any(),any())).thenAnswer(i->{String blob="public/dishes/"+UUID.randomUUID();return new StoredMedia("media",blob,"image/png",1,"https://media.example/"+blob);});
        finance=mock(CatalogFinanceEligibility.class);
        when(finance.current()).thenReturn(new CatalogFinanceEligibility.Snapshot(UUID.randomUUID(),Instant.now(),true,UUID.randomUUID(),1,UUID.randomUUID().toString().replace("-","").repeat(2),List.of(chef,otherChef)));
        catalog=new CatalogService(jdbc,media,new CatalogDiscoveryProperties(),finance);
        seed(kitchen,chef,dish,"Chef kitchen"); seedDish(kitchen,dish2);
        seed(otherKitchen,otherChef,otherDish,"Other kitchen");
    }

    void seed(UUID kitchenId,UUID identity,UUID menu,String name) {
        jdbc.update("INSERT INTO catalog_schema.kitchen_profile(id,identity_id,kitchen_name,address_line1,city,state,latitude,longitude,status) VALUES (?,?,?,'Test fixture address','Hyderabad','Telangana',?,?,'ACTIVE')",kitchenId,identity,name,latitude,longitude);
        seedDish(kitchenId,menu);
    }
    void seedDish(UUID kitchenId,UUID menu) {
        jdbc.update("INSERT INTO catalog_schema.menu_item(id,kitchen_id,item_name,category,food_type,price,is_available,status,unit_package_weight_grams,thermobox_required) VALUES (?,?,'Fixture meal','Lunch','VEG',100,true,'ACTIVE',500,false)",menu,kitchenId);
    }
    String status(UUID menu) { return jdbc.queryForObject("SELECT status FROM catalog_schema.menu_item WHERE id=?",String.class,menu); }
    KitchenProfileRequest request(String name,List<String> cuisines,List<String> areas,SocialLinks links) {
        return new KitchenProfileRequest(name,null,null,null,null,"Test fixture address",null,null,null,"Hyderabad","Telangana",null,latitude,longitude,KitchenStatus.ACTIVE,cuisines,areas,links);
    }
    static ApiException rejected(Runnable call) { return assertThrows(ApiException.class,call::run); }

    // ---- kitchen profile: PUT keeps what it does not mention ----

    @Test void oldShapePutKeepsStoredCuisinesAreasSocialLinksPhotosAndSettings() throws Exception {
        catalog.upsertMyKitchen(owner,request("Chef kitchen",List.of("North Indian","Hyderabadi"),List.of("Gachibowli","Madhapur"),new SocialLinks("https://instagram.com/chef",null,null,"https://chef.example")));
        catalog.uploadKitchenPhoto(owner,KitchenPhotoKind.CHEF,file);
        catalog.uploadKitchenPhoto(owner,KitchenPhotoKind.KITCHEN,file);
        catalog.updateKitchenSettings(owner,new KitchenSettings(true,30));
        var before=catalog.getMyKitchen(owner);
        assertEquals(List.of("North Indian","Hyderabadi"),before.cuisines());

        // exactly what craves.in and the 1.30.0 app send: none of the new fields
        var oldShape=json.readValue("{\"kitchenName\":\"Renamed kitchen\",\"addressLine1\":\"Test fixture address\",\"city\":\"Hyderabad\",\"state\":\"Telangana\",\"status\":\"ACTIVE\"}",KitchenProfileRequest.class);
        var after=catalog.upsertMyKitchen(owner,oldShape);

        assertEquals("Renamed kitchen",after.kitchenName());
        assertEquals(before.cuisines(),after.cuisines());
        assertEquals(before.serviceAreas(),after.serviceAreas());
        assertEquals(before.socialLinks(),after.socialLinks());
        assertNotNull(after.chefPhotoUrl()); assertEquals(before.chefPhotoUrl(),after.chefPhotoUrl());
        assertNotNull(after.kitchenPhotoUrl()); assertEquals(before.kitchenPhotoUrl(),after.kitchenPhotoUrl());
        assertEquals(new KitchenSettings(true,30),catalog.getKitchenSettings(owner));
        // explicit nulls are the same as absent
        var nulls=catalog.upsertMyKitchen(owner,request("Renamed again",null,null,null));
        assertEquals(before.cuisines(),nulls.cuisines()); assertEquals(before.socialLinks(),nulls.socialLinks());
    }

    @Test void aNewKitchenWithoutTheNewFieldsStartsWithEmptyValues() throws Exception {
        var newcomer=new CravesPrincipal(UUID.randomUUID(),"",Set.of("CHEF"));
        var created=catalog.upsertMyKitchen(newcomer,request("Brand new",null,null,null));
        assertEquals(List.of(),created.cuisines()); assertEquals(List.of(),created.serviceAreas());
        assertEquals(new SocialLinks(null,null,null,null),created.socialLinks());
        assertNull(created.chefPhotoUrl()); assertNull(created.kitchenPhotoUrl());
        assertEquals(new KitchenSettings(false,null),catalog.getKitchenSettings(newcomer));
    }

    @Test void newFieldsAreStoredTrimmedAndAnExplicitEmptyListOrObjectClears() {
        var saved=catalog.upsertMyKitchen(owner,request("Chef kitchen",List.of(" Biryani ","Andhra"),List.of("Kondapur"),new SocialLinks(" https://instagram.com/chef ","  ",null,null)));
        assertEquals(List.of("Biryani","Andhra"),saved.cuisines());
        assertEquals(List.of("Kondapur"),saved.serviceAreas());
        assertEquals(new SocialLinks("https://instagram.com/chef",null,null,null),saved.socialLinks());

        var cleared=catalog.upsertMyKitchen(owner,request("Chef kitchen",List.of(),null,new SocialLinks(null,null,null,null)));
        assertEquals(List.of(),cleared.cuisines());
        assertEquals(List.of("Kondapur"),cleared.serviceAreas());
        assertEquals(new SocialLinks(null,null,null,null),cleared.socialLinks());
        // the persisted row, read back through a fresh service
        var reloaded=new CatalogService(new JdbcTemplate(jdbc.getDataSource()),media,new CatalogDiscoveryProperties(),finance).getMyKitchen(owner);
        assertEquals(cleared,reloaded);
    }

    @Test void limitsAreEnforcedAtTheBoundaryAndNothingChangesWhenARequestIsRejected() {
        var ten=java.util.stream.IntStream.range(0,10).mapToObj(i->"Cuisine "+i).toList();
        var eleven=java.util.stream.IntStream.range(0,11).mapToObj(i->"Cuisine "+i).toList();
        String forty="x".repeat(40), link200="https://a.example/"+"p".repeat(200-"https://a.example/".length());
        assertEquals(10,catalog.upsertMyKitchen(owner,request("Chef kitchen",ten,null,null)).cuisines().size());
        assertEquals(List.of(forty),catalog.upsertMyKitchen(owner,request("Chef kitchen",null,List.of(forty),null)).serviceAreas());
        assertEquals(link200,catalog.upsertMyKitchen(owner,request("Chef kitchen",null,null,new SocialLinks(link200,null,null,null))).socialLinks().instagram());
        var good=catalog.getMyKitchen(owner);

        for (var bad:List.<KitchenProfileRequest>of(
            request("Changed",eleven,null,null),
            request("Changed",null,eleven,null),
            request("Changed",List.of("x".repeat(41)),null,null),
            request("Changed",null,List.of("   "),null),
            request("Changed",Arrays.asList("ok",null),null,null),
            request("Changed",null,null,new SocialLinks("http://instagram.com/chef",null,null,null)),
            request("Changed",null,null,new SocialLinks(null,"javascript:alert(1)",null,null)),
            request("Changed",null,null,new SocialLinks(null,null,"https://",null)),
            request("Changed",null,null,new SocialLinks(null,null,null,"https://exa mple.com")),
            request("Changed",null,null,new SocialLinks(null,null,null,link200+"p")))) {
            var ex=rejected(()->catalog.upsertMyKitchen(owner,bad));
            assertEquals(400,ex.getStatus()); assertNotNull(ex.getCode());
        }
        assertEquals(good,catalog.getMyKitchen(owner));
    }

    // ---- kitchen photos ----

    @Test void photoUploadStoresTheUrlPerKindAndDeleteClearsOnlyThatKind() {
        var withKitchenPhoto=catalog.uploadKitchenPhoto(owner,KitchenPhotoKind.KITCHEN,file);
        verify(media).uploadKitchenImage(kitchen,KitchenPhotoKind.KITCHEN,file);
        assertNotNull(withKitchenPhoto.kitchenPhotoUrl()); assertTrue(withKitchenPhoto.kitchenPhotoUrl().startsWith("https://media.example/public/kitchens/"+kitchen+"/kitchen/"));
        assertNull(withKitchenPhoto.chefPhotoUrl());
        assertEquals(withKitchenPhoto.kitchenPhotoUrl(),catalog.getMyKitchen(owner).kitchenPhotoUrl());

        var both=catalog.uploadKitchenPhoto(owner,KitchenPhotoKind.CHEF,file);
        assertNotNull(both.chefPhotoUrl()); assertEquals(withKitchenPhoto.kitchenPhotoUrl(),both.kitchenPhotoUrl());

        var replaced=catalog.uploadKitchenPhoto(owner,KitchenPhotoKind.KITCHEN,file);
        assertNotEquals(withKitchenPhoto.kitchenPhotoUrl(),replaced.kitchenPhotoUrl());
        verify(media).deleteByPublicUrl(withKitchenPhoto.kitchenPhotoUrl());

        var cleared=catalog.deleteKitchenPhoto(owner,KitchenPhotoKind.KITCHEN);
        assertNull(cleared.kitchenPhotoUrl()); assertEquals(both.chefPhotoUrl(),cleared.chefPhotoUrl());
        verify(media).deleteByPublicUrl(replaced.kitchenPhotoUrl());
        assertNull(catalog.getMyKitchen(owner).kitchenPhotoUrl());
        assertNull(catalog.deleteKitchenPhoto(owner,KitchenPhotoKind.KITCHEN).kitchenPhotoUrl()); // nothing left: still fine
        verify(media,never()).deleteByPublicUrl(both.chefPhotoUrl());
        // other chef's kitchen was never touched
        assertNull(catalog.getMyKitchen(stranger).kitchenPhotoUrl());
    }

    @Test void photoRoutesAreChefOnlyAndNeedAKitchen() {
        assertEquals("CHEF_ROLE_REQUIRED",rejected(()->catalog.uploadKitchenPhoto(new CravesPrincipal(chef,"",Set.of("CUSTOMER")),KitchenPhotoKind.CHEF,file)).getCode());
        assertEquals("CHEF_ROLE_REQUIRED",rejected(()->catalog.deleteKitchenPhoto(new CravesPrincipal(chef,"",Set.of("CUSTOMER")),KitchenPhotoKind.CHEF)).getCode());
        var newcomer=new CravesPrincipal(UUID.randomUUID(),"",Set.of("CHEF"));
        assertEquals("KITCHEN_PROFILE_REQUIRED",rejected(()->catalog.uploadKitchenPhoto(newcomer,KitchenPhotoKind.CHEF,file)).getCode());
        verify(media,never()).uploadKitchenImage(any(),any(),any());
    }

    // ---- chef settings ----

    @Test void settingsRoundTripAndAreValidated() {
        assertEquals(new KitchenSettings(false,null),catalog.getKitchenSettings(owner));
        assertEquals(new KitchenSettings(true,25),catalog.updateKitchenSettings(owner,new KitchenSettings(true,25)));
        assertEquals(new KitchenSettings(true,25),catalog.getKitchenSettings(owner));
        assertEquals(new KitchenSettings(true,5),catalog.updateKitchenSettings(owner,new KitchenSettings(true,5)));
        assertEquals(new KitchenSettings(true,120),catalog.updateKitchenSettings(owner,new KitchenSettings(true,120)));
        for (var bad:List.of(new KitchenSettings(true,4),new KitchenSettings(true,121),new KitchenSettings(true,0),new KitchenSettings(true,-30),new KitchenSettings(null,30))) {
            var ex=rejected(()->catalog.updateKitchenSettings(owner,bad));
            assertEquals(400,ex.getStatus());
        }
        assertEquals(new KitchenSettings(true,120),catalog.getKitchenSettings(owner));
        assertEquals(new KitchenSettings(false,null),catalog.updateKitchenSettings(owner,new KitchenSettings(false,null)));
        assertEquals(new KitchenSettings(false,null),catalog.getKitchenSettings(stranger));
        assertEquals("CHEF_ROLE_REQUIRED",rejected(()->catalog.getKitchenSettings(new CravesPrincipal(chef,"",Set.of("CUSTOMER")))).getCode());
    }

    @Test void updatingSettingsBumpsUpdatedAtLikeEveryOtherKitchenWrite() {
        jdbc.update("UPDATE catalog_schema.kitchen_profile SET updated_at=now()-interval '1 day' WHERE id=?",kitchen);
        var before=jdbc.queryForObject("SELECT updated_at FROM catalog_schema.kitchen_profile WHERE id=?",java.sql.Timestamp.class,kitchen);
        catalog.updateKitchenSettings(owner,new KitchenSettings(true,20));
        var after=jdbc.queryForObject("SELECT updated_at FROM catalog_schema.kitchen_profile WHERE id=?",java.sql.Timestamp.class,kitchen);
        assertTrue(after.after(before),"updated_at must move forward: "+before+" -> "+after);
    }

    @Test void theInternalKitchenReadExposesSettingsForOrderServiceButThePublicReadDoesNot() throws Exception {
        catalog.upsertMyKitchen(owner,request("Chef kitchen",List.of("Andhra"),List.of("Kondapur"),null));
        catalog.uploadKitchenPhoto(owner,KitchenPhotoKind.KITCHEN,file);
        catalog.updateKitchenSettings(owner,new KitchenSettings(true,45));

        var internal=json.readTree(json.writeValueAsString(catalog.getInternalKitchen(kitchen)));
        assertTrue(internal.get("autoAcceptOrders").asBoolean());
        assertEquals(45,internal.get("defaultPrepMinutes").asInt());
        assertEquals(chef.toString(),internal.get("identityId").asText()); // existing fields unchanged

        var publicRead=catalog.getPublicKitchen(kitchen);
        var publicJson=json.readTree(json.writeValueAsString(publicRead));
        assertFalse(publicJson.has("autoAcceptOrders")); assertFalse(publicJson.has("defaultPrepMinutes"));
        assertEquals("Andhra",publicJson.get("cuisines").get(0).asText());
        assertEquals(publicRead.kitchenPhotoUrl(),publicJson.get("kitchenPhotoUrl").asText());
    }

    // ---- dish archive ----

    @Test void archivingADishHidesItFromEveryCustomerAndChefListButKeepsItsPhotos() {
        catalog.uploadMenuItemImage(owner,dish,file,true); catalog.uploadMenuItemImage(owner,dish,file,false);
        var batch=new PublicMenuBatchResolveService(named,finance);
        var saved=new SavedMenuItemReadService(named,finance);
        var favorites=new FavoriteHomeFeedService(named,finance);
        assertEquals(2,catalog.listMyMenuItems(owner).size());
        assertEquals(2,catalog.getPublicMenuItems(kitchen).size());
        assertEquals(2,favorites.resolve(new ResolveFavoriteHomeRequest(null,List.of(kitchen))).items().getFirst().activeAvailableDishCount());

        catalog.archiveMenuItem(owner,dish);

        assertEquals("ARCHIVED",status(dish));
        assertFalse(jdbc.queryForObject("SELECT is_available FROM catalog_schema.menu_item WHERE id=?",Boolean.class,dish));
        assertEquals(List.of(dish2),catalog.listMyMenuItems(owner).stream().map(MenuItemResponse::id).toList());
        assertEquals(List.of(dish2),catalog.getPublicMenuItems(kitchen).stream().map(MenuItemResponse::id).toList());
        assertEquals("MENU_ITEM_NOT_FOUND",rejected(()->catalog.getPublicMenuItem(dish)).getCode()); // the read a checkout makes
        assertEquals(404,rejected(()->catalog.getPublicMenuItem(dish)).getStatus());
        assertEquals(List.of(dish2),batch.resolve(new ResolveMenuItemsRequest(List.of(dish,dish2))).stream().map(m->m.id()).toList());
        assertTrue(batch.resolve(new ResolveMenuItemsRequest(List.of(dish))).isEmpty());
        var savedRows=saved.resolve(new ResolveSavedMenuItemsRequest(List.of(dish,dish2))).items();
        assertFalse(savedRows.get(0).found()); assertNull(savedRows.get(0).itemName()); assertTrue(savedRows.get(1).found());
        var card=favorites.resolve(new ResolveFavoriteHomeRequest(null,List.of(kitchen))).items().getFirst();
        assertEquals(1,card.activeAvailableDishCount());
        assertEquals(List.of(dish2),card.menuPreview().stream().map(p->p.menuItemId()).toList());

        assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM catalog_schema.menu_item_image WHERE menu_item_id=?",Integer.class,dish));
        verify(media,never()).deleteQuietly(anyString());

        catalog.archiveMenuItem(owner,dish2);
        assertTrue(catalog.discoverKitchens(null,null,"Hyderabad",null,null).kitchens().stream().noneMatch(k->k.id().equals(kitchen)));
        assertTrue(catalog.listMyMenuItems(owner).isEmpty());
    }

    @Test void anArchivedDishCannotBeEditedReopenedPhotographedOrBroughtBack() {
        catalog.archiveMenuItem(owner,dish);
        var revive=new MenuItemRequest("Revived","d","Lunch",FoodType.VEG,new BigDecimal("120.00"),"INR",1,30,SpiceLevel.MILD,500,false,true,MenuItemStatus.ACTIVE);
        assertEquals(404,rejected(()->catalog.updateMenuItem(owner,dish,revive)).getStatus());
        assertEquals(404,rejected(()->catalog.updateAvailability(owner,dish,new AvailabilityRequest(true,"again"))).getStatus());
        assertEquals(404,rejected(()->catalog.uploadMenuItemImage(owner,dish,file,false)).getStatus());
        var bulk=new BulkMenuAvailabilityService(named,finance);
        assertEquals(404,rejected(()->bulk.update(owner,new BulkAvailabilityRequest(List.of(new AvailabilityChange(dish,true,null))))).getStatus());
        assertEquals("ARCHIVED",status(dish));
        catalog.archiveMenuItem(owner,dish); // archiving twice is harmless
        assertEquals("ARCHIVED",status(dish));
    }

    @Test void archiveIsChefOnlyAndOnlyForTheChefsOwnDishes() {
        assertEquals("MENU_ITEM_NOT_FOUND",rejected(()->catalog.archiveMenuItem(stranger,dish)).getCode());
        assertEquals(404,rejected(()->catalog.archiveMenuItem(stranger,dish)).getStatus());
        assertEquals(404,rejected(()->catalog.archiveMenuItem(owner,otherDish)).getStatus());
        assertEquals(404,rejected(()->catalog.archiveMenuItem(owner,UUID.randomUUID())).getStatus());
        assertEquals("CHEF_ROLE_REQUIRED",rejected(()->catalog.archiveMenuItem(new CravesPrincipal(chef,"",Set.of("CUSTOMER")),dish)).getCode());
        var noKitchen=new CravesPrincipal(UUID.randomUUID(),"",Set.of("CHEF"));
        assertEquals("KITCHEN_PROFILE_REQUIRED",rejected(()->catalog.archiveMenuItem(noKitchen,dish)).getCode());
        assertEquals("ACTIVE",status(dish)); assertEquals("ACTIVE",status(otherDish));
        assertEquals(1,catalog.listMyMenuItems(stranger).size());
    }

    @Test void archivedIsNotAStatusAChefCanSetThroughCreateOrUpdate() {
        var archived=new MenuItemRequest("Sneaky","d","Lunch",FoodType.VEG,new BigDecimal("120.00"),"INR",1,30,SpiceLevel.MILD,500,false,true,MenuItemStatus.ARCHIVED);
        assertEquals(400,rejected(()->catalog.createMenuItem(owner,archived)).getStatus());
        assertEquals(400,rejected(()->catalog.updateMenuItem(owner,dish,archived)).getStatus());
        assertEquals("ACTIVE",status(dish));
        assertEquals(2,catalog.listMyMenuItems(owner).size());
    }

    /** Needs PostGIS (the nearby queries use geography), so it only runs in the CI service container. */
    @Test void nearbyDiscoveryNeverReturnsAnArchivedDish() {
        var nearby=new NearbyDiscoveryService(jdbc,new CatalogDiscoveryProperties(),finance);
        catalog.archiveMenuItem(owner,dish);
        var meals=nearby.discoverMenuItems(latitude,longitude,1000,0,10).menuItems().stream().map(m->m.id()).toList();
        assertTrue(meals.contains(dish2)); assertFalse(meals.contains(dish));
        assertEquals(1,nearby.discoverKitchens(latitude,longitude,1000,0,10).kitchens().stream().filter(k->k.id().equals(kitchen)).findFirst().orElseThrow().activeMenuItemCount());
        catalog.archiveMenuItem(owner,dish2);
        assertTrue(nearby.discoverKitchens(latitude,longitude,1000,0,10).kitchens().stream().noneMatch(k->k.id().equals(kitchen)));
        assertTrue(nearby.discoverMenuItems(latitude,longitude,1000,0,10).menuItems().stream().noneMatch(m->m.kitchenId().equals(kitchen)));
    }
}
