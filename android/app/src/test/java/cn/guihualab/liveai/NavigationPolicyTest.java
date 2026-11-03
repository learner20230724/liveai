package cn.guihualab.liveai;

import org.junit.Test;
import static org.junit.Assert.*;

public class NavigationPolicyTest {
    @Test public void originAndBridgeStayOnLiveAI() {
        assertTrue(NavigationPolicy.ownDocument("https://guihualab.cn/liveai/"));
        assertTrue(NavigationPolicy.ownDocument("https://guihualab.cn/liveai/index.html?version=1"));
        for(String url:new String[]{"http://guihualab.cn/liveai/","https://guihualab.cn.evil.example/liveai/","https://user@guihualab.cn/liveai/","https://guihualab.cn:444/liveai/","https://guihualab.cn/","file:///liveai/index.html","https://guihualab.cn/liveai/api/models"})assertFalse(url,NavigationPolicy.ownDocument(url));
    }
    @Test public void onlyPublicBundleAssetsAreIntercepted() {
        assertEquals("index.html",NavigationPolicy.asset("https://guihualab.cn/liveai/","GET"));
        assertEquals("assets/a.js",NavigationPolicy.asset("https://guihualab.cn/liveai/assets/a.js","GET"));
        assertEquals("pcm-capture.js",NavigationPolicy.asset("https://guihualab.cn/liveai/pcm-capture.js","GET"));
        for(String path:new String[]{"api/session","downloads/liveai-latest.apk","app-updates/latest.json","assets/%2e%2e/index.html","assets/a/../../index.html","assets/a%5c../index.html"})assertNull(path,NavigationPolicy.asset("https://guihualab.cn/liveai/"+path,"GET"));
        assertNull(NavigationPolicy.asset("https://guihualab.cn/liveai/index.html","POST"));
        assertFalse(NavigationPolicy.external("intent://evil"));
    }
}
