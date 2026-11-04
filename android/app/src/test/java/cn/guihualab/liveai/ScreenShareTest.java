package cn.guihualab.liveai;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.os.*;
import android.webkit.WebView;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import org.robolectric.android.controller.*;
import org.robolectric.util.ReflectionHelpers;
import java.util.*;
import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

@RunWith(RobolectricTestRunner.class) @Config(sdk=34)
public class ScreenShareTest {
    static final class FakeScreen implements ScreenCapture {
        final Listener listener;boolean closed;Intent consent;int starts;boolean promoted;
        FakeScreen(Listener listener){this.listener=listener;}
        public void start(int result,Intent value){starts++;consent=value;assertTrue(promoted);listener.opened();}
        public void close(){closed=true;listener.closed("");}
    }
    public static class ScreenService extends BackgroundCallTest.TestService {
        FakeScreen capture;int created;final List<Boolean> types=new ArrayList<>();
        @Override protected void promote(boolean sharing){types.add(sharing);super.promote(sharing);}
        @Override protected ScreenCapture createScreenCapture(ScreenCapture.Listener l){created++;capture=new FakeScreen(l);capture.promoted=types.get(types.size()-1);return capture;}
    }
    private ServiceController<ScreenService> begin() throws Exception {
        shadowOf((Application)RuntimeEnvironment.getApplication()).grantPermissions(Manifest.permission.RECORD_AUDIO,Manifest.permission.POST_NOTIFICATIONS);
        ServiceController<ScreenService> c=Robolectric.buildService(ScreenService.class).create();ScreenService s=c.get();s.onStartCommand(new Intent(s,ScreenService.class).setAction(LiveCallService.START),0,1);
        for(int i=0;i<100&&!new JSONObject(LiveCallService.snapshot()).optString("phase").equals("listening");i++){Thread.sleep(10);shadowOf(Looper.getMainLooper()).idle();}assertTrue(LiveCallService.active());return c;
    }
    private void share(ScreenService s,int id){s.onStartCommand(new Intent(s,ScreenService.class).setAction(LiveCallService.SCREEN_START).putExtra("resultCode",Activity.RESULT_OK).putExtra("consent",new Intent("unique-consent-"+id)),0,id);shadowOf(Looper.getMainLooper()).idle();}
    @Test public void directScreenAndCameraSurviveActivityExitAndStopSeparately() throws Exception {
        ServiceController<ScreenService> c=begin();ScreenService s=c.get();
        try{
            share(s,2);assertEquals(1,s.created);assertEquals(1,s.capture.starts);assertTrue(new JSONObject(LiveCallService.snapshot()).getBoolean("screen"));assertTrue(s.types.get(s.types.size()-1));assertTrue(s.capture.listener.wantsFrame());
            assertTrue(s.sendFrame("screen",new byte[1000],10000));assertEquals(2,s.socket.lastBinary[0]);LiveCallService.video(true);
            assertFalse(s.sendFrame("screen",new byte[1000],11000));assertTrue(s.sendFrame("camera",new byte[1000],11000));assertEquals(1,s.socket.lastBinary[0]);assertTrue(s.sendFrame("screen",new byte[1000],11001));assertEquals(2,s.socket.lastBinary[0]);
            s.socket.queued=9000;assertFalse(s.sendFrame("screen",new byte[1000],14000));s.socket.queued=0;assertFalse(s.sendFrame("screen",new byte[32769],14000));
            ActivityController<MainActivity> activity=Robolectric.buildActivity(MainActivity.class).create().start().resume();activity.pause().stop().destroy();shadowOf(Looper.getMainLooper()).idle();assertTrue(new JSONObject(LiveCallService.snapshot()).getBoolean("screen"));assertFalse(s.capture.closed);assertFalse(s.fake.closed);
            FakeScreen old=s.capture;s.onStartCommand(new Intent(s,ScreenService.class).setAction(LiveCallService.SCREEN_STOP),0,3);shadowOf(Looper.getMainLooper()).idle();assertTrue(old.closed);assertFalse(new JSONObject(LiveCallService.snapshot()).getBoolean("screen"));assertTrue(LiveCallService.active());assertFalse(s.fake.closed);assertFalse(s.types.get(s.types.size()-1));assertFalse(s.sendFrame("screen",new byte[1],15000));
            share(s,4);assertEquals(2,s.created);assertNotSame(old,s.capture);s.onStartCommand(new Intent(s,ScreenService.class).setAction(LiveCallService.END),0,5);assertTrue(s.capture.closed);assertTrue(s.fake.closed);assertFalse(LiveCallService.active());
        }finally{LiveCallService.end();shadowOf(Looper.getMainLooper()).idle();c.destroy();}
    }
    @Test public void lockAndSystemRevocationEndOnlyProjection() throws Exception {
        ServiceController<ScreenService> c=begin();ScreenService s=c.get();
        try{
            share(s,2);s.capture.listener.closed("");shadowOf(Looper.getMainLooper()).idle();assertFalse(new JSONObject(LiveCallService.snapshot()).getBoolean("screen"));assertTrue(LiveCallService.active());assertFalse(s.fake.closed);
            share(s,3);s.sendBroadcast(new Intent(Intent.ACTION_SCREEN_OFF));shadowOf(Looper.getMainLooper()).idle();assertTrue(s.capture.closed);assertFalse(new JSONObject(LiveCallService.snapshot()).getBoolean("screen"));assertTrue(LiveCallService.active());assertFalse(s.fake.closed);
            s.sendBroadcast(new Intent(Intent.ACTION_SCREEN_ON));shadowOf(Looper.getMainLooper()).idle();assertEquals(2,s.created);assertFalse(new JSONObject(LiveCallService.snapshot()).getBoolean("screen"));
        }finally{LiveCallService.end();shadowOf(Looper.getMainLooper()).idle();c.destroy();}
    }
    @Test public void onlyForegroundOwnerCanRequestFreshConsentAndCancellationKeepsAudio() throws Exception {
        ServiceController<ScreenService> c=begin();ScreenService s=c.get();ActivityController<MainActivity> a=Robolectric.buildActivity(MainActivity.class).create().start().resume();MainActivity activity=a.get();
        try{
            activity.new Bridge().startScreenShare();shadowOf(Looper.getMainLooper()).idle();assertNull(shadowOf(activity).getNextStartedActivityForResult());
            WebView web=ReflectionHelpers.getField(activity,"web");web.getWebViewClient().onPageStarted(web,NavigationPolicy.HOME,null);
            activity.new Bridge().startScreenShare();shadowOf(Looper.getMainLooper()).idle();org.robolectric.shadows.ShadowActivity.IntentForResult request=shadowOf(activity).getNextStartedActivityForResult();assertNotNull(request);assertEquals(34,request.requestCode);
            activity.new Bridge().startScreenShare();shadowOf(Looper.getMainLooper()).idle();assertNull(shadowOf(activity).getNextStartedActivityForResult());
            activity.onActivityResult(34,Activity.RESULT_CANCELED,null);assertEquals(0,s.created);assertTrue(LiveCallService.active());assertFalse(s.fake.closed);
            activity.new Bridge().startScreenShare();shadowOf(Looper.getMainLooper()).idle();assertNotNull(shadowOf(activity).getNextStartedActivityForResult());activity.onActivityResult(34,Activity.RESULT_OK,new Intent("fresh-consent"));Intent start=shadowOf(activity).getNextStartedService();assertNotNull(start);assertEquals(LiveCallService.SCREEN_START,start.getAction());
            activity.onActivityResult(34,Activity.RESULT_OK,new Intent("replayed-consent"));assertNull(shadowOf(activity).getNextStartedService());
        }finally{a.pause().stop().destroy();LiveCallService.end();shadowOf(Looper.getMainLooper()).idle();c.destroy();}
    }
    @Test public void reconnectRestoresScreenProtocolWithoutReusingProjectionConsent() throws Exception {
        ServiceController<ScreenService> c=begin();ScreenService s=c.get();
        try{
            share(s,2);FakeScreen capture=s.capture;s.socket.listener.onFailure(s.socket,new java.io.IOException("synthetic switch"),null);shadowOf(Looper.getMainLooper()).idle();assertFalse(capture.listener.wantsFrame());
            shadowOf(Looper.getMainLooper()).idleFor(java.time.Duration.ofMillis(2500));assertTrue(capture.listener.wantsFrame());assertEquals(1,s.created);assertEquals(1,capture.starts);assertFalse(capture.closed);assertFalse(s.fake.closed);
            assertTrue(s.socket.json.stream().anyMatch(v->v.contains("video.state")&&v.contains("screen")&&v.contains("true")));assertTrue(s.sendFrame("screen",new byte[500],10000));assertEquals(2,s.socket.lastBinary[0]);
        }finally{LiveCallService.end();shadowOf(Looper.getMainLooper()).idle();c.destroy();}
    }

}
