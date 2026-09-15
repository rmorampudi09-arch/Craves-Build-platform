package in.craves.auth.security;

import org.apache.coyote.http11.AbstractHttp11Protocol;
import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.stereotype.Component;

/** Complements the filter's absolute elapsed budget with a bound on each blocking socket read. */
@Component
public class AuthRequestReadConfiguration implements WebServerFactoryCustomizer<TomcatServletWebServerFactory> {
    private final AuthRateLimitSettings settings;
    private final AuthRequestReadSettings reads;
    public AuthRequestReadConfiguration(AuthRateLimitSettings settings,AuthRequestReadSettings reads) { this.settings=settings;this.reads=reads; }
    @Override public void customize(TomcatServletWebServerFactory factory) {
        if(!settings.postgresEnabled()) return;
        factory.addConnectorCustomizers(connector->{
            if(!(connector.getProtocolHandler() instanceof AbstractHttp11Protocol<?> protocol))
                throw new IllegalStateException("PostgreSQL Auth protection requires a bounded HTTP connector");
            protocol.setConnectionTimeout(reads.idleTimeoutMs());
            protocol.setDisableUploadTimeout(false);
            protocol.setMaxSwallowSize(0); // Close rejected uploads instead of draining an attacker-controlled remainder.
            protocol.setConnectionUploadTimeout(reads.idleTimeoutMs());
        });
    }
}
