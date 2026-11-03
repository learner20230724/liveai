# Verification — 2026-11-03

## Automated checks

`npm test`: 9 tests passed. Playback acknowledgements wait until source playback finishes; whole-turn acknowledgements wait for all chunks. Interrupted playback reports actual elapsed time and does not acknowledge cancelled queued chunks. Unknown/paid models never fall back. API authentication, Secure/HttpOnly cookie scoping, Origin checks and unauthenticated WebSocket rejection passed. Invalid sizes and model IDs made zero upstream requests.

`npm run build`: Vite production build passed. Published HTML and both JS/CSS assets returned HTTP 200 over publicly trusted HTTPS at https://guihualab.cn/liveai/. DNS resolved to the intended server. Anonymous model API returned 401. Browser login with an intentionally invalid password was rejected by the actual production authentication service. Successful authentication was tested against an isolated loopback auth fixture; the existing private-area password was neither reset nor bypassed in production.

## Real MOSS inference, browser media simulation

Chromium captured an eSpeak-generated English test phrase through its synthetic microphone device. The actual application captured/resampled PCM, authenticated its WebSocket gateway and called the real MOSS Live service:

- User transcript: “Please introduce yourself in one short sentence.”
- Model replied with a complete self-introduction in English.
- Received 60 PCM audio chunks, acknowledged all 60 after browser playback ended.
- Received `response.ended` with status `completed`.
- One initial speech segment was naturally aborted by the following speech segment; the conversation continued successfully.
- Camera enabled, then disabled; microphone mute/unmute worked. After ending, both tracks were `ended`.
- A second test ended a session with the camera still active: 3 JPEG camera frames and 139 PCM frames were transmitted; all tracks ended.
- Navigating away during a call retained a visible ongoing-call indicator and an end-call control.
- Conversation text appeared in local history and paid models appeared in a separate locked catalog.
- MOSS Image SFT generated a real 512×512 image through the browser UI.
- No browser JavaScript errors in either run.

The QA authentication adapter ran **only on loopback in an isolated process**, never on the production route, and was stopped after verification. The real MOSS API key remained server-side. Synthetic media and this fixture do not prove real microphone/speaker quality, acoustic echo cancellation, Android permission behavior or M153 hardware compatibility.

## Responsive checks

Desktop 1440×1050 and mobile 390×844 screenshots inspected. No mobile horizontal overflow; sidebar fully hidden when closed, opens from the menu and closes on navigation. Browser zoom remains enabled and safe-area padding is present. Screen-share controls use the browser's display-capture API, which depends on browser support; no real desktop screen share or physical phone was available.

The public Guihua Lab card was clicked in Chromium and opened the protected LiveAI login page. The navigation screenshot decoded successfully and the navigation also passed the 390 px overflow check. During release checks, an older hashed JS URL initially returned 404; deployment now retains assets from the previous five releases. The same old URL returned 200 after the new deployment, while anonymous API access remained rejected.

## Known upstream limitations

`GET /v1/models` authenticates successfully but omits several officially documented free model IDs. Live and Image SFT work despite that omission. MOSS VL currently fails with `model or version not found`; its entry explicitly reports upstream unavailability. VL Realtime is listed only and is not an implemented alternate protocol in this release. Paid capabilities are catalog entries only and all paid handlers are disabled; no paid inference requests were made.

Machine-readable sanitized results: [browser-verification.json](browser-verification.json). Screenshots contain the actual application with empty or synthetic content, never user conversations.

## External link entry fix — 2026-11-03

The owner reported `{"error":"不允许跨站请求。"}` when opening the published URL. Before the fix, a normal homepage GET returned 200, but the same homepage GET carrying `Sec-Fetch-Site: cross-site` returned 403 with that exact error. The source of the owner's request was not logged; external navigation reproduces the reported response. This was caused by applying the API Origin/Fetch Metadata guard globally, including the public login document. Earlier browser verification used direct URL and same-origin navigation, so it missed external link entry.

The guard now applies only to `/api` and `/api/*`. Public HTML and static assets can be loaded from external links; API login/logout/session/model checks and the separate authenticated WebSocket Origin guard remain enforced. The regression suite now has 11 passing tests, including external document GET/HEAD, foreign-Origin requests, authenticated cross-site API rejection, and same-origin API acceptance.

The no-slash `/liveai` URL also returned an empty 200 because the Caddy redirect target was parsed as a path matcher. Its handler now uses `redir * /liveai/ 308`. The existing Caddy configuration was read, backed up, incrementally changed and validated; other site handlers and authentication were retained. The matching deployment example is [Caddyfile.snippet](../deploy/Caddyfile.snippet).

## Production authentication transport fix — 2026-11-03

