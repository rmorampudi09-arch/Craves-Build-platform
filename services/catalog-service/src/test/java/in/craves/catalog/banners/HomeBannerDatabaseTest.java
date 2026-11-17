package in.craves.catalog.banners;

import static org.junit.jupiter.api.Assertions.*;

import in.craves.catalog.security.CravesPrincipal;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.Set;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;

/** Website and app banners on PostgreSQL. Destructive fixtures only in the dedicated disposable CI service container. */
@EnabledIfEnvironmentVariable(named = "CRAVES_CATALOG_DISPOSABLE_DATABASE", matches = "true")
class HomeBannerDatabaseTest {
    JdbcTemplate jdbc;
    HomeBannerService banners;
    final CravesPrincipal admin = new CravesPrincipal(UUID.randomUUID(), "", Set.of("PLATFORM_ADMIN"));

    @BeforeEach void setup() {
        assertEquals("true", System.getenv("GITHUB_ACTIONS"), "Disposable CI only; never a local production tunnel");
        String url = System.getenv("CATALOG_TEST_JDBC_URL");
        assertEquals("jdbc:postgresql://localhost:5432/catalog_finance_test", url);
        var ds = new DriverManagerDataSource(url, "postgres", System.getenv("CATALOG_TEST_DB_PASSWORD"));
        jdbc = new JdbcTemplate(ds);
        jdbc.execute("DROP SCHEMA IF EXISTS catalog_schema CASCADE");
        Flyway.configure().dataSource(ds).schemas("catalog_schema").defaultSchema("catalog_schema").locations("classpath:db/migration").load().migrate();
        banners = new HomeBannerService(jdbc);
    }

    static MockMultipartFile picture() throws Exception {
        var output = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(200, 100, BufferedImage.TYPE_INT_RGB), "png", output);
        return new MockMultipartFile("file", "banner.png", "image/png", output.toByteArray());
    }

    UUID row(String platform, boolean published) throws Exception {
        UUID id = UUID.randomUUID();
        if (platform == null) {
            // A banner saved before platforms existed.
            jdbc.update("INSERT INTO catalog_schema.home_banners(id,label,image_bytes,content_type,published) VALUES (?,?,?,?,?)",
                id, "Older banner", picture().getBytes(), "image/png", published);
        } else {
            jdbc.update("INSERT INTO catalog_schema.home_banners(id,label,image_bytes,content_type,published,platform) VALUES (?,?,?,?,?,?)",
                id, platform + " banner", picture().getBytes(), "image/png", published, platform);
        }
        return id;
    }

    @Test void bannersSavedBeforePlatformsStayOnTheWebsite() throws Exception {
        UUID older = row(null, true);
        assertEquals("WEB", jdbc.queryForObject("SELECT platform FROM catalog_schema.home_banners WHERE id=?", String.class, older));
        assertThrows(Exception.class, () -> jdbc.update("UPDATE catalog_schema.home_banners SET platform='TV' WHERE id=?", older));
    }

    @Test void eachFeedShowsOnlyItsOwnPlatformsPublishedBanners() throws Exception {
        UUID web = row("WEB", true), app = row("APP", true);
        row("APP", false);
        assertEquals(java.util.List.of(web), banners.published("WEB").stream().map(HomeBannerService.Banner::id).toList());
        assertEquals(java.util.List.of(app), banners.published("APP").stream().map(HomeBannerService.Banner::id).toList());
        // A caller that names no platform, as the website did before, keeps getting the website's banners.
        assertEquals(java.util.List.of(web), banners.published(null).stream().map(HomeBannerService.Banner::id).toList());
        assertEquals(3, banners.adminList(admin).size());
    }

    @Test void anUploadGoesToTheChosenPlatformAndEachHoldsTwenty() throws Exception {
        var created = banners.create(admin, "App promo", 0, "APP", picture());
        assertEquals("APP", created.platform());
        for (int index = 1; index < HomeBannerService.PER_PLATFORM; index++) row("APP", false);
        var full = assertThrows(ResponseStatusException.class, () -> banners.create(admin, "One more", 0, "APP", picture()));
        assertEquals(HttpStatus.CONFLICT, full.getStatusCode());
        // The website's twenty are counted apart.
        assertEquals("WEB", banners.create(admin, "Web promo", 0, "WEB", picture()).platform());
    }
}
