package in.craves.notification.documents;

import static in.craves.notification.documents.DocumentModels.*;
import com.azure.core.http.policy.HttpLogDetailLevel;
import com.azure.core.http.policy.HttpLogOptions;
import com.azure.core.util.Context;
import com.azure.identity.ManagedIdentityCredentialBuilder;
import com.azure.storage.blob.BlobContainerClient;
import com.azure.storage.blob.BlobContainerClientBuilder;
import com.azure.storage.blob.models.BlobHttpHeaders;
import com.azure.storage.blob.models.BlobRange;
import com.azure.storage.blob.models.BlobRequestConditions;
import com.azure.storage.blob.models.BlobStorageException;
import com.azure.storage.blob.options.BlockBlobSimpleUploadOptions;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.time.Duration;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class AzureDocumentStorage implements DocumentStorage {
    private final DocumentSettings settings;
    private volatile BlobContainerClient container;
    public AzureDocumentStorage(DocumentSettings settings) { this.settings=settings; }
    private BlobContainerClient client() {
        if(!settings.enabled) throw new IllegalStateException("Documents disabled");
        if(container==null) {
            synchronized(this) {
                if(container==null) {
                    var identity=new ManagedIdentityCredentialBuilder();
                    if(!settings.managedIdentityClientId.isBlank()) identity.clientId(settings.managedIdentityClientId);
                    container=new BlobContainerClientBuilder().endpoint(settings.blobEndpoint)
                        .containerName(settings.blobContainer).credential(identity.build())
                        .httpLogOptions(new HttpLogOptions().setLogLevel(HttpLogDetailLevel.NONE)).buildClient();
                }
            }
        }
        var permissions=container.getAccessPolicyWithResponse(null,Duration.ofSeconds(10),Context.NONE).getValue();
        if(permissions.getBlobAccessType()!=null) throw new IllegalStateException("PDF container must be private");
        return container;
    }
    @Override public String put(UUID owner,UUID document,byte[] content) {
        if(content.length<5 || content.length>MAX_PDF_BYTES || content[0]!='%' || content[1]!='P' || content[2]!='D' || content[3]!='F')
            throw new IllegalArgumentException("Invalid PDF output");
        String hash=sha256(content);
        String key=owner+"/"+document+"/"+hash+".pdf";
        var blob=client().getBlobClient(key).getBlockBlobClient();
        try {
            blob.uploadWithResponse(new BlockBlobSimpleUploadOptions(new ByteArrayInputStream(content),content.length)
                .setHeaders(new BlobHttpHeaders().setContentType("application/pdf").setCacheControl("private, no-store"))
                .setRequestConditions(new BlobRequestConditions().setIfNoneMatch("*")),Duration.ofSeconds(30),Context.NONE);
        } catch(BlobStorageException ex) {
            if(ex.getStatusCode()!=409 && ex.getStatusCode()!=412) throw ex;
            read(key,hash,content.length);
        }
        return key;
    }
    @Override public byte[] read(String key,String expectedHash,long expectedBytes) {
        if(key==null || !key.matches("[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f]{64}\\.pdf") ||
            expectedHash==null || !expectedHash.matches("[0-9a-f]{64}") || !key.endsWith(expectedHash+".pdf") ||
            expectedBytes<5 || expectedBytes>MAX_PDF_BYTES) throw new IllegalStateException("Invalid PDF artifact metadata");
        var blob=client().getBlobClient(key);
        var properties=blob.getPropertiesWithResponse(null,Duration.ofSeconds(15),Context.NONE).getValue();
        if(properties.getBlobSize()!=expectedBytes) throw new IllegalStateException("PDF byte length mismatch");
        ByteArrayOutputStream output=new ByteArrayOutputStream((int)expectedBytes);
        blob.downloadStreamWithResponse(output,new BlobRange(0,expectedBytes),null,
            new BlobRequestConditions().setIfMatch(properties.getETag()),false,Duration.ofSeconds(30),Context.NONE);
        byte[] content=output.toByteArray();
        if(content.length!=expectedBytes || !sha256(content).equals(expectedHash)) throw new IllegalStateException("PDF integrity mismatch");
        return content;
    }
}
