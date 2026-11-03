import React, { useEffect, useRef, useState } from "react";
import {Sparkles,LoaderCircle,ArrowUpRight,Download,Copy,Image as ImageIcon,Plus,ScanEye,Upload,RefreshCw,ShieldCheck,LockKeyhole,AudioLines,Volume2} from "lucide-react";
import {api,post,read,save} from "./workspace.js";
export function ImageStudio({ onError, onNotice }) {
  const [prompt, setPrompt] = useState(() => read("imagePrompt", "")),
    [model, setModel] = useState("moss-image-sft-1.0"),
    [size, setSize] = useState("1024x1024"),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState(null),
    [elapsed, setElapsed] = useState(0);
  const timer = useRef(null),
    active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      clearInterval(timer.current);
    };
  }, []);
  async function generate(e) {
    e.preventDefault();
    onError("");
    setBusy(true);
    setElapsed(0);
    save("imagePrompt", prompt);
    const start = Date.now();
    timer.current = setInterval(
      () => setElapsed(Math.round((Date.now() - start) / 1000)),
      1000,
    );
    try {
      const data = await post("/images", { prompt, model, size });
      if (active.current) setResult(data);
    } catch (e) {
      onError(e.message,e);
    } finally {
      clearInterval(timer.current);
      if (active.current) setBusy(false);
    }
  }
  const examples = [
    "一张极简风格的咖啡海报，奶油色背景，深绿色中文字“慢一点，也很好”，柔和自然光，精致排版。",
    "雨后苏州的小巷，青石板路映着暖色灯光，水彩插画，安静而有生活气息。",
    "一座悬浮在云层中的玻璃温室，植物茂盛，清晨阳光，电影感构图，细节丰富。",
  ];
  return (
    <div className="studio-layout">
      <form className="studio-form" onSubmit={generate}>
        <div className="studio-title">
          <Sparkles size={20} />
          <h2>描述你的想象</h2>
          <span className="pill">限时免费</span>
        </div>
        <label htmlFor="image-prompt">
          画面描述
          <textarea
            id="image-prompt"
            rows={8}
            maxLength={4000}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="主体、场景、风格、光线…越具体，越接近想象。"
            required
          />
        </label>
        <div className="field-count">{prompt.length} / 4000</div>
        <label htmlFor="image-model">
          图像模型
          <select
            id="image-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            <option value="moss-image-sft-1.0">MOSS Image SFT · 已验证</option>
            <option value="moss-image-base-1.0">
              MOSS Image Base · 官方免费
            </option>
          </select>
        </label>
        <label htmlFor="image-size">
          画面比例
          <select
            id="image-size"
            value={size}
            onChange={(e) => setSize(e.target.value)}
          >
            <option value="1024x1024">1:1 · 1024 × 1024</option>
            <option value="1024x1536">2:3 · 1024 × 1536</option>
            <option value="1536x1024">3:2 · 1536 × 1024</option>
            <option value="512x512">1:1 · 512 × 512</option>
          </select>
        </label>
        <button
          className="button primary wide"
          disabled={busy || !prompt.trim()}
        >
          {busy ? (
            <LoaderCircle className="spin" size={18} />
          ) : (
            <Sparkles size={18} />
          )}{" "}
          {busy ? `正在创作 · ${elapsed}s` : "生成图像"}
        </button>
        <p className="field-hint">
          生成可能需要 1–2 分钟。每次一张，不自动重试。
        </p>
        <div className="example-list">
          <strong>从一点灵感开始</strong>
          {examples.map((s, i) => (
            <button
              type="button"
              key={i}
              disabled={busy}
              onClick={() => setPrompt(s)}
            >
              {["文字海报", "江南水彩", "想象建筑"][i]}
              <ArrowUpRight size={14} />
            </button>
          ))}
        </div>
      </form>
      <section className="image-result">
        {busy ? (
          <div className="empty-large">
            <div className="orb small-orb">
              <Sparkles size={30} />
            </div>
            <h2>正在把想象变成画面</h2>
            <p>已等待 {elapsed} 秒，请保持页面打开。</p>
          </div>
        ) : result ? (
          <>
            <img
              src={result.data?.[0]?.url}
              alt={prompt}
              referrerPolicy="no-referrer"
            />
            <div className="image-result-footer">
              <span>
                {result.usage?.output_width} × {result.usage?.output_height} ·
                MOSS Image
              </span>
              <a
                className="button primary"
                href={result.data?.[0]?.url}
                target="_blank"
                rel="noreferrer"
              >
                <Download size={16} />
                打开原图保存
              </a>
              <button
                className="button subtle"
                onClick={() =>
                  navigator.clipboard
                    .writeText(result.data?.[0]?.url)
                    .then(() => onNotice("图片链接已复制"))
                    .catch(() => onError("复制失败，请打开原图保存。"))
                }
              >
                <Copy size={15} />
              </button>
            </div>
            <p className="field-hint">
              平台图片链接有时效，请及时打开原图保存。
            </p>
          </>
        ) : (
          <div className="empty-large image-empty">
            <div className="image-outline">
              <ImageIcon size={43} />
              <span className="image-outline-corner">
                <Plus size={17} />
              </span>
            </div>
            <h2>下一张作品，从这里开始。</h2>
            <p>输入画面描述，让创意慢慢浮现。</p>
            <span className="pill">MOSS IMAGE · 限时免费</span>
          </div>
        )}
      </section>
    </div>
  );
}
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
  return (
    <>
      <div className="cost-overview">
        <div>
          <ShieldCheck size={28} />
          <span>
            <strong>免费通道独立运行</strong>
            <small>
              付费请求在服务端被拦截 · 不自动充值 · 不自动降级到收费模型
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
          付费能力 · 已锁定
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
      <div className="model-grid">
        {catalog?.models
          .filter((m) => m.tier === tier)
          .map((m) => (
            <article
              className={`model-card ${tier === "paid" ? "paid-card" : ""}`}
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
                      locked: "付费已锁定",
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
            <strong>{stats.liveSessions}</strong>
            <span>实时会话</span>
          </div>
          <div>
            <strong>{Math.round(stats.liveSeconds / 60)}</strong>
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
            网页中转与工具统计，含维护测试
            <br />自 {new Date(stats.since).toLocaleDateString("zh-CN")}{" "}
            起，非平台账单；不含 APP 直连通话
          </p>
        </div>
      )}
      {tier === "paid" && (
        <div className="alert warning">
          <span>
            当前没有充值，本服务的付费能力全部关闭。这里展示官方计费信息；充值不会自动解锁，需另行配置后端接入。
          </span>
        </div>
      )}
    </>
  );
}
