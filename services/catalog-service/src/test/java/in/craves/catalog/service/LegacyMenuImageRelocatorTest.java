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
        String oldOk="https://stcravesprodlowl3ing6.blob.core.windows.net/media/public%2Fdishes%2Fa.jpg";
        String oldBroken="https://stcravesprodlowl3ing6.blob.core.windows.net/media/public%2Fdishes%2Fb.jpg";
        when(jdbc.queryForList(anyString(),eq(base+"/"))).thenReturn(List.of(
            Map.of("id",broken,"blob_name","public/dishes/b.jpg","public_url",oldBroken),
            Map.of("id",foreign,"blob_name","x.jpg","public_url","http://169.254.169.254/x.jpg"),
            Map.of("id",ok,"blob_name","public/dishes/a.jpg","public_url",oldOk)));
        when(media.copyFromPublicUrl(oldBroken,"public/dishes/b.jpg")).thenThrow(new RuntimeException("404"));
        when(media.copyFromPublicUrl(oldOk,"public/dishes/a.jpg")).thenReturn(base+"/public%2Fdishes%2Fa.jpg");
        when(jdbc.update(anyString(),any(),any(),any())).thenReturn(1);

        assertEquals(1,new LegacyMenuImageRelocator(jdbc,media).relocate());
        verify(media,never()).copyFromPublicUrl(eq("http://169.254.169.254/x.jpg"),anyString());
        verify(jdbc).update(contains("SET public_url = ?"),eq(base+"/public%2Fdishes%2Fa.jpg"),eq(ok),eq(oldOk));
    }

    @Test void unreachableStoreSkipsWithoutTouchingRows() {
        var jdbc=mock(JdbcTemplate.class); var media=mock(MediaStorageService.class);
        when(media.publicBaseUrl()).thenThrow(new RuntimeException("not configured"));
        assertEquals(0,new LegacyMenuImageRelocator(jdbc,media).relocate());
        verifyNoInteractions(jdbc);
    }
}
