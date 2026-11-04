package cn.guihualab.liveai;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.os.*;

/** Keeps explicitly submitted work running while users switch pages or lock. */
public final class ToolTaskService extends Service {
    private static final String CHANNEL="liveai-tools";
    private static final int NOTICE=41;
    private PowerManager.WakeLock wake;private long renewed;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final Runnable tick=new Runnable(){public void run(){
        DirectTools tools=DirectTools.get(ToolTaskService.this);
        if(tools.pending()==0){stopSelf();return;}
        if(wake!=null&&SystemClock.elapsedRealtime()-renewed>5*60*1000L){wake.acquire(20*60*1000L);renewed=SystemClock.elapsedRealtime();}
        getSystemService(NotificationManager.class).notify(NOTICE,notification(tools.pending()));
        handler.postDelayed(this,3000);
    }};
    private Notification notification(int count){
        PendingIntent open=PendingIntent.getActivity(this,40,new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this,CHANNEL).setSmallIcon(R.drawable.ic_launcher_foreground).setContentTitle("LiveAI 正在处理任务")
            .setContentText(count+" 个任务 · 手机直连 MOSS").setOngoing(true).setContentIntent(open).setVisibility(Notification.VISIBILITY_PRIVATE).build();
    }
    @Override public void onCreate(){super.onCreate();NotificationChannel channel=new NotificationChannel(CHANNEL,"图像与工具任务",NotificationManager.IMPORTANCE_LOW);getSystemService(NotificationManager.class).createNotificationChannel(channel);
        if(Build.VERSION.SDK_INT>=29)startForeground(NOTICE,notification(1),ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);else startForeground(NOTICE,notification(1));
        wake=((PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"LiveAI:tools");wake.setReferenceCounted(false);wake.acquire(20*60*1000L);renewed=SystemClock.elapsedRealtime();
    }
    @Override public int onStartCommand(Intent i,int f,int id){handler.removeCallbacks(tick);handler.postDelayed(tick,1000);return START_NOT_STICKY;}
    @Override public void onTimeout(int startId,int type){DirectTools.get(this).cancelAll();stopSelf();}
    @Override public void onDestroy(){handler.removeCallbacksAndMessages(null);if(wake!=null&&wake.isHeld())wake.release();stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy();}
    @Override public IBinder onBind(Intent i){return null;}
}
