# 隐私说明

Video Digest AI 没有开发者运营的服务器、账户系统、分析、广告或遥测。开发者不会接收扩展中的设置、字幕、笔记或密钥。

## 本机存储

以下内容保存在 `chrome.storage.local`，不会通过 `storage.sync` 同步：

- YouTube 字幕服务商（Supadata、Captapi、TranscriptFetch、TranscriptAPI）的 API Key 与排序
- 有序 AI Provider 列表的服务商、Base URL、模型、API Key、并发和超时
- 字幕、翻译与概览缓存：30天过期，最多20条，按站点、视频和分P隔离
- 笔记：可配置 1–400 条，默认 100 条；并受 7 MB 安全线限制
- “问 AI”的对话只保留在当前侧栏会话内存中；只有点击“转为笔记”后，所选问答才写入时间戳笔记。

内容脚本无权读取扩展存储；存储访问被限制在 service worker、设置页和侧边栏等可信扩展上下文。卸载扩展会由 Chrome 清除这些数据。

## 网络请求

- YouTube：标准播放页的规范 URL 会按用户设置的顺序发送给已配置的字幕服务商，并仅携带该服务商对应的 API Key。前一项失败时才请求下一项。Supadata 固定使用 `mode=native`，TranscriptFetch 固定使用 `captions` 模式；四个服务商都只请求已发布字幕。扩展不会在本机下载音频或进行语音转写。
- Bilibili：向 `api.bilibili.com` 获取视频和字幕轨信息，并从 Bilibili CDN 下载字幕。接口请求可携带浏览器现有的 Bilibili 登录会话；扩展没有 `cookies` 权限，也不读取或保存 Cookie 内容。
- AI Provider：使用翻译、顺句、概览、视频问答、解释或笔记润色时，所需字幕文本、视频元数据、用户问题、必要的多轮对话和 API Key 会发送给当前使用的 Provider。当前一项发生可恢复故障时，相同请求才会依次发送给用户配置的后续 Provider。

AI Provider 的域名通过 Chrome 可选域名权限在用户点击“保存并授权”后申请。远程服务仅允许 HTTPS；明文 HTTP 仅允许本机地址。

第三方服务如何处理收到的数据，适用其各自的隐私政策。使用多个 AI Provider 意味着一次任务在前一项可恢复失败时，后续 Provider 也可能收到任务内容，用户应分别审查所有已配置服务的条款。

## 用户控制

- 在设置页添加、删除或拖动排序 AI Provider，并修改或清空密钥。
- 在 Chrome 扩展详情页收回 Provider 域名权限。
- 在侧边栏删除笔记；通过重新安装或清除扩展数据删除全部本机数据。

## English summary

Video Digest AI has no backend, analytics, ads, telemetry, or account system. API keys, settings, cached transcripts, digests, and notes remain in `chrome.storage.local`. YouTube requests go only to the configured caption providers in their saved order, with the next provider tried only after a failure; Bilibili metadata and caption requests go to Bilibili; AI tasks go to the configured AI providers in their saved order, with later providers tried only after a recoverable failure. The extension does not download or transcribe audio locally.
