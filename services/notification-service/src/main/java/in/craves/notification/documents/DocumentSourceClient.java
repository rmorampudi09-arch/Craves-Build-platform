package in.craves.notification.documents;

import static in.craves.notification.documents.DocumentModels.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
public class DocumentSourceClient {
    private final DocumentSettings settings;
    private final DocumentHttp http;
    private final ObjectMapper mapper;
    public DocumentSourceClient(DocumentSettings settings,DocumentHttp http,ObjectMapper mapper) {
        this.settings=settings; this.http=http; this.mapper=mapper;
    }
    public Snapshot fetch(UUID owner,Request request,String bearer) {
        if (bearer==null || !bearer.startsWith("Bearer ") || bearer.length()>16000)
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"ACCESS_TOKEN_REQUIRED");
        String base;
        String path;
        switch(request.type()) {
            case ORDER_SUMMARY, PAYMENT_RECEIPT -> {
                base=settings.orderBaseUrl;
                path="/api/v1/document-sources/orders/"+request.sourceId()+"?receipt="+(request.type()==Type.PAYMENT_RECEIPT);
            }
            case SUBSCRIPTION_RECEIPT -> {
                base=settings.subscriptionBaseUrl;
                path="/api/v1/document-sources/subscription-invoices/"+request.sourceId();
            }
            case CHEF_ORDER_STATEMENT -> { base=settings.orderBaseUrl; path="/api/v1/document-sources/chef/orders"; }
            case CHEF_EARNINGS_STATEMENT -> { base=settings.integrationBaseUrl; path="/api/v1/document-sources/chef/earnings"; }
            case CHEF_SETTLEMENT_STATEMENT -> { base=settings.integrationBaseUrl; path="/api/v1/document-sources/chef/settlements"; }
            default -> throw bad("UNSUPPORTED_DOCUMENT_TYPE");
        }
        if(request.type().chef()) path+="?from="+encode(request.start().toString())+"&to="+encode(request.end().toString());
        path+=(path.contains("?")?"&":"?")+"currency="+request.currency()+"&timezone="+encode(request.timezone());
        URI endpoint=URI.create(DocumentSettings.base(base,settings.allowLocalHttp).toString()+path);
        var response=http.get(endpoint,"Authorization",bearer,1048576);
        int status=response.statusCode();
        if(status==401||status==403||status==404||status==409||status==422||status==429)
            throw new ResponseStatusException(HttpStatus.valueOf(status),"DOCUMENT_SOURCE_NOT_ELIGIBLE");
        if(status!=200) throw upstream("DOCUMENT_SOURCE_UNAVAILABLE");
        try {
            Snapshot snapshot=mapper.readValue(response.body(),Snapshot.class).validated(owner,request.type(),request.currency());
            if(!request.type().chef() && !request.sourceId().toString().equals(snapshot.reference()))
                throw upstream("SOURCE_REFERENCE_MISMATCH");
            return snapshot;
        } catch(ResponseStatusException ex) { throw ex; }
        catch(Exception ex) { throw upstream("INVALID_DOCUMENT_SOURCE_RESPONSE"); }
    }
    private static String encode(String value) { return URLEncoder.encode(value,StandardCharsets.UTF_8); }
}
