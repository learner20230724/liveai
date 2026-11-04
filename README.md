# LiveAI

MOSS Live 工作台与独立 Android 客户端，包含实时语音、摄像头、图像生成、视觉理解和按需解锁的语音工具。React + 原生 Android Java/OkHttp，无需本机 GPU。

[下载 APK](http://42.192.115.30:8182/downloads/liveai/liveai-latest.apk) · [HTTPS 备用](https://guihualab.cn/liveai/downloads/liveai-latest.apk) · [网页兼容入口](https://guihualab.cn/liveai/) · [规划 Lab](https://guihualab.cn/)

## Android 3.0

同包名 `cn.guihualab.liveai`、同签名，直接覆盖安装旧版，保留本地数据。通用单 APK，不含 ABI 专用 `.so`，兼容 ARM64。原生能力变更需要本次 APK；后续页面继续完整 ZIP OTA 更新。

- 图像可连续提交，每次一张，最多 10 个同时处理、100 个待处理；独立执行池允许同时通话、上传图片和使用其他工具。任务由原生前台服务持有，切页、返回桌面或锁屏不会主动终止；系统强制停止仍会中断。
- 通过官网 `output_watermark.enabled=false` 关闭可见 AI 水印，原始 PNG 缓存在手机。点击「保存到相册」通过 Android MediaStore 写入 `Pictures/LiveAI`，不会打开浏览器，不重新编码图片。Android 10+ 不要求相册读取或全盘存储权限；Android 8/9 保存时才申请写入权限。
- 原生音视频、图像生成、图像下载、视觉文件上传/理解、声音列表、语音合成、声音设计和音频转写都由手机直接访问 `api.mosi.cn` / 官方结果域名。音视频沿用 `moss-live-1.0` 原生 WSS、真实播放头确认及耳机通话路由。
- 默认免费模型。模型页的付费区需**再次主动输入现有访问密码**，解锁当前进程 30 分钟。TTS Flash/Pro、多人对话合成、声音设计、标准/多人转写在手动选择、手动提交后才调用；不自动充值，不切换到收费模型，不自动重试收费任务。余额不足如实显示官网错误。
- 密码、运行期 API 凭据、新对话记录与图像任务记录由 Android Keystore AES-GCM 加密。公开源码、APK 和 OTA 都不内置真实密钥或密码。首次配置、主动刷新/密码验证及 OTA 使用规划 Lab，AI 数据不经其转发。
- 界面保留对话、图像、视觉、模型、记录五个入口，以及日常/口语/视觉/自定义提示词。相机离开前台暂停，语音继续。旧 localStorage 历史仍展示，新增图像任务可恢复已完成结果，中断状态不会悄悄重复提交。

**上游额度：**应用上限是 10，不代表账号的官网额度。2026-11-04 这把 Key 同时提交 10 个任务时，3 个被接收、7 个收到明确的 `concurrency_limit_exceeded`。原生/网页队列只对这种明确未受理的拒绝退避重排，收缩有效并发并在界面提示。限流重排后真实 10 个任务全部完成。超时或断线可能已经受理，故不会自动重发；付费调用不会自动重发。

## 网页与兼容性

网页继续提供免费工作台兼容模式，使用受密码保护的 Node API 和 WebSocket 中转。官网当前拒绝浏览器带 Authorization 的跨域预检，实时 WSS 又要求浏览器不能直接设置的认证头，因此完整直连、相册写入和付费工具由 APK 提供。旧版 2.x 外壳需要覆盖安装 3.0 才具备新增原生能力；没有静默改走中转的原生工具回退。

MOSS VL 的上游目前仍返回模型版本不存在；入口保留真实错误状态。MOSS VL Realtime 是独立协议，仍为目录项；本项目实时画面交互由 MOSS Live 提供。网页屏幕共享依赖浏览器支持，APP 没有原生 MediaProjection。

图像结果可能有官网链接时效：原生成功任务会先把原图缓存到手机再展示。图像任务最多保留最近 80 项（待处理任务优先保留），删除任务会删除对应私有缓存；保存到相册的副本独立保留。网页只在当前页面进程内持续执行，关闭整个浏览器不会获得 Android 后台服务能力。本机/网页计数不是账号余额或平台账单。

## 本地运行

Node 22.12+。`npm ci --include=dev`，配置 `MOSS_KEY_FILE` 指向私有文件（默认 `/etc/liveai/moss.key`），运行 `npm run build && npm start`，监听 `127.0.0.1:4260`。Vite 开发用 `npm run dev`。

认证沿用 `AUTH_BASE=http://127.0.0.1:4190` 的 `/api/share/login`、`logout`、`session`，使用原生 HTTP 适配器以兼容 fetch 禁用的端口。仓库不含默认密码或认证后门。独立部署应实现同一合同或替换认证适配器，不能无认证暴露推理或设备配置。

HTTPS 发布时剥离 `/liveai/` 前缀并保留 Origin/Cookie，设置准确的 `PUBLIC_ORIGIN`。设备配置只在认证后，将 API Key 加密给临时 RSA 公钥；付费解锁接口仅校验访问密码，实际付费请求在原生再次检查进程内授权和模型白名单。

## 验证与发布

```bash
npm ci --include=dev
npm test
npx playwright install --with-deps chromium
npm run test:ui
npm run test:android
npm run deploy:web
npm run build:apk
npm run publish:apk
```

UI 检查使用隔离的浏览器原生桥/API 模拟，不调用付费模型；GitHub CI 自动运行 Node、构建与浏览器回归。真实免费 MOSS 验证另记，不能把模拟桥、Robolectric MediaStore 检查或服务器 JVM 测试称作 M153 真机验收。

`npm run deploy:web` 同时构建、测试和发布网页/APP 资源包，保留之前五次资源和 OTA ZIP，原子切换服务并在失败时回滚。首次签名材料只在 Git 外准备，后续沿用证书；发布器校验包名、版本、证书和摘要，不允许同版本换包。

详细说明：[Android 安装与更新](docs/android.md)、[验证记录](docs/verification.md)。没有连接 M153，实际相册、锁屏/电池策略、耳机、摄像头和安装行为仍需手机验证。

## License

MIT。独立第三方客户端；模型可用性、限免、价格和账号配额以 MOSS 平台为准。
