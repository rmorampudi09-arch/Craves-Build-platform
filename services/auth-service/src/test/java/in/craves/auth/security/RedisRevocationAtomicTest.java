package in.craves.auth.security;

import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import static org.junit.jupiter.api.Assertions.*;

/** Dedicated disposable CI Redis, synthetic keys only; never flushes a database. */
@EnabledIfEnvironmentVariable(named="CRAVES_DISPOSABLE_REDIS_TEST",matches="YES_LOCAL_REDIS_ONLY")
class RedisRevocationAtomicTest {
    LettuceConnectionFactory factory;StringRedisTemplate redis;String key;
    @BeforeEach void setup() {
        factory=new LettuceConnectionFactory("127.0.0.1",6379);factory.afterPropertiesSet();factory.start();
        redis=new StringRedisTemplate(factory);redis.afterPropertiesSet();key="test:craves:revocation:"+UUID.randomUUID();
    }
    @AfterEach void cleanup() {try{redis.delete(key);}finally{factory.destroy();}}
    long apply(String status,String version) {
        return redis.execute(RedisTokenRevocationPublisher.PROJECTION_SCRIPT,List.of(key),status,version,"1200");
    }
    @Test void delayedOlderActiveEventCannotUndoSuspension() {
        assertEquals(1,apply("SUSPENDED","3"));assertEquals(0,apply("ACTIVE","2"));assertEquals("SUSPENDED|3",redis.opsForValue().get(key));
        assertEquals(1,apply("ACTIVE","4"));assertEquals(0,apply("SUSPENDED","3"));assertEquals("ACTIVE|4",redis.opsForValue().get(key));
    }
    @Test void decimalComparisonPreservesAllSignedLongPrecision() {
        assertEquals(1,apply("SUSPENDED","9223372036854775807"));assertEquals(0,apply("ACTIVE","9223372036854775806"));
        assertEquals("SUSPENDED|9223372036854775807",redis.opsForValue().get(key));
    }
    @Test void malformedAndSameVersionConflictNeverRestoreAccess() {
        apply("SUSPENDED","9");assertEquals(-1,apply("ACTIVE","9"));assertEquals("SUSPENDED|9",redis.opsForValue().get(key));
        redis.opsForValue().set(key,"INVALID",Duration.ofMinutes(10));assertEquals(-1,apply("ACTIVE","10"));assertEquals("INVALID",redis.opsForValue().get(key));
    }
    @Test void duplicateDoesNotShortenProtectionAndNewVersionCanRestoreAccess() {
        redis.opsForValue().set(key,"SUSPENDED|9",Duration.ofHours(1));apply("SUSPENDED","9");assertTrue(redis.getExpire(key)>3500);
        assertEquals(1,apply("ACTIVE","10"));assertEquals("ACTIVE|10",redis.opsForValue().get(key));
    }
    @Test void concurrentOutOfOrderVersionsFinishAtHighestVersion() throws Exception {
        try(var pool=Executors.newFixedThreadPool(8)) {
            var tasks=new java.util.ArrayList<java.util.concurrent.Callable<Long>>();
            for(int i=100;i>=1;i--){String version=Integer.toString(i);tasks.add(()->apply("SUSPENDED",version));}
            for(var result:pool.invokeAll(tasks))assertTrue(result.get()>=0);
        }
        assertEquals("SUSPENDED|100",redis.opsForValue().get(key));
    }
}
