package cn.guihualab.liveai;

import android.webkit.WebResourceResponse;
import java.io.*;
import java.util.*;

/** Private same-origin files are streamed locally, including audio range reads. */
final class NativeOutputResponse {
    static WebResourceResponse open(File file,String range,boolean head) throws IOException {
        long length=file.length(),start=0,end=length-1;boolean partial=false;
        if(range!=null&&range.matches("bytes=[0-9]+-[0-9]*")){
            String[] parts=range.substring(6).split("-",-1);start=Long.parseLong(parts[0]);if(!parts[1].isEmpty())end=Math.min(end,Long.parseLong(parts[1]));partial=true;
            if(start>=length||end<start)return new WebResourceResponse("text/plain","UTF-8",416,"Range Not Satisfiable",Map.of("Content-Range","bytes */"+length),new ByteArrayInputStream(new byte[0]));
        }
        String name=file.getName(),mime=name.endsWith(".png")?"image/png":name.endsWith(".wav")?"audio/wav":name.endsWith(".flac")?"audio/flac":name.endsWith(".aac")?"audio/aac":name.endsWith(".opus")?"audio/opus":"audio/mpeg";
        Map<String,String> headers=new HashMap<>();headers.put("Cache-Control","private, no-store");headers.put("Accept-Ranges","bytes");headers.put("Content-Length",String.valueOf(Math.max(0,end-start+1)));
        if(partial)headers.put("Content-Range","bytes "+start+"-"+end+"/"+length);
        InputStream input=new ByteArrayInputStream(new byte[0]);if(!head){FileInputStream stream=new FileInputStream(file);stream.getChannel().position(start);final long count=Math.max(0,end-start+1);input=new FilterInputStream(stream){long left=count;@Override public int read() throws IOException {if(left<=0)return -1;int v=super.read();if(v>=0)left--;return v;}@Override public int read(byte[] b,int off,int len)throws IOException{if(left<=0)return -1;int n=in.read(b,off,(int)Math.min(len,left));if(n>0)left-=n;return n;}};}
        return new WebResourceResponse(mime,null,partial?206:200,partial?"Partial Content":"OK",headers,input);
    }
}
