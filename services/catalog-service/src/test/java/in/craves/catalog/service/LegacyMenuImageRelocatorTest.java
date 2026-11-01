package in.craves.catalog.service;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class LegacyMenuImageRelocatorTest {
    @Test void copiesOnlyAzureBlobPhotosAndKeepsGoingAfterAFailure() {
        var jdbc=mock(JdbcTemplate.class); var media=mock(MediaStorageService.class);
        String base="https://stcravesmediakmqgfy.blob.core.windows.net/media";
        when(media.publicBaseUrl()).thenReturn(base);
        UUID ok=UUID.randomUUID(), broken=UUID.randomUUID(), foreign=UUID.randomUUID();
        // Retired storage account (old subscription): menu rows saved before the move still carry these URLs.
        String oldOk="https://stcravesprodlowl3ing6.blob.core.windows.net/media/public%2Fdishes%2Fa.jpg";
        String oldBroken="https://stcravesprodlowl3ing6.blob.core.windows.net/media/public%2Fdishes%2Fb.jpg";
        when(jdbc.queryForList(anyString(),eq(base+"/"))).thenReturn(List.of(
            Map.of("id",broken,"blob_name","public/dishes/b.jpg","content_type","image/jpeg","public_url",oldBroken),
            Map.of("id",foreign,"blob_name","x.jpg","content_type","image/jpeg","public_url","http://169.254.169.254/x.jpg"),
            Map.of("id",ok,"blob_name","public/dishes/a.jpg","content_type","image/png","public_url",oldOk)));
        when(media.copyFromPublicUrl(oldBroken,"public/dishes/b.jpg","image/jpeg")).thenThrow(new RuntimeException("404"));
        when(media.copyFromPublicUrl(oldOk,"public/dishes/a.jpg","image/png"))
            .thenReturn(new MediaStorageService.StoredMedia("media","public/dishes/a.jpg","image/jpeg",2048,base+"/public%2Fdishes%2Fa.jpg"));
        when(jdbc.update(anyString(),any(),any(),any(),any(),any())).thenReturn(1);

        assertEquals(1,new LegacyMenuImageRelocator(jdbc,media).relocate());
        verify(media,never()).copyFromPublicUrl(eq("http://169.254.169.254/x.jpg"),anyString(),anyString());
        verify(jdbc).update(contains("SET public_url = ?, content_type = ?, file_size_bytes = ?"),
            eq(base+"/public%2Fdishes%2Fa.jpg"),eq("image/jpeg"),eq(2048L),eq(ok),eq(oldOk));
    }

    @Test void blobLinkedPhotosMoveToTheFrontDoorAddress() {
        var jdbc=mock(JdbcTemplate.class); var media=mock(MediaStorageService.class);
        String cdn="https://craves.in/media";
        String blob="https://stcravesmediakmqgfy.blob.core.windows.net/media/public%2Fdishes%2Fc.png";
        UUID id=UUID.randomUUID();
        when(media.publicBaseUrl()).thenReturn(cdn);
        when(jdbc.queryForList(anyString(),eq(cdn+"/"))).thenReturn(List.of(
            Map.of("id",id,"blob_name","public/dishes/c.png","content_type","image/png","public_url",blob)));
        when(media.copyFromPublicUrl(blob,"public/dishes/c.png","image/png"))
            .thenReturn(new MediaStorageService.StoredMedia("media","public/dishes/c.png","image/jpeg",300_000,cdn+"/public/dishes/c.png"));
        when(jdbc.update(anyString(),any(),any(),any(),any(),any())).thenReturn(1);

        assertEquals(1,new LegacyMenuImageRelocator(jdbc,media).relocate());
        verify(jdbc).update(anyString(),eq(cdn+"/public/dishes/c.png"),eq("image/jpeg"),eq(300_000L),eq(id),eq(blob));
    }

    @Test void unreachableStoreSkipsWithoutTouchingRows() {
        var jdbc=mock(JdbcTemplate.class); var media=mock(MediaStorageService.class);
        when(media.publicBaseUrl()).thenThrow(new RuntimeException("not configured"));
        assertEquals(0,new LegacyMenuImageRelocator(jdbc,media).relocate());
        verifyNoInteractions(jdbc);
    }
}
