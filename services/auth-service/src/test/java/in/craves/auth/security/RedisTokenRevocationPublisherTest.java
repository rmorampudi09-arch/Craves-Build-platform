package in.craves.auth.security;

import in.craves.auth.config.JwtProperties;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class RedisTokenRevocationPublisherTest {
    RedisTokenRevocationPublisher.ProjectionWorkItem item(String status,long version) {
        return new RedisTokenRevocationPublisher.ProjectionWorkItem(UUID.randomUUID(),UUID.randomUUID(),status,version,1,UUID.randomUUID());
    }
    RedisTokenRevocationPublisher publisher(StringRedisTemplate redis) {
        return spy(new RedisTokenRevocationPublisher(mock(JdbcTemplate.class),redis,new JwtProperties(),"test:revocation",300,50,10,5,5));
    }
    @Test void newerAndAlreadySupersededWorkCanBeAcknowledged() {
        for(long result:List.of(0L,1L)) {
            var redis=mock(StringRedisTemplate.class);var worker=publisher(redis);var item=item("SUSPENDED",12);
            doReturn(List.of(item)).when(worker).claim();
            when(redis.execute(any(org.springframework.data.redis.core.script.RedisScript.class),anyList(),any(),any(),any())).thenReturn(result);
            worker.publish();verify(worker).markPublished(item);verify(worker,never()).markFailure(any(),any());
            verify(redis).execute(RedisTokenRevocationPublisher.PROJECTION_SCRIPT,List.of("test:revocation:"+item.identityId()),"SUSPENDED","12","1200");
        }
    }
    @Test void storeFailureOrConflictingStateMustNotBeAcknowledged() {
        for(Long result:new Long[]{null,-1L,2L}) {
            var redis=mock(StringRedisTemplate.class);var worker=publisher(redis);var item=item("ACTIVE",2);
            doReturn(List.of(item)).when(worker).claim();
            when(redis.execute(any(org.springframework.data.redis.core.script.RedisScript.class),anyList(),any(),any(),any())).thenReturn(result);
            worker.publish();verify(worker,never()).markPublished(any());verify(worker).markFailure(eq(item),any());
        }
    }
    @Test void invalidCanonicalStateDoesNotReachRedis() {
        for(var item:List.of(item("UNKNOWN",1),item("ACTIVE",0))) {
            var redis=mock(StringRedisTemplate.class);var worker=publisher(redis);doReturn(List.of(item)).when(worker).claim();
            worker.publish();verifyNoInteractions(redis);verify(worker,never()).markPublished(any());
        }
    }
    @Test void redisFailureRetriesWithoutPublishing() {
        var redis=mock(StringRedisTemplate.class);var worker=publisher(redis);var item=item("ACTIVE",4);doReturn(List.of(item)).when(worker).claim();
        when(redis.execute(any(org.springframework.data.redis.core.script.RedisScript.class),anyList(),any(),any(),any())).thenThrow(new IllegalStateException("Private connection detail"));
        worker.publish();verify(worker,never()).markPublished(any());verify(worker).markFailure(eq(item),any());
    }
}
