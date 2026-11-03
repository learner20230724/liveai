package cn.guihualab.liveai;

import java.lang.ref.WeakReference;
import org.json.JSONObject;

final class CallEvents {
    interface Listener {void event(JSONObject event);}
    private static WeakReference<Listener> listener=new WeakReference<>(null);
    static synchronized void listen(Listener value){listener=new WeakReference<>(value);}
    static synchronized void emit(JSONObject event){Listener target=listener.get();if(target!=null)target.event(event);}
    static JSONObject object(String type){JSONObject o=new JSONObject();try{o.put("type",type);}catch(Exception ignored){}return o;}
}
