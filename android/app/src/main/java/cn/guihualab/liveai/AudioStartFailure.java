package cn.guihualab.liveai;
/** Fixed startup stages only: never expose raw exceptions, credentials or transport headers. */
final class AudioStartFailure extends Exception {
    final String stage;
    AudioStartFailure(String stage,Exception cause){super(stage,cause);this.stage=stage;}
    String userMessage(){String label;
        switch(stage){
            case "AUDIO_PERMISSION":return "麦克风权限未获允许，请在系统设置中允许";
            case "AUDIO_FOCUS":label="通话音频被其他应用占用，请结束其他通话或录音";break;
            case "AUDIO_INPUT_INIT":label="所选录音设备初始化失败";break;
            case "AUDIO_OUTPUT_INIT":label="播放设备初始化失败";break;
            case "AUDIO_OUTPUT_START":label="播放设备无法开始播放";break;
            case "AUDIO_LISTENERS":label="音频设备监听初始化失败";break;
            default:label="通话音频模式初始化失败";
        }return label+"（"+stage+"）";
    }
}
