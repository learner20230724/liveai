# LiveAI Android 3.2 与在线更新

[IP 下载](http://42.192.115.30:8182/downloads/liveai/liveai-latest.apk) · [HTTPS 备用](https://guihualab.cn/liveai/downloads/liveai-latest.apk)

## 安装与保留数据

外壳 **3.2.0 / versionCode 6**，包名 `cn.guihualab.liveai`，沿用原证书，不要卸载旧版，直接覆盖安装。最低 API 26，compile/target 36；Java/Kotlin 通用 APK，不含 ABI 专用 `.so`，兼容 M153 的 ARM64。

本次新增原生 MediaProjection 屏幕共享和对应前台服务类型，需要覆盖更新一次 APK；原生 HTTP 直连、工具前台服务及 MediaStore 相册写入继续保留。页面、样式和提示词以后仍通过 OTA 更新，不要求每次安装。App 数据目录与 `https://guihualab.cn/liveai/` origin 保持一致，旧对话/草稿仍可见。

首次打开输入现有规划 Lab 共享密码，可勾选本机加密记住。密码和 MOSS Key 不在安装包、源码或 OTA 内。配置接口通过临时 RSA-OAEP SHA-256 公钥把运行期凭据给原生，原生用 Android Keystore AES-GCM 保存；JS 只取得是否就绪及处理结果。

## 图像并行与相册

- 可连续点击生成，每次一张；默认免费 MOSS Image SFT，可选免费 Base，保留比例、示例、任务状态、重试与移除。
- 原生 10 个图像工作线程，最多 100 个待处理任务。视觉、声音等另用 4 个线程，密码解锁和相册保存有独立通道；生成图片不会占住整个工具区。
- 官网实际账号额度可能更低。2026-11-04 实测 10 个同时请求仅 3 个被接收，7 个明确被官网并发拒绝。队列收到 `429 concurrency_limit_exceeded` 后降低有效并发，等待并重排被拒绝的请求；10 个任务最终全部完成。界面显示真实限流窗口。
- 超时/断线可能已被受理，不能自动重复生成；付费操作也不自动重复。取消本机等待不保证撤销官网已受理的工作。
- 每次请求强制 `output_watermark: {enabled:false}`，关闭官网可见 AI 水印；下载原始 PNG，不画本地标识，也不重新编码。
- 成功后先将官方原图缓存到手机私有目录，界面从本地读取。点击「保存到相册」经 `MediaStore.Images` 写入 `Pictures/LiveAI`；写入时用 pending 行，完整成功后发布，失败删除不完整条目。Android 10+ 无需相册读取/全盘存储权限，Android 8/9 在保存时才请求写入权限。不会跳转浏览器。
- 图像任务和私有结果仅保留在当前进程。下次进程启动清理旧生成缓存；已保存相册副本不删除。历史仅保留实时对话文字。

工具任务由独立 dataSync 前台服务持有局部唤醒锁，锁屏/切页不主动取消。系统强制停止、权限撤销、厂商电池策略仍能中断，Android 的前台服务时限也不能绕过。会话麦克风继续使用独立 microphone 前台服务。

## 直连范围与付费解锁

新版 APP 的实时音视频、图像生成/下载、视觉文件上传/理解、声音列表、TTS Flash/Pro、多人台词、声音设计、标准/多人转写全部由原生请求官网。固定 API 为 `https://api.mosi.cn/v1`；结果下载仅接受官方 HTTPS 域名，不把 API Key 发给 CDN。私有缓存使用同源 `native-output` URL，但由 WebView 本地拦截读取，不会向规划 Lab 请求该文件。

首次配置、主动配置刷新/密码验证、OTA 仍需规划 Lab；缓存凭据存在时普通 AI 调用不依赖其登录会话。电脑浏览器使用本地直连扩展；没有服务器 AI 中转后备，付费直连和相册写入由 APP 提供；2.x 外壳显示升级提示，不会静默把新的原生工具改走服务器。

进入「模型 → 付费能力」，再次主动输入现有访问密码可解锁当前进程 30 分钟。原生同时检查授权有效期、操作与模型白名单。付费模型选择框初始为空，只有手动选择并提交才请求；其他图像、通话、视觉仍默认免费。可立即重新锁定，已提交任务继续，新请求被阻止。没有充值、余额不足或官网权限错误如实显示，不自动充值、不改换模型、不自动重试收费请求。

TTS/多人合成可填写或读取官网声音 ID，声音设计可直接填写描述；音频结果本地播放并可另存文件。转写支持当前 20 MB 以内的音频/视频，结果可导出文字。视觉 MOSS VL 的上游不可用状态仍保留，不以付费模型替代。

## 麦克风、耳机与界面

用户在前台开始后才使用麦克风，系统申请 RECORD_AUDIO；Android 12+ 申请蓝牙/附近设备，Android 13+ 申请通知。通话设置可打开系统后台电池设置。通知栏可静音/结束，回桌面或锁屏不会主动结束原生语音。相机仅在前台开启时采集，离开前台即释放，语音继续。

录音为 VOICE_COMMUNICATION，Android 12+ 用 `setCommunicationDevice`，旧版本使用 SCO；支持可双向通话的蓝牙/BLE、USB、有线耳机，显示 `AudioRecord.getRoutedDevice()` 的真实输入。音乐 A2DP 连接本身不表示耳机麦克风可用。画面为最大 480 px / 1 fps JPEG，拥塞跳过画面优先语音；播放确认依据 AudioTrack 实际播放头。

保留底部对话、图像、视觉、模型、记录，以及口语陪练等模式。双指缩放、安全区域、软键盘、系统选图/选音频与文字导出沿用原生外壳。3.2.0 新增 Android MediaProjection 屏幕共享：通话中授权后可分享整个屏幕或单个应用，屏幕 JPEG 与语音经同一原生 MOSS WebSocket 直连。

## OTA 与维护

沿用日序的完整网页 ZIP OTA 方案：独立 HTTPS 通道 `https://guihualab.cn/liveai/app-updates/latest.json`，固定 `liveai-stable`，SHA-256、最低外壳版本、完整下载和原子切换。保留上一健康版本，启动未就绪回退，断网继续内置/上一健康页面；不提供离线 AI。

常规网页更新在结束当前通话后彻底关闭并重新打开 APP 时检查应用，切回前台不会强制刷新。包名、签名及本地数据路径不变；新增原生权限/依赖/能力仍可能需要后续外壳覆盖更新。图像/对话只存当前设备，OTA 不会自动把本机记录同步到云端；App 云备份和设备迁移备份均排除私有记录与凭据。

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

JDK 21、SDK/Build Tools 36、Gradle 8.14.3、AGP 8.13.0。首次在新环境构建需准备 Gradle/Robolectric 依赖缓存，构建脚本默认离线；本机已经具备缓存。OkHttp 4.12.0 为纯 JVM 运行依赖，Robolectric/JUnit 为测试依赖。

签名文件仍在 `/etc/liveai/android-release.p12`、`/etc/liveai/android-signing-password`，从不输出或打包。`android/release.json` 仅含公开身份元数据。发布器校验实际包名、版本、证书与摘要，拒绝降级/同版本换包，保留 IP/HTTPS 下载与版本归档；不使用临时共享区托管 APP。

## 验证边界

自动检查包括十路并发/第十一排队、图像和视觉并行、官网明确限流后的排队恢复、密码授权/模型白名单、取消与防重复、MediaStore 原图复制/失败回滚、本地音频范围读取及原有音视频服务/OTA 测试。浏览器原生桥模拟验证连续提交、其他功能、付费手动动作、无外部浏览器保存、免费默认和无 AI 中转请求。

真实免费官网测试使用生产 MossHttp 与 ImageLimiter 类在服务器 JVM 上执行：突发 10 个有 7 个被明确限流，加入排队后 10 个全部完成并下载。没有自动发送付费推理请求。服务器网络和模拟测试不能当作 M153 的网络、后台、音频或相册验收。

没有连接 M153。APK 安装/覆盖升级、真实相册条目、耳机、相机和锁屏时长仍需手机验证。证据与摘要见 [verification.md](verification.md)。

## 3.1.0 / code 5

模式指令由所选中文角色同时配置 persona 和 instructions，移除固定中文闲聊指令与英语陪练的冲突。原生不再持久保存图片任务；下一进程启动清理生成缓存，不处理 Pictures/LiveAI 中的相册导出。实时文字记录、凭据、origin 和 OTA 通道保持兼容。该原生变更需要同签名覆盖安装，页面同时通过 OTA 发布。

## 手机屏幕共享（3.2.0）

开始通话后点击「共享屏幕」，在 Android 系统框中选择整个屏幕或单个应用。切换到其他应用后继续采集；手机通过原生 OkHttp WebSocket 将 `0x02 + JPEG` 直接发送至 MOSS，截图不经过规划 Lab、JS、记录或磁盘。相机使用 `0x01`，麦克风使用 `0x00`，共用原有实时连接。

LiveCallService 在使用授权结果之前先声明 microphone|mediaProjection 前台服务类型，持有一个 MediaProjection/VirtualDisplay/ImageReader。每次新共享重新申请授权，不保存授权 token。旋转/窗口变化只调整原虚拟显示和图像 Surface，不重复消费授权。画面每秒最多一张，最长边 960、JPEG 上限 32 KiB，短暂拥塞丢画面并优先语音，两种画面都有时避免单一路持续占用队列。

APP 按钮、通话通知和系统共享指示均可停止共享；关闭整场通话同步释放采集资源。切出 APP 不停止屏幕共享，相机保持原有仅前台采集规则。锁屏会停止屏幕采集，后台语音继续；解锁后不会自动重新共享。用户取消授权或系统撤销共享不会结束语音。

自动测试包含授权取消/重复结果拒绝、前台服务提升、页面退出与其他工具使用、画面 tag/尺寸/队列/公平性、停止/锁屏/系统撤销保持语音、断线后恢复协议且不重新使用投屏授权，以及带行填充 RGBA 与真实 JPEG 编码。没有连接 M153，实际系统授权框、旋转、单应用选区和机型电源策略仍需真机验证。

Android 官方约定：[MediaProjection](https://developer.android.com/media/grow/media-projection)、[前台服务类型](https://developer.android.com/develop/background-work/services/fgs/service-types#media-projection)。

## 通话配置（3.3.0 / code7）

设置支持 0.5–2 倍播放、0–100% 音量、助手名称/别名、独立规则、语言/长度/语气、官网记忆范围、画面来源/帧率/清晰度/压缩。NativeAudio 使用 AudioTrack PlaybackParams 调速并保持 pitch=1，音量不改系统全局音量；回执仍读取实际采样播放头。Web 的 AudioBufferSource 调速会同时改变音高，不能等同于更换模型音色。会话开始时固定非播放配置，正在通话时只更新播放参数，避免重连、丢输入或切断投屏。

公开 MOSS Live 接口拒绝 voice 参数，音色保持官网默认。跨会话记忆默认关闭，开启后用固定本机 user ID 与 memory_scope=user。可选本机时间工具只读取日期/时间/时区；真实工具请求、本机结果与官网事件通过脱敏、最多 80 项的会话快照显示，不写入对话历史。未接入电脑控制、文件或 Shell 工具。

新增原生桥、播放和配置代码，需要同包名同签名的 3.3.0/code7 覆盖更新。网站及旧外壳 OTA 仍保留其他所有工作区入口；旧外壳显示更新设置能力的 APK 入口，不展示不会生效的原生设置。没有连接 M153，物理耳机/锁屏/音效仍需真机验收。
