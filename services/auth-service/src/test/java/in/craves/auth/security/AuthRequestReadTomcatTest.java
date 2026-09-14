package in.craves.auth.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;
import org.apache.catalina.startup.Tomcat;
import org.apache.tomcat.util.descriptor.web.FilterDef;
import org.apache.tomcat.util.descriptor.web.FilterMap;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory;

/** Synthetic loopback sockets prove connector inactivity and total-drip limits compose. No real Auth/DB/provider. */
class AuthRequestReadTomcatTest {
    @TempDir Path directory;
    Tomcat tomcat;
    PostgresAuthRateLimiter limiter;
    @BeforeEach void start() throws Exception {
        var settings=PostgresAuthAbuseProtectionFilterTest.settings(true,"postgres",1);
        var reads=new AuthRequestReadSettings(1000,1000);
        tomcat=new Tomcat();tomcat.setBaseDir(directory.toString());tomcat.setPort(0);
        var connector=tomcat.getConnector();connector.setProperty("address","127.0.0.1");
        var factory=new TomcatServletWebServerFactory();new AuthRequestReadConfiguration(settings,reads).customize(factory);
        factory.getTomcatConnectorCustomizers().forEach(customizer->customizer.customize(connector));
        var context=tomcat.addContext("",directory.toString());
        Tomcat.addServlet(context,"synthetic-auth",new HttpServlet(){
            @Override protected void doPost(HttpServletRequest request,HttpServletResponse response)throws java.io.IOException{response.getWriter().write("unexpected-controller");}
        });context.addServletMappingDecoded("/api/v1/auth/refresh","synthetic-auth");
        limiter=mock(PostgresAuthRateLimiter.class);when(limiter.allowGlobal("refresh")).thenReturn(true);when(limiter.retryAfterSeconds()).thenReturn(1);
        var definition=new FilterDef();definition.setFilterName("auth-limits");definition.setFilter(new PostgresAuthAbuseProtectionFilter(settings,limiter,reads));
        context.addFilterDef(definition);var mapping=new FilterMap();mapping.setFilterName("auth-limits");mapping.addURLPattern("/*");context.addFilterMap(mapping);tomcat.start();
    }
    @AfterEach void stop() throws Exception {if(tomcat!=null){try{tomcat.stop();}finally{tomcat.destroy();}}}
    Socket request() throws Exception {
        Socket socket=new Socket("127.0.0.1",tomcat.getConnector().getLocalPort());socket.setSoTimeout(4000);socket.setTcpNoDelay(true);
        socket.getOutputStream().write(("POST /api/v1/auth/refresh HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 100\r\nConnection: close\r\n\r\n{").getBytes(StandardCharsets.US_ASCII));socket.getOutputStream().flush();return socket;
    }
    @Test void anIdleIncompleteBodyTimesOutWithoutCredentialLookup() throws Exception {
        long start=System.nanoTime();
        try(var socket=request()) {
            String status=new BufferedReader(new InputStreamReader(socket.getInputStream(),StandardCharsets.US_ASCII)).readLine();
            assertNotNull(status);assertTrue(status.contains("408"),status);
        }
        assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-start)<3500);verify(limiter,never()).allowCredential(anyString(),anyString());
    }
    @Test void bytesDrippedWithinIdleTimeoutStillExhaustTotalBodyBudget() throws Exception {
        long start=System.nanoTime();
        try(var socket=request()) {
            for(int i=0;i<3;i++){java.util.concurrent.locks.LockSupport.parkNanos(TimeUnit.MILLISECONDS.toNanos(400));socket.getOutputStream().write('a');socket.getOutputStream().flush();}
            String status=new BufferedReader(new InputStreamReader(socket.getInputStream(),StandardCharsets.US_ASCII)).readLine();
            assertNotNull(status);assertTrue(status.contains("408"),status);
        }
        assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-start)<3500);verify(limiter,never()).allowCredential(anyString(),anyString());
    }
}
