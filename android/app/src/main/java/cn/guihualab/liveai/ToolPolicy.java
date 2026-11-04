package cn.guihualab.liveai;

import org.json.*;
import java.net.URI;
import java.util.*;

/** Allowlisted operations and models: JS cannot choose an arbitrary URL or add auth. */
final class ToolPolicy {
    static final int IMAGE_CONCURRENCY=10, MAX_UPLOAD=20*1024*1024;
    static final String API="https://api.mosi.cn/v1";
    static final Set<String> IMAGES=Set.of("moss-image-sft-1.0","moss-image-base-1.0");
    static final Set<String> SPEECH=Set.of("moss-tts-1.5-flash","moss-tts-1.0-pro");
    static final Set<String> TRANSCRIBE=Set.of("moss-transcribe-1.0","moss-transcribe-diarize-pro");
    static String text(JSONObject data,String name,int max) {
        String s=data.optString(name,"").trim();
        if(s.isEmpty()||s.length()>max)throw new IllegalArgumentException("请检查"+name+"，长度应为 1–"+max+" 字");
        return s;
    }
    static JSONObject image(JSONObject data) throws JSONException {
        String model=data.optString("model","moss-image-sft-1.0");
        if(!IMAGES.contains(model))throw new IllegalArgumentException("图像只能选择已接入的免费模型");
        String size=data.optString("size","1024x1024");
        if(!Set.of("1024x1024","1024x1536","1536x1024","512x512").contains(size))throw new IllegalArgumentException("图片尺寸不受支持");
        return new JSONObject().put("model",model).put("prompt",text(data,"prompt",4000)).put("size",size)
            .put("seed",java.util.concurrent.ThreadLocalRandom.current().nextLong(9007199254740991L)).put("n",1).put("response_format","url").put("prompt_enhance",false)
            .put("output_watermark",new JSONObject().put("enabled",false));
    }
    static String paidPath(String operation,String model,boolean unlocked) {
        if(!unlocked)throw new SecurityException("请先输入密码解锁付费模型");
        if(operation.equals("speech")&&SPEECH.contains(model))return "/audio/speech";
        if(operation.equals("speakers")&&model.equals("moss-ttsd-1.0"))return "/audio/speech/speakers";
        if(operation.equals("voiceDesign")&&model.equals("moss-voice-generator-1.0"))return "/audio/voice/generations";
        if(operation.equals("transcribe")&&TRANSCRIBE.contains(model))return "/audio/transcriptions";
        throw new IllegalArgumentException("模型与操作不匹配，不会替换为其他模型");
    }
    static boolean officialDownload(String url) {
        try{URI uri=new URI(url);String h=uri.getHost();return "https".equals(uri.getScheme())&&uri.getUserInfo()==null&&(uri.getPort()==-1||uri.getPort()==443)&&h!=null&&(h.equals("mosi.cn")||h.endsWith(".mosi.cn")||h.equals("moss.cn")||h.endsWith(".moss.cn"));}catch(Exception e){return false;}
    }
}
