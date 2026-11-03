package cn.guihualab.liveai;

import android.Manifest;
import android.app.Application;
import android.content.*;
import android.os.*;
import okhttp3.*;
import okio.ByteString;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import org.robolectric.android.controller.*;
import org.robolectric.util.ReflectionHelpers;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;
import java.util.*;

@RunWith(RobolectricTestRunner.class) @Config(sdk=34)
public class BackgroundCallTest {
    static final class FakeSocket implements WebSocket {final Request request;final WebSocketListener listener;final List<String> json=new ArrayList<>();long queued;int binaryFrames;byte[] lastBinary;boolean closed;FakeSocket(Request r,WebSocketListener l){request=r;listener=l;}public Request request(){return request;}public long queueSize(){return queued;}public boolean send(String value){json.add(value);try{JSONObject data=new JSONObject(value);if(data.optString("action").equals("attach_session"))listener.onMessage(this,"{\"action\":\"session_attached\",\"data\":{\"session_id\":\"fixture\"}}");if(data.optString("action").equals("session.update"))listener.onMessage(this,"{\"action\":\"session.updated\",\"data\":{\"error\":\"\"}}");}catch(Exception ignored){}return true;}public boolean send(ByteString data){binaryFrames++;lastBinary=data.toByteArray();return true;}public boolean close(int code,String reason){closed=true;return true;}public void cancel(){closed=true;}}
    static final class FakeAudio implements CallAudio {volatile boolean started,closed,muted;public void start(){started=true;}public void play(byte[] b,JSONObject c){}public void done(JSONObject c){}public void interrupt(JSONObject c){}public void muted(boolean value){muted=value;}public void route(String value){}public JSONArray routes(){return new JSONArray();}public void close(){closed=true;}}
    public static class TestService extends LiveCallService {FakeAudio fake=new FakeAudio();volatile FakeSocket socket;int attempts,failures;protected String configuredKey(){return "synthetic-only-key";}protected CallAudio createAudio(NativeAudio.Listener l){return fake;}protected MossConnection createConnection(MossConnection.Listener l){return new MossConnection((request,listener)->{attempts++;socket=new FakeSocket(request,listener);if(failures>0){failures--;listener.onFailure(socket,new java.io.IOException("synthetic interruption"),null);return socket;}listener.onOpen(socket,new Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(101).message("Switching Protocols").build());return socket;},l);}}
    @Test public void activityPauseStopDestroyDoNotStopForegroundAudioOrDirectConnection() throws Exception {
        shadowOf((Application)RuntimeEnvironment.getApplication()).grantPermissions(Manifest.permission.RECORD_AUDIO,Manifest.permission.POST_NOTIFICATIONS,Manifest.permission.BLUETOOTH_CONNECT);
        ServiceController<TestService> controller=Robolectric.buildService(TestService.class).create();TestService service=controller.get();service.onStartCommand(new Intent(service,TestService.class).setAction(LiveCallService.START).putExtra("prompt","synthetic prompt"),0,1);
        for(int i=0;i<100&&(!service.fake.started||!new JSONObject(LiveCallService.snapshot()).optString("phase").equals("listening"));i++){Thread.sleep(10);shadowOf(Looper.getMainLooper()).idle();}
        assertTrue(service.fake.started);assertTrue(LiveCallService.active());assertEquals("api.mosi.cn",service.socket.request.url().host());assertEquals("/v1/realtime",service.socket.request.url().encodedPath());assertEquals("moss-live-1.0",service.socket.request.url().queryParameter("model"));
        LiveCallService.video(true);service.socket.queued=9000;assertFalse(LiveCallService.frame(new byte[12000]));service.socket.queued=0;assertFalse(LiveCallService.frame(new byte[32769]));assertTrue(LiveCallService.frame(new byte[12000]));assertEquals(1,service.socket.binaryFrames);assertEquals(1,service.socket.lastBinary[0]);assertEquals(2,new JSONObject(LiveCallService.snapshot()).getInt("droppedVideo"));LiveCallService.video(false);
        ActivityController<MainActivity> activity=Robolectric.buildActivity(MainActivity.class).create().start().resume();
        MainActivity screen=activity.get();android.webkit.WebView view=ReflectionHelpers.getField(screen,"web");view.getWebViewClient().onPageStarted(view,NavigationPolicy.HOME,null);
        java.util.concurrent.FutureTask<String> bridgeCall=new java.util.concurrent.FutureTask<>(()->screen.new Bridge().history());new Thread(bridgeCall,"synthetic-JavaBridge").start();assertEquals("[]",bridgeCall.get(2,java.util.concurrent.TimeUnit.SECONDS));
        activity.pause().stop().destroy();shadowOf(Looper.getMainLooper()).idle();
        assertTrue(LiveCallService.active());assertFalse(service.fake.closed);assertFalse(service.socket.closed);assertTrue(((PowerManager.WakeLock)ReflectionHelpers.getField(service,"wake")).isHeld());
        service.onStartCommand(new Intent(service,TestService.class).setAction(LiveCallService.MUTE),0,2);assertTrue(service.fake.muted);
        service.onStartCommand(new Intent(service,TestService.class).setAction(LiveCallService.END),0,3);assertTrue(service.fake.closed);assertTrue(service.socket.closed);assertFalse(LiveCallService.active());controller.destroy();
    }
    @Test public void failedReconnectRetriesInsteadOfStayingInReconnectingForever() throws Exception {
        shadowOf((Application)RuntimeEnvironment.getApplication()).grantPermissions(Manifest.permission.RECORD_AUDIO);
        ServiceController<TestService> controller=Robolectric.buildService(TestService.class).create();TestService service=controller.get();service.onStartCommand(new Intent(service,TestService.class).setAction(LiveCallService.START),0,1);
        for(int i=0;i<100&&!new JSONObject(LiveCallService.snapshot()).optString("phase").equals("listening");i++){Thread.sleep(10);shadowOf(Looper.getMainLooper()).idle();}
        assertEquals(1,service.attempts);service.failures=1;service.socket.listener.onFailure(service.socket,new java.io.IOException("synthetic network loss"),null);shadowOf(Looper.getMainLooper()).idle();assertEquals("reconnecting",new JSONObject(LiveCallService.snapshot()).getString("phase"));
        shadowOf(Looper.getMainLooper()).idleFor(java.time.Duration.ofMillis(2500));assertEquals(2,service.attempts);assertEquals("reconnecting",new JSONObject(LiveCallService.snapshot()).getString("phase"));
        shadowOf(Looper.getMainLooper()).idleFor(java.time.Duration.ofMillis(5000));assertEquals(3,service.attempts);assertEquals("listening",new JSONObject(LiveCallService.snapshot()).getString("phase"));assertFalse(service.fake.closed);service.onStartCommand(new Intent(service,TestService.class).setAction(LiveCallService.END),0,2);controller.destroy();
    }
}
