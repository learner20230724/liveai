import { nativeShell } from "./native.js";
const API = "/liveai/api";
export const presets = {
  daily: {
    name: "日常对话",
    description: "随时聊聊，想到什么就说什么。",
    prompt:
      "你是 LiveAI，一个耐心、自然、聪明的实时助手。像朋友一样交流，回答简洁、有用；遇到不确定的内容坦诚说明。能看到画面时，结合画面回答。",
  },
  english: {
    name: "口语陪练",
    description: "聊真实话题，把练习变成对话。",
    prompt:
      "You are LiveAI, a friendly English conversation coach. Speak clear natural English. Keep each reply short and ask one follow-up question. Gently correct important mistakes. If the user asks for Chinese explanations, explain in Chinese.",
  },
  vision: {
    name: "看见与理解",
    description: "打开画面，一起观察身边的世界。",
    prompt:
      "你是 LiveAI，一个细心的视觉助手。结合用户实时提供的画面和语音，用中文回答问题。只描述确实可见的内容，不能看见时直接说明；不猜测画面中人物身份。",
  },
};
export async function api(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ["/images", "/vision"].includes(path) ? 165000 : 10000);
  let r, data;
  try {
    r = await fetch(API + path, { cache: "no-store", ...options, signal: options.signal || controller.signal });
    data = await r.json();
  } catch (error) {
    if (error.name === "AbortError") throw new Error("网络请求超时，请检查连接后重试。");
    throw error;
  } finally { clearTimeout(timer); }
  if (!r.ok)
    throw Object.assign(new Error(data.error || "请求失败，请稍后重试。"), {
      status: r.status,
      code: data.code,
    });
  return data;
}
export const post = (path, body) =>
  api(path, {
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
