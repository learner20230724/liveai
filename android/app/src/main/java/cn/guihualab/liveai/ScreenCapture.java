package cn.guihualab.liveai;

import android.content.Intent;

interface ScreenCapture {
    interface Listener {
        boolean wantsFrame();
        void frame(byte[] jpeg);
        void opened();
        void closed(String error);
    }
    void start(int resultCode, Intent consent);
    void close();
}
