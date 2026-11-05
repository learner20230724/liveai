package cn.guihualab.liveai;

import okhttp3.*;
import okio.ByteString;
import org.json.JSONObject;
import java.util.concurrent.TimeUnit;

/** Fixed native WSS endpoint: no media request is addressed to the hub. */
final class MossConnection {
    static final String ENDPOINT="wss://api.mosi.cn/v1/realtime?model=moss-live-1.0";
    interface Listener {void opened();void message(JSONObject data);void audio(byte[] bytes);void disconnected(int status);}
    private final WebSocket.Factory factory;private final Listener listener;private volatile WebSocket socket;private volatile int generation;
    MossConnection(Listener listener){this(new OkHttpClient.Builder().connectTimeout(15,TimeUnit.SECONDS).writeTimeout(10,TimeUnit.SECONDS).readTimeout(0,TimeUnit.MILLISECONDS).pingInterval(15,TimeUnit.SECONDS).build(),listener);}
    MossConnection(WebSocket.Factory factory,Listener listener){this.factory=factory;this.listener=listener;}
    synchronized void connect(String key){connect(key,"");}
    synchronized void connect(String key,String user){if(!user.isEmpty()&&!user.matches("[A-Za-z0-9_-]{1,64}"))throw new IllegalArgumentException("Invalid user identity");final int epoch=++generation;Request request=new Request.Builder().url(ENDPOINT+(user.isEmpty()?"":"&user="+user)).header("Authorization","Bearer "+key).build();socket=factory.newWebSocket(request,new WebSocketListener(){
        @Override public void onOpen(WebSocket ws,Response response){if(epoch!=generation){ws.close(1000,"Superseded");return;}socket=ws;listener.opened();}
        @Override public void onMessage(WebSocket ws,String text){if(epoch!=generation)return;try{listener.message(new JSONObject(text));}catch(Exception ignored){listener.disconnected(400);}}
        @Override public void onMessage(WebSocket ws,ByteString bytes){if(epoch==generation)listener.audio(bytes.toByteArray());}
        @Override public void onClosing(WebSocket ws,int code,String reason){ws.close(code,reason);}
        @Override public void onClosed(WebSocket ws,int code,String reason){if(epoch==generation)listener.disconnected(code);}
        @Override public void onFailure(WebSocket ws,Throwable failure,Response response){if(epoch==generation)listener.disconnected(response==null?0:response.code());}
    });}
    boolean json(JSONObject value){WebSocket ws=socket;return ws!=null&&ws.send(value.toString());}
    boolean binary(byte[] value){WebSocket ws=socket;return ws!=null&&ws.send(ByteString.of(value));}
    long queued(){WebSocket ws=socket;return ws==null?0:ws.queueSize();}
    synchronized void close(){generation++;WebSocket ws=socket;socket=null;if(ws!=null)ws.cancel();}
}
