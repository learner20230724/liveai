package cn.guihualab.liveai;

import java.net.URI;

/** One HTTPS origin for cookies/storage; only LiveAI documents host the bridge. */
final class NavigationPolicy {
    static final String HOME = "https://guihualab.cn/liveai/";
    static boolean ownOrigin(String value) {
        try {
            URI uri = new URI(value);
            return "https".equals(uri.getScheme()) && "guihualab.cn".equals(uri.getHost())
                && (uri.getPort() == -1 || uri.getPort() == 443) && uri.getUserInfo() == null;
        } catch (Exception ignored) { return false; }
    }
    static boolean ownDocument(String value) {
        if (!ownOrigin(value)) return false;
        try { String p = new URI(value).getPath(); return "/liveai/".equals(p) || "/liveai/index.html".equals(p); }
        catch (Exception ignored) { return false; }
    }
    static String asset(String value, String method) {
        if (!ownOrigin(value) || !"GET".equals(method)) return null;
        try {
            String path = new URI(value).getPath();
            if (path == null || !path.startsWith("/liveai/")) return null;
            String relative = path.substring("/liveai/".length());
            if (relative.isEmpty()) return "index.html";
            if (relative.contains("..") || relative.contains("\\") || relative.indexOf('\0') >= 0) return null;
            if (relative.equals("index.html") || relative.equals("pcm-capture.js") || relative.startsWith("assets/")) return relative;
        } catch (Exception ignored) { }
        return null;
    }
    static boolean external(String value) {
        try { URI uri = new URI(value); return "https".equals(uri.getScheme()) && uri.getHost() != null && uri.getUserInfo() == null; }
        catch (Exception ignored) { return false; }
    }
}
