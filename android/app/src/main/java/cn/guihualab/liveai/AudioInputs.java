package cn.guihualab.liveai;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.*;
import android.os.Build;
import org.json.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** Input enumeration and duplex pairing. Output-only music endpoints never become microphones. */
final class AudioInputs {
    static final class Device {
        final int id,type;final String name,address,key;final AudioDeviceInfo handle;
        Device(int id,int type,String name,String address){this(id,type,name,address,null);}
        Device(int id,int type,String name,String address,AudioDeviceInfo handle){this.id=id;this.type=type;this.name=name;this.address=address==null?"":address;this.handle=handle;this.key=identity(type,name,this.address);}
        static Device of(AudioDeviceInfo d){if(d==null)return null;String address="";try{if(Build.VERSION.SDK_INT>=28)address=d.getAddress();}catch(SecurityException ignored){}return new Device(d.getId(),d.getType(),d.getProductName().toString(),address,d);}
        String label(){return RoutePolicy.label(type)+" · "+name;}
    }
    static final class Plan {
        final Device target,communication,input;final String error;
        Plan(Device target,Device communication,Device input,String error){this.target=target;this.communication=communication;this.input=input;this.error=error;}
    }
    static String identity(int type,String name,String address){try{byte[] bytes=MessageDigest.getInstance("SHA-256").digest((type+"|"+address+"|"+name).getBytes(StandardCharsets.UTF_8));StringBuilder out=new StringBuilder();for(int i=0;i<12;i++)out.append(String.format(Locale.ROOT,"%02x",bytes[i]));return out.toString();}catch(Exception e){throw new IllegalStateException(e);}}
    static boolean bluetooth(int type){return type==AudioDeviceInfo.TYPE_BLUETOOTH_SCO||type==AudioDeviceInfo.TYPE_BLE_HEADSET;}
    static boolean microphone(int type){return type==15||type==3||type==7||type==11||type==12||type==22||type==26||type==5||type==6||type==19||type==20||type==21;}
    static boolean pair(Device a,Device b){if(a==null||b==null)return false;if(a.id==b.id)return true;boolean compatible=a.type==b.type||(bluetooth(a.type)&&bluetooth(b.type));if(!compatible)return false;if(!a.address.isEmpty()&&!b.address.isEmpty())return a.address.equals(b.address);return a.name.equals(b.name);}
    static List<Device> sources(AudioManager manager){List<Device> result=new ArrayList<>();for(AudioDeviceInfo d:manager.getDevices(AudioManager.GET_DEVICES_INPUTS))if(d.isSource()&&microphone(d.getType()))result.add(Device.of(d));return result;}
    static List<Device> communications(AudioManager manager){List<Device> result=new ArrayList<>();if(Build.VERSION.SDK_INT>=31){try{for(AudioDeviceInfo d:manager.getAvailableCommunicationDevices())result.add(Device.of(d));}catch(SecurityException ignored){}}else for(AudioDeviceInfo d:manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS))if(d.getType()==AudioDeviceInfo.TYPE_BUILTIN_EARPIECE||d.getType()==AudioDeviceInfo.TYPE_BUILTIN_SPEAKER||RoutePolicy.headset(d.getType()))result.add(Device.of(d));return result;}
    static Device peer(Device target,List<Device> inputs){for(Device d:inputs)if(pair(target,d))return d;return null;}
    static Device best(List<Device> devices,String output,boolean phoneOnly){Device best=null;int rank=0;for(Device d:devices){if(phoneOnly&&d.type!=1&&d.type!=2)continue;int n=RoutePolicy.rank(d.type);if(output.equals("speaker"))n=d.type==2?200:0;else if(output.equals("earpiece"))n=d.type==1?200:0;else if(output.startsWith("device:"))n=output.equals("device:"+d.id)?200:0;if(n>rank){rank=n;best=d;}}return best;}
    static Plan plan(List<Device> inputs,List<Device> communications,String selected,String output){
        Device input=null,comm=null,target=null;
        if(!selected.equals("auto")){
            for(Device d:inputs)if(selected.equals("mic:"+d.key)){input=d;target=d;break;}
            for(Device d:communications)if(selected.equals("comm:"+d.key)&&RoutePolicy.headset(d.type)){comm=d;target=d;input=peer(d,inputs);break;}
            if(target==null)for(Device d:inputs)if(RoutePolicy.headset(d.type)&&selected.equals("comm:"+d.key)){target=d;input=d;break;}
            if(target==null)return new Plan(null,null,null,"所选麦克风已断开，请重新检测或选择");
            if(comm==null){if(target.type==15)comm=best(communications,(output.equals("speaker")||output.equals("earpiece"))?output:"auto",true);else comm=peer(target,communications);}
        }else{
            comm=best(communications,output,false);if(comm==null)comm=best(communications,"auto",false);
            if(comm!=null){input=peer(comm,inputs);if(!RoutePolicy.headset(comm.type)){for(Device d:inputs)if(d.type==15){input=d;break;}}target=RoutePolicy.headset(comm.type)?comm:input;}
            if(target==null){int rank=0;for(Device d:inputs){int n=RoutePolicy.headset(d.type)?RoutePolicy.rank(d.type):d.type==15?10:1;if(n>rank){rank=n;input=d;target=d;}}}
        }
        return new Plan(target,comm,input,target==null?"未检测到可用麦克风":"");
    }
    static boolean matches(Plan plan,Device actual){return plan!=null&&plan.target!=null&&(plan.target.type==15?actual!=null&&actual.type==15&&pair(plan.target,actual):pair(plan.target,actual));}
    static String status(Plan plan,Device actual,String error,long elapsed){if(plan==null)return error.isEmpty()?"idle":"failed";if(!plan.error.isEmpty())return "unavailable";if(matches(plan,actual))return "active";if(!error.isEmpty())return "failed";return elapsed<5000?"pending":"mismatch";}
    static JSONArray choices(List<Device> inputs,List<Device> communications)throws JSONException{return choices(inputs,communications,"auto");}
    static JSONArray choices(List<Device> inputs,List<Device> communications,String selected)throws JSONException{
        JSONArray out=new JSONArray();Set<String> keys=new HashSet<>();
        for(Device d:communications)if(RoutePolicy.headset(d.type)){Device source=peer(d,inputs);String key=source!=null&&(selected.equals("mic:"+source.key)||selected.equals("comm:"+source.key))?selected:"comm:"+d.key;if(keys.add(key))out.put(new JSONObject().put("id",key).put("name",d.label()).put("type",d.type).put("detected",peer(d,inputs)!=null));}
        for(Device d:inputs){boolean represented=false;for(Device comm:communications)if(RoutePolicy.headset(comm.type)&&pair(comm,d)){represented=true;break;}String key=RoutePolicy.headset(d.type)&&selected.equals("comm:"+d.key)?selected:"mic:"+d.key;if(!represented&&keys.add(key))out.put(new JSONObject().put("id",key).put("name",d.label()).put("type",d.type).put("detected",true));}return out;
    }
    static JSONObject catalog(Context context){JSONObject result=new JSONObject();try{AudioManager manager=context.getSystemService(AudioManager.class);boolean permission=Build.VERSION.SDK_INT<31||context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)==PackageManager.PERMISSION_GRANTED;List<Device> inputs=sources(manager),comms=permission?communications(manager):Collections.emptyList();String selected=context.getSharedPreferences("call-options",Context.MODE_PRIVATE).getString("input","auto");JSONArray choices=choices(inputs,comms,selected);boolean bt=false,music=false;for(Device d:inputs)bt|=bluetooth(d.type);for(Device d:comms)bt|=bluetooth(d.type);for(AudioDeviceInfo d:manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS))music|=d.getType()==AudioDeviceInfo.TYPE_BLUETOOTH_A2DP;result.put("choices",choices).put("selected",context.getSharedPreferences("call-options",Context.MODE_PRIVATE).getString("input","auto")).put("bluetoothPermission",permission).put("mediaOnlyBluetooth",music&&!bt).put("status","idle").put("level",0);}catch(Exception ignored){}return result;}
}
