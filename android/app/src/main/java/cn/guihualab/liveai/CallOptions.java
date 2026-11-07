package cn.guihualab.liveai;
import android.content.Context;
import org.json.*;
final class CallOptions {
    final String name,aliases,instructions,language,length,tone,memory,user,focus;final float rate,volume,quality,fps;final int cameraEdge,screenEdge;final boolean clockTools;
    CallOptions(JSONObject j){name=text(j,"name","LiveAI",40);aliases=text(j,"aliases","Live AI",240);instructions=text(j,"instructions","",8000);language=choice(j,"language","auto","auto","zh","en");length=choice(j,"length","auto","auto","short","detailed");tone=choice(j,"tone","auto","auto","warm","lively","formal");memory=choice(j,"memory","session","session","user");user=text(j,"user","",64);if(memory.equals("user")&&!user.matches("[A-Za-z0-9_-]{1,64}"))throw new IllegalArgumentException("用户记忆标识无效");focus=choice(j,"focus","auto","auto","camera","screen");rate=number(j,"rate",1,.5f,2);volume=number(j,"volume",1,0,1);quality=number(j,"quality",.6f,.3f,.8f);fps=number(j,"fps",1,.5f,2);cameraEdge=(int)number(j,"cameraEdge",480,320,640);screenEdge=(int)number(j,"screenEdge",960,640,1280);clockTools=j.optBoolean("clockTools",false);}
    static CallOptions load(Context c){try{android.content.SharedPreferences p=c.getSharedPreferences("call-options",Context.MODE_PRIVATE);JSONObject json=new JSONObject(p.getString("settings","{}"));if(p.contains("playback-rate"))json.put("rate",p.getFloat("playback-rate",1));if(p.contains("playback-volume"))json.put("volume",p.getFloat("playback-volume",1));return new CallOptions(json);}catch(Exception ignored){return new CallOptions(new JSONObject());}}

    JSONObject json(){return DirectTools.object("name",name,"aliases",aliases,"instructions",instructions,"language",language,"length",length,"tone",tone,"memory",memory,"user",user,"focus",focus,"rate",rate,"volume",volume,"quality",quality,"fps",fps,"cameraEdge",cameraEdge,"screenEdge",screenEdge,"clockTools",clockTools);}
    JSONObject session(String prompt) throws JSONException {
        JSONArray names=new JSONArray();for(String n:aliases.split("[,，\\n]"))if(!n.trim().isEmpty()&&names.length()<8)names.put(n.trim());
        String rules=instructions.trim().isEmpty()?prompt:instructions;
        if(language.equals("zh"))rules+="\n默认使用中文回答，用户明确要求其他语言时遵从。";else if(language.equals("en"))rules+="\n默认使用英语回答，需要解释时按用户要求切换语言。";
        if(length.equals("short"))rules+="\n回答尽量简短，一到三句话。";else if(length.equals("detailed"))rules+="\n按问题需要给出详细、清晰的解释。";
        if(tone.equals("warm"))rules+="\n使用温和、耐心、自然的交流语气。";else if(tone.equals("lively"))rules+="\n使用活泼、轻快、自然的交流语气。";else if(tone.equals("formal"))rules+="\n使用正式、专业、直接的交流语气。";
        JSONObject session=new JSONObject().put("persona",new JSONObject().put("name",name).put("aliases",names).put("prompt",prompt)).put("instructions",rules.substring(0,Math.min(8000,rules.length())));
        if(clockTools)session.put("tools",new JSONArray().put(new JSONObject().put("type","function").put("name","liveai_current_time").put("description","读取用户设备的当前日期、时间和时区。只在用户需要知道本地日期或时间时调用。").put("parameters",new JSONObject().put("type","object").put("properties",new JSONObject()).put("additionalProperties",false))));return session;
    }
    private static String text(JSONObject j,String key,String fallback,int max){String s=j.optString(key,fallback);if(key.equals("name")&&s.trim().isEmpty())s=fallback;return s.substring(0,Math.min(max,s.length()));}
    private static String choice(JSONObject j,String key,String fallback,String...allowed){String s=j.optString(key,fallback);for(String a:allowed)if(a.equals(s))return s;return fallback;}
    private static float number(JSONObject j,String key,float fallback,float min,float max){double d=j.optDouble(key,fallback);return Double.isFinite(d)?Math.max(min,Math.min(max,(float)d)):fallback;}
}
