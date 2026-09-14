package in.craves.auth.security;

import jakarta.servlet.http.HttpServletRequest;

/** Classify the container-decoded servlet route, not an encoded request-URI spelling. */
public final class AuthProtectedOperation {
    private AuthProtectedOperation() {}
    public static String operation(HttpServletRequest request) {
        if (!"POST".equalsIgnoreCase(request.getMethod())) return null;
        String servletPath=request.getServletPath();
        String pathInfo=request.getPathInfo();
        String path;
        if (servletPath!=null && !servletPath.isEmpty()) {
            // Servlet paths already exclude the context path and use the container's decoding/normalization.
            path=servletPath+(pathInfo==null?"":pathInfo);
        } else if (pathInfo!=null && !pathInfo.isEmpty()) {
            path=pathInfo;
        } else {
            // Legacy request mocks may omit both servlet path fields. Real mapped requests use the branches above.
            path=request.getRequestURI();
            if (path==null) return null;
            String context=request.getContextPath();
            if (context!=null && !context.isEmpty()) {
                if (!path.startsWith(context+"/")) return null;
                path=path.substring(context.length());
            }
        }
        return switch(path) {
            case "/api/v1/auth/firebase/exchange" -> "exchange";
            case "/api/v1/auth/refresh" -> "refresh";
            default -> null;
        };
    }
}
