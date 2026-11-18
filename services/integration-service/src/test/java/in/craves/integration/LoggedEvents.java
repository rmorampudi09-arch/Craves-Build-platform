package in.craves.integration;

import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.AppenderBase;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/** A test's log lines, in a list that is safe to read while other threads log (logback's ListAppender keeps an ArrayList). */
public final class LoggedEvents extends AppenderBase<ILoggingEvent> {
    public final List<ILoggingEvent> list = new CopyOnWriteArrayList<>();

    @Override
    protected void append(ILoggingEvent event) {
        list.add(event);
    }

    public List<String> lines(String prefix) {
        return list.stream().map(ILoggingEvent::getFormattedMessage).filter(line -> line.startsWith(prefix)).toList();
    }
}
