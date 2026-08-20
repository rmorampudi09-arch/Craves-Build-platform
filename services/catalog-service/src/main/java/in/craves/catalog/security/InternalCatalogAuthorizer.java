package in.craves.catalog.security;

import in.craves.catalog.config.InternalCatalogAccessProperties;
import in.craves.catalog.exception.ApiException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class InternalCatalogAuthorizer {
    public static final String HEADER_NAME = "X-Craves-Internal-Key";

    private final InternalCatalogAccessProperties properties;

    public InternalCatalogAuthorizer(InternalCatalogAccessProperties properties) {
        this.properties = properties;
    }

    public void requireAuthorized(String supplied) {
        String expected = properties.getAccessValue();
        if (!StringUtils.hasText(expected)) {
            throw new ApiException(503, "INTERNAL_ACCESS_NOT_CONFIGURED", "Internal Catalog access is not configured");
        }
        if (!StringUtils.hasText(supplied)
            || !MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                supplied.getBytes(StandardCharsets.UTF_8)
            )) {
            throw ApiException.forbidden("INTERNAL_ACCESS_DENIED", "Internal Catalog access is denied");
        }
    }
}
