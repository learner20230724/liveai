package cn.guihualab.liveai;

import okhttp3.*;
import org.json.*;
import java.io.*;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.function.Supplier;

/** Native HTTPS only. Credentials are attached exclusively to the fixed API. */
final class MossHttp {
    static final class Failure extends IOException {
        final int status;final String code;
        Failure(int status,String code,String message){super(message);this.status=status;this.code=code;}
        boolean concurrencyLimited(){return status==429&&code.equals("concurrency_limit_exceeded");}
    }
    static final MediaType JSON=MediaType.get("application/json; charset=utf-8");
    private final Supplier<String> key;
    private final Call.Factory client;
    private final File directory;
    static final class Result {
        JSONObject json;File file;String mime;
        Result(JSONObject j){json=j;}
    }
    MossHttp(Supplier<String> key,File directory){this(key,directory,new OkHttpClient.Builder().connectTimeout(15,TimeUnit.SECONDS)
        .readTimeout(15,TimeUnit.MINUTES).callTimeout(16,TimeUnit.MINUTES).writeTimeout(90,TimeUnit.SECONDS)
        .followRedirects(false).followSslRedirects(false).build());}
    MossHttp(Supplier<String> key,File directory,Call.Factory client){this.key=key;this.directory=directory;this.client=client;directory.mkdirs();}
    Result json(String path,String method,JSONObject data,Consumer<Call> register) throws Exception {
        RequestBody body=data==null?null:RequestBody.create(data.toString(),JSON);
        return execute(api(path,method,body),register);
    }
    Result multipart(String path,MultipartBody body,Consumer<Call> register) throws Exception {return execute(api(path,"POST",body),register);}
    private Request api(String path,String method,RequestBody body){
        if(!path.startsWith("/")||path.contains("..")||path.contains(":")||path.contains("\\"))throw new IllegalArgumentException("Invalid API path");
        String secret=key.get();if(secret.isEmpty())throw new SecurityException("请先配置手机直连");
        return new Request.Builder().url(ToolPolicy.API+path).header("Authorization","Bearer "+secret).method(method,body).build();
    }
    private Result execute(Request request,Consumer<Call> register) throws Exception {
        Call call=client.newCall(request);register.accept(call);
        try(Response response=call.execute()){
            ResponseBody body=response.body();if(body==null)throw new IOException("MOSS 未返回内容");
            if(!response.isSuccessful()){
                String message=new String(read(body.byteStream(),256*1024),java.nio.charset.StandardCharsets.UTF_8);
                String code="";
                try{JSONObject j=new JSONObject(message);Object e=j.opt("error");code=e instanceof JSONObject?((JSONObject)e).optString("code"):j.optString("code",e instanceof String?(String)e:"");message=e instanceof JSONObject?((JSONObject)e).optString("message",message):j.optString("message",message);}catch(Exception ignored){}
                message=message.replace(key.get(),"[已隐藏]");
                throw new Failure(response.code(),code,"MOSS "+response.code()+"："+message.substring(0,Math.min(350,message.length())));
            }
            String mime=body.contentType()==null?"application/octet-stream":body.contentType().toString().split(";")[0];
            if(mime.startsWith("audio/")||mime.equals("application/octet-stream")){
                File file=new File(directory,UUID.randomUUID()+extension(mime));
                try(OutputStream out=new FileOutputStream(file)){copy(body.byteStream(),out,100L*1024*1024);}catch(Exception e){file.delete();throw e;}
                Result result=new Result(null);result.file=file;result.mime=mime;return result;
            }
            String value=new String(read(body.byteStream(),4*1024*1024),java.nio.charset.StandardCharsets.UTF_8);
            try{return new Result(new JSONObject(value));}catch(JSONException e){return new Result(new JSONObject().put("text",value));}
        }
    }
    File download(String url,String extension,long maximum,Consumer<Call> register) throws Exception {
        for(int redirect=0;redirect<5;redirect++){
            if(!ToolPolicy.officialDownload(url))throw new SecurityException("结果地址不属于 MOSS 官方域名");
            // Generated CDN URLs are public/signed URLs. Never attach the API key.
            Call call=client.newCall(new Request.Builder().url(url).get().build());register.accept(call);
            try(Response response=call.execute()){
                if(response.isRedirect()){String next=response.header("Location");HttpUrl target=response.request().url().resolve(next==null?"":next);if(target==null)throw new IOException("图片跳转地址无效");url=target.toString();continue;}
                if(!response.isSuccessful()||response.body()==null)throw new IOException("官方结果下载失败（"+response.code()+"）");
                File file=new File(directory,UUID.randomUUID()+extension);
                try(OutputStream out=new FileOutputStream(file)){copy(response.body().byteStream(),out,maximum);}catch(Exception e){file.delete();throw e;}
                return file;
            }
        }
        throw new IOException("官方结果跳转次数过多");
    }
    static String extension(String mime){if(mime.contains("wav"))return ".wav";if(mime.contains("flac"))return ".flac";if(mime.contains("aac"))return ".aac";if(mime.contains("opus"))return ".opus";return ".mp3";}
    static byte[] read(InputStream in,int max) throws IOException {ByteArrayOutputStream out=new ByteArrayOutputStream();copy(in,out,max);return out.toByteArray();}
    static void copy(InputStream in,OutputStream out,long max) throws IOException {byte[] buffer=new byte[32768];long total=0;int n;while((n=in.read(buffer))!=-1){total+=n;if(total>max)throw new IOException("文件大小超过本机限制");out.write(buffer,0,n);}}
}
