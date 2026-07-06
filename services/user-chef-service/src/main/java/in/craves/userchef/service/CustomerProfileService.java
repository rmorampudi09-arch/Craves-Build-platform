package in.craves.userchef.service;

import in.craves.userchef.exception.ApiException;
import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.web.ApiDtos.AddressLabel;
import in.craves.userchef.web.ApiDtos.CustomerAddressRequest;
import in.craves.userchef.web.ApiDtos.CustomerAddressResponse;
import in.craves.userchef.web.ApiDtos.CustomerProfileRequest;
import in.craves.userchef.web.ApiDtos.CustomerProfileResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CustomerProfileService {
    private final JdbcTemplate jdbcTemplate;

    public CustomerProfileService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public CustomerProfileResponse getProfile(CurrentUser user) {
        List<CustomerProfileResponse> rows = jdbcTemplate.query(
            "SELECT * FROM customer_profile WHERE identity_id = ?",
            this::mapProfile,
            user.identityId()
        );
        if (rows.isEmpty()) {
            throw ApiException.notFound("CUSTOMER_PROFILE_NOT_FOUND", "Customer profile has not been created yet");
        }
        return rows.getFirst();
    }

    @Transactional
    public CustomerProfileResponse upsertProfile(CurrentUser user, CustomerProfileRequest request) {
        List<UUID> existing = jdbcTemplate.query(
            "SELECT id FROM customer_profile WHERE identity_id = ?",
            (rs, rowNum) -> rs.getObject("id", UUID.class),
            user.identityId()
        );

        if (existing.isEmpty()) {
            UUID id = UUID.randomUUID();
            jdbcTemplate.update(
                "INSERT INTO customer_profile (id, identity_id, registered_phone_number, first_name, last_name, email, created_at, updated_at) " +
                    "VALUES (?, ?, ?, ?, ?, ?, now(), now())",
                id,
                user.identityId(),
                user.phoneNumber(),
                request.firstName(),
                request.lastName(),
                blankToNull(request.email())
            );
        } else {
            jdbcTemplate.update(
                "UPDATE customer_profile SET registered_phone_number = ?, first_name = ?, last_name = ?, email = ?, updated_at = now() " +
                    "WHERE identity_id = ?",
                user.phoneNumber(),
                request.firstName(),
                request.lastName(),
                blankToNull(request.email()),
                user.identityId()
            );
        }
        return getProfile(user);
    }

    public List<CustomerAddressResponse> listAddresses(CurrentUser user) {
        return jdbcTemplate.query(
            "SELECT * FROM customer_address WHERE identity_id = ? ORDER BY is_default DESC, created_at DESC",
            this::mapAddress,
            user.identityId()
        );
    }

    @Transactional
    public CustomerAddressResponse addAddress(CurrentUser user, CustomerAddressRequest request) {
        boolean makeDefault = Boolean.TRUE.equals(request.isDefault()) || listAddresses(user).isEmpty();
        if (makeDefault) {
            clearDefaultAddress(user.identityId());
        }

        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
            "INSERT INTO customer_address (id, identity_id, address_label, recipient_name, contact_phone_number, address_line1, address_line2, landmark, city, state, postal_code, latitude, longitude, is_default, created_at, updated_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now())",
            id,
            user.identityId(),
            labelOrDefault(request.addressLabel()).name(),
            blankToNull(request.recipientName()),
            request.contactPhoneNumber(),
            request.addressLine1(),
            blankToNull(request.addressLine2()),
            blankToNull(request.landmark()),
            request.city(),
            request.state(),
            blankToNull(request.postalCode()),
            request.latitude(),
            request.longitude(),
            makeDefault
        );
        return getAddress(user, id);
    }

    @Transactional
    public CustomerAddressResponse updateAddress(CurrentUser user, UUID addressId, CustomerAddressRequest request) {
        ensureAddressBelongsToUser(user, addressId);
        if (Boolean.TRUE.equals(request.isDefault())) {
            clearDefaultAddress(user.identityId());
        }
        jdbcTemplate.update(
            "UPDATE customer_address SET address_label = ?, recipient_name = ?, contact_phone_number = ?, address_line1 = ?, address_line2 = ?, landmark = ?, city = ?, state = ?, postal_code = ?, latitude = ?, longitude = ?, is_default = ?, updated_at = now() " +
                "WHERE id = ? AND identity_id = ?",
            labelOrDefault(request.addressLabel()).name(),
            blankToNull(request.recipientName()),
            request.contactPhoneNumber(),
            request.addressLine1(),
            blankToNull(request.addressLine2()),
            blankToNull(request.landmark()),
            request.city(),
            request.state(),
            blankToNull(request.postalCode()),
            request.latitude(),
            request.longitude(),
            Boolean.TRUE.equals(request.isDefault()),
            addressId,
            user.identityId()
        );
        return getAddress(user, addressId);
    }

    @Transactional
    public void deleteAddress(CurrentUser user, UUID addressId) {
        ensureAddressBelongsToUser(user, addressId);
        jdbcTemplate.update("DELETE FROM customer_address WHERE id = ? AND identity_id = ?", addressId, user.identityId());
    }

    private CustomerAddressResponse getAddress(CurrentUser user, UUID addressId) {
        List<CustomerAddressResponse> rows = jdbcTemplate.query(
            "SELECT * FROM customer_address WHERE id = ? AND identity_id = ?",
            this::mapAddress,
            addressId,
            user.identityId()
        );
        if (rows.isEmpty()) {
            throw ApiException.notFound("CUSTOMER_ADDRESS_NOT_FOUND", "Customer address was not found");
        }
        return rows.getFirst();
    }

    private void ensureAddressBelongsToUser(CurrentUser user, UUID addressId) {
        Integer count = jdbcTemplate.queryForObject(
            "SELECT count(*) FROM customer_address WHERE id = ? AND identity_id = ?",
            Integer.class,
            addressId,
            user.identityId()
        );
        if (count == null || count == 0) {
            throw ApiException.notFound("CUSTOMER_ADDRESS_NOT_FOUND", "Customer address was not found");
        }
    }

    private void clearDefaultAddress(UUID identityId) {
        jdbcTemplate.update("UPDATE customer_address SET is_default = false WHERE identity_id = ?", identityId);
    }

    private CustomerProfileResponse mapProfile(ResultSet rs, int rowNum) throws SQLException {
        return new CustomerProfileResponse(
            rs.getObject("id", UUID.class),
            rs.getObject("identity_id", UUID.class),
            rs.getString("registered_phone_number"),
            rs.getString("first_name"),
            rs.getString("last_name"),
            rs.getString("email"),
            instant(rs, "created_at"),
            instant(rs, "updated_at")
        );
    }

    private CustomerAddressResponse mapAddress(ResultSet rs, int rowNum) throws SQLException {
        return new CustomerAddressResponse(
            rs.getObject("id", UUID.class),
            rs.getObject("identity_id", UUID.class),
            AddressLabel.valueOf(rs.getString("address_label")),
            rs.getString("recipient_name"),
            rs.getString("contact_phone_number"),
            rs.getString("address_line1"),
            rs.getString("address_line2"),
            rs.getString("landmark"),
            rs.getString("city"),
            rs.getString("state"),
            rs.getString("postal_code"),
            rs.getBigDecimal("latitude"),
            rs.getBigDecimal("longitude"),
            rs.getBoolean("is_default"),
            instant(rs, "created_at"),
            instant(rs, "updated_at")
        );
    }

    private static AddressLabel labelOrDefault(AddressLabel label) {
        return label == null ? AddressLabel.HOME : label;
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
