package cn.guihualab.liveai;
import org.json.JSONObject;

/** Requested values stay distinct from values confirmed by the audio device. */
final class PlaybackControl {
    interface Output {void speed(float value);float speed();void volume(float value);void pause();}
    private float requested=1,volume=1,actual=1;private long generation;private String status="pending",error="";
    synchronized void request(float rate,float gain){requested=Math.max(.5f,Math.min(2,rate));volume=Math.max(0,Math.min(1,gain));generation++;status="pending";error="";}
    void apply(Output output,boolean focused){
        final float desired,gain;final long revision;synchronized(this){desired=requested;gain=volume;revision=generation;}
        String failure="";float readback;synchronized(this){readback=actual;}
        try{float current=output.speed();if(Math.abs(current-desired)>.001f)output.speed(desired);readback=output.speed();if(Math.abs(readback-desired)>.01f)failure="变速引擎未应用所选倍速";}
        catch(RuntimeException unsupported){try{readback=output.speed();}catch(RuntimeException ignored){}failure="播放变速处理失败";}
        try{output.volume(gain);}catch(RuntimeException unsupported){if(failure.isEmpty())failure="当前播放设备无法应用音量";}
        if(!focused)try{output.pause();}catch(RuntimeException ignored){}
        synchronized(this){actual=readback;if(generation==revision){error=failure;status=error.isEmpty()?"applied":"failed";}else{status="pending";error="";}}
    }
    synchronized JSONObject state(){return DirectTools.object("engine","software","requestedRate",requested,"rate",actual,"volume",volume,"status",status,"error",error);}
    static int bufferBytes(int minimum){if(minimum<=0||minimum>16*1024*1024)throw new IllegalArgumentException("Invalid output minimum");return Math.max(9600,minimum*3);}
}
