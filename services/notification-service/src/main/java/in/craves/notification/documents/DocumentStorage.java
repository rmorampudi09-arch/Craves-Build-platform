package in.craves.notification.documents;

import java.util.UUID;

public interface DocumentStorage {
    /** Store without overwriting another artifact; key contains the exact content digest. */
    String put(UUID owner,UUID document,byte[] content);
    /** Read the exact artifact and verify its digest and byte length before delivery. */
    byte[] read(String key,String expectedHash,long expectedBytes);
}
