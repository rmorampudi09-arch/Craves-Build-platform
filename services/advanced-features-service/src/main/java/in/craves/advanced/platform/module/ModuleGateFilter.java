package in.craves.advanced.platform.module;

import in.craves.advanced.platform.web.ApiProblem;
import in.craves.advanced.platform.web.ErrorBody;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Optional;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Runs after authentication: routes a request to its module, refuses it while the module is off or failed, and caps its concurrency. */
@Component
public class ModuleGateFilter extends OncePerRequestFilter {
    private final ModuleRuntime runtime;

    public ModuleGateFilter(ModuleRuntime runtime) {
        this.runtime = runtime;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Optional<FeatureModule> module = runtime.moduleFor(request.getRequestURI());
        if (module.isEmpty()) {
            chain.doFilter(request, response);
            return;
        }
        try {
            runtime.ensureReady(module.get());
        } catch (ApiProblem problem) {
            response.setHeader("Retry-After", "30");
            ErrorBody.write(request, response, problem.status(), problem.code(), problem.getMessage());
            return;
        }
        Semaphore bulkhead = runtime.bulkhead(module.get());
        boolean acquired;
        try {
            acquired = bulkhead.tryAcquire(250, TimeUnit.MILLISECONDS);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            acquired = false;
        }
        if (!acquired) {
            response.setHeader("Retry-After", "2");
            ErrorBody.write(request, response, 503, "FEATURE_BUSY", "This feature is busy, please retry");
            return;
        }
        try {
            response.setHeader("X-Craves-Feature", module.get().id());
            chain.doFilter(request, response);
        } finally {
            bulkhead.release();
        }
    }
}
