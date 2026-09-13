const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const readJson = (file) =>
  JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const readText = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));

const manifest = readJson("manifest.json");

test("是一份 MV3 清单", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.version);
  // 侧边栏 API 需要 Chrome 116+。Edge 的版本号跟 Chromium 对齐，同一个门槛
  // 对它一样成立（Edge 自 114 起支持侧边栏）。
  assert.ok(Number(manifest.minimum_chrome_version) >= 116);
});

/**
 * 侧边栏的 per-tab enabled 在两个浏览器上语义不同：Chrome 每个标签页各管各的，
 * Edge 是窗口级的——某个标签页被 disable，切过去就会把整个窗口的侧边栏关掉，
 * 正在跑的 AI 任务跟着断。所以路径只由清单提供，代码里不按标签页开关。
 */
test("侧边栏全局可用，图标点击交给浏览器处理", () => {
  assert.ok(manifest.side_panel?.default_path, "侧边栏路径应当由清单提供");
  assert.ok(manifest.permissions.includes("sidePanel"));

  const source = readText("background.js");
  assert.doesNotMatch(
    source,
    /sidePanel[\s\S]{0,40}setOptions\(/,
    "按标签页 setOptions 会让 Edge 在切标签页时关掉侧边栏",
  );
  assert.match(
    source,
    /openPanelOnActionClick:\s*true/,
    "自己接管图标点击要靠用户手势，Edge 的判定比 Chrome 严，交给浏览器两边都稳",
  );
});

test("同一份清单能投 Chrome 应用商店和 Edge 加载项", () => {
  // 这两条都是 Edge 认证会直接打回的硬性要求。
  assert.equal(manifest.update_url, undefined, "商店版清单不能带 update_url");
  for (const field of [manifest.name, manifest.description]) {
    assert.doesNotMatch(field, /chrome/i, "名称和描述里不能出现 Chrome");
  }
});

test("描述不超过 132 字符，且不宣传尚未实现的功能", () => {
  // 商店对这个字段有 132 字符的硬上限，超了要等到上传那一刻才报错。
  assert.ok(manifest.description.length > 0);
  assert.ok(
    manifest.description.length <= 132,
    `描述有 ${manifest.description.length} 字符，超过商店 132 的上限`,
  );

  // 描述先于实现出现，就是在向用户承诺一个装完找不到的功能。
  // 认这个消息名而不是「translat」这几个字母：注释里提一句翻译不算接线。
  const translationWired = readText("sidepanel.js").includes("translateSegments");
  if (!translationWired) {
    for (const field of [manifest.description, readJson("package.json").description]) {
      assert.doesNotMatch(
        field,
        /bilingual|translation/i,
        "双语翻译尚未接线，描述里不应出现",
      );
    }
  }
});

/**
 * 清单里但凡引用了不存在的文件，浏览器就整个拒绝加载扩展，
 * 而且报错信息经常只指向清单本身。这条测试把问题提前暴露在命令行里。
 */
test("清单引用的每个文件都真实存在", () => {
  const referenced = [
    manifest.background?.service_worker,
    manifest.side_panel?.default_path,
    manifest.options_ui?.page,
    ...(manifest.content_scripts || []).flatMap((entry) => entry.js || []),
    ...Object.values(manifest.action?.default_icon || {}),
    ...Object.values(manifest.icons || {}),
  ].filter(Boolean);

  assert.ok(referenced.length > 0);
  for (const file of referenced) {
    assert.ok(exists(file), `清单引用了不存在的文件：${file}`);
  }
});

test("service worker importScripts 的依赖都存在", () => {
  const source = readText(manifest.background.service_worker);
  const block = source.match(/importScripts\(([\s\S]*?)\);/);
  assert.ok(block, "background.js 应通过 importScripts 引入依赖");

  const files = [...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.ok(files.includes("settings.js"));
  for (const file of files) {
    assert.ok(exists(file), `importScripts 引用了不存在的文件：${file}`);
  }
});

test("HTML 引用的脚本与样式都存在", () => {
  for (const page of ["sidepanel.html", "options.html"]) {
    const html = readText(page);
    const assets = [
      ...[...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]),
      ...[...html.matchAll(/<link[^>]+href="([^"]+)"/g)].map((m) => m[1]),
    ];
    assert.ok(assets.length > 0, `${page} 应引用脚本或样式`);
    for (const asset of assets) {
      assert.ok(exists(asset), `${page} 引用了不存在的文件：${asset}`);
    }
  }
});

test("字幕服务商支持多项配置、排序回退与独立保存", () => {
  const html = readText("options.html");
  const script = readText("options.js");
  const settings = readText("settings.js");
  const background = readText("background.js");
  assert.match(html, /id="addCaptionProviderBtn"/);
  assert.match(html, /id="saveCaptionProvidersBtn"/);
  assert.match(html, /id="captionProviderList"/);
  assert.match(script, /renderCaptionProviders/);
  assert.match(script, /moveCaptionProvider/);
  assert.match(script, /wireCaptionProviderDrag/);
  assert.match(script, /caption-provider-drag-handle/);
  assert.match(script, /saveCaptionProviders/);
  assert.match(settings, /captapi/);
  assert.match(settings, /transcriptfetch/);
  assert.match(settings, /transcriptapi/);
  assert.match(background, /fetchTranscriptWithFallback/);
});

test("模型配置保存按钮使用明确文案", () => {
  const html = readText("options.html");
  const script = readText("options.js");
  assert.match(html, /id="saveBtn"[^>]*>保存模型配置</);
  assert.match(script, /"保存模型配置":\s*"Save model configuration"/);
});

test("设置页提供默认全开的双站点适用范围开关", () => {
  const html = readText("options.html");
  const script = readText("options.js");
  const background = readText("background.js");
  assert.match(html, /适用范围/);
  assert.match(html, /id="youtubeEnabled"[^>]*checked/);
  assert.match(html, /id="bilibiliEnabled"[^>]*checked/);
  assert.match(script, /saveSiteScope/);
  assert.match(background, /isSiteEnabled/);
  assert.match(background, /siteScopeChanged/);
});

test("面向用户的网站名称统一为 Bilibili", () => {
  for (const file of [
    "manifest.json",
    "options.html",
    "sidepanel.html",
    "README.md",
    "PRIVACY.md",
    "STORE-LISTING.md",
  ]) {
    const text = readText(file);
    assert.doesNotMatch(text, /B\s*站|哔哩哔哩/, `${file} 仍有旧网站名称`);
  }
});

test("界面语言会保存、广播到侧栏，并隔离不同语言的概览缓存", () => {
  const options = readText("options.js");
  const background = readText("background.js");
  const sidepanel = readText("sidepanel.js");
  assert.match(options, /notifyUiLanguageChanged/);
  assert.match(options, /\{ \.\.\.current, uiLanguage \}/);
  assert.match(background, /uiLanguageChanged/);
  assert.match(background, /cachedLanguage === analysisLanguage/);
  assert.match(sidepanel, /applySidepanelLanguage/);
  assert.match(sidepanel, /state\.analysisLanguage !== state\.uiLanguage/);
});

test("两站页面按钮使用同一蓝色，Note 明确使用白色文字", () => {
  const bilibili = readText("content-bilibili.js");
  const youtube = readText("content-youtube.js");
  assert.match(bilibili, /DIGEST_BLUE\s*=\s*"#168cff"/i);
  assert.match(youtube, /DIGEST_BLUE\s*=\s*"#168cff"/i);
  assert.match(bilibili, /button\.style\.color\s*=\s*"#fff"/i);
  assert.match(youtube, /color:\s*#fff/i);
});

test("YouTube 操作栏延迟或缺失时，Digest 会退到播放器并持续自检", () => {
  const youtube = readText("content-youtube.js");
  assert.match(youtube, /function findPlayerContainer\(/);
  assert.match(youtube, /function setDigestButtonPlacement\(/);
  assert.match(youtube, /Digest button using player fallback/);
  assert.match(youtube, /function setupControlsHealthCheck\(/);
  assert.match(youtube, /CONTROLS_HEALTH_CHECK_MS\s*=\s*1500/);
  assert.match(youtube, /setupControlsHealthCheck\(\);/);
});

test("模型选择使用独立 select，不再受 datalist 当前值过滤", () => {
  const html = readText("options.html");
  const script = readText("options.js");
  assert.doesNotMatch(html, /<datalist/i);
  assert.match(html, /id="aiProviderList"/i);
  assert.match(script, /modelOptions.className\s*=\s*"model-option-select"/);
  assert.match(script, /setModelOptions/);
  assert.match(script, /availableModels/);
  assert.match(script, /deepseek-v4-flash/);
  assert.match(script, /gpt-5\.6-terra/);
});

test("AI 服务支持有序多项、拖动排序与局部密钥掩码", () => {
  const html = readText("options.html");
  const script = readText("options.js");
  const settings = readText("settings.js");
  const background = readText("background.js");
  assert.match(html, /id="addAiProviderBtn"/);
  assert.match(html, /id="aiProviderList"/);
  assert.match(script, /renderAiProviders/);
  assert.match(script, /wireAiProviderDrag/);
  assert.match(script, /moveAiProviderById/);
  assert.match(script, /maskApiKey/);
  assert.match(script, /key\.slice\(0, 2\)/);
  assert.match(script, /key\.slice\(-3\)/);
  assert.match(script, /presetStates/);
  assert.match(script, /const previousPresetId = card\.currentPresetId/);
  assert.match(settings, /normalizeAiProviders/);
  assert.match(background, /尝试下一项 AI 服务/);
});

test("问 AI 不以字幕成功为前置条件", () => {
  const sidepanel = readText("sidepanel.js");
  const background = readText("background.js");
  const prompt = readText("prompts/ask.md");
  assert.doesNotMatch(sidepanel, /state\.view\s*!==\s*"ready"\s*\|\|\s*!state\.bvid/);
  assert.match(background, /只读已经取得的缓存/);
  assert.match(prompt, /没有视频上下文时也要正常回答/);
});

test("问 AI 可按需关联字幕、概览和笔记，所有笔记都支持再次编辑", () => {
  const html = readText("sidepanel.html");
  const sidepanel = readText("sidepanel.js");
  const background = readText("background.js");
  assert.match(html, /id="chatContextTranscript"[^>]*checked/);
  assert.match(html, /id="chatContextOverview"[^>]*checked/);
  assert.match(html, /id="chatContextNotes"[^>]*checked/);
  assert.match(sidepanel, /function chatContextSelection\(/);
  assert.match(sidepanel, /contextSelection:\s*chatContextSelection\(\)/);
  assert.match(background, /function normalizeChatContextSelection\(/);
  assert.match(background, /function notesAsChatContext\(/);
  assert.match(background, /function handleUpdateNote\(/);
  assert.match(sidepanel, /function beginNoteEdit\(/);
  assert.match(sidepanel, /action:\s*"updateNote"/);
});

test("笔记栏目复用安全 Markdown 渲染器", () => {
  const sidepanel = readText("sidepanel.js");
  const css = readText("sidepanel.css");
  assert.match(sidepanel, /BILI_MARKDOWN\.render\(text, note\.text, document\)/);
  assert.match(sidepanel, /BILI_MARKDOWN\.render\(text, memo\.text, document\)/);
  assert.match(css, /\.note \.entry-text\.markdown-body/);
});

test("字幕和概览章节均提供一键存为笔记，提示词恢复按钮等宽", () => {
  const script = readText("sidepanel.js");
  const css = readText("sidepanel.css");
  assert.match(script, /function saveTextAsVideoNote/);
  assert.match(script, /className = "ghost-btn segment-save-btn"/);
  assert.match(script, /noteTextForSegment/);
  assert.match(script, /章节标题与摘要是同一条概览信息/);
  assert.match(css, /\.overview-prompt-reset-actions \.ghost-btn[\s\S]*min-width: 140px/);
});

test("问 AI 安全渲染 Markdown，概览页提供可编辑提示词", () => {
  const html = readText("sidepanel.html");
  const sidepanel = readText("sidepanel.js");
  const background = readText("background.js");
  assert.match(html, /lib\/markdown\.js/);
  assert.match(sidepanel, /BILI_MARKDOWN\.render/);
  assert.match(html, /id="overviewPrompt"/);
  assert.match(html, /id="resetOverviewPromptZhBtn"[^>]*>\s*恢复默认/);
  assert.match(html, /id="resetOverviewPromptEnBtn"[^>]*>\s*Restore default/);
  assert.match(sidepanel, /customPrompt:\s*el\("overviewPrompt"\)/);
  assert.match(sidepanel, /resetOverviewPrompt\("zh-CN"\)/);
  assert.match(sidepanel, /resetOverviewPrompt\("en"\)/);
  assert.match(background, /analysisPrompt === analysisPrompt|cachedPrompt === analysisPrompt/);
});

test("笔记页提供手记和 AI 记两个独立栏目", () => {
  const html = readText("sidepanel.html");
  const sidepanel = readText("sidepanel.js");
  const background = readText("background.js");
  assert.match(html, /id="notesScopeMemo"[^>]*>手记</);
  assert.match(html, /id="notesScopeAi"[^>]*>AI 记</);
  assert.match(sidepanel, /action:\s*"saveMemo"/);
  assert.match(
    sidepanel,
    /message\.role === "assistant" && !message\.error\)/,
    "无视频时 AI 回答也必须显示保存入口",
  );
  assert.match(background, /kind === "ai_note"/);
  assert.match(background, /timestampedUrl:\s*canonicalVideoUrl/);
});

test("笔记页提供 JSON、Markdown 和 CSV 本地导出", () => {
  const html = readText("sidepanel.html");
  const sidepanel = readText("sidepanel.js");
  assert.match(html, /id="exportNotesJsonBtn"/);
  assert.match(html, /id="exportNotesMarkdownBtn"/);
  assert.match(html, /id="exportNotesCsvBtn"/);
  assert.match(sidepanel, /function exportNotes\(format\)/);
  assert.match(sidepanel, /JSON\.stringify\(/);
  assert.match(sidepanel, /function notesAsMarkdown\(notes\)/);
  assert.match(sidepanel, /function notesAsCsv\(notes\)/);
});

test("笔记只使用 video_digest_notes 存储键", () => {
  const background = readText("background.js");
  assert.match(background, /const NOTES_STORAGE_KEY = "video_digest_notes"/);
  assert.doesNotMatch(background, /bili_digest_notes|LEGACY_NOTES_STORAGE_KEY/);
});

test("笔记范围按本视频、手记、AI 记、全部排列，全部视图汇总所有笔记类型", () => {
  const html = readText("sidepanel.html");
  const sidepanel = readText("sidepanel.js");
  const background = readText("background.js");
  const order = ["notesScopeVideo", "notesScopeMemo", "notesScopeAi", "notesScopeAll"];
  const positions = order.map((id) => html.indexOf(`id="${id}"`));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.match(sidepanel, /scope:\s*state\.notesScope/);
  assert.match(sidepanel, /function renderAnyNote\(note\)/);
  assert.match(background, /if \(scope === "all"\)/);
  assert.match(background, /\.\.\.pageNotes\(notes, page\)/);
});

test("笔记上限可配置，写入守住 7 MB 安全线，并在超过 100 条时分页", () => {
  const settings = readText("settings.js");
  const options = readText("options.html");
  const background = readText("background.js");
  const sidepanel = readText("sidepanel.js");
  const html = readText("sidepanel.html");
  assert.match(settings, /noteLimit: Object\.freeze\(\{ min: 1, max: 400, default: 100 \}\)/);
  assert.match(options, /id="noteLimit"[^>]*max="400"/);
  assert.match(background, /NOTE_STORAGE_SAFE_BYTES = 7 \* 1024 \* 1024/);
  assert.match(background, /function pageNotes\(/);
  assert.match(sidepanel, /const NOTES_PAGE_SIZE = 100/);
  assert.match(html, /id="loadMoreNotesBtn"/);
});

test("笔记页支持多选删除与按当前范围一键清空", () => {
  const html = readText("sidepanel.html");
  const sidepanel = readText("sidepanel.js");
  const background = readText("background.js");
  for (const id of [
    "toggleNotesDeleteModeBtn",
    "selectVisibleNotesBtn",
    "deleteSelectedNotesBtn",
    "clearCurrentNotesBtn",
  ]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(sidepanel, /function deleteSelectedNotes\(/);
  assert.match(sidepanel, /function clearCurrentNotes\(/);
  assert.match(background, /message\?\.action === "deleteNotes"/);
  assert.match(background, /message\?\.action === "clearNotes"/);
  assert.match(background, /function noteMatchesScope\(/);
});

test("侧栏脚本引用的固定节点全部存在，聊天空态不会被消息重绘删除", () => {
  const html = readText("sidepanel.html");
  const sidepanel = readText("sidepanel.js");
  const htmlIds = new Set(
    [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]),
  );
  const referencedIds = new Set(
    [...sidepanel.matchAll(/\bel\("([^"]+)"\)/g)].map((match) => match[1]),
  );
  assert.deepEqual(
    [...referencedIds].filter((id) => !htmlIds.has(id)),
    [],
  );
  assert.match(
    html,
    /id="chatEmpty"[\s\S]*?<\/div>\s*<div id="chatMessages"[^>]*><\/div>/,
  );
  assert.doesNotMatch(sidepanel, /list\.appendChild\(empty\)/);
  assert.ok(
    html.indexOf('id="chatForm"') > html.indexOf('id="chatMessages"'),
    "问 AI 输入框必须位于消息列表下方",
  );
  const css = readText("sidepanel.css");
  assert.match(css, /\.chat-sticky\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?bottom:\s*0;/);
});

test("安装时索要的权限只限两个视频网站与字幕数据源，且全部走 https", () => {
  const hosts = manifest.host_permissions || [];
  assert.ok(hosts.every((host) => host.startsWith("https://")), "不应出现明文 http");

  // 字幕 JSON 托管在 hdslb CDN，漏了它字幕就下载不下来。
  assert.ok(hosts.some((host) => host.includes("api.bilibili.com")));
  assert.ok(hosts.some((host) => host.includes("hdslb.com")));
  assert.ok(hosts.some((host) => host.includes("youtube.com")));
  assert.ok(hosts.some((host) => host.includes("api.supadata.ai")));

  // AI 服务地址由用户自定义，必须留到运行时申请。
  // 一旦有人图省事把它写进 host_permissions，安装时就会索要全网权限。
  for (const host of hosts) {
    assert.match(
      host,
      /bilibili\.com|hdslb\.com|youtube\.com|supadata\.ai/,
      `出现了预期之外的主机权限：${host}`,
    );
  }
});

test("自定义 AI 地址走可选权限，且明文 http 只对本机放行", () => {
  const optional = manifest.optional_host_permissions || [];
  assert.ok(optional.length > 0, "缺少 optional_host_permissions，自定义地址会被 CORS 拦下");
  assert.ok(
    optional.includes("https://*/*"),
    "需要 https://*/* 才能在运行时申请任意 https 服务商",
  );

  for (const host of optional) {
    if (!host.startsWith("http://")) continue;
    assert.match(
      host,
      /^http:\/\/(localhost|127\.0\.0\.1)\//,
      `明文 http 只应对本机放行，出现了：${host}`,
    );
  }
});

test("内容脚本只注入两个站点的播放页，不是整个站点", () => {
  const matches = (manifest.content_scripts || []).flatMap((e) => e.matches);
  assert.ok(matches.length > 0);
  for (const pattern of matches) {
    assert.ok(
      /^https:\/\/www\.bilibili\.com\/(video|list)\//.test(pattern) ||
        pattern === "https://www.youtube.com/watch*",
      `内容脚本的匹配范围过宽：${pattern}`,
    );
  }
});

test("侧边栏与设置页的存储读写走同一个 storage key", () => {
  const settings = require("../settings.js");
  assert.equal(settings.STORAGE_KEY, "video_digest_settings");
  for (const file of ["background.js", "options.js"]) {
    assert.match(
      readText(file),
      /BILI_SETTINGS\.STORAGE_KEY/,
      `${file} 应通过 BILI_SETTINGS.STORAGE_KEY 访问存储`,
    );
  }
});
