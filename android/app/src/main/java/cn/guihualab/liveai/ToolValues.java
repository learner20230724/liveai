package cn.guihualab.liveai;
/** Production implementation is Android Keystore-backed SecureStore. */
interface ToolValues {String get(String name);void put(String name,String value) throws Exception;}
