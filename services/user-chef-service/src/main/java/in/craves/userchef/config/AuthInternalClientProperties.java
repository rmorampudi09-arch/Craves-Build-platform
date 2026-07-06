package in.craves.userchef.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "craves.internal")
public class AuthInternalClientProperties {
    private String authServiceBaseUrl;
    private String serviceSecret;

    public String getAuthServiceBaseUrl() {
        return authServiceBaseUrl;
    }

    public void setAuthServiceBaseUrl(String authServiceBaseUrl) {
        this.authServiceBaseUrl = authServiceBaseUrl;
    }

    public String getServiceSecret() {
        return serviceSecret;
    }

    public void setServiceSecret(String serviceSecret) {
        this.serviceSecret = serviceSecret;
    }
}
