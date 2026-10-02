package in.craves.catalog.banners;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import in.craves.catalog.exception.ApiException;
import in.craves.catalog.security.CravesPrincipal;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

class HomeBannerTest {
    @Test void acceptsOnlyRealSupportedImages() throws Exception {
        var output = new ByteArrayOutputStream(); ImageIO.write(new BufferedImage(100, 50, BufferedImage.TYPE_INT_RGB), "png", output);
        byte[] image = output.toByteArray();
        assertArrayEquals(image, BannerImageValidator.validate(new MockMultipartFile("file", "banner.png", "image/png", image)));
        assertThrows(ApiException.class, () -> BannerImageValidator.validate(new MockMultipartFile("file", "banner.jpg", "image/jpeg", image)));
        assertThrows(ApiException.class, () -> BannerImageValidator.validate(new MockMultipartFile("file", "banner.png", "image/png", "not an image".getBytes())));
        assertThrows(ApiException.class, () -> BannerImageValidator.validate(new MockMultipartFile("file", "banner.svg", "image/svg+xml", "<svg/>".getBytes())));
        assertThrows(ApiException.class, () -> BannerImageValidator.validate(new MockMultipartFile("file", "banner.png", "image/png", new byte[BannerImageValidator.MAX_BYTES + 1])));
        assertThrows(ApiException.class, () -> BannerImageValidator.validate(null));
    }
    @Test void rejectsDecompressionBombDimensions() throws Exception {
        var output = new ByteArrayOutputStream(); ImageIO.write(new BufferedImage(4097, 1, BufferedImage.TYPE_INT_RGB), "png", output);
        assertThrows(ApiException.class, () -> BannerImageValidator.validate(new MockMultipartFile("file", "banner.png", "image/png", output.toByteArray())));
    }
    @Test void restrictsWritesAndReadsWithoutTouchingCustomerRoles() {
        var id = UUID.randomUUID();
        assertThrows(ResponseStatusException.class, () -> HomeBannerService.requireAdmin(null, false));
        for (String role : List.of("CUSTOMER", "CHEF", "OPERATIONS_ADMIN", "SUPPORT_ADMIN", "AUDIT_ADMIN")) {
            assertThrows(ResponseStatusException.class, () -> HomeBannerService.requireAdmin(new CravesPrincipal(id, null, Set.of(role)), true));
        }
        assertDoesNotThrow(() -> HomeBannerService.requireAdmin(new CravesPrincipal(id, null, Set.of("PLATFORM_ADMIN")), true));
        assertDoesNotThrow(() -> HomeBannerService.requireAdmin(new CravesPrincipal(id, null, Set.of("AUDIT_ADMIN")), false));
        var jdbc = mock(JdbcTemplate.class); var service = new HomeBannerService(jdbc);
        assertThrows(ResponseStatusException.class, () -> service.adminList(null));
        assertThrows(ResponseStatusException.class, () -> service.create(null, "Banner", 0, null));
        verifyNoInteractions(jdbc);
    }
    @Test void validatesLabelPositionAndUpdateVersion() {
        for (String label : new String[]{"", "  ", "a".repeat(161), "Banner\n"}) assertThrows(ApiException.class, () -> HomeBannerService.validateFields(label, 0));
        assertThrows(ApiException.class, () -> HomeBannerService.validateFields("Banner", -1));
        assertThrows(ApiException.class, () -> HomeBannerService.validateFields("Banner", 1000));
        assertDoesNotThrow(() -> HomeBannerService.validateFields("Banner", 999));
        var jdbc = mock(JdbcTemplate.class); var service = new HomeBannerService(jdbc);
        assertThrows(ApiException.class, () -> service.update(new CravesPrincipal(UUID.randomUUID(), null, Set.of("PLATFORM_ADMIN")), UUID.randomUUID(), "Banner", 0, true, null));
        verifyNoInteractions(jdbc);
    }
    @Test void emptyPublicFeedDoesNotInventContent() throws Exception {
        var service = mock(HomeBannerService.class); when(service.published()).thenReturn(List.of());
        MockMvcBuilders.standaloneSetup(new PublicHomeBannerController(service)).build().perform(get("/api/v1/catalog/banners"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.banners").isEmpty()).andExpect(header().string("Cache-Control", "no-store"));
    }
    @Test void imageReturnsActualBytesAndDraftIsNotPublic() throws Exception {
        var service = mock(HomeBannerService.class); var id = UUID.randomUUID();
        when(service.image(id, null, false)).thenReturn(new HomeBannerService.Image(new byte[]{1,2,3}, "image/png"));
        var mvc = MockMvcBuilders.standaloneSetup(new PublicHomeBannerController(service)).build();
        mvc.perform(get("/api/v1/catalog/banners/"+id+"/image")).andExpect(status().isOk()).andExpect(content().bytes(new byte[]{1,2,3}))
            .andExpect(header().string("X-Content-Type-Options", "nosniff"));
        when(service.image(id, null, false)).thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND));
        mvc.perform(get("/api/v1/catalog/banners/"+id+"/image")).andExpect(status().isNotFound());
    }
    @Test void protectsAdminControllerWithoutPrincipal() throws Exception {
        var service = new HomeBannerService(mock(JdbcTemplate.class));
        MockMvcBuilders.standaloneSetup(new AdminHomeBannerController(service))
            .setCustomArgumentResolvers(new org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver())
            .build().perform(get("/api/v1/catalog/admin/banners"))
            .andExpect(status().isUnauthorized());
    }
}
