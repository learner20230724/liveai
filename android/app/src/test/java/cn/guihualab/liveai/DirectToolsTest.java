package cn.guihualab.liveai;

import android.content.Context;
import okhttp3.*;
import okio.Timeout;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import java.io.*;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class) @Config(sdk=34)
public class DirectToolsTest {
    static final class Values implements ToolValues {final Map<String,String> values=new ConcurrentHashMap<>();public String get(String n){return n.equals("mossKey")?"synthetic-only-key":values.getOrDefault(n,"");}public void put(String n,String v){values.put(n,v);}}
    static final class Backend implements Call.Factory {
        final CountDownLatch tenStarted=new CountDownLatch(10),release=new CountDownLatch(1);
        final AtomicInteger active=new AtomicInteger(),peak=new AtomicInteger(),images=new AtomicInteger();
        volatile int quota=100;
        final List<Request> requests=new CopyOnWriteArrayList<>();
        public Call newCall(Request r){requests.add(r);return new Call(){boolean cancelled;public Request request(){return r;}public Timeout timeout(){return new Timeout();}public void cancel(){cancelled=true;}public boolean isCanceled(){return cancelled;}public boolean isExecuted(){return true;}public Call clone(){return newCall(r);}public void enqueue(Callback callback){throw new UnsupportedOperationException();}
            public Response execute() throws IOException {
                String body="{}",mime="application/json";String path=r.url().encodedPath();
                if(path.equals("/v1/images/generations")){int count=active.incrementAndGet();images.incrementAndGet();if(count>quota){active.decrementAndGet();return new Response.Builder().request(r).protocol(Protocol.HTTP_1_1).code(429).message("limited").body(ResponseBody.create("{\"error\":{\"code\":\"concurrency_limit_exceeded\",\"message\":\"concurrency_limit_exceeded\"}}",MediaType.get("application/json"))).build();}peak.accumulateAndGet(count,Math::max);tenStarted.countDown();try{if(!release.await(6,TimeUnit.SECONDS))throw new IOException("fixture timeout");}catch(InterruptedException e){throw new IOException(e);}finally{active.decrementAndGet();}body="{\"data\":[{\"url\":\"https://img.mosi.cn/fixture.png\"}]}";}
                if(path.equals("/v1/files"))body="{\"id\":\"fixture-file\"}";
                if(path.equals("/v1/responses"))body="{\"output\":[]}";
                if(r.url().host().equals("img.mosi.cn")){mime="image/png";body="PNG fixture";}
                return new Response.Builder().request(r).protocol(Protocol.HTTP_1_1).code(cancelled?499:200).message("fixture").body(ResponseBody.create(body,MediaType.get(mime))).build();
            }
        };}
    }
    @Test public void tenNativeImagesRunAlongsideVisionAndEleventhQueues() throws Exception {
        Context context=RuntimeEnvironment.getApplication();File dir=Files.createTempDirectory("native-tools").toFile();Backend backend=new Backend();Values values=new Values();DirectTools tools=new DirectTools(context,values,dir,new MossHttp(()->values.get("mossKey"),dir,backend));
        try{
            for(int i=0;i<11;i++)tools.submitImage(new JSONObject().put("prompt","fixture "+i).put("size","512x512").toString());
            assertTrue(backend.tenStarted.await(4,TimeUnit.SECONDS));assertEquals(10,backend.images.get());assertEquals(10,tools.snapshot().getInt("running"));assertEquals(1,tools.snapshot().getInt("queued"));
            tools.request("vision-fixture","vision",new JSONObject().put("prompt","fixture question").put("file",new JSONObject().put("name","fixture.png").put("mime","image/png").put("base64","UE5H")).toString());
            for(int i=0;i<100&&tools.result("vision-fixture").isEmpty();i++)Thread.sleep(10);
            assertFalse(tools.result("vision-fixture").isEmpty());assertEquals("",new JSONObject(tools.result("vision-fixture")).getString("error"));assertEquals(10,backend.images.get());
            backend.release.countDown();for(int i=0;i<200&&tools.pending()>0;i++)Thread.sleep(10);
            assertEquals(0,tools.pending());assertEquals(11,backend.images.get());assertTrue(backend.peak.get()<=10);
            JSONArray list=tools.snapshot().getJSONArray("images");for(int i=0;i<list.length();i++){assertEquals("succeeded",list.getJSONObject(i).getString("status"));assertTrue(list.getJSONObject(i).getJSONObject("data").getJSONArray("data").getJSONObject(0).getString("url").startsWith(NavigationPolicy.HOME+"native-output/"));}
            for(Request r:backend.requests){assertNotEquals("guihualab.cn",r.url().host());if(r.url().host().equals("api.mosi.cn"))assertEquals("Bearer synthetic-only-key",r.header("Authorization"));else assertNull(r.header("Authorization"));if(r.url().encodedPath().equals("/v1/images/generations")){okio.Buffer buffer=new okio.Buffer();r.body().writeTo(buffer);assertFalse(new JSONObject(buffer.readUtf8()).getJSONObject("output_watermark").getBoolean("enabled"));}}
        }finally{backend.release.countDown();tools.shutdown();}
    }
    @Test public void providerThreeSlotQuotaQueuesRejectedJobsWithoutLosingResults() throws Exception {
        Context context=RuntimeEnvironment.getApplication();File dir=Files.createTempDirectory("native-limited").toFile();Backend backend=new Backend();backend.quota=3;Values values=new Values();DirectTools tools=new DirectTools(context,values,dir,new MossHttp(()->values.get("mossKey"),dir,backend));
        try{for(int i=0;i<10;i++)tools.submitImage(new JSONObject().put("prompt","fixture "+i).toString());for(int i=0;i<100&&(backend.active.get()<3||tools.snapshot().getInt("providerConcurrency")==10);i++)Thread.sleep(10);assertTrue(backend.images.get()>=4);assertTrue(tools.snapshot().getInt("providerConcurrency")<10);backend.release.countDown();for(int i=0;i<600&&tools.pending()>0;i++)Thread.sleep(10);assertEquals(0,tools.pending());JSONArray list=tools.snapshot().getJSONArray("images");for(int i=0;i<list.length();i++)assertEquals("succeeded",list.getJSONObject(i).getString("status"));assertTrue(backend.peak.get()<=3);}finally{backend.release.countDown();tools.shutdown();}
    }
    @Test public void lockedPaidOperationNeverMakesAnUpstreamRequest() throws Exception {
        Context context=RuntimeEnvironment.getApplication();File dir=Files.createTempDirectory("native-paid").toFile();Backend backend=new Backend();Values values=new Values();DirectTools tools=new DirectTools(context,values,dir,new MossHttp(()->values.get("mossKey"),dir,backend));
        try{tools.request("paid-blocked","voiceDesign",new JSONObject().put("model","moss-voice-generator-1.0").put("input","test").put("instruction","fixture voice").toString());for(int i=0;i<100&&tools.result("paid-blocked").isEmpty();i++)Thread.sleep(10);assertTrue(new JSONObject(tools.result("paid-blocked")).getString("error").contains("密码"));assertEquals(0,backend.requests.size());}finally{tools.shutdown();}
    }

    @Test public void oldMediaCacheIsRemovedWithoutChangingRealtimeHistory() throws Exception {
        Context context=RuntimeEnvironment.getApplication();File dir=Files.createTempDirectory("session-media").toFile();Files.write(new File(dir,"old.png").toPath(),new byte[]{1,2,3});Values values=new Values();values.put("imageJobs","[{\"id\":\"old\"}]");values.put("history","realtime text fixture");Backend backend=new Backend();DirectTools tools=new DirectTools(context,values,dir,new MossHttp(()->values.get("mossKey"),dir,backend));
        try{assertEquals(0,tools.snapshot().getJSONArray("images").length());assertEquals("[]",values.get("imageJobs"));assertEquals("realtime text fixture",values.get("history"));assertFalse(new File(dir,"old.png").exists());assertEquals(0,backend.requests.size());}finally{tools.shutdown();}
    }

}
