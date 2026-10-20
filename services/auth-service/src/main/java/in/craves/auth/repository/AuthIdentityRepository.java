package in.craves.auth.repository;

import in.craves.auth.domain.AuthIdentity;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AuthIdentityRepository extends JpaRepository<AuthIdentity, UUID> {
    Optional<AuthIdentity> findByFirebaseUid(String firebaseUid);

    Optional<AuthIdentity> findByPhoneNumber(String phoneNumber);

    // In-place increment: the V4 trigger publishes the new minimum version; never overwrites a concurrent status change.
    @Modifying
    @Query(value = "UPDATE auth_identity SET token_version = token_version + 1, updated_at = now() WHERE id = :id", nativeQuery = true)
    int incrementTokenVersion(@Param("id") UUID id);
}
