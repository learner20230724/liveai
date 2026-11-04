import {nativeTools,nativeApi} from "./native-tools.js";
import { nativeShell } from "./native.js";
import {browserApi} from './browser-direct.js';
const API = "/liveai/api";
export {presets} from './conversation.js';
export async function api(path, options = {}) {
  if(nativeShell()&&!nativeTools()&&["/images","/vision"].includes(path))throw Object.assign(new Error("完整 AI 直连需要 APP 3.0，请覆盖安装新版"),{code:"UPGRADE_REQUIRED"});
  if(nativeTools() && !["/login","/logout","/health"].includes(path))return nativeApi(path,options);
  if(!nativeShell()&&["/images","/vision"].includes(path))return browserApi(path,options);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ["/images", "/vision"].includes(path) ? 900000 : 10000);
  const cancel=()=>controller.abort();options.signal?.addEventListener('abort',cancel,{once:true});if(options.signal?.aborted)cancel();
  let r, data;
  try {
    r = await fetch(API + path, { cache: "no-store", ...options, signal: controller.signal });
    data = await r.json();
  } catch (error) {
    if (error.name === "AbortError") throw new Error("网络请求超时，请检查连接后重试。");
    throw error;
  } finally { clearTimeout(timer);options.signal?.removeEventListener('abort',cancel); }
  if (!r.ok)
    throw Object.assign(new Error(data.error || "请求失败，请稍后重试。"), {
      status: r.status,
      code: data.code,
    });
  return data;
}
export const post = (path, body, options = {}) =>
  api(path, {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
export const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem("liveai." + key)) ?? fallback;
  } catch {
    return fallback;
  }
};
export function save(key, value) {
  try {
    localStorage.setItem("liveai." + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function download(text, name, type = "text/plain") {
  if (nativeShell()?.saveText) { nativeShell().saveText(text, name); return; }
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
