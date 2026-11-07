package cn.guihualab.liveai;
import org.json.JSONArray;
import org.json.JSONObject;
interface CallAudio {
    void start() throws Exception;
    void play(byte[] bytes,JSONObject context);
    void done(JSONObject context);
    void interrupt(JSONObject context);
    void muted(boolean value);
    void route(String value);
    JSONArray routes();
    default void settings(float rate,float volume) {}
    default JSONObject playbackState(){return new JSONObject();}
    default void input(String value) {}
    default void refreshInputs() {}
    default JSONObject inputs(){return new JSONObject();}
    void close();
}
