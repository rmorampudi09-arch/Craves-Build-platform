package in.craves.userchef.service;

import in.craves.userchef.exception.ApiException;
import in.craves.userchef.security.CurrentUser;
import in.craves.userchef.web.AdminDirectoryDtos.ChefApplicationCase;
import in.craves.userchef.web.AdminDirectoryDtos.ChefCaseResponse;
import in.craves.userchef.web.AdminDirectoryDtos.ChefDecisionCase;
import in.craves.userchef.web.AdminDirectoryDtos.ChefDocumentCase;
import in.craves.userchef.web.AdminDirectoryDtos.CustomerAddressCase;
import in.craves.userchef.web.AdminDirectoryDtos.CustomerCaseResponse;
import in.craves.userchef.web.AdminDirectoryDtos.CustomerProfileCase;
import in.craves.userchef.web.AdminDirectoryDtos.DirectoryHit;
import in.craves.userchef.web.AdminDirectoryDtos.DirectorySearchResponse;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class AdminDirectoryService {
    private static final int MAX_RESULTS = 20;
    private static final int MIN_REASON_LENGTH = 10;
    private static final int MAX_REASON_LENGTH = 500;
    private static final int MAX_QUERY_LENGTH = 255;

    private final JdbcTemplate jdbcTemplate;

    public AdminDirectoryService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional
    public DirectorySearchResponse search(CurrentUser admin, String rawQuery, String rawReason) {
        requireAdmin(admin);
        String reason = normalizeReason(rawReason);
        SearchQuery query = normalizeQuery(rawQuery);
        UUID correlationId = UUID.randomUUID();
        List<DirectoryHit> hits = new ArrayList<>();

        switch (query.type()) {
            case "UUID" -> searchByUuid(query.value(), hits);
            case "EMAIL" -> searchByEmail(query.value(), hits);
            case "PHONE" -> searchByPhone(query.value(), hits);
            case "NAME" -> searchByName(query.value(), hits);
            default -> throw ApiException.badRequest("ADMIN_DIRECTORY_QUERY_INVALID", "Unsupported directory search query");
        }

        List<DirectoryHit> bounded = hits.stream().limit(MAX_RESULTS).toList();
        audit(admin.identityId(), correlationId, "SEARCH", query.type(), query.value(), null, bounded.size(), reason);
        return new DirectorySearchResponse(correlationId, query.type(), bounded);
    }

    @Transactional
    public CustomerCaseResponse getCustomerCase(CurrentUser admin, UUID identityId, String rawReason) {
        requireAdmin(admin);
        if (identityId == null) {
            throw ApiException.badRequest("ADMIN_DIRECTORY_IDENTITY_REQUIRED", "Customer identity is required");
        }
        String reason = normalizeReason(rawReason);
        UUID correlationId = UUID.randomUUID();

        List<CustomerProfileCase> profiles = jdbcTemplate.query(
            "SELECT id, identity_id, registered_phone_number, first_name, last_name, email, created_at, updated_at " +
                "FROM customer_profile WHERE identity_id = ?",
            this::mapCustomerProfile,
            identityId
        );
        if (profiles.isEmpty()) {
            throw ApiException.notFound("ADMIN_CUSTOMER_NOT_FOUND", "Customer profile was not found");
        }

        List<CustomerAddressCase> addresses = jdbcTemplate.query(
            "SELECT id, address_label, recipient_name, contact_phone_number, address_line1, address_line2, landmark, " +
                "area_name, district_name, city, state, postal_code, latitude, longitude, is_default, created_at, updated_at " +
                "FROM customer_address WHERE identity_id = ? AND is_active = true " +
                "ORDER BY is_default DESC, updated_at DESC, created_at DESC LIMIT 50",
            this::mapCustomerAddress,
            identityId
        );

        audit(admin.identityId(), correlationId, "CUSTOMER_CASE", "IDENTITY_ID", identityId.toString(), identityId, 1, reason);
        return new CustomerCaseResponse(correlationId, profiles.getFirst(), addresses);
    }

    @Transactional
    public ChefCaseResponse getChefCase(CurrentUser admin, UUID identityId, String rawReason) {
        requireAdmin(admin);
        if (identityId == null) {
            throw ApiException.badRequest("ADMIN_DIRECTORY_IDENTITY_REQUIRED", "Chef identity is required");
        }
        String reason = normalizeReason(rawReason);
        UUID correlationId = UUID.randomUUID();

        List<ChefApplicationCase> applications = jdbcTemplate.query(
            "SELECT id, identity_id, phone_number, email, first_name, last_name, address_line1, address_line2, landmark, " +
                "city, state, postal_code, latitude, longitude, status, rejection_reason, submitted_at, reviewed_at, " +
                "reviewed_by_identity_id, created_at, updated_at FROM chef_application WHERE identity_id = ?",
            this::mapChefApplication,
            identityId
        );
        if (applications.isEmpty()) {
            throw ApiException.notFound("ADMIN_CHEF_NOT_FOUND", "Chef application was not found");
        }
        ChefApplicationCase application = applications.getFirst();

        List<ChefDocumentCase> documents = jdbcTemplate.query(
            "SELECT id, document_type, original_file_name, content_type, file_size_bytes, status, created_at, updated_at " +
                "FROM chef_kyc_document WHERE application_id = ? ORDER BY document_type, created_at",
            this::mapChefDocument,
            application.applicationId()
        );
        List<ChefDecisionCase> decisions = jdbcTemplate.query(
            "SELECT id, admin_identity_id, decision, reason, created_at FROM admin_chef_decision_audit " +
                "WHERE application_id = ? ORDER BY created_at DESC LIMIT 100",
            this::mapChefDecision,
            application.applicationId()
        );

        audit(admin.identityId(), correlationId, "CHEF_CASE", "IDENTITY_ID", identityId.toString(), identityId, 1, reason);
        return new ChefCaseResponse(correlationId, application, documents, decisions);
    }

    private void searchByUuid(String value, List<DirectoryHit> hits) {
        UUID id;
        try {
            id = UUID.fromString(value);
        } catch (IllegalArgumentException ex) {
            throw ApiException.badRequest("ADMIN_DIRECTORY_UUID_INVALID", "Search UUID is invalid");
        }
        hits.addAll(jdbcTemplate.query(
            "SELECT id, identity_id, registered_phone_number, first_name, last_name, email " +
                "FROM customer_profile WHERE id = ? OR identity_id = ? LIMIT 10",
            (rs, rowNum) -> customerHit(rs, "ID", value),
            id,
            id
        ));
        hits.addAll(jdbcTemplate.query(
            "SELECT id, identity_id, phone_number, email, first_name, last_name, status " +
                "FROM chef_application WHERE id = ? OR identity_id = ? LIMIT 10",
            (rs, rowNum) -> chefHit(rs, "ID", value),
            id,
            id
        ));
    }

    private void searchByEmail(String value, List<DirectoryHit> hits) {
        hits.addAll(jdbcTemplate.query(
            "SELECT id, identity_id, registered_phone_number, first_name, last_name, email " +
                "FROM customer_profile WHERE lower(email) = ? LIMIT 10",
            (rs, rowNum) -> customerHit(rs, "EMAIL", value),
            value
        ));
        hits.addAll(jdbcTemplate.query(
            "SELECT id, identity_id, phone_number, email, first_name, last_name, status " +
                "FROM chef_application WHERE lower(email) = ? LIMIT 10",
            (rs, rowNum) -> chefHit(rs, "EMAIL", value),
            value
        ));
    }

    private void searchByPhone(String value, List<DirectoryHit> hits) {
        hits.addAll(jdbcTemplate.query(
            "SELECT id, identity_id, registered_phone_number, first_name, last_name, email " +
                "FROM customer_profile WHERE registered_phone_number = ? LIMIT 10",
            (rs, rowNum) -> customerHit(rs, "PHONE", value),
            value
        ));
        hits.addAll(jdbcTemplate.query(
            "SELECT id, identity_id, phone_number, email, first_name, last_name, status " +
                "FROM chef_application WHERE phone_number = ? LIMIT 10",
            (rs, rowNum) -> chefHit(rs, "PHONE", value),
            value
        ));
    }

    private void searchByName(String value, List<DirectoryHit> hits) {
        String[] parts = value.split("\\s+", 2);
        String first = parts[0];
        String last = parts.length > 1 ? parts[1] : null;
        if (last == null) {
            hits.addAll(jdbcTemplate.query(
                "SELECT id, identity_id, registered_phone_number, first_name, last_name, email " +
                    "FROM customer_profile WHERE lower(first_name) = ? OR lower(last_name) = ? ORDER BY updated_at DESC LIMIT 10",
                (rs, rowNum) -> customerHit(rs, "NAME", value),
                first,
                first
            ));
            hits.addAll(jdbcTemplate.query(
                "SELECT id, identity_id, phone_number, email, first_name, last_name, status " +
                    "FROM chef_application WHERE lower(first_name) = ? OR lower(last_name) = ? ORDER BY updated_at DESC LIMIT 10",
                (rs, rowNum) -> chefHit(rs, "NAME", value),
                first,
                first
            ));
        } else {
            hits.addAll(jdbcTemplate.query(
                "SELECT id, identity_id, registered_phone_number, first_name, last_name, email " +
                    "FROM customer_profile WHERE lower(first_name) = ? AND lower(last_name) = ? ORDER BY updated_at DESC LIMIT 10",
                (rs, rowNum) -> customerHit(rs, "NAME", value),
                first,
                last
            ));
            hits.addAll(jdbcTemplate.query(
                "SELECT id, identity_id, phone_number, email, first_name, last_name, status " +
                    "FROM chef_application WHERE lower(first_name) = ? AND lower(last_name) = ? ORDER BY updated_at DESC LIMIT 10",
                (rs, rowNum) -> chefHit(rs, "NAME", value),
                first,
                last
            ));
        }
    }

    private DirectoryHit customerHit(ResultSet rs, String matchField, String query) throws SQLException {
        String phone = rs.getString("registered_phone_number");
        String email = rs.getString("email");
        return new DirectoryHit(
            "CUSTOMER",
            rs.getObject("identity_id", UUID.class),
            rs.getObject("id", UUID.class),
            displayName(rs.getString("first_name"), rs.getString("last_name")),
            email == null ? "Customer account" : maskEmail(email),
            "ACTIVE_PROFILE",
            matchField,
            maskedMatch(matchField, query, phone, email)
        );
    }

    private DirectoryHit chefHit(ResultSet rs, String matchField, String query) throws SQLException {
        String phone = rs.getString("phone_number");
        String email = rs.getString("email");
        return new DirectoryHit(
            "CHEF",
            rs.getObject("identity_id", UUID.class),
            rs.getObject("id", UUID.class),
            displayName(rs.getString("first_name"), rs.getString("last_name")),
            maskEmail(email),
            rs.getString("status"),
            matchField,
            maskedMatch(matchField, query, phone, email)
        );
    }

    private CustomerProfileCase mapCustomerProfile(ResultSet rs, int rowNum) throws SQLException {
        return new CustomerProfileCase(
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

    private CustomerAddressCase mapCustomerAddress(ResultSet rs, int rowNum) throws SQLException {
        return new CustomerAddressCase(
            rs.getObject("id", UUID.class),
            rs.getString("address_label"),
            rs.getString("recipient_name"),
            rs.getString("contact_phone_number"),
            rs.getString("address_line1"),
            rs.getString("address_line2"),
            rs.getString("landmark"),
            rs.getString("area_name"),
            rs.getString("district_name"),
            rs.getString("city"),
            rs.getString("state"),
            rs.getString("postal_code"),
            decimal(rs, "latitude"),
            decimal(rs, "longitude"),
            rs.getBoolean("is_default"),
            instant(rs, "created_at"),
            instant(rs, "updated_at")
        );
    }

    private ChefApplicationCase mapChefApplication(ResultSet rs, int rowNum) throws SQLException {
        return new ChefApplicationCase(
            rs.getObject("id", UUID.class),
            rs.getObject("identity_id", UUID.class),
            rs.getString("phone_number"),
            rs.getString("email"),
            rs.getString("first_name"),
            rs.getString("last_name"),
            rs.getString("address_line1"),
            rs.getString("address_line2"),
            rs.getString("landmark"),
            rs.getString("city"),
            rs.getString("state"),
            rs.getString("postal_code"),
            decimal(rs, "latitude"),
            decimal(rs, "longitude"),
            rs.getString("status"),
            rs.getString("rejection_reason"),
            instant(rs, "submitted_at"),
            instant(rs, "reviewed_at"),
            rs.getObject("reviewed_by_identity_id", UUID.class),
            instant(rs, "created_at"),
            instant(rs, "updated_at")
        );
    }

    private ChefDocumentCase mapChefDocument(ResultSet rs, int rowNum) throws SQLException {
        return new ChefDocumentCase(
            rs.getObject("id", UUID.class),
            rs.getString("document_type"),
            rs.getString("original_file_name"),
            rs.getString("content_type"),
            rs.getLong("file_size_bytes"),
            rs.getString("status"),
            instant(rs, "created_at"),
            instant(rs, "updated_at")
        );
    }

    private ChefDecisionCase mapChefDecision(ResultSet rs, int rowNum) throws SQLException {
        return new ChefDecisionCase(
            rs.getObject("id", UUID.class),
            rs.getObject("admin_identity_id", UUID.class),
            rs.getString("decision"),
            rs.getString("reason"),
            instant(rs, "created_at")
        );
    }

    private void audit(
        UUID adminIdentityId,
        UUID correlationId,
        String actionType,
        String queryType,
        String queryValue,
        UUID targetIdentityId,
        int resultCount,
        String reason
    ) {
        jdbcTemplate.update(
            "INSERT INTO admin_directory_lookup_audit " +
                "(id, admin_identity_id, correlation_id, action_type, query_type, query_sha256, target_identity_id, result_count, reason, created_at) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, now())",
            UUID.randomUUID(),
            adminIdentityId,
            correlationId,
            actionType,
            queryType,
            sha256(queryValue),
            targetIdentityId,
            resultCount,
            reason
        );
    }

    private static void requireAdmin(CurrentUser user) {
        if (user == null) {
            throw ApiException.unauthorized("ADMIN_AUTHENTICATION_REQUIRED", "Administrator authentication is required");
        }
        if (!user.hasRole("ADMIN")) {
            throw ApiException.forbidden("ADMIN_ROLE_REQUIRED", "Administrator role is required");
        }
    }

    private static String normalizeReason(String value) {
        String reason = value == null ? "" : value.replaceAll("[\\r\\n]+", " ").trim();
        if (reason.length() < MIN_REASON_LENGTH || reason.length() > MAX_REASON_LENGTH) {
            throw ApiException.badRequest(
                "ADMIN_DIRECTORY_REASON_INVALID",
                "Operational reason must contain 10 to 500 characters"
            );
        }
        return reason;
    }

    private static SearchQuery normalizeQuery(String value) {
        if (!StringUtils.hasText(value)) {
            throw ApiException.badRequest("ADMIN_DIRECTORY_QUERY_REQUIRED", "Search query is required");
        }
        String trimmed = value.trim();
        if (trimmed.length() > MAX_QUERY_LENGTH) {
            throw ApiException.badRequest("ADMIN_DIRECTORY_QUERY_TOO_LONG", "Search query is too long");
        }
        if (looksLikeUuid(trimmed)) {
            return new SearchQuery("UUID", trimmed.toLowerCase(Locale.ROOT));
        }
        if (trimmed.contains("@")) {
            return new SearchQuery("EMAIL", trimmed.toLowerCase(Locale.ROOT));
        }
        String phone = normalizePhone(trimmed);
        if (phone != null) {
            return new SearchQuery("PHONE", phone);
        }
        String name = trimmed.replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
        if (name.length() < 2 || !name.matches("[\\p{L} .'-]+")) {
            throw ApiException.badRequest(
                "ADMIN_DIRECTORY_QUERY_INVALID",
                "Search by an exact mobile number, email, customer or chef UUID, or exact name"
            );
        }
        return new SearchQuery("NAME", name);
    }

    private static boolean looksLikeUuid(String value) {
        try {
            UUID.fromString(value);
            return true;
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    private static String normalizePhone(String value) {
        String compact = value.replaceAll("[\\s()-]", "");
        if (!compact.matches("\\+?\\d{10,15}")) {
            return null;
        }
        return compact;
    }

    private static String displayName(String firstName, String lastName) {
        return ((firstName == null ? "" : firstName.trim()) + " " + (lastName == null ? "" : lastName.trim())).trim();
    }

    private static String maskedMatch(String field, String query, String phone, String email) {
        return switch (field) {
            case "PHONE" -> maskPhone(phone == null ? query : phone);
            case "EMAIL" -> maskEmail(email == null ? query : email);
            case "ID" -> maskUuid(query);
            default -> "Exact name match";
        };
    }

    private static String maskPhone(String value) {
        if (value == null || value.length() < 4) {
            return "••••";
        }
        return "••••••" + value.substring(value.length() - 4);
    }

    private static String maskEmail(String value) {
        if (value == null || !value.contains("@")) {
            return "Email not recorded";
        }
        String[] parts = value.split("@", 2);
        String local = parts[0];
        String visible = local.isEmpty() ? "•" : local.substring(0, 1);
        return visible + "•••@" + parts[1];
    }

    private static String maskUuid(String value) {
        return value.length() <= 12 ? value : value.substring(0, 8) + "…" + value.substring(value.length() - 4);
    }

    private static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is unavailable", ex);
        }
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }

    private static BigDecimal decimal(ResultSet rs, String column) throws SQLException {
        return rs.getBigDecimal(column);
    }

    private record SearchQuery(String type, String value) {
    }
}
