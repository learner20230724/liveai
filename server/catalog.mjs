export const verifiedAt = "2026-11-05";
export const models = [
  {
    id: "moss-live-1.0",
    name: "MOSS Live",
    kind: "live",
    tier: "free",
    description: "实时语音对话 · 摄像头 · 屏幕共享",
    price: "限时免费",
    status: "verified",
    note: "已验证真实语音回答、播放确认和摄像头传输；APP 原生直连，需设备授权。",
  },
  {
    id: "moss-image-sft-1.0",
    name: "MOSS Image SFT",
    kind: "image",
    tier: "free",
    description: "图像创作 · 文字渲染 · 精细指令",
    price: "限时免费",
    status: "verified",
    note: "已完成真实图像生成。",
  },
  {
    id: "moss-image-base-1.0",
    name: "MOSS Image Base",
    kind: "image",
    tier: "free",
    description: "基础图像创作 · 自由探索",
    price: "限时免费",
    status: "verified",
    note: "已验证官方直连生成、原图下载和关闭可见水印。",
  },
  {
    id: "moss-vl-1.0",
    name: "MOSS VL",
    kind: "vision",
    tier: "free",
    description: "图片与视频理解",
    price: "限时免费",
    status: "unavailable",
    note: "当前上游返回模型版本不存在；保留入口供恢复后重试。",
  },
  {
    id: "moss-vl-realtime-1.0",
    name: "MOSS VL Realtime",
    kind: "vision-live",
    tier: "free",
    description: "连续画面理解 · 增量文本回答",
    price: "限时免费",
    status: "documented",
    note: "使用独立协议；本版视觉实时交互由 MOSS Live 提供。",
  },
  {
    id: "moss-tts-1.5-flash",
    name: "MOSS TTS Flash",
    kind: "speech",
    tier: "paid",
    description: "快速单人语音合成",
    price: "¥2 / 万字符",
    status: "locked",
  },
  {
    id: "moss-tts-1.0-pro",
    name: "MOSS TTS Pro",
    kind: "speech",
    tier: "paid",
    description: "高品质单人语音合成",
    price: "¥2 / 万字符",
    status: "locked",
  },
  {
    id: "moss-ttsd-1.0",
    name: "MOSS TTSD",
    kind: "dialogue-speech",
    tier: "paid",
    description: "多人对话语音合成",
    price: "¥2 / 万字符",
    status: "locked",
  },
  {
    id: "moss-voice-generator-1.0",
    name: "MOSS Voice Design",
    kind: "voice",
    tier: "paid",
    description: "用文字描述设计声音",
    price: "¥2 / 万字符",
    status: "locked",
  },
  {
    id: "moss-transcribe-1.0",
    name: "MOSS Transcribe",
    kind: "transcribe",
    tier: "paid",
    description: "音频转写",
    price: "¥0.80 / 小时",
    status: "locked",
  },
  {
    id: "moss-transcribe-diarize-pro",
    name: "MOSS Diarize Pro",
    kind: "transcribe",
    tier: "paid",
    description: "区分说话人的多人转写",
    price: "¥2 / 小时",
    status: "locked",
  },
];
export function selectModel(id, kind, paid = false) {
  const model = models.find((m) => m.id === id);
  if (!model || (kind && model.kind !== kind))
    throw Object.assign(new Error("模型或能力不受支持。"), {
      status: 400,
      code: "INVALID_MODEL",
    });
  if (model.tier === "paid" && !paid)
    throw Object.assign(
      new Error("付费模型已由服务端关闭，不会向 MOSS 发起收费请求。"),
      { status: 403, code: "PAID_DISABLED" },
    );
  return model;
}
