# Video Digest AI

一个同时支持 YouTube 与 Bilibili 的 Chrome 侧边栏扩展。它把平台字幕整理成可搜索、可跳转的学习材料，并提供自动中英互译、AI 章节概览、视频问答、划词解释和时间戳笔记。

项目基于以下两个 MIT 项目合并与泛化：

- [youtube-digest](https://github.com/zarazhangrui/youtube-digest)
- [bilibili-digest](https://github.com/biuworks/bilibili-digest)

## 适用范围

核心目标是提升通过视频学习的效率，尤其适合需要反复定位、理解和沉淀长视频内容的场景。

1. 不需要 AI：通过可搜索、可点击的字幕快速定位并跳转视频进度。
2. 视频中英字幕与翻译速览：查看原文、译文或双语对照；中文内容译为英文，其他语言译为中文。
3. 自定义 AI 总结：使用自己配置的 AI 服务生成章节、摘要与金句。
4. 快速灵活做笔记：在播放位置、字幕、概览、手记或 AI 回答处保存笔记，并可再次编辑、复制或导出。
5. 侧边栏快捷 AI 咨询问答：按需关联字幕、概述和当前视频笔记；全部关闭时就是纯问答。

- YouTube：标准 `youtube.com/watch` 页面；支持 Supadata、Captapi、TranscriptFetch 和 TranscriptAPI。可配置多个服务商，按设置页从上到下的顺序回退。
- Bilibili：普通视频、合集和分P；通过 Bilibili 官方接口与 WBI 签名读取当前登录会话可见的字幕。
- 不支持 Shorts、直播、番剧影视页和受限视频。四个 YouTube 字幕服务都只读取已发布字幕；没有可用字幕时会按顺序继续尝试下一项。

## 功能

- 原文、译文、双语三种字幕视图；中文字幕译英文，其他语言译中文；每条字幕可一键存为带时间锚点的笔记。
- 跟随播放高亮、点击时间戳跳转、全文搜索、复制和 TXT 导出。
- Bilibili AI 中文字幕可用“顺句”补标点、修正常见同音错字。
- 长视频分块并发生成章节和金句，部分分块失败时保留已完成结果；章节、摘要和金句均可一键存为笔记。
- “问 AI”支持自由连续问答；下拉多选可决定是否关联字幕、概述和当前视频的 Note，全部关闭时为纯问答，并可将回答一键转为带时间戳笔记。
- “问 AI”回答支持安全 Markdown 渲染；概览提示词可直接在侧边栏调整、自动保存并恢复默认。
- “手记”支持随时输入并保存文字；在视频页记录时会同时保存视频标题和当前播放位置的访问锚点。已存档的所有笔记都可在侧边栏再次编辑，并安全渲染 Markdown（标题、列表、强调、代码与 HTTPS 链接）。
- “AI 记”单独收纳从问答中保存的内容；无论是否打开视频，AI 回答都能一键保存。
- 笔记保留上限可在设置页设为 1–400 条（默认 100）；达到上限时保存新笔记会清理最早条目。笔记写入遵守 7 MB 安全线，超过 100 条时侧边栏按每页 100 条加载，导出仍包含当前范围的全部笔记。降低上限前请先导出备份。
- 笔记页的“删除”栏支持勾选已加载笔记并批量删除，也可按当前范围（本视频、手记、AI 记或全部）一键清空；清空会覆盖尚未加载的分页内容，并要求二次确认。
- 划词解释；播放器按钮或 `n` 快捷键保存时间戳笔记。
- 两站的 Digest 按钮统一使用海蓝色，Note 在播放器上保持白色高对比文字；设置页可分别开关 YouTube 与 Bilibili，默认全开。
- 缓存和笔记按站点、视频与分P隔离，全部保存在本机。

## 有序 AI Provider

设置页可通过“添加 AI 服务”配置 1–8 个服务。服务卡片按上下顺序排列，可直接拖动调整优先级；每项分别保存服务商、协议、Base URL、API Key 与模型，并可独立拉取模型列表、申请域名权限和测试连接。切换服务商选项后再切回，已填写的该服务商配置会保留。已拉取的模型列表会随 Provider 配置保存在本机，下次打开设置仍可从完整列表选择；DeepSeek 默认使用 `deepseek-v4-flash`，也可直接覆盖为其他模型 ID。

请求会从列表顶部开始。当前项遇到以下可恢复故障时，才自动尝试下一项：

- 网络连接失败、响应中断或请求超时
- HTTP `408`、`409`、`425`、`429`
- HTTP `5xx`
- Provider 返回空内容且内部自愈重试仍失败

每次 AI 请求都会按保存的顺序重新尝试；`400/401/403/404`、缺少域名授权、模型名错误和配置不完整不会继续请求后续服务，以免掩盖需要用户修正的配置问题。旧版的主/备配置在首次读取时会自动迁移为有序列表。

为方便核对而不完整暴露密钥，失焦后的 API Key 会显示前 2 位与后 3 位，中间以掩码隐藏；聚焦输入框即可查看和修改完整值。

内置常见服务商预设，包括 DeepSeek、OpenAI、Claude、Gemini、Kimi、GLM、通义千问、火山方舟 Agent Plan、SiliconFlow、OpenRouter 和 Ollama；也支持 OpenAI 兼容接口、Anthropic 原生协议和自定义服务。火山方舟预设使用 Agent Plan 专用的 `/api/plan/v3`，普通按量 API 或 Coding Plan 可通过“自定义”填写各自的 Base URL。远程地址必须使用 HTTPS；HTTP 只允许 localhost 与 127.0.0.1。

## YouTube 字幕服务商

设置页默认提供一个 Supadata 项，可通过“添加字幕服务商”继续添加 Captapi、TranscriptFetch 或 TranscriptAPI。填写各自的 API Key 后，可直接拖动卡片或使用“上移 / 下移”调整顺序；请求按从上到下的顺序执行，只有前一项失败才尝试后一项。密钥仅保存在 `chrome.storage.local`，并且仅发送至所属服务商域名。

- [Supadata](https://docs.supadata.ai/get-transcript)：扩展固定使用 `mode=native`，只取已有字幕。
- [Captapi](https://captapi.com/how-to/youtube-transcript)：返回 YouTube 已发布的带时间戳字幕。
- [TranscriptFetch](https://transcriptfetch.com/docs/endpoints)：扩展固定使用 `captions` 模式，只取已有字幕。
- [TranscriptAPI](https://transcriptapi.com/docs/api/)：返回带时间戳的 YouTube 字幕，并支持服务端语言优先级。

扩展会缓存已获取的字幕；缓存命中不会重新请求，手动“重新获取字幕”可能再次消耗服务商额度。套餐、额度和计费规则会变化，请以设置页每个服务商提供的官方文档和控制台说明为准。

## 本地安装

需要 Chrome 116 或更高版本。

1. 在 [Releases](https://github.com/Keybird0/video-digest-ai/releases) 下载最新的 `video-digest-ai-<version>.zip`。
2. 在本地解压 ZIP。
3. 打开浏览器扩展程序菜单或 `chrome://extensions`，开启“开发者模式”。
4. 将解压后的扩展文件夹拖拽到扩展程序页面安装；若浏览器不接受拖拽，点击“加载已解压的扩展程序”并选择该文件夹。
5. 在自动打开的设置页配置至少一个 YouTube 字幕服务商和 AI Provider，并按需调整 AI 服务顺序或“适用范围”。设置页也提供笔记类型、导出方式和快捷键（`N` 保存当前时间点笔记、`/` 搜索字幕）的简要说明。

所有密钥只写入 `chrome.storage.local`。扩展没有后端、账户、分析、广告或遥测。

## 开发检查

```bash
npm test
npm run package
```

自动化测试覆盖字幕解析、Bilibili WBI、YouTube native 请求、缓存隔离、AI 响应校验、有序 Provider 路由、DOM 注入和侧边栏交互。真实字幕与模型服务仍需在 Chrome 中使用自己的密钥手工验证。

## 许可与致谢

[MIT](LICENSE)。保留两个上游项目的版权和提示词来源说明；详见 `LICENSE` 与 `prompts/`。
