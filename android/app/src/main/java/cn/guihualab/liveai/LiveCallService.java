package cn.guihualab.liveai;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.*;
import android.os.*;
import org.json.*;
import java.util.*;
import java.util.concurrent.*;

/** Foreground microphone service owns all media, transport and playback. */
public class LiveCallService extends Service {
    static final String START="liveai.START",END="liveai.END",MUTE="liveai.MUTE";private static final String CHANNEL="liveai-active-call";private static final int NOTIFICATION=40;
    private static volatile LiveCallService instance;private static volatile String lastState="{\"phase\":\"idle\",\"lines\":[]}";
    private final Handler main=new Handler(Looper.getMainLooper());private final ExecutorService io=Executors.newSingleThreadExecutor();
    private final Queue<JSONObject> contexts=new ConcurrentLinkedQueue<>();private final List<JSONObject> lines=new ArrayList<>();private MossConnection connection;private CallAudio audio;private SecureStore store;private PowerManager.WakeLock wake;
    private volatile String phase="idle",error="",input="等待麦克风",output="系统默认",userDraft="",assistantDraft="";private String prompt="",session="",id="";private volatile boolean ready,muted,camera,ending,reconnectPending;private int reconnects,inputType;private long wakeRenewed;private long started,bytesOut,bytesIn,audioFrames,videoFrames,droppedVideo,droppedAudio;private String lastNotification="";
    private final Runnable heartbeat=new Runnable(){@Override public void run(){if(ending)return;if(wake!=null&&SystemClock.elapsedRealtime()-wakeRenewed>5*60*1000L){wake.acquire(10*60*1000L);wakeRenewed=SystemClock.elapsedRealtime();}emit();updateNotification();main.postDelayed(this,1000);}};
    @Override public void onCreate(){super.onCreate();instance=this;store=new SecureStore(this);NotificationChannel channel=new NotificationChannel(CHANNEL,"LiveAI 后台通话",NotificationManager.IMPORTANCE_LOW);channel.setDescription("通话期间保持麦克风、耳机和语音播放，并提供静音与结束按钮");channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);getSystemService(NotificationManager.class).createNotificationChannel(channel);}
    @Override public int onStartCommand(Intent intent,int flags,int startId){if(intent==null)return START_NOT_STICKY;String action=intent.getAction();if(END.equals(action)){finish("",false);return START_NOT_STICKY;}if(MUTE.equals(action)){setMuted(!muted);return START_NOT_STICKY;}
        if(START.equals(action)&&started==0){prompt=intent.getStringExtra("prompt");if(prompt==null||prompt.length()>8000)prompt="你是 LiveAI，简短自然地回答。";started=System.currentTimeMillis();id=UUID.randomUUID().toString();phase="connecting";
            try{if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)throw new SecurityException();if(Build.VERSION.SDK_INT>=30)startForeground(NOTIFICATION,notification(),ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);else startForeground(NOTIFICATION,notification());wake=((PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"LiveAI:conversation");wake.setReferenceCounted(false);wake.acquire(10*60*1000L);main.post(heartbeat);io.execute(this::begin);}catch(Exception denied){finish("无法启动后台通话，请允许麦克风权限后在 APP 内重试",true);}}
        return START_NOT_STICKY;
    }
    private void begin(){try{
        String key=configuredKey();if(key.isEmpty())throw new IllegalStateException("请先完成通话配置");
        connection=createConnection(new MossConnection.Listener(){
            public void opened(){if(ending)return;JSONObject attach=obj("action","attach_session");put(attach,"memory_scope","session");if(!session.isEmpty())put(attach,"session_id",session);send(attach);}
            public void message(JSONObject message){handle(message);}
            public void audio(byte[] bytes){bytesIn+=bytes.length;JSONObject ctx=contexts.poll();if(ctx!=null&&audio!=null)audio.play(bytes,ctx);}
            public void disconnected(int status){main.post(()->lost(status));}
        });
        audio=createAudio(new NativeAudio.Listener(){
            public void microphone(byte[] pcm){if(!ready||ending)return;if(connection.queued()>65536){droppedAudio++;return;}byte[] frame=new byte[pcm.length+1];System.arraycopy(pcm,0,frame,1,pcm.length);if(connection.binary(frame)){audioFrames++;bytesOut+=frame.length;}}
            public void acknowledge(PlaybackLedger.Ack ack){JSONObject value=obj("action",ack.action);put(value,"run_id",ack.run);put(value,"turn_id",ack.turn);if(!ack.chunk.isEmpty())put(value,"chunk_id",ack.chunk);send(value);}
            public void stopped(String run,String turn,long millis){JSONObject value=obj("action","playback.stopped");put(value,"run_id",run);put(value,"turn_id",turn);put(value,"played_audio_ms",millis);send(value);}
            public void routing(String in,String out,int type){input=in;output=out;inputType=type;}
            public void error(String text){main.post(()->finish(text,true));}
        });audio.start();String route=getSharedPreferences("call-options",MODE_PRIVATE).getString("route","auto");audio.route(route);if(ending){audio.close();return;}connection.connect(key);
    }catch(Exception e){main.post(()->finish("通话音频未能启动，请检查麦克风和耳机权限",true));}}
    protected String configuredKey(){return store.get("mossKey");}
    protected MossConnection createConnection(MossConnection.Listener listener){return new MossConnection(listener);}
    protected CallAudio createAudio(NativeAudio.Listener listener){return new NativeAudio(this,listener);}
    private void handle(JSONObject message){if(ending)return;String action=message.optString("action");JSONObject d=message.optJSONObject("data");if(d==null)d=new JSONObject();
        switch(action){
            case "session_attached":session=d.optString("session_id");JSONObject persona=obj("name","LiveAI");put(persona,"prompt",prompt);JSONObject config=obj("persona",persona);put(config,"instructions","默认用简洁中文回答，除非用户要求其他语言。");JSONObject update=obj("action","session.update");put(update,"session",config);send(update);break;
            case "session.updated":if(!d.optString("error").isEmpty()){main.post(()->finish("MOSS 未能应用通话设置，请重试",true));return;}ready=true;reconnects=0;phase="listening";send(obj("action","media.mode","binary_protocol","tagged-v1"));send(obj("action","mic_state","enabled",!muted));if(camera)video(true);break;
            case "response.audio.context":contexts.add(d);break;
            case "response.audio.done":if(audio!=null)audio.done(d);break;
            case "response.audio.stop":if(audio!=null)audio.interrupt(d);break;
            case "input.transcript.updated":userDraft=d.optString("text");break;
            case "input.transcript.done":append("user",d.optString("text"),"u-"+UUID.randomUUID());userDraft="";break;
            case "output.transcript.updated":assistantDraft=d.optString("text");phase="speaking";break;
            case "output.transcript.done":append("assistant",d.optString("text"),"a-"+d.optString("run_id")+"-"+d.optString("turn_id"));assistantDraft="";break;
            case "response.interrupted":phase="listening";assistantDraft="";break;
            case "response.ended":phase="listening";break;
            case "error":main.post(()->finish("MOSS 通话服务返回错误，请检查网络或在设置中刷新通话配置",true));return;
        }main.post(this::emit);
    }
    private synchronized void append(String role,String text,String lineId){if(text.isEmpty())return;JSONObject value=obj("id",lineId,"role",role,"text",text,"at",System.currentTimeMillis());boolean replaced=false;for(int i=0;i<lines.size();i++)if(lines.get(i).optString("id").equals(lineId)){lines.set(i,value);replaced=true;break;}if(!replaced)lines.add(value);if(lines.size()>240)lines.remove(0);persist();}
    private synchronized void persist(){if(id.isEmpty()||lines.isEmpty())return;JSONObject record=obj("id",id,"at",java.time.Instant.ofEpochMilli(started).toString(),"duration",(System.currentTimeMillis()-started)/1000,"title",lines.get(0).optString("text").substring(0,Math.min(32,lines.get(0).optString("text").length())),"lines",new JSONArray(lines),"native",true);io.execute(()->{try{JSONArray old=new JSONArray(store.get("history").isEmpty()?"[]":store.get("history")),next=new JSONArray();next.put(record);for(int i=0;i<old.length()&&next.length()<60;i++)if(!old.getJSONObject(i).optString("id").equals(id))next.put(old.getJSONObject(i));store.put("history",next.toString());}catch(Exception ignored){}});}
    private void lost(int status){if(ending||reconnectPending)return;ready=false;contexts.clear();if(status==401||status==403){finish("通话凭据已失效，请在设置刷新配置后重试",true);return;}if(++reconnects>3){finish("连接中断，请检查网络后重新开始",true);return;}reconnectPending=true;phase="reconnecting";emit();if(connection!=null)connection.close();main.postDelayed(()->{reconnectPending=false;if(!ending&&connection!=null)connection.connect(configuredKey());},reconnects*2500L);}
    private void send(JSONObject object){MossConnection ws=connection;if(ws!=null&&!ending)ws.json(object);}
    private void setMuted(boolean value){muted=value;if(audio!=null)audio.muted(value);send(obj("action","mic_state","enabled",!value));emit();updateNotification();}
    static void mute(boolean value){LiveCallService s=instance;if(s!=null)s.main.post(()->s.setMuted(value));}
    static void route(String value){LiveCallService s=instance;if(s!=null)s.main.post(()->{s.getSharedPreferences("call-options",MODE_PRIVATE).edit().putString("route",value).apply();if(s.audio!=null)s.audio.route(value);s.emit();});}
    static boolean active(){LiveCallService s=instance;return s!=null&&!s.ending&&s.started!=0;}
    static void end(){LiveCallService s=instance;if(s!=null)s.main.post(()->s.finish("",false));}
    static void video(boolean enabled){LiveCallService s=instance;if(s==null)return;s.camera=enabled;s.send(obj("action","video.state","source","camera","enabled",enabled));if(enabled)s.send(obj("action","video.stream_focus","source","camera"));s.main.post(s::emit);}
    static boolean frame(byte[] jpeg){LiveCallService s=instance;if(s==null||!s.ready||!s.camera||s.connection==null)return false;if(jpeg.length>32768||s.connection.queued()>8192){s.droppedVideo++;return false;}byte[] bytes=new byte[jpeg.length+1];bytes[0]=1;System.arraycopy(jpeg,0,bytes,1,jpeg.length);boolean sent=s.connection.binary(bytes);if(sent){s.videoFrames++;s.bytesOut+=bytes.length;}else s.droppedVideo++;return sent;}
    static String snapshot(){LiveCallService s=instance;return s==null?lastState:s.state().toString();}
    private synchronized JSONObject state(){return obj("phase",phase,"error",error,"id",id,"startedAt",started,"muted",muted,"camera",camera,"lines",new JSONArray(lines),"userDraft",userDraft,"assistantDraft",assistantDraft,"input",input,"output",output,"inputType",inputType,"routes",audio==null?new JSONArray():audio.routes(),"queuedBytes",connection==null?0:connection.queued(),"uploadBytes",bytesOut,"downloadBytes",bytesIn,"audioFrames",audioFrames,"videoFrames",videoFrames,"droppedVideo",droppedVideo,"droppedAudio",droppedAudio,"endpoint",MossConnection.ENDPOINT,"direct",true,"background",!ending&&wake!=null&&wake.isHeld());}
    private void emit(){JSONObject data=state();lastState=data.toString();CallEvents.emit(obj("type","call","state",data));}
    private Notification notification(){Intent open=new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);PendingIntent activity=PendingIntent.getActivity(this,0,open,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);PendingIntent end=PendingIntent.getService(this,1,new Intent(this,LiveCallService.class).setAction(END),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);PendingIntent mute=PendingIntent.getService(this,2,new Intent(this,LiveCallService.class).setAction(MUTE),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this,CHANNEL).setSmallIcon(cn.guihualab.liveai.R.drawable.ic_launcher_foreground).setContentTitle("LiveAI 通话进行中").setContentText((muted?"已静音":"锁屏可继续语音")+" · 直连 MOSS").setContentIntent(activity).setCategory(Notification.CATEGORY_CALL).setOngoing(true).setVisibility(Notification.VISIBILITY_PUBLIC).addAction(new Notification.Action.Builder(null,muted?"取消静音":"静音",mute).build()).addAction(new Notification.Action.Builder(null,"结束通话",end).build()).build();}
    private void updateNotification(){String value=phase+":"+muted;if(!value.equals(lastNotification)){lastNotification=value;getSystemService(NotificationManager.class).notify(NOTIFICATION,notification());}}
    private void finish(String text,boolean failed){if(ending)return;ending=true;ready=false;phase=failed?"error":"idle";error=text;persist();emit();main.removeCallbacksAndMessages(null);if(connection!=null)connection.close();if(audio!=null){audio.close();audio=null;}if(wake!=null&&wake.isHeld())wake.release();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
    @Override public void onTaskRemoved(Intent rootIntent){/* Removing the screen does not end an explicitly started foreground call. */}
    @Override public void onDestroy(){if(!ending)finish("",false);instance=null;io.shutdown();super.onDestroy();}
    @Override public IBinder onBind(Intent intent){return null;}
    private static JSONObject obj(Object... pairs){JSONObject o=new JSONObject();for(int i=0;i+1<pairs.length;i+=2)put(o,String.valueOf(pairs[i]),pairs[i+1]);return o;}
    private static void put(JSONObject o,String k,Object v){try{o.put(k,v);}catch(Exception ignored){}}
}
