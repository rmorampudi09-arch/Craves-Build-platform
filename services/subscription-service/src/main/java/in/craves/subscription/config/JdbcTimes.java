package in.craves.subscription.config;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;

/** PostgreSQL JDBC supports Timestamp reads, not getObject(..., Instant.class). */
public final class JdbcTimes {
    private JdbcTimes() {}
    public static Instant instant(ResultSet rows,String column) throws SQLException {
        Timestamp value=rows.getTimestamp(column);
        return value==null?null:value.toInstant();
    }
}
