package in.craves.catalog.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.catalog.exception.ApiException;
import in.craves.catalog.exception.AppErrorHandler;
import in.craves.catalog.security.CravesPrincipal;
import in.craves.catalog.service.BulkMenuAvailabilityService;
import in.craves.catalog.service.CatalogService;
import in.craves.catalog.service.DiscoveryCacheService;
import in.craves.catalog.service.KitchenPhotoImporter;
import in.craves.catalog.web.ApiDtos.KitchenPhotoKind;
import in.craves.catalog.web.ApiDtos.KitchenProfileRequest;
import in.craves.catalog.web.ApiDtos.KitchenProfileResponse;
import in.craves.catalog.web.ApiDtos.KitchenSettings;
import in.craves.catalog.web.ApiDtos.KitchenStatus;
import in.craves.catalog.web.ApiDtos.SocialLinks;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

/** Wire-level checks of the chef routes added for the chef app: paths, verbs, status codes and JSON shape. */
class KitchenControllerChefApiTest {
    private final CravesPrincipal chef = new CravesPrincipal(UUID.randomUUID(), "", Set.of("CHEF"));
    private final CatalogService catalog = mock(CatalogService.class);
    private final DiscoveryCacheService cache = mock(DiscoveryCacheService.class);
    private final KitchenPhotoImporter importer = mock(KitchenPhotoImporter.class);
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        HandlerMethodArgumentResolver principal = new HandlerMethodArgumentResolver() {
            @Override public boolean supportsParameter(MethodParameter p) { return p.getParameterType() == CravesPrincipal.class; }
            @Override public Object resolveArgument(MethodParameter p, ModelAndViewContainer m, NativeWebRequest r, WebDataBinderFactory f) { return chef; }
        };
        mvc = MockMvcBuilders
            .standaloneSetup(new KitchenController(catalog, mock(BulkMenuAvailabilityService.class), cache, importer))
            .setCustomArgumentResolvers(principal)
            .setControllerAdvice(new AppErrorHandler())
            .build();
    }

    @Test
    void putKitchenWithoutTheNewFieldsReachesTheServiceWithNullsSoNothingIsWiped() throws Exception {
        when(catalog.upsertMyKitchen(any(), any())).thenReturn(kitchen());
        mvc.perform(put("/api/v1/kitchens/me").contentType(MediaType.APPLICATION_JSON)
                .content("{\"kitchenName\":\"K\",\"addressLine1\":\"A\",\"city\":\"Hyderabad\",\"state\":\"Telangana\",\"status\":\"ACTIVE\"}"))
            .andExpect(status().isOk());
        ArgumentCaptor<KitchenProfileRequest> sent = ArgumentCaptor.forClass(KitchenProfileRequest.class);
        verify(catalog).upsertMyKitchen(eq(chef), sent.capture());
        assertThat(sent.getValue().cuisines()).isNull();
        assertThat(sent.getValue().serviceAreas()).isNull();
        assertThat(sent.getValue().socialLinks()).isNull();
    }

    @Test
    void putKitchenWithTheNewFieldsPassesThemThrough() throws Exception {
        when(catalog.upsertMyKitchen(any(), any())).thenReturn(kitchen());
        mvc.perform(put("/api/v1/kitchens/me").contentType(MediaType.APPLICATION_JSON)
                .content("{\"kitchenName\":\"K\",\"addressLine1\":\"A\",\"city\":\"Hyderabad\",\"state\":\"Telangana\","
                    + "\"cuisines\":[\"Andhra\"],\"serviceAreas\":[\"Kondapur\"],\"socialLinks\":{\"instagram\":\"https://instagram.com/k\"}}"))
            .andExpect(status().isOk());
        ArgumentCaptor<KitchenProfileRequest> sent = ArgumentCaptor.forClass(KitchenProfileRequest.class);
        verify(catalog).upsertMyKitchen(eq(chef), sent.capture());
        assertThat(sent.getValue().cuisines()).containsExactly("Andhra");
        assertThat(sent.getValue().serviceAreas()).containsExactly("Kondapur");
        assertThat(sent.getValue().socialLinks()).isEqualTo(new SocialLinks("https://instagram.com/k", null, null, null));
    }

    @Test
    void kitchenResponseCarriesTheNewFields() throws Exception {
        when(catalog.getMyKitchen(chef)).thenReturn(kitchen());
        mvc.perform(get("/api/v1/kitchens/me").accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.chefPhotoUrl").value("https://cdn.example/chef.jpg"))
            .andExpect(jsonPath("$.kitchenPhotoUrl").value("https://cdn.example/kitchen.jpg"))
            .andExpect(jsonPath("$.cuisines[0]").value("Andhra"))
            .andExpect(jsonPath("$.serviceAreas[0]").value("Kondapur"))
            .andExpect(jsonPath("$.socialLinks.instagram").value("https://instagram.com/k"))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("\"facebook\":null")))
            .andExpect(jsonPath("$.kitchenName").value("K"));
    }

    @Test
    void photoUploadTakesTheKindAndTheFilePart() throws Exception {
        when(catalog.uploadKitchenPhoto(eq(chef), eq(KitchenPhotoKind.KITCHEN), any())).thenReturn(kitchen());
        mvc.perform(multipart("/api/v1/kitchens/me/photos").file(new MockMultipartFile("file", "k.png", "image/png", new byte[]{1})).param("kind", "KITCHEN").accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.kitchenPhotoUrl").value("https://cdn.example/kitchen.jpg"));
        verify(catalog).uploadKitchenPhoto(eq(chef), eq(KitchenPhotoKind.KITCHEN), any());
    }

    @Test
    void photoUploadRejectsAnUnknownKind() throws Exception {
        mvc.perform(multipart("/api/v1/kitchens/me/photos").file(new MockMultipartFile("file", "k.png", "image/png", new byte[]{1})).param("kind", "DISH"))
            .andExpect(status().isBadRequest());
        verify(catalog, never()).uploadKitchenPhoto(any(), any(), any());
    }

    @Test
    void photoDeleteTakesTheKindInThePath() throws Exception {
        when(catalog.deleteKitchenPhoto(chef, KitchenPhotoKind.CHEF)).thenReturn(kitchen());
        mvc.perform(delete("/api/v1/kitchens/me/photos/CHEF")).andExpect(status().isOk());
        mvc.perform(delete("/api/v1/kitchens/me/photos/BOGUS")).andExpect(status().isBadRequest());
        verify(catalog).deleteKitchenPhoto(chef, KitchenPhotoKind.CHEF);
    }

    @Test
    void chefAvatarPutPassesTheIdAndClearsTheDiscoveryCache() throws Exception {
        when(catalog.setChefAvatar(chef, "chef-avatar-04")).thenReturn(kitchen());
        mvc.perform(put("/api/v1/kitchens/me/chef-avatar").accept(MediaType.APPLICATION_JSON).contentType(MediaType.APPLICATION_JSON).content("{\"avatarId\":\"chef-avatar-04\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.chefPhotoUrl").value("https://cdn.example/chef.jpg"));
        verify(cache).invalidateAllDiscovery();
    }

    @Test
    void chefAvatarPutRejectsABlankId() throws Exception {
        mvc.perform(put("/api/v1/kitchens/me/chef-avatar").contentType(MediaType.APPLICATION_JSON).content("{\"avatarId\":\" \"}"))
            .andExpect(status().isBadRequest());
        verify(catalog, never()).setChefAvatar(any(), any());
    }

    @Test
    void removingTheChefPhotoClearsTheDiscoveryCache() throws Exception {
        when(catalog.deleteKitchenPhoto(chef, KitchenPhotoKind.CHEF)).thenReturn(kitchen());
        mvc.perform(delete("/api/v1/kitchens/me/photos/CHEF")).andExpect(status().isOk());
        verify(cache).invalidateAllDiscovery();
    }

    @Test
    void settingsReadAndWriteTheTwoFieldsAndKeepAnExplicitNull() throws Exception {
        when(catalog.getKitchenSettings(chef)).thenReturn(new KitchenSettings(false, null));
        mvc.perform(get("/api/v1/kitchens/me/settings").accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.autoAcceptOrders").value(false))
            .andExpect(content().string(org.hamcrest.Matchers.containsString("\"defaultPrepMinutes\":null")));
        when(catalog.updateKitchenSettings(eq(chef), any())).thenReturn(new KitchenSettings(true, 30));
        mvc.perform(put("/api/v1/kitchens/me/settings").accept(MediaType.APPLICATION_JSON).contentType(MediaType.APPLICATION_JSON).content("{\"autoAcceptOrders\":true,\"defaultPrepMinutes\":30}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.autoAcceptOrders").value(true))
            .andExpect(jsonPath("$.defaultPrepMinutes").value(30));
        verify(catalog).updateKitchenSettings(chef, new KitchenSettings(true, 30));
    }

    @Test
    void settingsWithoutAutoAcceptAreRejectedBeforeTheService() throws Exception {
        mvc.perform(put("/api/v1/kitchens/me/settings").contentType(MediaType.APPLICATION_JSON).content("{\"defaultPrepMinutes\":30}"))
            .andExpect(status().isBadRequest());
        verify(catalog, never()).updateKitchenSettings(any(), any());
    }

    @Test
    void deletingADishIsA204WithNoBodyAndRefreshesDiscovery() throws Exception {
        UUID dish = UUID.randomUUID();
        mvc.perform(delete("/api/v1/kitchens/me/menu-items/{id}", dish))
            .andExpect(status().isNoContent())
            .andExpect(content().string(""));
        verify(catalog).archiveMenuItem(chef, dish);
        verify(cache).invalidateAllDiscovery();
    }

    @Test
    void deletingSomeoneElsesDishIsA404() throws Exception {
        UUID dish = UUID.randomUUID();
        org.mockito.Mockito.doThrow(ApiException.notFound("MENU_ITEM_NOT_FOUND", "Menu item was not found")).when(catalog).archiveMenuItem(chef, dish);
        mvc.perform(delete("/api/v1/kitchens/me/menu-items/{id}", dish).accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("MENU_ITEM_NOT_FOUND"));
        verify(cache, never()).invalidateAllDiscovery();
    }

    @Test
    void uploadingAKitchenPhotoRefreshesDiscoveryAndReturnsTheSlots() throws Exception {
        when(catalog.uploadKitchenPhoto(any(), eq(KitchenPhotoKind.KITCHEN), any())).thenReturn(kitchen());
        mvc.perform(multipart("/api/v1/kitchens/me/photos").file(new MockMultipartFile("file", "k.jpg", "image/jpeg", new byte[] {1}))
                .param("kind", "KITCHEN").accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.kitchenPhotoUrls[0]").value("https://cdn.example/kitchen.jpg"));
        verify(cache).invalidateAllDiscovery();
    }

    @Test
    void deletingAKitchenPhotoAnswers409Locked() throws Exception {
        when(catalog.deleteKitchenPhoto(any(), eq(KitchenPhotoKind.KITCHEN))).thenThrow(
            ApiException.conflict("KITCHEN_PHOTOS_LOCKED", "Kitchen photos can't be changed. To change one, contact Craves support."));
        mvc.perform(delete("/api/v1/kitchens/me/photos/KITCHEN").accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("KITCHEN_PHOTOS_LOCKED"));
        verify(cache, never()).invalidateAllDiscovery();
    }

    @Test
    void savingTheKitchenStartsTheRegistrationPhotoImport() throws Exception {
        KitchenProfileResponse saved = kitchen();
        when(catalog.upsertMyKitchen(any(), any())).thenReturn(saved);
        mvc.perform(put("/api/v1/kitchens/me").contentType(MediaType.APPLICATION_JSON)
                .content("{\"kitchenName\":\"K\",\"addressLine1\":\"A\",\"city\":\"Hyderabad\",\"state\":\"Telangana\",\"status\":\"ACTIVE\"}"))
            .andExpect(status().isOk());
        verify(importer).importInBackground(saved.id());
    }

    private static KitchenProfileResponse kitchen() {
        return new KitchenProfileResponse(
            UUID.randomUUID(), UUID.randomUUID(), "K", null, null, null, null, "A", null, null, null, "Hyderabad", "Telangana", null,
            null, null, KitchenStatus.ACTIVE, Instant.now(), Instant.now(),
            "https://cdn.example/chef.jpg", "https://cdn.example/kitchen.jpg", List.of("https://cdn.example/kitchen.jpg"),
            List.of("Andhra"), List.of("Kondapur"), new SocialLinks("https://instagram.com/k", null, null, null), null, null
        );
    }
}
