package in.craves.notification.documents;

import java.net.URI;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class DocumentSettings {
    @Value("${CRAVES_DOCUMENTS_ENABLED:false}") public boolean enabled;
    @Value("${CRAVES_DOCUMENTS_WORKER_ENABLED:false}") public boolean workerEnabled;
    @Value("${CRAVES_DOCUMENTS_EMAIL_ENABLED:false}") public boolean emailEnabled;
    @Value("${CRAVES_DOCUMENTS_ORDER_BASE_URL:}") public String orderBaseUrl="";
    @Value("${CRAVES_DOCUMENTS_INTEGRATION_BASE_URL:}") public String integrationBaseUrl="";
    @Value("${CRAVES_DOCUMENTS_SUBSCRIPTION_BASE_URL:}") public String subscriptionBaseUrl="";
    @Value("${CRAVES_DOCUMENTS_BLOB_ENDPOINT:}") public String blobEndpoint="";
    @Value("${CRAVES_DOCUMENTS_BLOB_CONTAINER:}") public String blobContainer="";
    @Value("${CRAVES_DOCUMENTS_MANAGED_IDENTITY_CLIENT_ID:}") public String managedIdentityClientId="";
    @Value("${CRAVES_DOCUMENTS_FONT_PATH:}") public String fontPath="";
    @Value("${CRAVES_DOCUMENTS_ALLOW_LOCAL_HTTP:false}") public boolean allowLocalHttp;
    @PostConstruct
    public void validate() {
        if ((workerEnabled||emailEnabled) && !enabled) throw new IllegalStateException("Document workers require documents enabled");
        if (!enabled) return;
        base(orderBaseUrl,allowLocalHttp); base(integrationBaseUrl,allowLocalHttp); base(subscriptionBaseUrl,allowLocalHttp);
        URI storage=base(blobEndpoint,false);
        if (!storage.getHost().matches("[a-z0-9]{3,24}\\.blob\\.core\\.windows\\.net") || !storage.getPath().isEmpty())
            throw new IllegalStateException("Use the Azure Blob account HTTPS endpoint without a path");
        if (!blobContainer.matches("[a-z0-9](?:[a-z0-9-]{1,61})[a-z0-9]") || blobContainer.contains("--"))
            throw new IllegalStateException("A dedicated private Blob container is required");
    }
    public static URI base(String value,boolean allowLocal) {
        try {
            URI uri=URI.create(value);
            boolean local=allowLocal && "http".equals(uri.getScheme()) &&
                java.util.List.of("localhost","127.0.0.1","[::1]").contains(uri.getHost());
            if ((!"https".equals(uri.getScheme()) && !local) || uri.getHost()==null || uri.getUserInfo()!=null ||
                uri.getQuery()!=null || uri.getFragment()!=null || (!uri.getPath().isEmpty() && !uri.getPath().equals("/")))
                throw new IllegalArgumentException();
            return URI.create(value.replaceAll("/+$",""));
        } catch (RuntimeException ex) { throw new IllegalStateException("Invalid document service endpoint"); }
    }
}
