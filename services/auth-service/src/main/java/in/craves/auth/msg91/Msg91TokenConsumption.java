package in.craves.auth.msg91;

import in.craves.auth.exception.AuthException;
import in.craves.auth.security.TokenHasher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class Msg91TokenConsumption {
    private final JdbcTemplate jdbc;
    private final TokenHasher hasher = new TokenHasher();
    public Msg91TokenConsumption(JdbcTemplate jdbc) {
        this.jdbc = new JdbcTemplate(java.util.Objects.requireNonNull(jdbc.getDataSource()));
        this.jdbc.setQueryTimeout(3);
    }
    public void consume(String token) {
        // Unique insert makes concurrent/repeated exchanges fail closed, across replicas/restarts.
        // Retain only a SHA-256 digest; never persist the OTP, access token, or phone here.
        int inserted = jdbc.update("INSERT INTO msg91_consumed_token(token_hash) VALUES (?) ON CONFLICT DO NOTHING",
            hasher.sha256Base64Url(token));
        if (inserted != 1) throw AuthException.unauthorized("OTP_ALREADY_USED", "Request a new verification code");
    }
}