While verifying the owner's requested password, the documented password matched the existing shared-password hash, and the shared service accepted a direct native HTTP login. LiveAI's login proxy returned 502. Reproducing the same request in Node exposed `fetch failed` with cause `bad port`: browser-compatible Node fetch rejects the existing authentication service's port 4190 before opening a connection. Login, logout and authenticated session checks all used that transport. Earlier positive tests used ephemeral ports and the browser QA auth fixture used 4263, so both missed the production-port restriction; anonymous session checks returned false before using the transport and did not reveal it.

The authentication adapter now uses Node's native HTTP/HTTPS client with bounded responses and request timeouts. The shared service, passwords, cookies, API Origin rules and WebSocket authentication are preserved. The integration fixture runs on fetch-blocked port 6000 and explicitly proves that ordinary fetch fails while LiveAI validates the same session successfully. All 12 tests pass. No MOSS inference or paid requests are needed for this fix.

After deployment, Chromium logged in through the actual public UI using the existing owner password. The session endpoint returned 200/authenticated, the model catalog returned 200, reloading retained the session, and logout returned to the password form with an unauthenticated session. There were no browser JavaScript errors. The password and cookies are not included in repository artifacts.

## Android shell and OTA delivery — 2026-11-03

Signed shell 1.0.1 / versionCode 2 (`cn.guihualab.liveai`) uses an independent certificate and the Dayweave WebView + verified full-bundle update design. Release build and Lint passed, as did 7 Java/Robolectric tests. The web suite now has 13 passing tests, including deterministic OTA packaging, SHA-256 addressing, and exclusion of private files. Lint warnings remain for intentional synchronous update-state persistence, backward-compatible attributes and cached test dependencies; there are no lint errors. No Android device was connected.

The live manifest at `/liveai/app-updates/latest.json` declares version 1.1.0, channel `liveai-stable`, minimum shell 1, ZIP size 95,792 bytes and SHA-256 `72db8ca3d8cfd517604afaee629d3fa4ba665a226deccb23e5ab7da528e8c714`. Downloaded and verified its digest and entries. Each entry matches the corresponding `assets/web/` entry in the signed APK. The 123,880-byte signed APK was downloaded from both the permanent IP route and HTTPS route; both matched SHA-256 `a182f5d3e2fedfd855d06ca8984395a85e8ed43dd183b8b4b5b5ea9b91f6769e`. APK v2/v3 signature checks passed, its identity matches the public certificate metadata, and no ABI-specific `.so`, API key or real password was packaged. Existing port-8182 terminal authentication still returned 401, and the existing TTYD APK download remained available.

Browser simulation of the native bridge verified ready signalling, actual production login, the Android capability notice, hidden unsupported screen-sharing controls, local-history retention after reload, and routing text exports to the native save callback. A simulated native pause ended a real MOSS Live connection and returned the UI to the start button; no JavaScript errors occurred. The first simulated-bridge login run timed out without a captured server response; subsequent instrumented login and the full controlled run passed. This is browser integration evidence, not an Android device result. System permission dialogs, audio quality, camera and native file-picker operation remain pending physical-device validation.

Public APK installation/update instructions and native verification details: [android.md](android.md), [android-verification.json](android-verification.json). The website and APP resources now use the same `npm run deploy:web` command; native shell changes require the same signature and increased versionCode. The actual navigation preview and Android availability description were updated without changing the existing project URL.

## Native direct/background redesign — 2026-11-03 (2.0.0)

The owner reported locked-screen calls ending, video stalling through the hub and headset input remaining on the handset. The former shell explicitly stopped browser media on pause, all media used the hub relay, and WebView capture did not own a communication-device route. APK 2.0.0/code 3 now gives microphone capture, playback and fixed-endpoint MOSS transport to a microphone foreground service. The visible Activity owns Camera2 only; it releases camera on pause while audio continues. Initial credential provisioning and OTA still use the hub, while native call audio, JPEG frames, output audio and transcripts go directly to MOSS. Desktop and 1.x clients retain the relay. A direct native call has no automatic relay or paid-model fallback.

The encrypted native bootstrap was tested through actual public HTTPS authentication: legitimate login and RSA-OAEP decryption matched the configured credential; anonymous requests returned 401 and foreign-Origin requests returned 403. The bootstrap response contained ciphertext only. Native storage uses Android Keystore AES-GCM with per-field AAD. Remembered passwords are optional, records remain local, old localStorage history still displays, and backup/transfer of app data is excluded. No real password or API key was added to repo or assets.

