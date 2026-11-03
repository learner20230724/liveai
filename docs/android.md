# LiveAI Android 与在线更新

下载最新正式签名 APK：[本机 IP 直链](http://42.192.115.30:8182/downloads/liveai/liveai-latest.apk) · [HTTPS 备用](https://guihualab.cn/liveai/downloads/liveai-latest.apk)。版本归档、安装包清单与 SHA-256 校验文件位于相同目录。

## 安装与使用

- 原生外壳 **1.0.1 / versionCode 2**，稳定包名 `cn.guihualab.liveai`，独立正式签名，与日序及其他 APP 可以同时安装。
- 最低 Android 8 / API 26，compile/target SDK 36。单个通用 APK，不含 ABI 专用 `.so`，兼容 ARM64 / `arm64-v8a`；面向 nubia M153，不需要拆分安装。
- 下载后在手机点击 APK，按系统提示允许该下载来源安装应用。首次打开沿用规划 Lab 共享密码解锁，密码与 MOSS 密钥均未内置到安装包。
- 点击「开始实时对话」后才申请麦克风权限；通话中开启摄像头时才申请相机权限。拒绝后可去系统设置 → LiveAI → 权限调整，再重试。
- 系统选图器用于视觉模型上传；不申请相册读取或全盘存储权限。对话文字导出使用系统文件保存窗口，图片原图使用外部 HTTPS 浏览器打开保存。
- APP 初版支持语音及摄像头。Android WebView 不支持现有网页使用的 `getDisplayMedia` 接口，APP 隐藏不可用的屏幕共享按钮，屏幕共享请使用电脑网页。未宣称已实现原生 MediaProjection。
- 切到后台或退出时结束会话并释放媒体；Android 权限确认与系统文件选择不被误当作离开会话。没有后台录音、后台保活服务或自动上传本机记录。
- 支持双指缩放，原生处理状态栏、刘海、导航栏及软键盘边距；返回键提供重新加载或退出入口。页面重载先结束媒体会话。

## 首次安装后如何更新

采用与日序相同的 **Java WebView 原生外壳 + 完整网页 ZIP OTA**。沿用日序已有模式，以最少原生依赖交付；此处没有改动日序的代码、签名、域名或更新通道。

首次安装自带完整网页资源。冷启动检查独立 HTTPS 通道 `https://guihualab.cn/liveai/app-updates/latest.json`，只接受 `liveai-stable`，校验完整 ZIP 的 SHA-256 和 `minShellVersion`。下载上限 12 MB，解压上限 32 MB，限制文件数并拒绝路径穿越。完整资源包独立解压后原子切换，不混用新旧网页资源。

保留上一健康版本。新页面通过就绪回调后才标记健康；启动 15 秒未就绪会回退，下次冷启动也会处理未确认版本。失败版本不会循环安装。断网或下载失败时继续使用上一健康版本或 APK 内置资源，不要求重装。

常规界面、交互与网页业务逻辑更新：**彻底关闭 APP，再重新打开**后检查并应用；切回前台不会强制刷新、打断输入。服务端提示词和 API 逻辑发布后由服务器直接生效。新增原生权限、插件、原生依赖或系统能力仍可能需要新 APK；沿用包名、签名并递增版本号，不要求卸载旧版。

保持 `https://guihualab.cn` 的 origin 和 `/liveai/` 路径不变，后续更新保留本 APP 的登录 Cookie、localStorage 历史和草稿。APP 与手机浏览器是独立存储容器，首次安装不会自动取得浏览器里的历史；OTA 也不等于云端同步。用户记录仍仅保存在当前容器，服务器不保存音视频或对话文字。

断网可打开内置/缓存界面；登录验证、实时 AI、图像生成和模型列表需要联网。本版不提供离线 AI。已有本机记录和草稿不会因网页版本切换而删除。

## 维护与发布

环境：Node 22.12+、JDK 21、Android SDK 36 / Build Tools 36.0.0、Gradle 8.14.3、AGP 8.13.0。原生运行时仅用 Android 平台能力，Robolectric/JUnit 仅为测试依赖。

```bash
npm ci --include=dev
# 仅首次准备本项目独立签名；存在时不替换、不重置。
python3 scripts/prepare-signing.py
npm run build:apk
npm run publish:apk
```

签名材料只放在 Git 外：`/etc/liveai/android-release.p12` 与 `/etc/liveai/android-signing-password`。可通过 `LIVEAI_KEYSTORE`、`LIVEAI_SIGNING_PASSWORD_FILE` 指定其他私有路径。不要输出、提交或打包这些文件；公开的 `android/release.json` 仅包含包名、版本与证书指纹。后续原生更新同步修改 `android/app/build.gradle` 与 `android/release.json` 的版本，不重新生成签名。

构建命令执行网页构建、完整资源打包、Android Release、Lint、原生单元测试、zipalign、正式签名和签名校验，输出 `artifacts/liveai.apk`。发布命令再次检查实际包名、版本、证书及摘要；拒绝降级和同版本换包，保留版本归档与校验文件。安装包不含服务器 API 密钥、密码、Cookie、签名私钥或用户资料。

**网页与 APP 网页资源统一发布命令：**

```bash
npm run deploy:web
```

此命令同时构建网页、运行检查、生成独立 OTA 完整包及清单，跟随同一次原子发布生效。`npm run deploy` 是同一个入口。普通页面变更不再重打 APK。`app-updates` 仅公开受检查的构建文件，`downloads` 仅公开已验证的安装包；其他 API 继续登录保护。IP 下载路径在现有 8182 Caddy 中独立配置，终端等其他路径保留原认证。

## 验证边界

已进行 APK Release 构建、Android Lint、7 项原生测试，以及网页/OTA 发布测试。原生测试覆盖同源与文档边界、非静态请求不被离线包截获、SHA-256、解压路径限制、最低外壳版本、独立通道、健康版本回退和原有草稿保留。

没有连接 nubia M153 或其他实机，不能把上述检查称作真机安装或音视频测试。实际系统/WebView 版本、ABI、权限弹窗、麦克风/扬声器、摄像头、双指缩放、系统文件选择和断网冷启动仍需设备验收。网页模拟测试也不能替代这些检查。
