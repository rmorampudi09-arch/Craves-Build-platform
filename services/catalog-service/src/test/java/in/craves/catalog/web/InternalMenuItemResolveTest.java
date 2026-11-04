package in.craves.catalog.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import in.craves.catalog.config.InternalCatalogAccessProperties;
import in.craves.catalog.exception.AppErrorHandler;
import in.craves.catalog.security.InternalCatalogAuthorizer;
import in.craves.catalog.service.CatalogService;
import in.craves.catalog.service.DiscoveryCacheService;
import in.craves.catalog.service.PublicMenuBatchResolveService;
import in.craves.catalog.web.PublicCatalogBatchDtos.ResolvedMenuItemResponse;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** The route order-service's cart preflight calls (CatalogClient.resolveActiveMenuItems, which accepts JSON). */
class InternalMenuItemResolveTest {
    private static final String PATH = "/api/v1/catalog/internal/menu-items/resolve";
    private final UUID dish = UUID.randomUUID();
    private final UUID kitchen = UUID.randomUUID();
    private final PublicMenuBatchResolveService resolver = mock(PublicMenuBatchResolveService.class);
    private final InternalCatalogAccessProperties access = new InternalCatalogAccessProperties();
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        access.setAccessValue("internal-test-key");
        mvc = MockMvcBuilders.standaloneSetup(new InternalCatalogController(mock(CatalogService.class),
                new InternalCatalogAuthorizer(access), mock(DiscoveryCacheService.class), resolver))
            .setControllerAdvice(new AppErrorHandler())
            .build();
    }

    @Test
    void returnsTheDishesThatCanBeBoughtInTheShapeTheOrderClientReads() throws Exception {
        when(resolver.resolve(any())).thenReturn(List.of(
            new ResolvedMenuItemResponse(dish, kitchen, "Gongura chicken", new BigDecimal("249.00"), "INR", 450, true)));

        mvc.perform(post(PATH).header(InternalCatalogAuthorizer.HEADER_NAME, "internal-test-key")
                .contentType(MediaType.APPLICATION_JSON).accept(MediaType.APPLICATION_JSON).content("{\"menuItemIds\":[\"" + dish + "\"]}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].id").value(dish.toString()))
            .andExpect(jsonPath("$[0].kitchenId").value(kitchen.toString()))
            .andExpect(jsonPath("$[0].itemName").value("Gongura chicken"))
            .andExpect(jsonPath("$[0].price").value(249.00))
            .andExpect(jsonPath("$[0].currency").value("INR"))
            .andExpect(jsonPath("$[0].unitPackageWeightGrams").value(450))
            .andExpect(jsonPath("$[0].thermoboxRequired").value(true));
    }

    @Test
    void refusesAMissingOrWrongKeyBeforeReadingAnyDish() throws Exception {
        mvc.perform(post(PATH).contentType(MediaType.APPLICATION_JSON).accept(MediaType.APPLICATION_JSON).content("{\"menuItemIds\":[\"" + dish + "\"]}"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.code").value("INTERNAL_ACCESS_DENIED"));
        mvc.perform(post(PATH).header(InternalCatalogAuthorizer.HEADER_NAME, "wrong")
                .contentType(MediaType.APPLICATION_JSON).accept(MediaType.APPLICATION_JSON).content("{\"menuItemIds\":[]}"))
            .andExpect(status().isForbidden());

        verifyNoInteractions(resolver);
    }

    @Test
    void answers503WhenTheInternalKeyIsNotConfigured() throws Exception {
        access.setAccessValue("");

        mvc.perform(post(PATH).header(InternalCatalogAuthorizer.HEADER_NAME, "internal-test-key")
                .contentType(MediaType.APPLICATION_JSON).accept(MediaType.APPLICATION_JSON).content("{\"menuItemIds\":[\"" + dish + "\"]}"))
            .andExpect(status().isServiceUnavailable());
        verifyNoInteractions(resolver);
    }
}
