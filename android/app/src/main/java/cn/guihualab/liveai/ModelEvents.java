package cn.guihualab.liveai;
import org.json.*;
final class ModelEvents {
    static boolean visible(String action){return !action.startsWith("response.audio.")&&!action.contains("transcript")&&!action.startsWith("input.speech.");}
    static Object clean(Object value,String secret,int depth) throws JSONException {
        if(depth>4)return "[省略]";
        if(value instanceof String){String s=(String)value;if(!secret.isEmpty())s=s.replace(secret,"[已隐藏]");s=s.replaceAll("sk-[A-Za-z0-9_-]{16,}","[已隐藏]").replaceAll("(?i)Bearer\\s+\\S+","[已隐藏]");return s.substring(0,Math.min(1600,s.length()));}
        if(value instanceof JSONObject){JSONObject out=new JSONObject(),j=(JSONObject)value;java.util.Iterator<String> keys=j.keys();int n=0;while(keys.hasNext()&&n<20){String k=keys.next();if(k.matches("(?i).*(token|secret|authorization|api.?key|session_id|reasoning|thought|audio|base64).*"))continue;out.put(k,clean(j.opt(k),secret,depth+1));n++;}return out;}
        if(value instanceof JSONArray){JSONArray out=new JSONArray(),a=(JSONArray)value;for(int i=0;i<Math.min(a.length(),12);i++)out.put(clean(a.opt(i),secret,depth+1));return out;}return value;
    }
}
