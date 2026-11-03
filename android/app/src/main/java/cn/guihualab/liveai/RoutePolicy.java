package cn.guihualab.liveai;

/** AudioDeviceInfo type values; kept platform-independent for routing tests. */
final class RoutePolicy {
    static int rank(int type){switch(type){case 7:case 26:return 100;case 3:case 22:return 90;case 11:case 12:return 80;case 2:return 30;case 1:return 20;default:return 0;}}
    static boolean headset(int type){return type==7||type==26||type==3||type==22||type==11||type==12;}
    static String label(int type){if(type==7||type==26)return "蓝牙耳机麦克风";if(type==3)return "有线耳机麦克风";if(type==11||type==12||type==22)return "USB 耳机麦克风";if(type==15)return "手机麦克风";return "系统输入";}
}
