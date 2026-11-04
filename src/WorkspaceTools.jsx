import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {Sparkles,LoaderCircle,ArrowUpRight,Download,Copy,Image as ImageIcon,Plus,ScanEye,Upload,RefreshCw,ShieldCheck,LockKeyhole,AudioLines,Volume2} from "lucide-react";
import {api,post,read,save} from "./workspace.js";
import PaidTools from "./PaidTools.jsx";
import {nativeTools,getTools,subscribeTools} from "./native-tools.js";
export {default as ImageStudio} from "./ImageStudio.jsx";
export function VisionStudio({ onError }) {
  const [file, setFile] = useState(null),
    [url, setUrl] = useState(""),
    [prompt, setPrompt] = useState(
      "请描述这张图片的主要内容，并指出值得注意的细节。",
    ),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState("");
  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    onError("");
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("prompt", prompt);
      const data = await api("/vision", { method: "POST", body });
      setResult(
        (data.output || [])
          .flatMap((o) => o.content || [])
          .filter((c) => c.type === "output_text")
          .map((c) => c.text)
          .join("\n") || "模型未返回文字。",
      );
    } catch (e) {
      onError(e.message,e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="alert warning">
        <span>
          上游状态：MOSS VL
          当前返回“模型版本不存在”。可以保留此入口等待恢复，或使用实时对话中的摄像头理解画面。
        </span>
      </div>
      <div className="studio-layout">
        <form className="studio-form" onSubmit={submit}>
          <div className="studio-title">
            <ScanEye size={20} />
            <h2>理解一张图片</h2>
          </div>
          <label className="upload-area" htmlFor="vision-file">
            {url ? (
              <img src={url} alt="待分析图片" />
            ) : (
              <>
                <Upload size={26} />
                <strong>选择一张图片</strong>
                <span>JPG / PNG / WebP · 最大 20 MB</span>
              </>
            )}
            <input
              id="vision-file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f?.size > 20 * 1024 * 1024) {
                  onError("图片不能超过 20 MB。");
                  e.target.value = "";
                  return;
                }
                setFile(f);
              }}
            />
          </label>
          <label htmlFor="vision-prompt">
            想了解什么？
            <textarea
              id="vision-prompt"
              maxLength={4000}
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </label>
          <button
            className="button primary wide"
            disabled={busy || !file || !prompt.trim()}
          >
            {busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <RefreshCw size={18} />
            )}{" "}
            {busy ? "正在请求" : "重试上游视觉模型"}
          </button>
          <p className="field-hint">
            点击后才会上传图片到 MOSS，任务完成后尝试删除临时上传文件。
          </p>
        </form>
        <section className="vision-result">
          {result ? (
            <>
              <h3>理解结果</h3>
              <p>{result}</p>
            </>
          ) : (
            <div className="empty-large">
              <ScanEye size={38} />
              <h2>在这里读懂画面</h2>
              <p>模型恢复后，可以提取文字、识别物品或描述场景。</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
export function Models({ catalog, stats, onRefresh }) {
  const [tier, setTier] = useState("free");
  const directState=useSyncExternalStore(subscribeTools,getTools,getTools);
  const unlocked=nativeTools()&&directState.paidUnlocked;
  return (
    <>
      <div className="cost-overview">
        <div>
          <ShieldCheck size={28} />
          <span>
            <strong>默认使用免费模型</strong>
            <small>
              付费需单独输入密码解锁 · 只在手动选择后调用 · 不自动充值
            </small>
          </span>
        </div>
        <button className="button subtle" onClick={onRefresh}>
          <RefreshCw size={16} />
          刷新
        </button>
      </div>
      <div className="model-filter">
        <button
          className={tier === "free" ? "selected" : ""}
          onClick={() => setTier("free")}
        >
          限时免费
          <span>
            {catalog?.models.filter((m) => m.tier === "free").length || 0}
          </span>
        </button>
        <button
          className={tier === "paid" ? "selected" : ""}
          onClick={() => setTier("paid")}
        >
          付费能力 {unlocked?'· 已解锁':'· 密码解锁'}
          <LockKeyhole size={14} />
        </button>
        <a
          href="https://platform.moss.cn/en/docs/models/"
          target="_blank"
          rel="noreferrer"
        >
          官方目录
          <ArrowUpRight size={14} />
        </a>
      </div>
      {tier === "paid" && <PaidTools unlocked={unlocked}/>}
      <div className="model-grid">
        {catalog?.models
          .filter((m) => m.tier === tier)
          .map((m) => (
            <article
              className={`model-card ${tier === "paid" && !unlocked ? "paid-card" : ""}`}
              key={m.id}
            >
              <div className="model-card-top">
                <span className="model-card-icon">
                  {m.kind === "live" ? (
                    <AudioLines />
                  ) : m.kind === "image" ? (
                    <ImageIcon />
                  ) : tier === "paid" ? (
                    <Volume2 />
                  ) : (
                    <ScanEye />
                  )}
                </span>
                <span className={`model-state ${m.status}`}>
                  {
                    {
                      verified: "已实测",
                      documented: "官方目录",
                      unavailable: "上游不可用",
                      locked: unlocked?"付费已解锁":"付费需密码",
                    }[m.status]
                  }
                </span>
              </div>
              <h3>{m.name}</h3>
              <code>{m.id}</code>
              <p>{m.description}</p>
              {m.note && <small>{m.note}</small>}
              <div className="model-price">
                <strong>{m.price}</strong>
                {tier === "paid" ? (
                  <LockKeyhole size={15} />
                ) : (
                  <span>0 积分 / 官方限免</span>
                )}
              </div>
            </article>
          ))}
      </div>
      <p className="field-hint">
        目录核对日期：{catalog?.verifiedAt}
        。限免随平台政策变化，使用前可核对官方费用；本服务没有账号余额查询权限，不显示估算余额。未知价格的模型不自动开放。
      </p>
      {stats && (
        <div className="stats-bar">
          <div>
            <strong>{stats.nativeDirect?'—':stats.liveSessions}</strong>
            <span>实时会话</span>
          </div>
          <div>
            <strong>{stats.nativeDirect?'—':Math.round(stats.liveSeconds / 60)}</strong>
            <span>实时累计分钟</span>
          </div>
          <div>
            <strong>{stats.images}</strong>
            <span>成功生成图片</span>
          </div>
          <div>
            <strong>
              {stats.success} / {stats.failed}
            </strong>
            <span>HTTP 成功 / 失败</span>
          </div>
          <p>
            {stats.nativeDirect?'本机直连工具统计，当前进程':'网页兼容工具统计，含维护测试'}
            <br />自 {new Date(stats.since).toLocaleDateString("zh-CN")}{" "}
            起，非平台账单；不含 APP 直连通话
          </p>
        </div>
      )}

    </>
  );
}
