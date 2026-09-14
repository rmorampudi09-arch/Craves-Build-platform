package in.craves.auth.security;

import static org.junit.jupiter.api.Assertions.*;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicReference;
import org.apache.catalina.startup.Tomcat;
import org.apache.tomcat.util.descriptor.web.FilterDef;
import org.apache.tomcat.util.descriptor.web.FilterMap;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Real loopback Tomcat routing only; no Spring application, Auth provider or database is started. */
class AuthProtectedOperationTomcatTest {
    @TempDir Path directory;
    private Tomcat tomcat;
    private URI origin;
    private final AtomicReference<String> rawPath=new AtomicReference<>();
    private final AtomicReference<String> decodedPath=new AtomicReference<>();
    @BeforeEach void startDisposableServletContainer() throws Exception {
        tomcat=new Tomcat();tomcat.setBaseDir(directory.toString());tomcat.setPort(0);
        tomcat.getConnector().setProperty("address","127.0.0.1");
        var context=tomcat.addContext("/craves",directory.toString());
        Tomcat.addServlet(context,"synthetic-auth",new HttpServlet(){
            @Override protected void doPost(HttpServletRequest request,HttpServletResponse response)throws java.io.IOException {
                response.setContentType("text/plain");response.getWriter().write("synthetic-auth-route-reached");
            }
        });
        context.addServletMappingDecoded("/api/v1/auth/refresh","synthetic-auth");
        context.addServletMappingDecoded("/api/v1/auth/firebase/exchange","synthetic-auth");
        var definition=new FilterDef();definition.setFilterName("classify-auth");definition.setFilter(new Filter(){
            public void doFilter(ServletRequest request,ServletResponse response,FilterChain chain)throws java.io.IOException,jakarta.servlet.ServletException {
                HttpServletRequest http=(HttpServletRequest)request;rawPath.set(http.getRequestURI());decodedPath.set(http.getServletPath());
                String operation=AuthProtectedOperation.operation(http);
                ((HttpServletResponse)response).setHeader("X-Synthetic-Auth-Operation",operation==null?"NONE":operation);
                chain.doFilter(request,response);
            }
        });
        context.addFilterDef(definition);var mapping=new FilterMap();mapping.setFilterName("classify-auth");mapping.addURLPattern("/*");context.addFilterMap(mapping);
        tomcat.start();origin=URI.create("http://127.0.0.1:"+tomcat.getConnector().getLocalPort());
    }
    @AfterEach void stopDisposableServletContainer()throws Exception {
        if(tomcat!=null){try{tomcat.stop();}finally{tomcat.destroy();}}
    }
    @Test void encodedRefreshSpellingReachesDecodedProtectedServlet()throws Exception {
        String path="/craves/api/v1/auth/re%66resh";var response=post(path);
        assertEquals(200,response.statusCode());assertEquals("synthetic-auth-route-reached",response.body());
        assertEquals(path,rawPath.get());assertEquals("/api/v1/auth/refresh",decodedPath.get());
        assertEquals("refresh",response.headers().firstValue("X-Synthetic-Auth-Operation").orElseThrow());
    }
    @Test void encodedExchangeSpellingAndContextCannotBypassClassification()throws Exception {
        String path="/craves/api/v1/auth/firebase/%65xchange";var response=post(path);
        assertEquals(200,response.statusCode());assertEquals("synthetic-auth-route-reached",response.body());
        assertEquals(path,rawPath.get());assertEquals("/api/v1/auth/firebase/exchange",decodedPath.get());
        assertEquals("exchange",response.headers().firstValue("X-Synthetic-Auth-Operation").orElseThrow());
    }
    private HttpResponse<String> post(String path)throws Exception {
        try(var client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build()) {
            return client.send(HttpRequest.newBuilder(origin.resolve(path)).timeout(Duration.ofSeconds(5)).header("Content-Type","application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{}" )).build(),HttpResponse.BodyHandlers.ofString());
        }
    }
}
