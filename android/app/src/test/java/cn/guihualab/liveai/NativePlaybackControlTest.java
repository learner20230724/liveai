package cn.guihualab.liveai;
import android.app.Application;import android.media.*;import org.json.*;import org.junit.*;import org.junit.runner.RunWith;import org.robolectric.*;import org.robolectric.annotation.*;import org.robolectric.shadow.api.Shadow;import org.robolectric.util.ReflectionHelpers;import java.util.function.BooleanSupplier;import static org.junit.Assert.*;
@RunWith(RobolectricTestRunner.class) @Config(sdk=34,shadows={NativePlaybackControlTest.TrackShadow.class})
public class NativePlaybackControlTest {
 @Implements(AudioTrack.class) public static class TrackShadow{
  volatile float rate=1,gain=1;volatile boolean deny;volatile int written,maxWrite,flushes;volatile String caller="";
  @Implementation public PlaybackParams getPlaybackParams(){return new PlaybackParams().allowDefaults().setSpeed(rate).setPitch(1);}
  @Implementation public void setPlaybackParams(PlaybackParams p){caller=Thread.currentThread().getName();if(deny)throw new IllegalArgumentException("unsupported synthetic speed");rate=p.getSpeed();}
  @Implementation public int setVolume(float value){gain=value;return 0;}@Implementation public int getPlaybackHeadPosition(){return 0;}
  @Implementation public int write(byte[] b,int offset,int size,int mode){maxWrite=Math.max(maxWrite,size);written+=size;return size;}
  @Implementation public void pause(){}@Implementation public void flush(){flushes++;}@Implementation public void release(){}
 }
 private NativeAudio audio;private TrackShadow track;private volatile String error="";
 @Before public void setup(){audio=new NativeAudio(RuntimeEnvironment.getApplication(),new NativeAudio.Listener(){public void microphone(byte[] b){}public void acknowledge(PlaybackLedger.Ack a){throw new AssertionError("No playback head advanced");}public void stopped(String r,String t,long ms){}public void routing(String i,String o,int t){}public void error(String e){error=e;}});AudioTrack output=Shadow.newInstanceOf(AudioTrack.class);track=Shadow.extract(output);ReflectionHelpers.setField(audio,"track",output);ReflectionHelpers.setField(audio,"running",true);ReflectionHelpers.callInstanceMethod(audio,"startPlaybackControls");}
 @After public void cleanup(){audio.close();}
 private void waitFor(BooleanSupplier condition)throws Exception{long until=System.currentTimeMillis()+2500;while(!condition.getAsBoolean()&&System.currentTimeMillis()<until)Thread.sleep(5);assertTrue(condition.getAsBoolean());}
 @Test public void pendingSettingsApplyWithoutDispatchingTheMainLooperAndReapplyAfterRouteReset()throws Exception{
  audio.settings(1.7f,.3f);waitFor(()->{try{return audio.playbackState().getString("status").equals("applied")&&Math.abs(audio.playbackState().getDouble("rate")-1.7)<.001;}catch(Exception e){return false;}});assertEquals("liveai-playback-settings",track.caller);assertEquals(.3,track.gain,.001);track.rate=1;ReflectionHelpers.callInstanceMethod(audio,"schedulePlayback");waitFor(()->Math.abs(track.rate-1.7f)<.001);assertEquals("",error);
 }
 @Test public void fullHardwareQueueDoesNotBlockSpeedChangesOrAcknowledgeUnplayedAudio()throws Exception{
  audio.play(new byte[96000],new JSONObject().put("chunk_id","c").put("run_id","r").put("turn_id","t"));Thread writer=new Thread(()->ReflectionHelpers.callInstanceMethod(audio,"playbackLoop"));ReflectionHelpers.setField(audio,"playback",writer);writer.start();waitFor(()->track.written>=9600);audio.settings(.75f,.4f);waitFor(()->Math.abs(track.rate-.75f)<.001);assertTrue(track.maxWrite<=960);assertEquals(9600,track.written);assertEquals(0,track.flushes);assertEquals("",error);audio.close();writer.join(1500);assertFalse(writer.isAlive());
 }
 @Test public void unsupportedLiveSpeedKeepsPlaybackAliveAndReportsActualRate()throws Exception{
  track.deny=true;audio.settings(2,.5f);waitFor(()->{try{return audio.playbackState().getString("status").equals("failed");}catch(Exception e){return false;}});assertEquals(1,audio.playbackState().getDouble("rate"),0);assertEquals(2,audio.playbackState().getDouble("requestedRate"),0);assertTrue((boolean)ReflectionHelpers.getField(audio,"running"));assertEquals("",error);
 }
}
