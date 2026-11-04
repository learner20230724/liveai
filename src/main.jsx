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
import {prepareBrowserDirect} from './browser-direct.js';
import {conversationProfile} from './conversation.js';
import { LiveSession } from "./live";
import { nativeShell, notifyNativeReady, nativeDirect } from "./native";
import MobileApp from "./MobileApp";
import {api,post,read,save,download,presets} from "./workspace.js";
import {ImageStudio,VisionStudio,Models} from "./WorkspaceTools.jsx";
import { version as webVersion } from "../package.json";
import "./style.css";

const sections = [
  ["live", "实时对话", AudioLines],
  ["images", "图像工作室", ImageIcon],
  ["vision", "视觉理解", ScanEye],
  ["models", "模型与费用", Layers3],
  ["history", "对话记录", History],
];
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
  const [profile]=useState(()=>conversationProfile(read));
  const [section, setSection] = useState("live"),
    [auth, setAuth] = useState(null),
    [password, setPassword] = useState(""),
    [logging, setLogging] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [catalog, setCatalog] = useState(null),
    [menu, setMenu] = useState(false);
  const [phase, setPhase] = useState("idle"),
    [preset, setPreset] = useState(profile.preset),
    [prompt, setPrompt] = useState(profile.prompt),
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
    [pendingMedia, setPendingMedia] = useState(""),
    [networkBusy,setNetworkBusy] = useState(false);
  const [directReady,setDirectReady]=useState(false);
  useEffect(()=>{if(auth)prepareBrowserDirect().then(setDirectReady)},[auth]);
  const engine = useRef(null),
    lines = useRef([]),
    began = useRef(0),
    lastInput = useRef(""),
    scroll = useRef(null),
    drafts=useRef({}),
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
  useEffect(() => { if (auth !== null) notifyNativeReady(); }, [auth]);
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
      behavior: "instant",
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
    window.addEventListener("liveai:native-pause", handler);
    return () => { window.removeEventListener("pagehide", handler); window.removeEventListener("liveai:native-pause", handler); };
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
      if(drafts.current.assistant)addLine("assistant",drafts.current.assistant,drafts.current.key||crypto.randomUUID());
      if(drafts.current.user)addLine("user",drafts.current.user,"u-"+ ++lastInput.current);
      drafts.current={};
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
    const d=m.data||{},key=`a-${d.run_id||"current"}-${d.turn_id||"current"}`;
    if(m.action==="input.transcript.updated"){drafts.current.user=d.text||"";setDraft(old=>({...old,user:d.text||""}));}
    if(m.action==="input.transcript.done"){
      addLine("user",d.text||drafts.current.user,"u-"+ ++lastInput.current);drafts.current.user="";setDraft(old=>({...old,user:""}));
    }
    if(m.action==="output.transcript.updated"){
      drafts.current.assistant=d.text||drafts.current.assistant||"";drafts.current.key=key;setDraft(old=>({...old,assistant:drafts.current.assistant}));
    }
    if(m.action==="output.transcript.done"||m.action==="response.interrupted"){
      const text=d.text||(drafts.current.key===key?drafts.current.assistant:"");
      addLine("assistant",text+(text&&m.action==="response.interrupted"?"（已打断）":""),key);
      drafts.current.assistant="";setDraft(old=>({...old,assistant:""}));
    }
    if(m.action==="response.ended"&&drafts.current.assistant){
      addLine("assistant",drafts.current.assistant,drafts.current.key);drafts.current.assistant="";setDraft(old=>({...old,assistant:""}));
    }
  }
  async function start() {
    if (connected) return;
    setError("");
    setTranscript([]);
    setDraft({});drafts.current={};
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
      onNetwork:setNetworkBusy,
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

            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
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
          {!nativeShell() && <a href="/liveai/downloads/liveai-latest.apk">下载 Android APP<Download size={15}/></a>}
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
              {directReady?"官网直连":"未连接"}
            </span>
            {!directReady&&<a className="button subtle" href="/liveai/direct-install.html" target="_blank" rel="noreferrer">安装直连扩展</a>}
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
                        ? "查看可用模型与价格。"
                        : "查看和导出实时对话。"}
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
                  LiveAI
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
                          onChange={(e) => {setPrompt(e.target.value);setPreset("custom");save("preset","custom");save("prompt",e.target.value)}}
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
                              save("preset",key);save("prompt",p.prompt);
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
                                : (presets[preset]?.description||"按你的设置开始对话。")}
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
                            {(!nativeShell() || navigator.mediaDevices?.getDisplayMedia) && <button
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
                            </button>}
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
                      {nativeShell() && !navigator.mediaDevices?.getDisplayMedia && <p className="native-capability">APP 支持语音和摄像头；屏幕共享请在电脑浏览器使用。</p>}
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
              LiveAI · 网页 {webVersion}{nativeShell() ? " · 关闭后重开获取页面更新" : " · Powered by MOSS"}
            </span>
            <span>

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
createRoot(document.getElementById("root")).render(nativeDirect() ? <MobileApp /> : <App />);
