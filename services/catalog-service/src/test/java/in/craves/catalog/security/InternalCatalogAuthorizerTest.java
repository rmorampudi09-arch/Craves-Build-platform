package in.craves.catalog.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

import in.craves.catalog.config.InternalCatalogAccessProperties;
import in.craves.catalog.exception.ApiException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class InternalCatalogAuthorizerTest {
    private InternalCatalogAccessProperties properties;
    private InternalCatalogAuthorizer authorizer;

    @BeforeEach
    void setUp() {
        properties = new InternalCatalogAccessProperties();
        authorizer = new InternalCatalogAuthorizer(properties);
    }

    @Test
    void acceptsConfiguredInternalServiceSecret() {
        properties.setAccessValue("shared-secret-value");
        authorizer.requireAuthorized("shared-secret-value");
    }

    @Test
    void rejectsWrongSecretWithoutEchoingExpectedValue() {
        properties.setAccessValue("shared-secret-value");

        ApiException error = catchThrowableOfType(
            () -> authorizer.requireAuthorized("wrong-value"),
            ApiException.class
        );

        assertThat(error.getStatus()).isEqualTo(403);
        assertThat(error.getCode()).isEqualTo("INTERNAL_ACCESS_DENIED");
        assertThat(error.getMessage()).doesNotContain("shared-secret-value");
    }

    @Test
    void failsClosedWhenInternalSecretIsNotConfigured() {
        ApiException error = catchThrowableOfType(
            () -> authorizer.requireAuthorized(null),
            ApiException.class
        );

        assertThat(error.getStatus()).isEqualTo(503);
        assertThat(error.getCode()).isEqualTo("INTERNAL_ACCESS_NOT_CONFIGURED");
    }
}
