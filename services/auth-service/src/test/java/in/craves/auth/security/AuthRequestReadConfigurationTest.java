package in.craves.auth.security;

import static org.junit.jupiter.api.Assertions.*;
import org.apache.catalina.connector.Connector;
import org.apache.coyote.http11.AbstractHttp11Protocol;
import org.junit.jupiter.api.Test;
import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory;

class AuthRequestReadConfigurationTest {
    @Test void postgresModeBoundsInitialAndUploadReads() {
        var factory=new TomcatServletWebServerFactory();
        new AuthRequestReadConfiguration(PostgresAuthAbuseProtectionFilterTest.settings(true,"postgres",6),new AuthRequestReadSettings(5000,10000)).customize(factory);
        var connector=new Connector();factory.getTomcatConnectorCustomizers().forEach(customizer->customizer.customize(connector));
        var protocol=(AbstractHttp11Protocol<?>)connector.getProtocolHandler();
        assertEquals(5000,protocol.getConnectionTimeout());assertEquals(5000,protocol.getConnectionUploadTimeout());assertFalse(protocol.getDisableUploadTimeout());assertEquals(0,protocol.getMaxSwallowSize());
    }
    @Test void disabledAndRedisModesPreserveExistingConnectorConfiguration() {
        for(var settings:new AuthRateLimitSettings[]{PostgresAuthAbuseProtectionFilterTest.settings(false,"postgres",6),PostgresAuthAbuseProtectionFilterTest.settings(true,"redis",6)}) {
            var factory=new TomcatServletWebServerFactory();
            new AuthRequestReadConfiguration(settings,new AuthRequestReadSettings(5000,10000)).customize(factory);
            assertTrue(factory.getTomcatConnectorCustomizers().isEmpty());
        }
    }
    @Test void unsupportedTimeoutBoundsFailConfiguration() {
        assertThrows(IllegalArgumentException.class,()->new AuthRequestReadSettings(0,10000));
        assertThrows(IllegalArgumentException.class,()->new AuthRequestReadSettings(5000,4000));
        assertThrows(IllegalArgumentException.class,()->new AuthRequestReadSettings(5000,60001));
    }
}
