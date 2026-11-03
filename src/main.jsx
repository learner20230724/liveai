import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AudioLines,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  PhoneOff,
  ArrowUpRight,
  ArrowRight,
  LockKeyhole,
  LogOut,
  Image as ImageIcon,
  ScanEye,
  Layers3,
  Download,
  RefreshCw,
  Copy,
  Check,
  SlidersHorizontal,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  History,
  Plus,
  Trash2,
  X,
  LoaderCircle,
  Headphones,
  ChevronRight,
  Upload,
  Volume2,
  Menu,
} from "lucide-react";
import { LiveSession } from "./live";
import "./style.css";

const API = "/liveai/api";
const presets = {
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
const sections = [
  ["live", "实时对话", AudioLines],
  ["images", "图像工作室", ImageIcon],
  ["vision", "视觉理解", ScanEye],
  ["models", "模型与费用", Layers3],
  ["history", "对话记录", History],
];
async function api(path, options = {}) {
  const r = await fetch(API + path, { cache: "no-store", ...options });
  const data = await r.json();
  if (!r.ok)
    throw Object.assign(new Error(data.error || "请求失败，请稍后重试。"), {
      status: r.status,
      code: data.code,
    });
  return data;
}
const post = (path, body) =>
  api(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem("liveai." + key)) ?? fallback;
  } catch {
    return fallback;
  }
};
function save(key, value) {
  try {
    localStorage.setItem("liveai." + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
function download(text, name, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function IconButton({ icon: Icon, label, ...props }) {
  return (
    <button className="icon-button" aria-label={label} title={label} {...props}>
      <Icon size={18} />
    </button>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <Activity size={23} />
      </span>
      <span>
        Live<span className="brand-ai">AI</span>
        <small>THE MOSS WORKSPACE</small>
      </span>
    </div>
  );
}
function App() {
  const [section, setSection] = useState("live"),
    [auth, setAuth] = useState(null),
    [password, setPassword] = useState(""),
    [logging, setLogging] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [catalog, setCatalog] = useState(null),
    [menu, setMenu] = useState(false);
  const [phase, setPhase] = useState("idle"),
    [preset, setPreset] = useState("daily"),
    [prompt, setPrompt] = useState(() => read("prompt", presets.daily.prompt)),
    [settings, setSettings] = useState(false),
    [muted, setMuted] = useState(false),
    [level, setLevel] = useState(0),
    [media, setMedia] = useState({}),
    [transcript, setTranscript] = useState([]),
    [draft, setDraft] = useState({}),
    [records, setRecords] = useState(() => read("history", [])),
    [selectedRecord, setSelectedRecord] = useState(null),
    [seconds, setSeconds] = useState(0),
    [stats, setStats] = useState(null),
    [pendingMedia, setPendingMedia] = useState("");
  const engine = useRef(null),
    lines = useRef([]),
    began = useRef(0),
    lastInput = useRef(""),
    scroll = useRef(null),
    phaseRef = useRef("idle");
  phaseRef.current = phase;
  const connected = phase !== "idle";
  const load = () =>
    Promise.all([
      api("/models").then(setCatalog),
      api("/stats").then(setStats),
    ]);
  useEffect(() => {
    api("/session")
      .then((data) => {
        setAuth(data.authenticated);
        if (data.authenticated) load().catch((e) => setError(e.message));
      })
      .catch((e) => {
        setAuth(false);
        setError(e.message);
      });
    return () => engine.current?.stop();
  }, []);
  useEffect(() => {
    if (!auth) return;
    let active = true;
    async function check() {
      if (document.visibilityState !== "visible") return;
      try {
        const data = await api("/session");
        if (active && !data.authenticated) {
          engine.current?.stop();
          setAuth(false);
          setError("登录已过期，请重新输入共享密码。");
        }
      } catch {}
    }
    const interval = setInterval(check, 60000);
    document.addEventListener("visibilitychange", check);
    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
    };
  }, [auth]);
  useEffect(() => {
    if (!connected) return;
    const timer = setInterval(
      () => setSeconds(Math.floor((Date.now() - began.current) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [connected]);
  useEffect(() => {
    scroll.current?.scrollTo({
      top: scroll.current.scrollHeight,
      behavior: "smooth",
    });
  }, [transcript, draft]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const handler = () => {
      engine.current?.stop();
    };
    window.addEventListener("pagehide", handler);
    return () => window.removeEventListener("pagehide", handler);
  }, []);
  async function login(e) {
    e.preventDefault();
    setLogging(true);
    setError("");
    try {
      await post("/login", { password });
      setPassword("");
      setAuth(true);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setLogging(false);
    }
  }
  async function logout() {
    engine.current?.stop();
    try {
      await post("/logout", {});
      setAuth(false);
      setCatalog(null);
      setStats(null);
      setTranscript([]);
      setDraft({});
    } catch (e) {
      setError(e.message);
    }
  }
  function handleState(value) {
    setPhase(value);
    if (value === "idle" && began.current) {
      const duration = Math.floor((Date.now() - began.current) / 1000);
      if (lines.current.length) {
        const entry = {
          id: crypto.randomUUID(),
          at: new Date(began.current).toISOString(),
          duration,
          preset: preset,
          title:
            lines.current.find((l) => l.role === "user")?.text.slice(0, 32) ||
            "实时对话",
          lines: [...lines.current],
        };
        setRecords((old) => {
          const next = [entry, ...old].slice(0, 60);
          if (!save("history", next))
            setError("当前浏览器存储已满，本次记录未保存，请导出文字。");
          return next;
        });
      }
      began.current = 0;
      setDraft({});
      api("/stats")
        .then(setStats)
        .catch(() => {});
    }
  }
  function addLine(role, text, id) {
    if (!text) return;
    const exists = lines.current.findIndex((x) => x.id === id);
    const line = { id, role, text, at: new Date().toISOString() };
    if (exists >= 0) lines.current[exists] = line;
    else lines.current.push(line);
    setTranscript([...lines.current]);
  }
  function event(m) {
    const d = m.data || {};
    if (m.action === "input.transcript.updated")
      setDraft((old) => ({ ...old, user: d.text }));
    if (m.action === "input.transcript.done") {
      addLine("user", d.text, "u-" + ++lastInput.current);
      setDraft((old) => ({ ...old, user: "" }));
    }
    if (m.action === "output.transcript.updated")
      setDraft((old) => ({ ...old, assistant: d.text }));
    if (m.action === "output.transcript.done") {
      addLine("assistant", d.text, `a-${d.run_id}-${d.turn_id}`);
      setDraft((old) => ({ ...old, assistant: "" }));
    }
    if (m.action === "response.interrupted") {
      if (d.text)
        addLine(
          "assistant",
          d.text + "（已打断）",
          `a-${d.run_id}-${d.turn_id}`,
        );
      setDraft((old) => ({ ...old, assistant: "" }));
    }
  }
  async function start() {
    if (connected) return;
    setError("");
    setTranscript([]);
    setDraft({});
    setMuted(false);
    lines.current = [];
    lastInput.current = 0;
    began.current = Date.now();
    setSeconds(0);
    save("prompt", prompt);
    const session = new LiveSession({
      onState: handleState,
      onEvent: event,
      onError: setError,
      onMedia: (source, stream) =>
        setMedia((old) => ({ ...old, [source]: stream })),
      onLevel: setLevel,
    });
    engine.current = session;
    await session.start(prompt);
  }
  async function toggleMedia(source) {
    setError("");
    if (media[source]) {
      engine.current?.disableMedia(source);
      return;
    }
    setPendingMedia(source);
    try {
      await engine.current.enableMedia(source);
    } catch (e) {
      setError(
        e.name === "NotAllowedError"
          ? "画面权限未获允许或分享已取消，可以继续语音对话。"
          : e.message,
      );
    } finally {
      setPendingMedia("");
    }
  }
  function navigate(id) {
    setSection(id);
    setMenu(false);
    setError("");
    setSelectedRecord(null);
  }
  function exportLines(items = transcript) {
    download(
      items
        .map((l) => `${l.role === "user" ? "我" : "LiveAI"}：${l.text}`)
        .join("\n\n"),
      `LiveAI-${new Date().toISOString().slice(0, 10)}.txt`,
    );
  }
  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? "mobile-open" : ""}`}>
        <Brand />
        <div className="sidebar-caption">工作空间</div>
        <nav>
          {sections.map(([id, name, Icon]) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={section === id ? "active" : ""}
            >
              <Icon size={19} />
              <span>{name}</span>
              {id === "live" && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="free-note">
            <ShieldCheck size={19} />
            <div>
              <strong>免费模式已开启</strong>
              <span>付费请求由服务端关闭</span>
            </div>
          </div>
          <a
            href="https://platform.moss.cn/en/docs/models/"
            target="_blank"
            rel="noreferrer"
          >
            MOSS 官方文档
            <ArrowUpRight size={15} />
          </a>
          <a href="https://guihualab.cn/">
            返回规划 Lab
            <ArrowUpRight size={15} />
          </a>
          <div className="sidebar-footer">
            <span className="tiny-logo">L</span>
            <div>
              <strong>个人工作台</strong>
              <small>{auth ? "已解锁 · 仅本人使用" : "受密码保护"}</small>
            </div>
            {auth && (
              <IconButton icon={LogOut} label="锁定工作台" onClick={logout} />
            )}
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="menu-shade"
          aria-label="关闭菜单"
          onClick={() => setMenu(false)}
        />
      )}
      <main>
        <header className="topbar">
          <div>
            <button
              className="mobile-menu icon-button"
              aria-label="打开菜单"
              onClick={() => setMenu(true)}
            >
              <Menu size={21} />
            </button>
            <span>工作空间</span>
            <ChevronRight size={14} />
            <strong>{sections.find((s) => s[0] === section)[1]}</strong>
          </div>
          <div className="topbar-right">
            <span className="top-status">
              <i />
              MOSS API
            </span>
            <span className="beta">BETA</span>
          </div>
        </header>
        <div className="workspace">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {section === "live"
                  ? "REALTIME INTELLIGENCE"
                  : section === "images"
                    ? "IMAGE STUDIO"
                    : section === "vision"
                      ? "VISUAL UNDERSTANDING"
                      : section === "models"
                        ? "MODELS & PRICING"
                        : "YOUR CONVERSATIONS"}
              </div>
              <h1>
                {section === "live"
                  ? "让对话，自然发生。"
                  : section === "images"
                    ? "把想象，变成画面。"
                    : section === "vision"
                      ? "看见细节，理解更多。"
                      : section === "models"
                        ? "每一种能力，费用清楚。"
                        : "值得留下的对话。"}
              </h1>
              <p>
                {section === "live"
                  ? "开口交流，分享眼前的世界。LiveAI 会听，也会看。"
                  : section === "images"
                    ? "用 MOSS Image 创作图像，探索构图、色彩和文字。"
                    : section === "vision"
                      ? "上传图片，提问并获取对画面的理解。"
                      : section === "models"
                        ? "免费与付费独立展示，绝不自动切换收费模型。"
                        : "对话文字只保存在当前浏览器，可随时导出或删除。"}
              </p>
            </div>
            {auth && section === "live" && (
              <button
                className="button subtle"
                onClick={() => {
                  setSettings(!settings);
                }}
              >
                <SlidersHorizontal size={16} />
                对话设置
              </button>
            )}
          </div>
          {connected && section !== "live" && (
            <div className="ongoing-call">
              <span>
                <span className="status-dot on" />
                实时对话进行中 · {time}
              </span>
              <button
                className="button subtle"
                onClick={() => navigate("live")}
              >
                返回对话
              </button>
              <button
                className="button subtle"
                onClick={() => engine.current?.stop()}
              >
                <PhoneOff size={15} />
                结束
              </button>
            </div>
          )}
          {error && (
            <div className="alert error" role="alert">
              <span>{error}</span>
              <button aria-label="关闭错误" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="toast" role="status">
              <Check size={16} />
              {notice}
            </div>
          )}
          {auth === null ? (
            <div className="loading">
              <LoaderCircle className="spin" />
              正在检查访问权限…
            </div>
          ) : !auth ? (
            <section className="login-card">
              <div className="login-art">
                <div className="orb login-orb">
                  <AudioLines size={52} />
                </div>
                <span className="pill">
                  <i />
                  MOSS LIVE · 限时免费
                </span>
                <h2>一个入口，连接感知与创作。</h2>
                <p>实时语音 · 摄像头 · 屏幕共享 · 图像生成</p>
              </div>
              <form onSubmit={login}>
                <span className="login-lock">
                  <LockKeyhole size={26} />
                </span>
                <h2>解锁你的 AI 工作台</h2>
                <p>
                  使用规划 Lab 的共享密码进入。
                  <br />
                  API 密钥已在服务端安全配置。
                </p>
                <label htmlFor="password">访问密码</label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="输入规划 Lab 共享密码"
                  maxLength={128}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  className="button primary"
                  disabled={logging || !password}
                >
                  {logging ? (
                    <LoaderCircle className="spin" size={18} />
                  ) : (
                    <ArrowRight size={18} />
                  )}{" "}
                  {logging ? "正在验证" : "解锁工作台"}
                </button>
                <small>
                  <ShieldCheck size={14} />
                  付费模型默认锁定，免费功能不会自动转收费。
                </small>
              </form>
            </section>
          ) : (
            <>
              {section === "live" && (
                <>
                  {settings && (
                    <section className="settings-panel">
                      <div>
                        <h3>让 LiveAI 更懂你</h3>
                        <p>设置将在下次开始对话时生效。</p>
                      </div>
                      <label htmlFor="persona">
                        助手角色与回复偏好
                        <textarea
                          id="persona"
                          maxLength={8000}
                          rows={3}
                          value={prompt}
                          onChange={(e) => setPrompt(e.target.value)}
                          disabled={connected}
                        />
                      </label>
                      <IconButton
                        icon={X}
                        label="关闭对话设置"
                        onClick={() => setSettings(false)}
                      />
                    </section>
                  )}
                  <div className="live-layout">
                    <section className="live-card">
                      <div className="card-top">
                        <div className="model-label">
                          <span className="model-avatar">
                            <Activity size={17} />
                          </span>
                          <div>
                            <strong>MOSS Live</strong>
                            <small>moss-live-1.0</small>
                          </div>
                        </div>
                        <span className="pill">
                          <i />
                          限时免费
                        </span>
                      </div>
                      <div
                        className="preset-tabs"
                        role="group"
                        aria-label="对话场景"
                      >
                        {Object.entries(presets).map(([key, p]) => (
                          <button
                            key={key}
                            className={preset === key ? "selected" : ""}
                            disabled={connected}
                            onClick={() => {
                              setPreset(key);
                              setPrompt(p.prompt);
                            }}
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                      <div
                        className={`live-stage ${Object.values(media).some(Boolean) ? "has-video" : ""}`}
                      >
                        {Object.values(media).some(Boolean) ? (
                          <div className="media-grid">
                            {["camera", "screen"].map(
                              (s) =>
                                media[s] && (
                                  <MediaPreview
                                    key={s}
                                    stream={media[s]}
                                    title={
                                      s === "camera" ? "摄像头" : "屏幕共享"
                                    }
                                  />
                                ),
                            )}
                          </div>
                        ) : (
                          <>
                            <div
                              className={`orb-wrap ${connected ? "is-live" : ""}`}
                              style={{ "--level": level }}
                            >
                              <div className="orb-ring ring-one" />
                              <div className="orb-ring ring-two" />
                              <div
                                className={`orb ${phase === "speaking" ? "speaking" : ""}`}
                              >
                                <AudioLines size={56} strokeWidth={1.6} />
                              </div>
                              <span className="orb-spark spark-one" />
                              <span className="orb-spark spark-two" />
                            </div>
                            <h2>
                              {phase === "connecting"
                                ? "正在连接 LiveAI…"
                                : phase === "speaking"
                                  ? "LiveAI 正在回应"
                                  : connected
                                    ? muted
                                      ? "麦克风已静音"
                                      : "我在听，请说吧。"
                                    : "你的声音，就是开始。"}
                            </h2>
                            <p>
                              {connected
                                ? "你可以随时开口打断，自然接着聊。"
                                : presets[preset].description}
                            </p>
                          </>
                        )}
                        {connected && (
                          <span className="call-timer">
                            <i />
                            {time}
                          </span>
                        )}
                      </div>
                      <div className="call-controls">
                        {connected ? (
                          <>
                            <button
                              className={`control ${muted ? "off" : ""}`}
                              onClick={() => {
                                engine.current.mute(!muted);
                                setMuted(!muted);
                              }}
                            >
                              {muted ? <MicOff size={21} /> : <Mic size={21} />}
                              <span>{muted ? "取消静音" : "静音"}</span>
                            </button>
                            <button
                              className={`control ${media.camera ? "enabled" : ""}`}
                              disabled={
                                phase === "connecting" || !!pendingMedia
                              }
                              onClick={() => toggleMedia("camera")}
                            >
                              {pendingMedia === "camera" ? (
                                <LoaderCircle className="spin" size={21} />
                              ) : (
                                <Video size={21} />
                              )}
                              <span>
                                {media.camera ? "关闭摄像头" : "摄像头"}
                              </span>
                            </button>
                            <button
                              className={`control screen-control ${media.screen ? "enabled" : ""}`}
                              disabled={
                                phase === "connecting" || !!pendingMedia
                              }
                              onClick={() => toggleMedia("screen")}
                            >
                              {pendingMedia === "screen" ? (
                                <LoaderCircle className="spin" size={21} />
                              ) : (
                                <Monitor size={21} />
                              )}
                              <span>
                                {media.screen ? "停止共享" : "共享屏幕"}
                              </span>
                            </button>
                            <button
                              className="control hangup"
                              onClick={() => engine.current?.stop()}
                            >
                              <PhoneOff size={21} />
                              <span>结束对话</span>
                            </button>
                          </>
                        ) : (
                          <button
                            className="button primary start-call"
                            onClick={start}
                            disabled={!prompt.trim()}
                          >
                            <Mic size={20} />
                            开始实时对话
                            <ArrowRight size={17} />
                          </button>
                        )}
                      </div>
                      <div className="stage-foot">
                        <LockKeyhole size={12} />
                        {connected
                          ? "会话已连接 · 结束对话将释放所有设备"
                          : "仅在你开始对话后，才使用麦克风和画面"}
                      </div>
                    </section>
                    <section className="transcript-card">
                      <div className="transcript-head">
                        <div>
                          <MessageSquare size={17} />
                          <h3>实时对话</h3>
                        </div>
                        <IconButton
                          icon={Download}
                          label="导出对话文字"
                          disabled={!transcript.length}
                          onClick={() => exportLines()}
                        />
                      </div>
                      <div className="transcript-scroll" ref={scroll}>
                        {!transcript.length &&
                        !draft.user &&
                        !draft.assistant ? (
                          <div className="empty-transcript">
                            <span>
                              <MessageSquare size={27} />
                            </span>
                            <h3>听见，也看见。</h3>
                            <p>
                              对话开始后，文字会出现在这里。
                              <br />
                              不用打字，也能自在交流。
                            </p>
                            <div className="sample-question">
                              “带我练习一段英语口语。”
                            </div>
                            <div className="sample-question">
                              “帮我看看眼前这个东西。”
                            </div>
                          </div>
                        ) : (
                          <>
                            {transcript.map((l) => (
                              <TranscriptLine key={l.id} line={l} />
                            ))}
                            {draft.user && (
                              <TranscriptLine
                                line={{ role: "user", text: draft.user }}
                                pending
                              />
                            )}
                            {draft.assistant && (
                              <TranscriptLine
                                line={{
                                  role: "assistant",
                                  text: draft.assistant,
                                }}
                                pending
                              />
                            )}
                          </>
                        )}
                      </div>
                      <div className="transcript-foot">
                        <span
                          className={`status-dot ${connected ? "on" : ""}`}
                        />
                        {connected ? "正在进行 · 文字实时更新" : "等待开始对话"}
                        <span>记录仅保存在本机浏览器</span>
                      </div>
                    </section>
                  </div>
                  <div className="feature-row">
                    {[
                      [
                        Headphones,
                        "像聊天一样自然",
                        "双向语音，支持随时打断。",
                      ],
                      [Video, "分享你看到的", "摄像头或屏幕，按需开启。"],
                      [
                        ShieldCheck,
                        "费用始终可控",
                        "免费模式，不会转用付费模型。",
                      ],
                    ].map(([Icon, title, desc]) => (
                      <div key={title}>
                        <span>
                          <Icon size={20} />
                        </span>
                        <div>
                          <h3>{title}</h3>
                          <p>{desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {section === "images" && (
                <ImageStudio onError={setError} onNotice={setNotice} />
              )}
              {section === "vision" && <VisionStudio onError={setError} />}
              {section === "models" && (
                <Models
                  catalog={catalog}
                  stats={stats}
                  onRefresh={() =>
                    load()
                      .then(() => setNotice("信息已刷新"))
                      .catch((e) => setError(e.message))
                  }
                />
              )}
              {section === "history" && (
                <section className="history-panel">
                  {selectedRecord ? (
                    <>
                      <div className="history-top">
                        <button
                          className="button subtle"
                          onClick={() => setSelectedRecord(null)}
                        >
                          返回记录
                        </button>
                        <button
                          className="button subtle"
                          onClick={() => exportLines(selectedRecord.lines)}
                        >
                          <Download size={16} />
                          导出文字
                        </button>
                      </div>
                      <h2>{selectedRecord.title}</h2>
                      <p className="muted">
                        {new Date(selectedRecord.at).toLocaleString("zh-CN")}
                      </p>
                      {selectedRecord.lines.map((l) => (
                        <TranscriptLine key={l.id} line={l} />
                      ))}
                    </>
                  ) : records.length ? (
                    <>
                      {records.map((r) => (
                        <div className="history-row" key={r.id}>
                          <button onClick={() => setSelectedRecord(r)}>
                            <span className="history-icon">
                              <MessageSquare size={20} />
                            </span>
                            <div>
                              <strong>{r.title}</strong>
                              <small>
                                {new Date(r.at).toLocaleString("zh-CN")} ·{" "}
                                {r.lines.length} 条文字 ·{" "}
                                {Math.floor(r.duration / 60)}分{r.duration % 60}
                                秒
                              </small>
                            </div>
                            <ChevronRight size={17} />
                          </button>
                          <IconButton
                            icon={Trash2}
                            label="删除此条记录"
                            onClick={() => {
                              if (!window.confirm("删除这条浏览器本地记录？"))
                                return;
                              const next = records.filter((x) => x.id !== r.id);
                              setRecords(next);
                              save("history", next);
                            }}
                          />
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="empty-large">
                      <History size={35} />
                      <h2>还没有留下的对话</h2>
                      <p>结束实时对话后，文字记录会自动出现在这里。</p>
                      <button
                        className="button primary"
                        onClick={() => navigate("live")}
                      >
                        <Plus size={16} />
                        开始一段对话
                      </button>
                    </div>
                  )}
                </section>
              )}
            </>
          )}
          <footer className="workspace-footer">
            <span>
              <Activity size={13} />
              LiveAI · Powered by MOSS
            </span>
            <span>
              限时免费政策以平台为准 ·{" "}
              <a
                href="https://platform.moss.cn/app/pricing/"
                target="_blank"
                rel="noreferrer"
              >
                查看官方费用
                <ArrowUpRight size={12} />
              </a>
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
function TranscriptLine({ line, pending }) {
  return (
    <div className={`transcript-line ${line.role}`}>
      <div className="line-meta">
        {line.role === "user" ? (
          <span className="user-avatar">我</span>
        ) : (
          <span className="assistant-avatar">
            <Activity size={12} />
          </span>
        )}
        <strong>{line.role === "user" ? "你" : "LiveAI"}</strong>
        {pending && <span className="writing">正在说话…</span>}
      </div>
      <p>{line.text}</p>
    </div>
  );
}
function MediaPreview({ stream, title }) {
  const video = useRef();
  useEffect(() => {
    const el = video.current;
    el.srcObject = stream;
    el.play().catch(() => {});
    return () => {
      el.srcObject = null;
    };
  }, [stream]);
  return (
    <div className="media-preview">
      <video ref={video} muted playsInline autoPlay />
      <span>{title} · 正在分享</span>
    </div>
  );
}
function ImageStudio({ onError, onNotice }) {
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
      onError(e.message);
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
function VisionStudio({ onError }) {
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
      onError(e.message);
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
function Models({ catalog, stats, onRefresh }) {
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
            本机服务统计，含维护测试
            <br />自 {new Date(stats.since).toLocaleDateString("zh-CN")}{" "}
            起，非平台账单
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
createRoot(document.getElementById("root")).render(<App />);