14 Node tests and 14 Java/Robolectric tests passed, together with Release build and Lint (no errors; intentional persistence, direct-distribution background-permission and compatibility warnings remain). Added tests cover Activity pause/stop/destruction retaining the active service/socket and wake lock; notification mute/end; retries after a failed reconnect; video queue/size limits; headset routing priorities; authenticated encryption tampering; bridge calls from a JavaBridge worker; and acknowledgement only after the simulated hardware playback head passes the entire chunk. Existing OTA origin, integrity, atomic bundle and rollback tests remain. These are software simulations, not handset results.

The actual production `MossConnection.java` and pinned OkHttp runtime were compiled into a separate server-JVM harness and connected to real MOSS without the hub media gateway:

- Voice test: synthetic spoken phrase produced a complete transcript, a model reply, 71 PCM chunks and 71 time-scheduled playback acknowledgements; `response.ended=completed`.
- Voice + picture test: sent 9 tagged JPEG frames (6,546 bytes each) at 1 fps alongside PCM. MOSS read the synthetic image correctly as “HELLO” and produced 17 PCM chunks, all acknowledged; response completed. Peak observed outbound queue was 6,743 bytes on this server's network path.
- Playback timing in the harness was simulated; the production Android path instead uses AudioTrack's actual playback-head position. These network results do not establish M153 audio quality, its network performance or physical camera operation.

The new minimal mobile frontend was rendered and inspected at 390×844 with a simulated native bridge. Login/remember preference, direct status, actual input-device display, route selection, settings, encrypted-history bridge/export and call end passed without horizontal overflow or JavaScript errors. Screenshots [android-call.png](android-call.png) and [android-audio.png](android-audio.png) contain synthetic test content; the displayed headset is a fixture, not evidence of a physically tested headset.

Signed APK and public OTA were downloaded and compared byte-for-byte for every web resource. The bundle SHA-256 is `ea6a7f34905f3b11668829aa37e8551c49b820c186397267b687e12466695f2a`, size 101458 bytes; the APK is 1173342 bytes with SHA-256 `359b40379d0bb31cd6d7a07b6390600d89acc99abd76ffa74cc101d4c3e135d8`. Signature v2/v3 and original certificate/package identity passed; no ABI-specific `.so`, API key, actual owner password or signing materials were packaged. Public IP and HTTPS downloads match; unrelated terminal authentication and TTYD APK remain available. Website external navigation still succeeds.

No Android phone is connected. M153 install/cover-update, locked-screen duration, OEM power policy, real Bluetooth/BLE/USB/wired microphone selection, camera orientation and voice quality remain physical-device acceptance items. The UI reports the actual routed input to make that check visible. Users must begin the call while foregrounded and grant required permissions; force-stop or OS revocation cannot be bypassed. Routine later web changes use OTA; this upgrade changes native permissions, service and audio transport, so it requires one APK cover-install.

## Restore in-APP tools — web resources 2.1.0, 2026-11-03

The owner reported missing features after the 2.0 native redesign. Those tool components remained in the desktop app, but the new mobile root rendered only the call page and linked out to an external browser for tools. This unintentionally removed discoverable in-APP functionality. The mobile root now has five entries (call, images, vision, models, history), reuses the same ImageStudio/VisionStudio/Models components as desktop, and restores daily/English/vision/custom conversation settings. Switching tools keeps the native call screen and tool forms mounted, preserving input, selected file, in-flight image job and result. An ongoing-call strip provides return/end controls. Tool-session expiry uses native remembered login where available, while native media stays direct.

The 14 Node tests and production build passed. `scripts/check-mobile-workspace.mjs` ran against the built frontend using isolated browser API/native fixtures: all five tabs, active job/result retention, upload/draft retention, free/paid separation, remembered tool-session recovery, conversation presets, history export, native call state across tabs/reload, absence of relay calls, desktop tools and 390 px overflow passed with no JavaScript errors. This fixture never contacts the real provider and is never deployed as an authentication service.

A separate browser run used actual public HTTPS authentication, the production catalog and a real free 512×512 MOSS Image SFT generation. The image request completed while viewing a different tab and its result was present on return. The simulated native call remained active and no `/api/live` relay connection was opened. The vision entry correctly retained its upstream-unavailable notice; it was not advertised as a working upstream fix. No paid inference request was sent. The native bridge was simulated in Chromium: this does not add M153 hardware validation.

Public service health reports 2.1.0. The downloaded full OTA ZIP matched every new build resource, passed SHA-256 verification and declares minimum shell 1, compatible with 2.0.0/code 3. The current Android native code, permissions, package and signer were untouched; this release requires no new APK. To apply it, end the current call, fully close the APP and reopen it so cold-start update checks run. Old local history and origin remain intact. The Guihua Lab card and real rendered preview were updated to show the complete APP workspace. Sanitized results: [mobile-workspace-verification.json](mobile-workspace-verification.json), screenshot: [mobile-workspace.png](mobile-workspace.png).
