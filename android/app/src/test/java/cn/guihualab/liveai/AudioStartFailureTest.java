package cn.guihualab.liveai;
import android.content.Intent;import android.os.Looper;import org.json.*;import org.junit.Test;import org.junit.runner.RunWith;import org.robolectric.*;import org.robolectric.annotation.Config;import org.robolectric.android.controller.ServiceController;import static org.junit.Assert.*;import static org.robolectric.Shadows.shadowOf;
@RunWith(RobolectricTestRunner.class) @Config(sdk=34)
public class AudioStartFailureTest {
 public static class FailedService extends BackgroundCallTest.TestService{
  protected CallAudio createAudio(NativeAudio.Listener listener){return new CallAudio(){public void start()throws Exception{throw new AudioStartFailure("AUDIO_FOCUS",new IllegalStateException("synthetic"));}public void settings(float r,float v){}public void play(byte[] b,JSONObject c){}public void done(JSONObject c){}public void interrupt(JSONObject c){}public void muted(boolean v){}public void route(String v){}public JSONArray routes(){return new JSONArray();}public void close(){}};}
 }
 @Test public void focusFailureIsNotMisreportedAsPermissionAndDoesNotConnectUpstream()throws Exception{
  org.robolectric.Shadows.shadowOf((android.app.Application)RuntimeEnvironment.getApplication()).grantPermissions(android.Manifest.permission.RECORD_AUDIO);ServiceController<FailedService> controller=Robolectric.buildService(FailedService.class).create();FailedService s=controller.get();try{s.onStartCommand(new Intent(s,FailedService.class).setAction(LiveCallService.START),0,1);for(int i=0;i<100&&!new JSONObject(LiveCallService.snapshot()).optString("phase").equals("error");i++){Thread.sleep(10);shadowOf(Looper.getMainLooper()).idle();}JSONObject state=new JSONObject(LiveCallService.snapshot());assertEquals("error",state.getString("phase"));assertTrue(state.getString("error").contains("AUDIO_FOCUS"));assertFalse(state.getString("error").contains("耳机权限"));assertEquals(0,s.attempts);}finally{controller.destroy();}
 }
}
