package cn.guihualab.liveai;

import android.content.*;
import android.os.*;
import android.util.Base64;
import okhttp3.*;
import org.json.*;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

/** Application-owned jobs. Images have ten workers; other tools use their own pool. */
final class DirectTools {
    private static DirectTools instance;
    static synchronized DirectTools get(Context context){if(instance==null)instance=new DirectTools(context.getApplicationContext());return instance;}
    private final Context context;
    private final ToolValues store;
    private final File outputs;
    private final MossHttp http;
    private final ThreadPoolExecutor images=(ThreadPoolExecutor)Executors.newFixedThreadPool(ToolPolicy.IMAGE_CONCURRENCY);
    private final ExecutorService tools=Executors.newFixedThreadPool(4),controls=Executors.newSingleThreadExecutor(),saves=Executors.newFixedThreadPool(2),persistence=Executors.newSingleThreadExecutor();
    private final LinkedHashMap<String,ImageJob> jobs=new LinkedHashMap<>();
    private final LinkedHashMap<String,JSONObject> results=new LinkedHashMap<>();
    private final ConcurrentHashMap<String,Call> calls=new ConcurrentHashMap<>();
    private final AtomicInteger work=new AtomicInteger();
    private final ImageLimiter imageLimiter=new ImageLimiter(10);
    private final PaidAccess paid=new PaidAccess(SystemClock::elapsedRealtime);
    private final AtomicLong requests=new AtomicLong(),successful=new AtomicLong(),failed=new AtomicLong();
    private final long since=System.currentTimeMillis();
    private static final class ImageJob {
        final String id;final JSONObject input;final long created;
        volatile String status="queued",error="",output="";volatile long started;volatile JSONObject data;volatile Future<?> future;
        ImageJob(String id,JSONObject input,long created){this.id=id;this.input=input;this.created=created;}
        JSONObject json(){return object("id",id,"prompt",input.optString("prompt"),"model",input.optString("model"),"size",input.optString("size"),"createdAt",created,"startedAt",started,"status",status,"error",error,"data",data==null?JSONObject.NULL:data,"outputToken",output);}
    }
    private DirectTools(Context context){this(context,new SecureStore(context),new File(context.getFilesDir(),"tool-outputs"),null);}
    DirectTools(Context context,ToolValues values,File directory,MossHttp transport){this.context=context;store=values;outputs=directory;http=transport==null?new MossHttp(()->store.get("mossKey"),outputs):transport;
        // Only realtime text history persists; generated files are session cache.
        try{store.put("imageJobs","[]");}catch(Exception ignored){}
        File[] oldOutputs=outputs.listFiles();if(oldOutputs!=null)for(File old:oldOutputs)if(old.isFile())old.delete();
    }
    int pending(){return work.get();}
    private void startWork(){context.startForegroundService(new Intent(context,ToolTaskService.class));work.incrementAndGet();}
    private void endWork(){work.decrementAndGet();}
    synchronized String submitImage(String payload) throws Exception {
        if(jobs.values().stream().filter(j->j.status.equals("queued")||j.status.equals("running")).count()>=100)throw new IllegalStateException("待处理任务已达到 100 个，请等待一些任务完成");
        JSONObject input=ToolPolicy.image(new JSONObject(payload));if(store.get("mossKey").isEmpty())throw new SecurityException("请先配置手机直连");
        startWork();ImageJob job=new ImageJob(UUID.randomUUID().toString(),input,System.currentTimeMillis());jobs.put(job.id,job);trim();changed();
        try{job.future=images.submit(()->runImage(job));}catch(Exception e){job.status="failed";job.error="无法提交任务";endWork();changed();throw e;}
        return job.id;
    }
    private void runImage(ImageJob job){
        try{
            if(job.status.equals("cancelled"))return;
            JSONObject value=null;int rejections=0;
            while(value==null){
                if(!imageLimiter.acquire(()->job.status.equals("cancelled")))return;
                boolean limited=false,accepted=false;
                try{
                    job.status="running";job.error="";job.started=System.currentTimeMillis();changed();requests.incrementAndGet();
                    value=http.json("/images/generations","POST",job.input,call->register(job.id,call)).json;if(value==null)throw new IOException("官网返回格式异常，未自动重复提交");accepted=true;
                }catch(MossHttp.Failure e){limited=e.concurrencyLimited();if(!limited||++rejections>12)throw e;job.status="queued";job.error="官网并发限流，自动等待空闲通道（未受理的请求才会重排）。";changed();}
                finally{imageLimiter.release(limited,accepted);}
            }
            if(job.status.equals("cancelled"))return;
            String source=value.getJSONArray("data").getJSONObject(0).getString("url");
            File cached=http.download(source,".png",32L*1024*1024,call->register(job.id,call));
            if(job.status.equals("cancelled")){cached.delete();return;}
            job.output=cached.getName();value.getJSONArray("data").getJSONObject(0).put("url",outputUrl(cached)).put("source_url",source);
            job.data=value;job.status="succeeded";successful.incrementAndGet();
        }catch(Exception e){if(!job.status.equals("cancelled")){job.status="failed";job.error=safe(e);failed.incrementAndGet();}}
        finally{calls.remove(job.id);endWork();changed();}
    }
    private void register(String id,Call call){calls.put(id,call);synchronized(this){ImageJob j=jobs.get(id);if(j!=null&&j.status.equals("cancelled"))call.cancel();}}
    synchronized void cancelImage(String id){ImageJob job=jobs.get(id);if(job==null||!(job.status.equals("queued")||job.status.equals("running")))return;job.status="cancelled";job.error="已取消本机等待；已发到官网的请求仍可能完成。";Call call=calls.get(id);if(call!=null)call.cancel();changed();}
    synchronized void removeImage(String id){ImageJob job=jobs.get(id);if(job!=null&&!job.status.equals("queued")&&!job.status.equals("running")){jobs.remove(id);File output=file(job.output);if(output!=null)output.delete();changed();}}
    private synchronized void trim(){Iterator<ImageJob> it=jobs.values().iterator();while(jobs.size()>80&&it.hasNext()){ImageJob job=it.next();if(!job.status.equals("queued")&&!job.status.equals("running")){File old=file(job.output);if(old!=null)old.delete();it.remove();}}}
    synchronized JSONObject snapshot(){JSONArray list=new JSONArray();List<ImageJob> all=new ArrayList<>(jobs.values());Collections.reverse(all);for(ImageJob j:all)list.put(j.json());return object("images",list,"maxConcurrent",10,"providerConcurrency",imageLimiter.capacity(),"running",all.stream().filter(j->j.status.equals("running")).count(),"queued",all.stream().filter(j->j.status.equals("queued")).count(),"paidUnlocked",paid.allowed(),"paidRemainingMs",paid.remaining(),"direct",true,"stats",object("since",new Date(since).toInstant().toString(),"requests",requests.get(),"success",successful.get(),"failed",failed.get(),"images",all.stream().filter(j->j.status.equals("succeeded")).count(),"nativeDirect",true));}
    private synchronized void changed(){CallEvents.emit(object("type","tools","state",snapshot()));}
    void lockPaid(){paid.lock();CallEvents.emit(object("type","tools","state",snapshot()));}
    void request(String id,String operation,String payload){
        if(id==null||!id.matches("[A-Za-z0-9_-]{1,80}"))return;
        if(operation.equals("lockPaid")){lockPaid();finishResult(id,object("unlocked",false),null);return;}
        try{startWork();}catch(Exception e){finishResult(id,null,safe(e));return;}
        ExecutorService pool=operation.equals("saveImage")?saves:operation.equals("unlockPaid")?controls:tools;
        pool.execute(()->{try{JSONObject data=new JSONObject(payload);JSONObject result=perform(id,operation,data);finishResult(id,result,null);}catch(Exception e){failed.incrementAndGet();finishResult(id,null,safe(e));}finally{calls.remove(id);endWork();}});
    }
    private JSONObject perform(String id,String operation,JSONObject data) throws Exception {
        if(operation.equals("unlockPaid")){DeviceProvisioning.unlockPaid(ToolPolicy.text(data,"password",128));paid.unlock();CallEvents.emit(object("type","tools","state",snapshot()));return object("unlocked",true,"expiresIn",1800);}
        if(operation.equals("lockPaid")){lockPaid();return object("unlocked",false);}
        if(operation.equals("saveImage"))return saveImage(data.getString("id"));
        if(operation.equals("vision"))return vision(id,data);
        if(operation.equals("voices")){if(!paid.allowed())throw new SecurityException("请先输入密码解锁付费模型");return requestJson(id,"/audio/voices","GET",null);}
        String model=ToolPolicy.text(data,"model",100),path=ToolPolicy.paidPath(operation,model,paid.allowed());
        if(operation.equals("transcribe")){
            JSONObject file=data.getJSONObject("file");MultipartBody.Builder form=new MultipartBody.Builder().setType(MultipartBody.FORM).addFormDataPart("model",model).addFormDataPart("response_format","json");
            if(model.equals("moss-transcribe-diarize-pro"))form.addFormDataPart("diarize","true");addFile(form,file,"file");requests.incrementAndGet();MossHttp.Result r=http.multipart(path,form.build(),c->register(id,c));successful.incrementAndGet();return r.json;
        }
        JSONObject body=object("model",model,"response_format","mp3","delivery_method","audio");
        if(operation.equals("speech"))body.put("input",ToolPolicy.text(data,"input",45000)).put("voice_id",ToolPolicy.text(data,"voice_id",200)).put("stream",false);
        if(operation.equals("voiceDesign"))body.put("input",ToolPolicy.text(data,"input",45000)).put("instruction",ToolPolicy.text(data,"instruction",4000));
        if(operation.equals("speakers")){
            JSONArray speakers=data.getJSONArray("speakers"),segments=data.getJSONArray("segments");if(speakers.length()<1||speakers.length()>10||segments.length()<1||segments.length()>300)throw new IllegalArgumentException("请检查角色和台词数量");
            Set<String> names=new HashSet<>();for(int i=0;i<speakers.length();i++){JSONObject speaker=speakers.getJSONObject(i);names.add(ToolPolicy.text(speaker,"id",40));ToolPolicy.text(speaker,"voice_id",200);}
            int length=0;for(int i=0;i<segments.length();i++){JSONObject segment=segments.getJSONObject(i);if(!names.contains(segment.optString("speaker")))throw new IllegalArgumentException("台词角色与声音配置不匹配");length+=ToolPolicy.text(segment,"text",45000).length();}if(length>45000)throw new IllegalArgumentException("台词总长度不能超过 45000 字");body.put("speakers",speakers).put("segments",segments);
        }
        requests.incrementAndGet();MossHttp.Result r=http.json(path,"POST",body,c->register(id,c));successful.incrementAndGet();
        if(r.file!=null)return object("audio_url",outputUrl(r.file),"outputToken",r.file.getName(),"mime",r.mime);
        return r.json;
    }
    private JSONObject requestJson(String id,String path,String method,JSONObject body) throws Exception {requests.incrementAndGet();JSONObject value=http.json(path,method,body,c->register(id,c)).json;successful.incrementAndGet();return value;}
    private JSONObject vision(String id,JSONObject data) throws Exception {
        JSONObject inputFile=data.getJSONObject("file");String mime=inputFile.optString("mime");if(!Set.of("image/jpeg","image/png","image/webp").contains(mime))throw new IllegalArgumentException("请选择 JPG、PNG 或 WebP 图片");
        MultipartBody.Builder form=new MultipartBody.Builder().setType(MultipartBody.FORM).addFormDataPart("purpose","image");addFile(form,inputFile,"file");
        JSONObject upload=http.multipart("/files",form.build(),c->register(id,c)).json;String fileId=upload.getString("id");
        try{
            JSONArray content=new JSONArray().put(object("type","input_text","text",ToolPolicy.text(data,"prompt",4000))).put(object("type","input_image","file_id",fileId));
            return requestJson(id,"/responses","POST",object("model","moss-vl-1.0","input",new JSONArray().put(object("role","user","content",content))));
        }finally{try{http.json("/files/"+java.net.URLEncoder.encode(fileId,"UTF-8"),"DELETE",null,c->register(id,c));}catch(Exception ignored){}}
    }
    private static void addFile(MultipartBody.Builder form,JSONObject file,String field) throws Exception {
        String base64=file.getString("base64");if(base64.length()>ToolPolicy.MAX_UPLOAD*4L/3+10)throw new IllegalArgumentException("文件不能超过 20 MB");byte[] bytes=Base64.decode(base64,Base64.DEFAULT);if(bytes.length==0||bytes.length>ToolPolicy.MAX_UPLOAD)throw new IllegalArgumentException("文件大小应为 1 字节至 20 MB");
        String mime=file.optString("mime","application/octet-stream");if(!mime.matches("[A-Za-z0-9.+-]+/[A-Za-z0-9.+-]+"))mime="application/octet-stream";
        form.addFormDataPart(field,file.optString("name","upload").replaceAll("[\\\\/\\p{Cntrl}]","_"),RequestBody.create(bytes,MediaType.get(mime)));
    }
    private JSONObject saveImage(String id) throws Exception {
        ImageJob job;synchronized(this){job=jobs.get(id);}if(job==null||!job.status.equals("succeeded"))throw new IllegalArgumentException("图片尚未生成成功");File cached=file(job.output);
        if(cached==null){String url=job.data.getJSONArray("data").getJSONObject(0).optString("source_url");cached=http.download(url,".png",32L*1024*1024,c->register("save-"+id,c));job.output=cached.getName();changed();}
        android.net.Uri uri=GallerySave.save(context,cached,"LiveAI-"+job.created+"-"+job.id.substring(0,6)+".png");return object("saved",true,"uri",uri.toString());
    }
    private synchronized void finishResult(String id,JSONObject value,String error){JSONObject result=object("id",id,"done",true,"value",value==null?JSONObject.NULL:value,"error",error==null?"":error);results.put(id,result);while(results.size()>60)results.remove(results.keySet().iterator().next());CallEvents.emit(object("type","tool-result","result",result));}
    void failRequest(String id,String message){finishResult(id,null,message);}
    synchronized String result(String id){JSONObject value=results.get(id);return value==null?"":value.toString();}
    File file(String token){if(token==null||!token.matches("[a-f0-9-]{36}\\.(png|mp3|wav|flac|aac|opus)"))return null;File file=new File(outputs,token);return file.isFile()?file:null;}
    static String outputUrl(File file){return NavigationPolicy.HOME+"native-output/"+file.getName();}
    void shutdown(){cancelAll();images.shutdownNow();tools.shutdownNow();controls.shutdownNow();saves.shutdownNow();try{images.awaitTermination(2,TimeUnit.SECONDS);tools.awaitTermination(2,TimeUnit.SECONDS);controls.awaitTermination(2,TimeUnit.SECONDS);saves.awaitTermination(2,TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}persistence.shutdown();}
    void cancelAll(){synchronized(this){for(ImageJob job:jobs.values())if(job.status.equals("queued")||job.status.equals("running"))job.status="cancelled";}for(Call call:calls.values())call.cancel();changed();}
    private String safe(Exception e){String secret=store.get("mossKey");String message=e.getMessage()==null?"任务未能完成，请检查网络后重试":e.getMessage();if(!secret.isEmpty())message=message.replace(secret,"[已隐藏]");return message.substring(0,Math.min(500,message.length()));}
    static JSONObject object(Object... pairs){JSONObject result=new JSONObject();for(int i=0;i+1<pairs.length;i+=2)try{result.put(String.valueOf(pairs[i]),pairs[i+1]);}catch(Exception ignored){}return result;}
}
