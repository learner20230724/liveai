package cn.guihualab.liveai;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.*;
import android.media.audiofx.AcousticEchoCanceler;
import android.media.audiofx.NoiseSuppressor;
import java.util.concurrent.atomic.AtomicLong;
import android.os.*;
import org.json.*;
import java.util.*;
import java.util.concurrent.*;

/** AudioRecord + AudioTrack stay alive independently of the Activity/WebView. */
final class NativeAudio implements CallAudio {
    interface Listener {void microphone(byte[] pcm);void acknowledge(PlaybackLedger.Ack ack);void stopped(String run,String turn,long millis);void routing(String input,String output,int inputType);void error(String text);default void playbackChanged(){}}
    private final Context context;private final AudioManager manager;private final Listener listener;private final Handler handler=new Handler(Looper.getMainLooper());
    private AudioRecord recorder;private AudioTrack track;private AudioFocusRequest focusRequest;private AcousticEchoCanceler echo;private NoiseSuppressor noise;
    private final BlockingQueue<Item> queue=new LinkedBlockingQueue<>(512);private final PlaybackLedger ledger=new PlaybackLedger();private final Object outputLock=new Object();
    private final PlaybackControl playbackControl=new PlaybackControl();private HandlerThread controlsThread;private Handler controls;private long outputWritten;private int queuedFrameLimit=4800;private final Runnable applyPlayback=this::applyPlayback;private volatile boolean running,muted,focused=true;private volatile String preference="auto";private volatile int epoch;private final AtomicLong queuedBytes=new AtomicLong();
    private volatile String selectedInput="",routeFailure="";private volatile AudioInputs.Plan inputPlan;private volatile long routeStarted;private volatile int inputEpoch;private volatile boolean inputConfirmed;private volatile float inputLevel;
    private int preferredInputId=-1,routeAttempt;private long levelAt;private android.media.AudioManager.OnCommunicationDeviceChangedListener communicationChanged;
    private long lastHead,headWrap;private Thread capture,playback,monitor;
    private final AudioDeviceCallback devices=new AudioDeviceCallback(){@Override public void onAudioDevicesAdded(AudioDeviceInfo[] added){applyRoute();}@Override public void onAudioDevicesRemoved(AudioDeviceInfo[] removed){applyRoute();}};
    private static final class Item {final byte[] bytes;final PlaybackLedger.Chunk context;Item(byte[] b,PlaybackLedger.Chunk c){bytes=b;context=c;}}
    NativeAudio(Context context,Listener listener){this.context=context;manager=(AudioManager)context.getSystemService(Context.AUDIO_SERVICE);this.listener=listener;preference=context.getSharedPreferences("call-options",Context.MODE_PRIVATE).getString("route","auto");selectedInput=AudioInputs.selection(context);}
    @SuppressLint("MissingPermission") public void start() throws Exception {
        String stage="AUDIO_PERMISSION";try{
        if(context.checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)throw new SecurityException("麦克风权限未获允许");
        stage="AUDIO_MODE";manager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        AudioAttributes attributes=new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build();
        stage="AUDIO_FOCUS";focusRequest=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(attributes).setOnAudioFocusChangeListener(change->{focused=change==AudioManager.AUDIOFOCUS_GAIN;if(change==AudioManager.AUDIOFOCUS_LOSS)listener.error("其他通话占用了音频，请结束后重新开始");synchronized(outputLock){if(track!=null){try{if(focused)track.play();else track.pause();}catch(Exception ignored){}}}},handler).build();
        if(manager.requestAudioFocus(focusRequest)!=AudioManager.AUDIOFOCUS_REQUEST_GRANTED)throw new IllegalStateException("暂时无法取得通话音频，请结束其他通话后重试");
        stage="AUDIO_INPUT_INIT";int inputSize=Math.max(5120,AudioRecord.getMinBufferSize(16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT));
        recorder=new AudioRecord.Builder().setAudioSource(MediaRecorder.AudioSource.VOICE_COMMUNICATION).setAudioFormat(new AudioFormat.Builder().setSampleRate(16000).setChannelMask(AudioFormat.CHANNEL_IN_MONO).setEncoding(AudioFormat.ENCODING_PCM_16BIT).build()).setBufferSizeInBytes(inputSize).build();
        if(recorder.getState()!=AudioRecord.STATE_INITIALIZED)throw new IllegalStateException("input");
        stage="AUDIO_OUTPUT_INIT";int outputSize=PlaybackControl.bufferBytes(AudioTrack.getMinBufferSize(48000,AudioFormat.CHANNEL_OUT_MONO,AudioFormat.ENCODING_PCM_16BIT));
        track=new AudioTrack.Builder().setAudioAttributes(attributes).setAudioFormat(new AudioFormat.Builder().setSampleRate(48000).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).setEncoding(AudioFormat.ENCODING_PCM_16BIT).build()).setTransferMode(AudioTrack.MODE_STREAM).setBufferSizeInBytes(outputSize).build();
        if(track.getState()!=AudioTrack.STATE_INITIALIZED)throw new IllegalStateException("当前设备无法初始化通话音频");
        queuedFrameLimit=Math.max(4800,track.getBufferSizeInFrames());
        if(Build.VERSION.SDK_INT>=31){try{track.setStartThresholdInFrames(Math.max(1,Math.min(960,track.getBufferCapacityInFrames())));queuedFrameLimit=4800;}catch(RuntimeException ignored){}}
        stage="AUDIO_LISTENERS";recorder.addOnRoutingChangedListener(r->reportRoute(),handler);track.addOnRoutingChangedListener(r->{reportRoute();schedulePlayback();},handler);manager.registerAudioDeviceCallback(devices,handler);
        try{if(AcousticEchoCanceler.isAvailable()){echo=AcousticEchoCanceler.create(recorder.getAudioSessionId());if(echo!=null)echo.setEnabled(true);}if(NoiseSuppressor.isAvailable()){noise=NoiseSuppressor.create(recorder.getAudioSessionId());if(noise!=null)noise.setEnabled(true);}}catch(RuntimeException ignored){}
        stage="AUDIO_OUTPUT_START";running=true;track.play();
        startPlaybackControls();
        if(Build.VERSION.SDK_INT>=31){communicationChanged=d->{settleInput(false);schedulePlayback();};manager.addOnCommunicationDeviceChangedListener(context.getMainExecutor(),communicationChanged);}handler.post(this::applyRoute);
        capture=new Thread(this::captureLoop,"liveai-microphone");playback=new Thread(this::playbackLoop,"liveai-speaker");monitor=new Thread(this::monitorLoop,"liveai-playback-ack");capture.start();playback.start();monitor.start();
        handler.postDelayed(this::reportRoute,800);
        }catch(Exception failure){throw new AudioStartFailure(stage,failure);}
    }
    private void captureLoop(){android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_AUDIO);byte[] frame=new byte[640];boolean recording=false;int routeGeneration=inputEpoch;try{while(running){
        if(routeGeneration!=inputEpoch){if(recording){recorder.stop();recording=false;}routeGeneration=inputEpoch;}
        if(muted||!focused){if(recording){recorder.stop();recording=false;}Arrays.fill(frame,(byte)0);listener.microphone(frame.clone());Thread.sleep(20);continue;}
        if(!recording){recorder.startRecording();recording=true;handler.post(this::reportRoute);}
        int offset=0;while(running&&offset<frame.length&&!muted&&focused){int n=recorder.read(frame,offset,frame.length-offset,AudioRecord.READ_BLOCKING);if(n<0)throw new IllegalStateException("麦克风被系统暂停，请检查权限或耳机连接");offset+=n;}
        if(offset==frame.length){
            if(!inputConfirmed){Arrays.fill(frame,(byte)0);inputLevel=0;}else{long sum=0;for(int i=0;i<frame.length;i+=2){int v=(short)((frame[i]&255)|(frame[i+1]<<8));sum+=(long)v*v;}float level=Math.min(1,(float)Math.sqrt((double)sum/(frame.length/2))/6000);long now=SystemClock.elapsedRealtime();inputLevel=now-levelAt>350?level:Math.max(inputLevel,level);if(now-levelAt>350)levelAt=now;}
            listener.microphone(frame.clone());}
    }}catch(Exception e){if(running)listener.error("麦克风读取失败，请检查设备权限和音频占用");}finally{try{recorder.stop();}catch(Exception ignored){}}}
    private void playbackLoop(){android.os.Process.setThreadPriority(android.os.Process.THREAD_PRIORITY_AUDIO);String previous="";while(running){try{Item item=queue.poll(200,TimeUnit.MILLISECONDS);if(item==null)continue;queuedBytes.addAndGet(-item.bytes.length);
        while(running&&!item.context.cancelled&&!previous.isEmpty()&&!previous.equals(item.context.turnKey())&&ledger.pending(previous))Thread.sleep(5);
        int offset=0;int generation=epoch;while(running&&!item.context.cancelled&&offset<item.bytes.length){if(!focused){Thread.sleep(10);continue;}int written;
            synchronized(outputLock){if(generation!=epoch)break;long queued=Math.max(0,outputWritten-head());int size=(int)Math.min(Math.min(960,item.bytes.length-offset),Math.max(0,queuedFrameLimit-queued)*2);written=size==0?0:track.write(item.bytes,offset,size,AudioTrack.WRITE_NON_BLOCKING);if(written>0)outputWritten+=written/2;if(written>0)ledger.accepted(item.context,written/2);}
            if(written<0)throw new IllegalStateException("播放设备已断开");if(written==0)Thread.sleep(5);else offset+=written;
        }
        if(offset==item.bytes.length&&!item.context.cancelled){ledger.written(item.context);previous=item.context.turnKey();}
    }catch(InterruptedException ignored){break;}catch(Exception e){if(running)listener.error("语音播放失败，请检查耳机连接");break;}}}
    private void monitorLoop(){while(running){try{List<PlaybackLedger.Ack> acks; synchronized(outputLock){acks=ledger.advance(head());}for(PlaybackLedger.Ack ack:acks)listener.acknowledge(ack);Thread.sleep(5);}catch(InterruptedException e){break;}catch(Exception ignored){}}}
    private long head(){long now=track.getPlaybackHeadPosition()&0xffffffffL;if(now<lastHead)headWrap+=0x100000000L;lastHead=now;return headWrap+now;}
    public void play(byte[] bytes,JSONObject data){if(!running||bytes.length%2!=0)return;if(queuedBytes.get()+bytes.length>4*1024*1024){listener.error("语音播放积压过多，请重新开始通话");return;}
        PlaybackLedger.Chunk c=ledger.enqueue(data.optString("chunk_id"),data.optString("run_id"),data.optString("turn_id"),bytes.length/2);queuedBytes.addAndGet(bytes.length);if(!queue.offer(new Item(bytes,c))){queuedBytes.addAndGet(-bytes.length);c.cancelled=true;listener.error("语音缓冲已满，请重新开始");return;}
    }
    public void done(JSONObject data){ledger.done(data.optString("run_id"),data.optString("turn_id"));}
    public void interrupt(JSONObject data){String run=data.optString("run_id"),turn=data.optString("turn_id");long played;
        synchronized(outputLock){long position=head();for(PlaybackLedger.Ack ack:ledger.advance(position))listener.acknowledge(ack);played=ledger.interrupt(run,turn,position);epoch++;track.pause();track.flush();lastHead=0;headWrap=0;outputWritten=0;ledger.resetClock();if(focused)track.play();}
        queue.removeIf(item->{if(item.context.cancelled){queuedBytes.addAndGet(-item.bytes.length);return true;}return false;});listener.stopped(run,turn,played);
    }
    public void settings(float rate,float volume){playbackControl.request(rate,volume);schedulePlayback();}
    private void startPlaybackControls(){controlsThread=new HandlerThread("liveai-playback-settings");controlsThread.start();controls=new Handler(controlsThread.getLooper());schedulePlayback();}
    private void schedulePlayback(){Handler control=controls;if(control!=null&&running){control.removeCallbacks(applyPlayback);control.post(applyPlayback);}}
    private void applyPlayback(){if(!running||track==null)return;synchronized(outputLock){if(!running)return;playbackControl.apply(new PlaybackControl.Output(){
        public void speed(float value){track.setPlaybackParams(new PlaybackParams().allowDefaults().setSpeed(value).setPitch(1).setAudioFallbackMode(PlaybackParams.AUDIO_FALLBACK_MODE_FAIL));}
        public float speed(){return track.getPlaybackParams().allowDefaults().getSpeed();}
        public void volume(float value){if(track.setVolume(value)!=AudioTrack.SUCCESS)throw new IllegalStateException("volume");}
        public void pause(){track.pause();}
    },focused);}listener.playbackChanged();}
    public JSONObject playbackState(){return playbackControl.state();}
    public void muted(boolean value){muted=value;handler.post(this::reportRoute);}
    public void route(String value){preference=value;handler.post(this::applyRoute);}
    public void input(String value){selectedInput=value;inputConfirmed=false;inputLevel=0;handler.post(this::applyRoute);}
    public void refreshInputs(){handler.post(this::applyRoute);}
    @SuppressWarnings("deprecation") private void applyRoute(){
        if(!running)return;routeStarted=SystemClock.elapsedRealtime();routeFailure="";inputConfirmed=false;preferredInputId=-1;int attempt=++routeAttempt;
        try{
            inputPlan=AudioInputs.plan(AudioInputs.sources(manager),AudioInputs.communications(manager),selectedInput,preference);
            AudioInputs.Device comm=inputPlan.communication;
            if(Build.VERSION.SDK_INT>=31){AudioInputs.Device current=AudioInputs.Device.of(manager.getCommunicationDevice());if(comm!=null&&(current==null||current.id!=comm.id)&&!manager.setCommunicationDevice(comm.handle))routeFailure="系统拒绝切换通话设备";}
            else{boolean bluetooth=inputPlan.target!=null&&AudioInputs.bluetooth(inputPlan.target.type);manager.setBluetoothScoOn(bluetooth);if(bluetooth)manager.startBluetoothSco();else manager.stopBluetoothSco();manager.setSpeakerphoneOn(preference.equals("speaker"));}
            if(comm!=null&&!track.setPreferredDevice(comm.handle))routeFailure="系统拒绝切换播放设备";
            settleInput(true);
        }catch(SecurityException denied){routeFailure="蓝牙权限未获允许";reportRoute();}catch(Exception failure){routeFailure="未能切换麦克风，请重新检测";reportRoute();}
        for(long delay:new long[]{250,750,1500,3000,5200})handler.postDelayed(()->{if(running&&routeAttempt==attempt)settleInput(true);},delay);
    }
    private void settleInput(boolean retry){if(!running)return;try{
        inputPlan=AudioInputs.plan(AudioInputs.sources(manager),AudioInputs.communications(manager),selectedInput,preference);
        AudioInputs.Device desired=inputPlan.input,actual=AudioInputs.Device.of(recorder.getRoutedDevice());
        if(desired!=null&&(desired.id!=preferredInputId||(retry&&!AudioInputs.matches(inputPlan,actual)))){
            if(recorder.setPreferredDevice(desired.handle)){boolean changed=preferredInputId!=desired.id;preferredInputId=desired.id;if(changed||retry)inputEpoch++;}else routeFailure="系统拒绝切换麦克风";
        }
        reportRoute();
    }catch(SecurityException denied){routeFailure="蓝牙权限未获允许";inputConfirmed=false;}catch(Exception failure){routeFailure="未能确认麦克风，请重新检测";inputConfirmed=false;}}
    private void reportRoute(){if(!running)return;AudioDeviceInfo input=recorder.getRoutedDevice(),output=track.getRoutedDevice();AudioInputs.Device actual=AudioInputs.Device.of(input);inputConfirmed=AudioInputs.matches(inputPlan,actual);if(!inputConfirmed||muted)inputLevel=0;String name=muted?"麦克风已静音":input==null?"正在确认输入设备":RoutePolicy.label(input.getType())+" · "+input.getProductName();listener.routing(name,output==null?"正在确认输出设备":output.getProductName().toString(),input==null?0:input.getType());}
    public JSONObject inputs(){JSONObject result=AudioInputs.catalog(context);try{
        AudioInputs.Device actual=AudioInputs.Device.of(recorder==null?null:recorder.getRoutedDevice());String status=AudioInputs.status(inputPlan,actual,routeFailure,SystemClock.elapsedRealtime()-routeStarted);String message=inputPlan!=null&&!inputPlan.error.isEmpty()?inputPlan.error:status.equals("failed")?routeFailure:status.equals("mismatch")?"系统未切换到所选麦克风，已暂停上传":status.equals("pending")?"正在切换麦克风":"";
        result.put("selected",selectedInput).put("status",status).put("message",message).put("requested",inputPlan==null||inputPlan.target==null?"":inputPlan.target.label()).put("actual",actual==null?"":actual.label()).put("actualId",actual==null?0:actual.id).put("actualType",actual==null?0:actual.type).put("uploadEnabled",inputConfirmed&&!muted).put("level",inputConfirmed&&!muted?inputLevel:0);
    }catch(Exception ignored){}return result;}
    public JSONArray routes(){JSONArray result=new JSONArray();try{if(Build.VERSION.SDK_INT>=31)for(AudioDeviceInfo d:manager.getAvailableCommunicationDevices())result.put(new JSONObject().put("id","device:"+d.getId()).put("name",d.getProductName()).put("type",d.getType()));}catch(Exception ignored){}return result;}
    @SuppressWarnings("deprecation") public void close(){running=false;epoch++;if(controls!=null)controls.removeCallbacksAndMessages(null);if(controlsThread!=null)controlsThread.quitSafely();if(capture!=null)capture.interrupt();if(playback!=null)playback.interrupt();if(monitor!=null)monitor.interrupt();handler.removeCallbacksAndMessages(null);try{if(Build.VERSION.SDK_INT>=31&&communicationChanged!=null)manager.removeOnCommunicationDeviceChangedListener(communicationChanged);manager.unregisterAudioDeviceCallback(devices);}catch(Exception ignored){}try{if(recorder!=null)recorder.stop();}catch(Exception ignored){}synchronized(outputLock){if(track!=null){try{track.pause();}catch(Exception ignored){}try{track.flush();}catch(Exception ignored){}try{track.release();}catch(Exception ignored){}}ledger.clear();}
        try{if(echo!=null)echo.release();if(noise!=null)noise.release();}catch(Exception ignored){}if(capture!=null)try{capture.join(400);}catch(Exception ignored){}try{if(recorder!=null)recorder.release();}catch(Exception ignored){}if(focusRequest!=null)manager.abandonAudioFocusRequest(focusRequest);try{if(Build.VERSION.SDK_INT>=31)manager.clearCommunicationDevice();else{manager.setBluetoothScoOn(false);manager.stopBluetoothSco();}manager.setMode(AudioManager.MODE_NORMAL);}catch(Exception ignored){}queue.clear();queuedBytes.set(0);
    }
}
