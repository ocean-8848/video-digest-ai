/**
 * Bilibili Digest — service worker（MV3）：
 * 消息中转、字幕获取（WBI 签名）、LLM 调用、侧边栏按 tab 启用。
 */

importScripts(
  "settings.js",
  "lib/wbi.js",
  "lib/bili-api.js",
  "lib/youtube-api.js",
  "lib/transcript.js",
  "lib/cache.js",
  "lib/ai.js",
  "lib/ai-provider.js",
  "lib/provider-router.js",
  "lib/concurrency.js",
);

const DEBUG = false;
const debugLog = (...args) => {
  if (DEBUG) console.log(...args);
};

// 两道超时各管一段，边界是「响应头是否已到达」：之前是模型在生成，归可配的
// 硬超时管；之后 body 应连续到达，静默 50 秒即视为连接出了问题，不必可配。
const AI_IDLE_TIMEOUT_MS = 50_000;
const AI_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
// 加码重试的天花板。再往上多数模型会因超过自身输出上限直接拒绝请求。
const MAX_OUTPUT_TOKENS = 32_768;
const NOTES_STORAGE_KEY = "video_digest_notes";
const NOTE_STORAGE_SAFE_BYTES = 7 * 1024 * 1024;

// 内容脚本运行在 B 站页面上下文，不应读到密钥或缓存。
chrome.storage.local
  .setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })
  .catch((error) =>
    console.warn("[Bilibili Digest] 无法限制存储访问级别：", error),
  );

async function getSettings() {
  const stored = await chrome.storage.local.get([
    BILI_SETTINGS.STORAGE_KEY,
    BILI_SETTINGS.LEGACY_STORAGE_KEY,
  ]);
  const source =
    stored[BILI_SETTINGS.STORAGE_KEY] ??
    stored[BILI_SETTINGS.LEGACY_STORAGE_KEY];
  const settings = BILI_SETTINGS.normalizeAppSettings(source);
  if (!stored[BILI_SETTINGS.STORAGE_KEY] && stored[BILI_SETTINGS.LEGACY_STORAGE_KEY]) {
    await chrome.storage.local.set({ [BILI_SETTINGS.STORAGE_KEY]: settings });
  }
  return settings;
}

function isSiteEnabled(settings, site) {
  if (site === "youtube") return settings.youtubeEnabled;
  if (site === "bilibili") return settings.bilibiliEnabled;
  return false;
}

async function broadcastSiteScope(settings) {
  const message = {
    action: "siteScopeChanged",
    youtubeEnabled: settings.youtubeEnabled,
    bilibiliEnabled: settings.bilibiliEnabled,
  };

  // 侧边栏等扩展页面走 runtime 消息；内容脚本必须逐标签页发送。
  chrome.runtime.sendMessage(message).catch(() => {});
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(
    tabs
      .filter((tab) =>
        /^https:\/\/www\.(youtube\.com\/watch|bilibili\.com\/(video|list)\/)/.test(
          tab.url || "",
        ),
      )
      .map((tab) => chrome.tabs.sendMessage(tab.id, message)),
  );
}

// ============================================================
// 侧边栏
// ============================================================

/**
 * 侧边栏对所有页面可用，路径由清单的 side_panel.default_path 给出，这里
 * 不按标签页 setOptions。原因是 per-tab 的 enabled 在两个浏览器上语义不同：
 * Chrome 每个标签页各管各的，Edge 则是窗口级——切到一个 disabled 的标签页会
 * 把整个窗口的侧边栏关掉，切回来也不会自动恢复，正在跑的 AI 任务跟着断
 * （microsoft/MicrosoftEdge-Extensions#142）。改成全局可用之后两边行为一致，
 * 顺带躲开了 setOptions 重载面板打断任务的老毛病；非播放页由侧边栏自己显示引导。
 */

// 让浏览器自己响应工具栏图标的点击。自己调 open() 要求调用发生在用户手势里，
// 而手势的判定 Edge 比 Chrome 严，交给浏览器是两边都稳的唯一做法。
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) =>
    console.warn("[Bilibili Digest] 无法设置侧边栏点击行为：", error),
  );

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") chrome.runtime.openOptionsPage();
});

/**
 * 播放页上那个注入的 Digest 按钮走这条路。手势能否从内容脚本的消息传递到这里，
 * Chrome 认，Edge 不一定认。被拒绝时如实回话，让页面上的按钮改口引导用户去点
 * 工具栏图标——那条路由浏览器自己处理，一定有效。
 */
async function handleOpenSidePanel(tab) {
  if (!tab) return { success: false };

  try {
    // 传 windowId 而不是 tabId：侧边栏是窗口级的，没有按标签页区分的路径。
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (error) {
    console.warn("[Bilibili Digest] 打开侧边栏被拒绝：", error);
    return { success: false, needsToolbarClick: true };
  }

  // 侧边栏可能本来就开着而且停在别的视频上，广播一次让它跟过来。
  // 刚打开的那种情形不必担心广播丢失，面板自己启动时就会同步当前标签页。
  chrome.runtime
    .sendMessage({
      action: "startDigestFromButton",
      tab: { id: tab.id, windowId: tab.windowId, url: tab.url || "" },
    })
    .catch(() => {});
  return { success: true };
}

// ============================================================
// 消息路由
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.action === "isSiteEnabled") {
    getSettings()
      .then((settings) =>
        sendResponse({ enabled: isSiteEnabled(settings, message.site) }),
      )
      .catch((error) => sendResponse({ enabled: true, error: error.message }));
    return true;
  }

  if (message?.action === "notifySiteScopeChanged") {
    getSettings()
      .then(async (settings) => {
        await broadcastSiteScope(settings);
        sendResponse({ success: true });
      })
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message?.action === "notifyUiLanguageChanged") {
    const uiLanguage = message.uiLanguage === "en" ? "en" : "zh-CN";
    chrome.runtime.sendMessage({ action: "uiLanguageChanged", uiLanguage }).catch(() => {});
    sendResponse({ success: true });
    return false;
  }

  if (message?.action === "fetchTranscript") {
    handleFetchTranscript(message.bvid, {
      site: message.site,
      page: message.page,
      tabId: message.tabId,
      forceRefresh: message.forceRefresh,
    })
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true; // 保持消息通道开启以异步回复
  }

  if (message?.action === "checkConfig") {
    getSettings()
      .then((settings) => {
        const check = BILI_SETTINGS.validateAppSettings(settings);
        sendResponse({ ready: check.ok, errors: check.errors });
      })
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (message?.action === "openOptions") {
    chrome.runtime.openOptionsPage();
    sendResponse({ success: true });
    return false;
  }

  if (message?.action === "openSidePanel") {
    handleOpenSidePanel(sender.tab)
      .then(sendResponse)
      .catch(() => sendResponse({ success: false, needsToolbarClick: true }));
    return true;
  }

  if (message?.action === "analyzeTranscript") {
    handleAnalyzeTranscript(message.bvid, {
      site: message.site,
      page: message.page,
      forceRefresh: message.forceRefresh,
      customPrompt: message.customPrompt,
    })
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message?.action === "polishSegments") {
    handlePolishSegments(message.bvid, {
      site: message.site,
      page: message.page,
      segmentIds: message.segmentIds,
    })
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message?.action === "translateSegments") {
    handleTranslateSegments(message.bvid, {
      site: message.site,
      page: message.page,
      segmentIds: message.segmentIds,
    })
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message?.action === "explainSelection") {
    handleExplainSelection(
      message.selectedText,
      message.transcriptContext,
      message.videoTitle,
    )
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message?.action === "askVideo") {
    handleAskVideo(message)
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message?.action === "saveNote") {
    handleSaveNote(message)
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message?.action === "saveMemo") {
    handleSaveMemo(message)
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message?.action === "getNotes") {
    handleGetNotes(message.bvid, message.site, message.scope, {
      offset: message.offset,
      limit: message.limit,
    })
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message?.action === "getMemos") {
    handleGetMemos(message.kind, { offset: message.offset, limit: message.limit })
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message?.action === "deleteNote") {
    handleDeleteNote(message.noteId)
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message?.action === "deleteNotes") {
    handleDeleteNotes(message.noteIds)
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message?.action === "clearNotes") {
    handleClearNotes(message)
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message?.action === "updateNote") {
    handleUpdateNote(message.noteId, message.text)
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message?.action === "getNoteStats") {
    handleGetNoteStats()
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message?.action === "applyNoteLimit") {
    enforceStoredNoteLimits()
      .then(sendResponse)
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message?.action === "checkVideoAvailable") {
    handleCheckVideoAvailable(message.bvid, message.site)
      .then(sendResponse)
      // 检查本身出错不该挡住用户，放行让 B 站自己说话。
      .catch(() => sendResponse({ available: true }));
    return true;
  }

  return false;
});

// ============================================================
// 字幕管线
// ============================================================

function resolveVideo(siteInput, videoIdInput, page = 1) {
  const site = siteInput === "youtube" ? "youtube" : "bilibili";
  const videoId =
    site === "youtube"
      ? VIDEO_YOUTUBE_API.parseVideoId(videoIdInput)
      : BILI_API.parseBvid(videoIdInput);
  if (!videoId) return null;
  const pageNumber =
    site === "bilibili" && Number(page) > 0 ? Math.floor(Number(page)) : 1;
  return {
    site,
    videoId,
    page: pageNumber,
    cacheId: site === "youtube" ? `youtube_${videoId}` : videoId,
  };
}

function canonicalVideoUrl(resource, seconds = 0) {
  return resource.site === "youtube"
    ? VIDEO_YOUTUBE_API.canonicalVideoUrl(resource.videoId, seconds)
    : BILI_API.canonicalVideoUrl(resource.videoId, seconds, resource.page);
}

async function readYouTubePageInfo(tabId) {
  let targetTabId = Number(tabId) || 0;
  if (!targetTabId) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    targetTabId = tab?.id || 0;
  }
  if (!targetTabId) return {};
  try {
    return (await chrome.tabs.sendMessage(targetTabId, { action: "getVideoInfo" })) || {};
  } catch (error) {
    return {};
  }
}

// 优先命中站点隔离缓存；未命中后由对应站点适配器获取字幕。
async function handleFetchTranscript(
  videoIdInput,
  { site = "bilibili", page = 1, tabId, forceRefresh = false } = {},
) {
  const resource = resolveVideo(site, videoIdInput, page);
  if (!resource) {
    return {
      success: false,
      error: "INVALID_VIDEO_ID",
      message: "没有识别到受支持的视频地址。",
    };
  }

  if (!forceRefresh) {
    const cached = await BILI_CACHE.load(resource.cacheId, { page: resource.page });
    if (cached?.transcript?.length) {
      debugLog("[Video Digest AI] 命中字幕缓存：", resource.cacheId);
      // 标志放在展开之后：旧版本写进缓存的脏标志不能盖过本次的真实值。
      return { ...cached, success: true, fromCache: true };
    }
  }

  try {
    const settings = await getSettings();
    let videoInfo;
    let entries;
    let language;
    let languageLabel;
    let isAiSubtitle = false;
    let availableTracks = [];

    if (resource.site === "youtube") {
      const [pageInfo, transcriptResult] = await Promise.all([
        readYouTubePageInfo(tabId),
        VIDEO_YOUTUBE_API.fetchTranscriptWithFallback(
          resource.videoId,
          settings.youtubeCaptionProviders,
        ),
      ]);
      entries = transcriptResult.transcript;
      language = transcriptResult.language || "";
      languageLabel = language || "Original";
      availableTracks = transcriptResult.availableLanguages.map((lang) => ({
        lang,
        langLabel: lang,
        isAi: false,
      }));
      videoInfo = {
        site: resource.site,
        videoId: resource.videoId,
        page: 1,
        pageCount: 1,
        title: pageInfo.title || resource.videoId,
        owner: pageInfo.channelName || "",
        description: pageInfo.description || "",
        duration: Number(pageInfo.duration) || 0,
      };
    } else {
      videoInfo = await BILI_API.fetchVideoInfo(resource.videoId, {
        page: resource.page,
      });
      videoInfo.site = resource.site;
      videoInfo.videoId = resource.videoId;
      const { tracks, needLogin } = await BILI_API.fetchSubtitleTracks(videoInfo);

      if (!tracks.length) {
        return {
          success: false,
          error: needLogin ? "NEED_LOGIN" : "NO_SUBTITLE",
          message: needLogin
            ? "该视频的字幕需要登录后才能查看，请先在浏览器里登录 Bilibili 账号。"
            : "该视频没有可用字幕。",
          videoInfo,
        };
      }

      const track = BILI_API.pickSubtitleTrack(
        tracks,
        settings.subtitleLangPreference,
      );
      entries = await BILI_API.fetchSubtitleTrackContent(track.url);
      language = track.lang;
      languageLabel = track.langLabel;
      isAiSubtitle = track.isAi;
      availableTracks = tracks.map(({ lang, langLabel, isAi }) => ({
        lang,
        langLabel,
        isAi,
      }));
    }

    if (!entries.length) {
      return {
        success: false,
        error: "EMPTY_TRANSCRIPT",
        message: "字幕文件是空的。",
        videoInfo,
      };
    }

    const segments = BILI_TRANSCRIPT.groupTranscriptEntries(entries);
    const texts = BILI_TRANSCRIPT.buildTranscriptTexts(entries);

    const result = {
      videoInfo,
      transcript: entries,
      segments,
      transcriptText: texts.plain,
      transcriptTextTimestamped: texts.timestamped,
      site: resource.site,
      videoId: resource.videoId,
      language,
      languageLabel,
      isAiSubtitle,
      availableTracks,
    };

    await BILI_CACHE.save(resource.cacheId, result, { page: resource.page });
    return { ...result, success: true, fromCache: false };
  } catch (error) {
    console.error("[Video Digest AI] 字幕获取失败：", error);
    return {
      success: false,
      error: error.code || "TRANSCRIPT_FETCH_FAILED",
      message: error.message || "字幕获取失败。",
    };
  }
}

// ============================================================
// 模型调用
// ============================================================

const promptFileCache = new Map();

async function loadPromptSection(fileName, heading, variables = {}) {
  let markdown = promptFileCache.get(fileName);
  if (!markdown) {
    const response = await fetch(chrome.runtime.getURL(`prompts/${fileName}`));
    if (!response.ok) {
      throw new Error(`提示词文件读取失败：${fileName}`);
    }
    markdown = await response.text();
    promptFileCache.set(fileName, markdown);
  }
  return BILI_AI.extractPromptSection(markdown, heading, variables);
}

/**
 * 用户可以填任意 API 地址，而 MV3 不允许 fetch 未授权的域名。
 * 域名在安装时是未知的，所以走 optional_host_permissions 在设置页运行时申请。
 */
async function ensureHostPermission(baseUrl) {
  const origin = BILI_SETTINGS.originOf(baseUrl);
  if (!origin) {
    const error = new Error("API 地址不合法，请到设置页检查。");
    error.code = "INVALID_BASE_URL";
    throw error;
  }

  const granted = await chrome.permissions.contains({ origins: [origin] });
  if (!granted) {
    const error = new Error(
      `扩展还没有访问 ${origin} 的权限。请打开设置页，点「保存并授权」。`,
    );
    error.code = "NEED_HOST_PERMISSION";
    throw error;
  }
}

// 协议差异由 lib/ai-provider.js 处理，这里只管超时、大小上限、空响应的诊断与重试。
async function requestAiCompletion({
  messages,
  maxTokens,
  temperature,
  responseFormat,
}) {
  const appSettings = await getSettings();
  const check = BILI_SETTINGS.validateAppSettings(appSettings);
  if (!check.ok) {
    const error = new Error(`AI 还没配置好：${check.errors.join(" ")}`);
    error.code = "NO_AI_CONFIG";
    throw error;
  }

  const configured = BILI_SETTINGS.activeProviders(appSettings).map((entry) => ({
    ...entry,
    settings: {
      ...entry.settings,
      aiTimeoutSeconds: appSettings.aiTimeoutSeconds,
    },
  }));
  const providers = VIDEO_PROVIDER_ROUTER.routeOrder(configured);
  const failures = [];

  for (const [index, provider] of providers.entries()) {
    try {
      const result = await requestProviderCompletion(provider.settings, {
        messages,
        maxTokens,
        temperature,
        responseFormat,
      });
      return { ...result, providerRole: provider.role };
    } catch (error) {
      failures.push({ provider, error });
      if (!VIDEO_PROVIDER_ROUTER.shouldFailOver(error)) throw error;
      if (index >= providers.length - 1) break;
      console.warn(
        `[Video Digest AI] ${provider.label} 暂时不可用，尝试下一项 AI 服务：${error.message}`,
      );
    }
  }

  const error = new Error(failures.length
    ? `所有 AI 服务均失败。${failures
      .map(({ provider, error: failure }) => `${provider.label}：${failure.message || "暂不可用"}`)
      .join("；")}`
    : "没有可用的 AI 服务。");
  error.code = "AI_ALL_PROVIDERS_FAILED";
  throw error;
}

// 单个 Provider 内部仍保留空响应的自愈重试；用尽后才交给有序回退路由判断。
async function requestProviderCompletion(
  settings,
  { messages, maxTokens, temperature, responseFormat },
) {
  const check = BILI_SETTINGS.validate(settings);
  if (!check.ok) {
    const error = new Error(check.errors.join(" "));
    error.code = "NO_AI_CONFIG";
    throw error;
  }
  await ensureHostPermission(settings.aiBaseUrl);

  let format = responseFormat;
  let tokens = maxTokens;
  let diagnosis = null;

  // 空响应有两种能自愈的成因，各给一次机会，所以最多三轮。
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const request = BILI_AI_PROVIDER.buildChatRequest({
      settings,
      messages,
      maxTokens: tokens,
      temperature,
      responseFormat: format,
    });
    const data = await sendAiRequest(settings, request);

    const text = BILI_AI_PROVIDER.parseChatResponse(settings.protocol, data);
    if (text.trim()) return { text, settings };

    diagnosis = BILI_AI_PROVIDER.diagnoseEmptyResponse(settings.protocol, data);

    if (format && diagnosis.retryWithoutJsonMode) {
      debugLog("[Bilibili Digest] JSON 模式返回空，脱掉 response_format 重试");
      format = null;
      continue;
    }

    // 预算被吃光了就加码重试——max_tokens 按实际生成计费，加码不额外花钱。
    if (diagnosis.retryWithMoreTokens && tokens < MAX_OUTPUT_TOKENS) {
      tokens = Math.min(tokens * 4, MAX_OUTPUT_TOKENS);
      debugLog("[Bilibili Digest] 输出被截断，放大预算重试：", tokens);
      continue;
    }

    break;
  }

  const error = new Error(diagnosis.message);
  error.code = "EMPTY_AI_RESPONSE";
  error.reason = diagnosis.reason;
  throw error;
}

// 真正发出请求，守住超时与响应大小（分工见 AI_IDLE_TIMEOUT_MS 处的说明）。
async function sendAiRequest(settings, request) {
  const controller = new AbortController();
  let timeoutKind = "";
  let idleTimer;
  let hardTimer;

  const abortFor = (kind) => {
    if (controller.signal.aborted) return;
    timeoutKind = kind;
    controller.abort();
  };
  const resetIdleTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => abortFor("idle"), AI_IDLE_TIMEOUT_MS);
  };

  const hardTimeoutMs = settings.aiTimeoutSeconds * 1000;
  hardTimer = setTimeout(() => abortFor("hard"), hardTimeoutMs);
  // 空闲计时绝不能在这里起表：非流式请求在模型生成完之前一个字节都不会到，
  // 提前起表等于把「模型在慢慢想」当成「服务端死了」。这一段只由硬超时负责。

  try {
    const response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: controller.signal,
    });
    // 响应头到了，body 应连续到达，空闲超时从这一刻起才有判断力。
    resetIdleTimer();

    const data = await readBoundedAiResponse(response, resetIdleTimer);
    if (!response.ok) {
      const error = new Error(
        BILI_AI_PROVIDER.parseErrorMessage(data, response.status),
      );
      error.status = response.status;
      throw error;
    }

    return data;
  } catch (error) {
    if (timeoutKind === "idle") {
      const timeout = new Error("响应传到一半断了，请重试。");
      timeout.code = "AI_IDLE_TIMEOUT";
      throw timeout;
    }
    if (timeoutKind === "hard") {
      const timeout = new Error(
        `请求超过 ${settings.aiTimeoutSeconds} 秒上限。可以在设置页调高超时，或降低并发。`,
      );
      timeout.code = "AI_HARD_TIMEOUT";
      throw timeout;
    }
    // fetch 对跨域被拒和网络不通都只抛笼统的 TypeError，给一句能指导下一步的提示。
    if (error instanceof TypeError) {
      const network = new Error(
        `连不上 ${settings.aiBaseUrl}。请检查地址是否正确、服务是否在运行，以及是否已在设置页授权。`,
      );
      network.code = "AI_NETWORK_ERROR";
      throw network;
    }
    throw error;
  } finally {
    clearTimeout(idleTimer);
    clearTimeout(hardTimer);
  }
}

/** 边读边计字节数，避免异常大的响应把内存吃满。 */
async function readBoundedAiResponse(response, onActivity) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    onActivity();
    return JSON.parse(text.trimStart());
  }

  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onActivity();
    bytes += value?.byteLength ?? 0;
    if (bytes > AI_MAX_RESPONSE_BYTES) {
      await reader.cancel?.().catch(() => {});
      const error = new Error("响应超过 2 MiB 上限。");
      error.code = "AI_RESPONSE_TOO_LARGE";
      throw error;
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return JSON.parse(text.trimStart());
}

/** 把模型服务的错误翻译成用户能看懂、且知道下一步该干什么的提示。 */
function aiErrorResponse(error) {
  // 这几类都要用户去设置页动手，原样透出提示即可。
  const actionable = [
    "NO_AI_CONFIG",
    "NEED_HOST_PERMISSION",
    "INVALID_BASE_URL",
    "AI_NETWORK_ERROR",
  ];
  if (actionable.includes(error.code)) {
    return { success: false, error: error.code, message: error.message };
  }
  if (error.status === 401 || error.status === 403) {
    return {
      success: false,
      error: "INVALID_AI_KEY",
      message: "服务拒绝了这个密钥，请在设置里检查密钥和地址是否匹配。",
    };
  }
  if (error.status === 404) {
    return {
      success: false,
      error: "MODEL_OR_ENDPOINT_NOT_FOUND",
      message: "服务返回 404，多半是模型名写错或 API 地址不对，请到设置页核对。",
    };
  }
  if (error.status === 429) {
    return {
      success: false,
      error: "RATE_LIMITED",
      message: "服务限流了，稍等一会儿再试。",
    };
  }
  return {
    success: false,
    error: error.code || "AI_REQUEST_FAILED",
    message: error.message || "AI 请求失败。",
  };
}

// ============================================================
// AI 概览
// ============================================================

/** 概览和笔记都需要字幕，统一从缓存拿，没有再走网络。 */
async function ensureTranscript(resource, { tabId } = {}) {
  const cached = await BILI_CACHE.load(resource.cacheId, { page: resource.page });
  if (cached?.transcript?.length) return { ...cached, success: true };
  return handleFetchTranscript(resource.videoId, {
    site: resource.site,
    page: resource.page,
    tabId,
  });
}

// 缓存的「读—改—写」必须串行：并发批次会各自读到旧快照，后写的覆盖先写的，
// 表现为「有些段落莫名其妙没保存下来」，既不报错也难复现。
const cacheWriteQueue = BILI_CONCURRENCY.createSerialQueue();

function updateCache(bvid, page, mutate) {
  return cacheWriteQueue(async () => {
    const current = (await BILI_CACHE.load(bvid, { page })) || {};
    const next = mutate(current);
    // 只是更新已有条目，跳过淘汰——淘汰要读全量存储，一次任务几十批经不起这么读。
    await BILI_CACHE.save(bvid, next, { page, evict: false });
    return next;
  });
}

// success / fromCache 是每次响应现算的，跟着 spread 写进缓存的话，
// 下次命中时旧标志会盖掉新标志，落库前必须剥掉。
function persistable(transcript) {
  const { success, fromCache, ...rest } = transcript;
  return rest;
}

// 侧边栏可能没开着，广播失败是正常的。
function reportProgress(kind, done, total) {
  chrome.runtime
    .sendMessage({ action: "aiProgress", kind, done, total })
    .catch(() => {});
}

async function handleAnalyzeTranscript(
  videoIdInput,
  { site = "bilibili", page = 1, forceRefresh = false, customPrompt = "" } = {},
) {
  const resource = resolveVideo(site, videoIdInput, page);
  if (!resource) {
    return { success: false, error: "INVALID_VIDEO_ID", message: "没有识别到视频 ID。" };
  }

  const cached = await BILI_CACHE.load(resource.cacheId, { page: resource.page });
  const settings = await getSettings();
  const analysisLanguage = settings.uiLanguage === "en" ? "en" : "zh-CN";
  const analysisPrompt = (
    String(customPrompt || "").trim() ||
    BILI_SETTINGS.DEFAULT_OVERVIEW_PROMPTS[analysisLanguage]
  ).slice(0, 5000);
  const cachedLanguage = cached?.analysisLanguage || "zh-CN";
  const cachedPrompt =
    cached?.analysisPrompt || BILI_SETTINGS.DEFAULT_OVERVIEW_PROMPTS[cachedLanguage];
  if (
    !forceRefresh &&
    cached?.analysis &&
    cachedLanguage === analysisLanguage &&
    cachedPrompt === analysisPrompt
  ) {
    return {
      success: true,
      fromCache: true,
      analysis: cached.analysis,
      analysisLanguage,
      analysisPrompt,
    };
  }

  const transcript = cached?.transcript?.length
    ? { ...cached, success: true }
    : await ensureTranscript(resource);
  if (!transcript.success) return transcript;

  try {
    const chunks = BILI_AI.planAnalysisChunks(transcript.segments);
    if (!chunks.length) {
      return { success: false, error: "NO_TRANSCRIPT", message: "没有可用的字幕。" };
    }

    const common = {
      videoTitle: transcript.videoInfo?.title || "未知",
      ownerName: transcript.videoInfo?.owner || "未知",
      videoDescription: transcript.videoInfo?.description || "（无简介）",
      outputLanguage: analysisLanguage === "en" ? "English" : "简体中文",
      customInstructions: analysisPrompt,
    };
    const totalDuration = Math.max(
      Math.floor(Number(transcript.videoInfo?.duration) || 0),
      chunks[chunks.length - 1].endSeconds,
    );

    debugLog(`[Bilibili Digest] 概览分 ${chunks.length} 块，并发 ${settings.aiConcurrency}`);
    reportProgress("analysis", 0, chunks.length);

    const analyzeOne = (chunk) => analyzeChunk(chunk, chunks.length, common);
    const results = await BILI_CONCURRENCY.mapWithConcurrency(
      chunks,
      settings.aiConcurrency,
      analyzeOne,
      (done, total) => reportProgress("analysis", done, total),
    );

    // 部分块失败多半是偶发超时或限流，静默补一轮；全军覆没通常是配置错误，不补。
    const failedIndexes = results
      .map((result, index) => (result.status === "rejected" ? index : -1))
      .filter((index) => index >= 0);
    if (failedIndexes.length && failedIndexes.length < chunks.length) {
      debugLog(`[Bilibili Digest] ${failedIndexes.length} 块失败，自动补一轮`);
      const retried = await BILI_CONCURRENCY.mapWithConcurrency(
        failedIndexes.map((index) => chunks[index]),
        settings.aiConcurrency,
        analyzeOne,
      );
      failedIndexes.forEach((chunkIndex, i) => {
        if (retried[i].status === "fulfilled") results[chunkIndex] = retried[i];
      });
    }

    const parts = results
      .filter((result) => result.status === "fulfilled" && result.value)
      .map((result) => result.value);
    const failures = results.filter((result) => result.status === "rejected");

    if (!parts.length) {
      // 全军覆没时把第一个真实错误透出去，它比「生成失败」有用得多。
      throw failures[0]?.reason || new Error("概览生成失败。");
    }

    const analysis = BILI_AI.mergeAnalyses(parts, totalDuration);
    if (!analysis.chapters.length && !analysis.keyQuotes.length) {
      return {
        success: false,
        error: "EMPTY_ANALYSIS",
        message: "模型没有产出有效的章节或金句，请重试。",
      };
    }

    // 概览与字幕存在同一条缓存里，下次打开直接命中。
    await updateCache(resource.cacheId, resource.page, (current) => ({
      ...current,
      ...persistable(transcript),
      analysis,
      analysisLanguage,
      analysisPrompt,
    }));

    return {
      success: true,
      fromCache: false,
      analysis,
      analysisLanguage,
      analysisPrompt,
      chunkCount: chunks.length,
      // 部分块失败仍然出结果，但要如实告诉用户这份概览是不完整的。
      failedChunks: failures.length,
    };
  } catch (error) {
    console.error("[Bilibili Digest] 概览生成失败：", error);
    return aiErrorResponse(error);
  }
}

// 时长相关变量按本块区间算，好让模型只覆盖这一段。
async function analyzeChunk(chunk, chunkCount, common) {
  const timing = BILI_AI.analysisTimingVariables(chunk.text, chunk.endSeconds);
  const rangeNote =
    chunkCount > 1
      ? `注意：这是长视频切分后的第 ${chunk.index + 1} / ${chunkCount} 段，` +
        `覆盖 ${BILI_TRANSCRIPT.formatTimestamp(chunk.startSeconds)} 到 ` +
        `${BILI_TRANSCRIPT.formatTimestamp(chunk.endSeconds)}。` +
        `只为这一段产出章节与金句，不要涉及其它时间段。`
      : "";

  // 前情只喂给模型当上下文，产出仍限定在本块区间内，靠 minTimestampSeconds 兜底。
  const contextNote = chunk.contextText
    ? `\n前情回顾（上一段的结尾，只用来理解本段承接什么，不要为它开章节或挑金句）：\n${chunk.contextText}\n`
    : "";

  const variables = {
    ...common,
    ...timing,
    rangeNote,
    contextNote,
    startFormatted: BILI_TRANSCRIPT.formatTimestamp(chunk.startSeconds),
    minTimestampSeconds: chunk.startSeconds,
    transcriptText: chunk.text,
  };
  const [systemPrompt, userPrompt] = await Promise.all([
    loadPromptSection("analysis.md", "系统提示词", variables),
    loadPromptSection("analysis.md", "用户提示词", variables),
  ]);

  const { text } = await requestAiCompletion({
    // 概览是摘要，产出远小于原文；分块之后每块更小。
    // 按正文长度估算即可，前情只进输入不进输出。
    maxTokens: BILI_AI.estimateOutputTokens(chunk.text.length, {
      ratio: 0.5,
      floor: 2048,
    }),
    responseFormat: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  return BILI_AI.validateAnalysis(
    BILI_AI.parseLooseJson(text),
    timing.maxTimestampSeconds,
    chunk.startSeconds,
  );
}

// ============================================================
// 逐条改写字幕：顺句（补标点 + 改同音错别字）与翻译（外文 → 中文）
// ============================================================

// 侧边栏按批发过来，这里再兜一道上限，避免异常大的请求。
const REWRITE_MAX_SEGMENTS_PER_CALL = 12;

/**
 * 顺句和翻译走同一条流水线：挑分段 → 查缓存 → 送模型 → 按 id 对回原位 → 写缓存。
 * 真正不同的只有下面这几项；prepare 按本次字幕算出提示词变量和对齐守卫。
 */
const REWRITE_TASKS = Object.freeze({
  polish: {
    label: "顺句",
    cacheKey: "polished",
    promptFile: "punctuate.md",
    // 原地补标点，输出量跟着输入走，再加上 JSON 结构和 id 的开销。
    tokenRatio: 1.5,
    async prepare() {
      return {
        variables: {},
        align: (parsed, todo) => {
          const { polished, rejected } = BILI_AI.alignPolishedSegments(parsed, todo);
          return { accepted: polished, rejected };
        },
      };
    },
  },
  translate: {
    label: "翻译",
    cacheKey: "translated",
    promptFile: "translation.md",
    // 中英互译字符数会变，按字符估 token 时统一放宽。
    tokenRatio: 2,
    async prepare(transcript) {
      // 方向由字幕轨语种决定：中文字幕译成英文，外文字幕译成中文。
      const toEnglish = BILI_TRANSCRIPT.isChineseSubtitle(transcript.language);
      const targetLang = toEnglish ? "en" : "zh";
      return {
        variables: {
          targetLangName: toEnglish ? "英文" : "简体中文",
          langRules: await loadPromptSection(
            "translation.md",
            toEnglish ? "英文规则" : "中文规则",
          ),
        },
        align: (parsed, todo) => {
          const { translated, rejected } = BILI_AI.alignTranslatedSegments(
            parsed,
            todo,
            { targetLang },
          );
          return { accepted: translated, rejected };
        },
      };
    },
  },
});

async function handleSegmentRewrite(
  kind,
  videoIdInput,
  { site = "bilibili", page = 1, segmentIds = [] } = {},
) {
  const task = REWRITE_TASKS[kind];
  const resource = resolveVideo(site, videoIdInput, page);
  if (!resource) {
    return { success: false, error: "INVALID_VIDEO_ID", message: "没有识别到视频 ID。" };
  }

  const cached = await BILI_CACHE.load(resource.cacheId, { page: resource.page });
  const transcript = cached?.segments?.length
    ? { ...cached, success: true }
    : await ensureTranscript(resource);
  if (!transcript.success) return transcript;

  const requested = new Set((segmentIds || []).map(String));
  const segments = (transcript.segments || [])
    .filter((segment) => requested.has(segment.id))
    .slice(0, REWRITE_MAX_SEGMENTS_PER_CALL);
  if (!segments.length) {
    return { success: false, error: "NO_SEGMENTS", message: "没有需要处理的分段。" };
  }

  const done = cached?.[task.cacheKey] || {};
  const todo = segments.filter((segment) => !done[segment.id]);
  if (!todo.length) {
    const hit = {};
    for (const segment of segments) hit[segment.id] = done[segment.id];
    return { success: true, fromCache: true, [task.cacheKey]: hit };
  }

  try {
    const { variables: extraVariables, align } = await task.prepare(transcript);
    const payload = {
      segments: todo.map((segment) => ({ id: segment.id, text: segment.text })),
    };
    const variables = {
      ...extraVariables,
      videoTitle: transcript.videoInfo?.title || "未知",
      segmentsJson: JSON.stringify(payload),
    };
    const [systemPrompt, userPrompt] = await Promise.all([
      loadPromptSection(task.promptFile, "系统提示词", variables),
      loadPromptSection(task.promptFile, "用户提示词", variables),
    ]);

    const { text } = await requestAiCompletion({
      maxTokens: BILI_AI.estimateOutputTokens(variables.segmentsJson.length, {
        ratio: task.tokenRatio,
        floor: 2048,
      }),
      // 两者都是照着原文做的，不是创作，温度越低越贴近原意。
      temperature: 0.2,
      responseFormat: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const { accepted, rejected } = align(BILI_AI.parseLooseJson(text), todo);
    if (rejected.length) {
      debugLog(`[Bilibili Digest] ${task.label}丢弃的条目：`, rejected);
    }

    // 这些批次是并发跑的，读—改—写要走串行队列，否则会互相覆盖。
    const saved = await updateCache(resource.cacheId, resource.page, (current) => ({
      ...current,
      ...persistable(transcript),
      [task.cacheKey]: { ...(current[task.cacheKey] || {}), ...accepted },
    }));

    // 命中缓存的那部分也一并回给侧边栏，它只认返回值。
    const response = { ...accepted };
    for (const segment of segments) {
      if (!response[segment.id] && saved[task.cacheKey][segment.id]) {
        response[segment.id] = saved[task.cacheKey][segment.id];
      }
    }
    return { success: true, fromCache: false, [task.cacheKey]: response, rejected };
  } catch (error) {
    console.error(`[Bilibili Digest] ${task.label}失败：`, error);
    return aiErrorResponse(error);
  }
}

const handlePolishSegments = (bvid, options) =>
  handleSegmentRewrite("polish", bvid, options);
const handleTranslateSegments = (bvid, options) =>
  handleSegmentRewrite("translate", bvid, options);

// ============================================================
// 多轮视频问答
// ============================================================

function analysisAsChatContext(analysis) {
  if (!analysis) return "（尚未生成概览）";
  const chapters = (analysis.chapters || []).map(
    (chapter) =>
      `[${chapter.timestamp}] ${chapter.title}${chapter.summary ? `：${chapter.summary}` : ""}`,
  );
  const quotes = (analysis.keyQuotes || []).map(
    (quote) => `[${quote.timestamp}] 金句：${quote.quote}`,
  );
  return [...chapters, ...quotes].join("\n").slice(0, 8_000) || "（概览为空）";
}

function normalizeChatContextSelection(selection) {
  // 兼容已有侧边栏：它们尚未发送该字段时，沿用原来的「全关联」行为。
  if (!selection || typeof selection !== "object") {
    return { transcript: true, overview: true, notes: true };
  }
  return {
    transcript: selection.transcript === true,
    overview: selection.overview === true,
    notes: selection.notes === true,
  };
}

function notesAsChatContext(notes, resource) {
  if (!resource) return "（当前没有关联视频，未附加笔记）";
  const matching = notes.filter(
    (note) =>
      (note.site || "bilibili") === resource.site &&
      note.bvid === resource.videoId &&
      typeof note.text === "string" &&
      note.text.trim(),
  );
  const content = matching
    .slice(0, 20)
    .map((note) => {
      const timestamp = note.timestamp ? `[${note.timestamp}] ` : "";
      return `${timestamp}${note.text.trim().slice(0, 1_500)}`;
    })
    .join("\n\n")
    .slice(0, 8_000);
  return content || "（当前视频没有已保存笔记）";
}

async function handleAskVideo({
  bvid: videoIdInput,
  site,
  page = 1,
  tabId,
  videoInfo: providedVideoInfo,
  question,
  history = [],
  contextSelection,
}) {
  const resource = resolveVideo(site, videoIdInput, page);
  const selectedContext = normalizeChatContextSelection(contextSelection);
  const useVideoContext = Object.values(selectedContext).some(Boolean);
  const userQuestion = String(question || "").trim().slice(0, 2_000);
  if (!userQuestion) {
    return { success: false, error: "EMPTY_QUESTION", message: "请先输入问题。" };
  }

  // 问答不依赖字幕管线。能取到字幕就把它作为额外上下文；取不到、视频没有
  // 字幕，甚至当前没有关联视频时，都仍然按普通 AI 对话继续。
  let transcript = null;
  let videoInfo =
    providedVideoInfo && typeof providedVideoInfo === "object"
      ? providedVideoInfo
      : {};
  if (resource && (selectedContext.transcript || selectedContext.overview)) {
    try {
      // 只读已经取得的缓存，不为一次聊天重新阻塞式拉字幕。
      const cached = await BILI_CACHE.load(resource.cacheId, { page: resource.page });
      if (cached?.transcript?.length) {
        transcript = cached;
        videoInfo = { ...(cached.videoInfo || {}), ...videoInfo };
      }
    } catch (error) {
      debugLog("[Video Digest AI] 问答未读到字幕缓存，将继续普通对话：", error);
    }

    // YouTube 的标题等信息可直接向当前页面读取；失败也不阻断问答。
    if (!videoInfo.title && resource.site === "youtube" && useVideoContext) {
      try {
        videoInfo = await readYouTubePageInfo(tabId);
      } catch (error) {
        debugLog("[Video Digest AI] 问答未取得视频基本信息：", error);
      }
    }
  }

  let notesContext = "（用户未选择关联笔记）";
  if (selectedContext.notes) {
    try {
      notesContext = notesAsChatContext(await readNotes(), resource);
    } catch (error) {
      debugLog("[Video Digest AI] 问答未读到笔记，将跳过笔记上下文：", error);
      notesContext = "（没有可用的已保存笔记）";
    }
  }

  try {
    const variables = {
      videoTitle: useVideoContext
        ? videoInfo.title || (resource ? resource.videoId : "（未关联视频）")
        : "（未关联视频）",
      ownerName: useVideoContext
        ? videoInfo.owner || videoInfo.channelName || "未知"
        : "（无）",
      videoDescription:
        useVideoContext
          ? String(videoInfo.description || "（无简介）").slice(0, 4_000)
          : "（未关联视频资料）",
      overviewText: selectedContext.overview && transcript
        ? analysisAsChatContext(transcript.analysis)
        : selectedContext.overview
          ? "（当前没有可用的视频概览）"
          : "（用户未选择关联概览）",
      transcriptContext: selectedContext.transcript && transcript?.segments?.length
        ? BILI_AI.buildChatTranscriptContext(transcript.segments, userQuestion)
        : selectedContext.transcript
          ? "（当前没有可用的视频字幕；可以正常回答一般问题，但不要假装了解未提供的视频内容。）"
          : "（用户未选择关联字幕）",
      notesContext,
      question: userQuestion,
    };
    const [systemPrompt, userPrompt] = await Promise.all([
      loadPromptSection("ask.md", "系统提示词", variables),
      loadPromptSection("ask.md", "用户提示词", variables),
    ]);
    const safeHistory = BILI_AI.normalizeChatHistory(history);
    const { text, providerRole } = await requestAiCompletion({
      maxTokens: 2_048,
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        ...safeHistory,
        { role: "user", content: userPrompt },
      ],
    });
    return {
      success: true,
      answer: text.trim().slice(0, 12_000),
      providerRole,
    };
  } catch (error) {
    console.error("[Video Digest AI] 视频问答失败：", error);
    return aiErrorResponse(error);
  }
}

// ============================================================
// 划词解释
// ============================================================

async function handleExplainSelection(selectedText, transcriptContext, videoTitle) {
  const text = String(selectedText || "").trim();
  if (!text) {
    return { success: false, error: "EMPTY_SELECTION", message: "没有选中任何文字。" };
  }

  try {
    const variables = {
      videoTitle: videoTitle || "未知",
      selectedText: text.slice(0, 1000),
      transcriptContext: String(transcriptContext || "").slice(0, 4000) || "无",
    };
    const [systemPrompt, userPrompt] = await Promise.all([
      loadPromptSection("explain.md", "系统提示词", variables),
      loadPromptSection("explain.md", "用户提示词", variables),
    ]);

    const { text: explanation } = await requestAiCompletion({
      maxTokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    return { success: true, explanation: explanation.trim() };
  } catch (error) {
    console.error("[Bilibili Digest] 划词解释失败：", error);
    return aiErrorResponse(error);
  }
}

// ============================================================
// 笔记
// ============================================================

// 笔记的「读—改—写」也要串行：润色是保存后异步落笔的，会和新增 / 删除并发。
const notesWriteQueue = BILI_CONCURRENCY.createSerialQueue();

async function readNotes() {
  const stored = await chrome.storage.local.get(NOTES_STORAGE_KEY);
  return Array.isArray(stored[NOTES_STORAGE_KEY])
    ? stored[NOTES_STORAGE_KEY]
    : [];
}

function jsonByteLength(value) {
  const source = JSON.stringify(value);
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(source).byteLength;
  return source.length;
}

function pageNotes(notes, { offset, limit } = {}) {
  const totalCount = notes.length;
  // 未传分页参数的旧调用方仍按原行为取得全部数据。
  if (!Number.isFinite(Number(limit))) {
    return { notes, totalCount, hasMore: false };
  }
  const start = Math.max(0, Math.floor(Number(offset) || 0));
  const size = Math.min(100, Math.max(1, Math.floor(Number(limit) || 100)));
  const page = notes.slice(start, start + size);
  return { notes: page, totalCount, hasMore: start + page.length < totalCount };
}

async function capNotesForStorage(notes, { noteLimit, protectedNoteId } = {}) {
  const capped = notes.slice(0, noteLimit);
  const removed = notes.slice(noteLimit);
  const [allBytes, currentNotesBytes] = await Promise.all([
    chrome.storage.local.getBytesInUse(null),
    chrome.storage.local.getBytesInUse(NOTES_STORAGE_KEY),
  ]);
  const nonNoteBytes = Math.max(0, Number(allBytes) - Number(currentNotesBytes));
  // 缓存等非笔记内容已超过安全线时，不为了保存一条笔记而清空原有笔记。
  if (nonNoteBytes >= NOTE_STORAGE_SAFE_BYTES) {
    return { notes: capped, removed, storageBlocked: true };
  }
  while (
    capped.length &&
    nonNoteBytes + jsonByteLength({ [NOTES_STORAGE_KEY]: capped }) > NOTE_STORAGE_SAFE_BYTES
  ) {
    const oldest = capped.at(-1);
    // 正在保存/编辑的条目不得被悄悄裁掉，直接反馈容量不足。
    if (oldest?.id === protectedNoteId) {
      return { notes: capped, removed, storageBlocked: true };
    }
    removed.push(capped.pop());
  }
  return { notes: capped, removed, storageBlocked: false };
}

function mutateNotes(mutate, { protectedNoteId } = {}) {
  return notesWriteQueue(async () => {
    const notes = await readNotes();
    const next = mutate(notes);
    const settings = await getSettings();
    const result = await capNotesForStorage(next, {
      noteLimit: settings.noteLimit,
      protectedNoteId,
    });
    if (result.storageBlocked && protectedNoteId) {
      throw new Error("笔记存储已达到 7 MB 安全线，请导出或删除部分笔记后再保存。");
    }
    await chrome.storage.local.set({ [NOTES_STORAGE_KEY]: result.notes });
    return result;
  });
}

async function enforceStoredNoteLimits() {
  const result = await mutateNotes((notes) => notes);
  return {
    success: true,
    removedCount: result.removed.length,
    storageBlocked: result.storageBlocked,
  };
}

async function handleGetNoteStats() {
  const [notes, settings, notesBytes, totalBytes] = await Promise.all([
    readNotes(),
    getSettings(),
    chrome.storage.local.getBytesInUse(NOTES_STORAGE_KEY),
    chrome.storage.local.getBytesInUse(null),
  ]);
  return {
    success: true,
    totalCount: notes.length,
    noteLimit: settings.noteLimit,
    notesBytes,
    totalBytes,
    safeBytes: NOTE_STORAGE_SAFE_BYTES,
  };
}

// 请模型把口语字幕整理成通顺的笔记。失败返回 null，笔记保持原始字幕。
async function polishNoteText(context, videoTitle) {
  try {
    const variables = {
      videoTitle: videoTitle || "未知",
      fullContext: context.fullContext,
      beforeText: context.beforeText || "（无）",
      targetText: context.targetText,
      afterText: context.afterText || "（无）",
    };
    const [systemPrompt, userPrompt] = await Promise.all([
      loadPromptSection("note-cleanup.md", "系统提示词", variables),
      loadPromptSection("note-cleanup.md", "用户提示词", variables),
    ]);

    const { text } = await requestAiCompletion({
      maxTokens: 512,
      responseFormat: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const parsed = BILI_AI.parseLooseJson(text);
    if (typeof parsed?.quote === "string" && parsed.quote.trim()) {
      return parsed.quote.trim().slice(0, 3000);
    }
    return null;
  } catch (error) {
    // 润色失败不该让笔记丢掉，原始文本已经在库里了。
    console.warn("[Bilibili Digest] 笔记润色失败，保留原始字幕：", error.message);
    return null;
  }
}

// 后台润色完成后把正文换掉。笔记可能已被删除，map 不命中就什么都不做。
async function polishNoteWhenReady(noteId, context, videoTitle) {
  const polished = await polishNoteText(context, videoTitle);
  await mutateNotes(
    (notes) =>
      notes.map((note) =>
        note.id === noteId && note.pending
          ? { ...note, text: polished || note.text, pending: false }
          : note,
      ),
    { protectedNoteId: noteId },
  );
  chrome.runtime.sendMessage({ action: "noteUpdated", noteId }).catch(() => {});
}

async function handleSaveNote({
  bvid: videoIdInput,
  videoId: legacyVideoId,
  site = "bilibili",
  page = 1,
  timestamp,
  text: manualText,
  kind: noteKind,
}) {
  const resource = resolveVideo(site, videoIdInput || legacyVideoId, page);
  if (!resource) {
    return { success: false, error: "INVALID_VIDEO_ID", message: "没有识别到视频 ID。" };
  }
  const seconds = Math.max(0, Math.floor(Number(timestamp) || 0));

  const transcript = await ensureTranscript(resource);
  if (!transcript.success) return transcript;

  const videoTitle = transcript.videoInfo?.title || "";
  // 字幕或概览里的「存为笔记」已经有整理好的文字，不必再过一次模型。
  let noteText = String(manualText || "").trim();
  let rawText = noteText;
  let polishContext = null;

  if (!noteText) {
    const context = BILI_AI.noteContextAt(transcript.transcript, seconds);
    if (!context) {
      return { success: false, error: "NO_TRANSCRIPT", message: "没有可用的字幕。" };
    }
    rawText = context.targetText;
    // 先用原始字幕落库，保存立即完成；润色在后台跑完再替换正文。
    noteText = [context.beforeText, context.targetText, context.afterText]
      .filter(Boolean)
      .join(" ");
    // 本地推理服务往往不需要密钥，所以用完整校验而不是只看密钥有没有填。
    const settings = await getSettings();
    if (BILI_SETTINGS.validateAppSettings(settings).ok) polishContext = context;
  }

  const note = {
    id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    bvid: resource.videoId,
    site: resource.site,
    videoId: resource.videoId,
    page: resource.page,
    videoTitle: videoTitle.slice(0, 500),
    ownerName: (transcript.videoInfo?.owner || "").slice(0, 300),
    timestamp: BILI_TRANSCRIPT.formatTimestamp(seconds),
    timestampSeconds: seconds,
    timestampedUrl: canonicalVideoUrl(resource, seconds),
    text: noteText,
    rawText,
    kind: noteKind === "ai_chat" ? "ai_chat" : "quote",
    // 界面靠它显示「润色中」；配合 createdAt 识别润色中途挂掉留下的僵尸标记
    pending: Boolean(polishContext),
    createdAt: Date.now(),
  };

  const mutation = await mutateNotes((notes) => {
    notes.unshift(note);
    return notes;
  }, { protectedNoteId: note.id });

  // 侧边栏可能开着笔记页，通知它刷新。
  chrome.runtime.sendMessage({ action: "noteSaved", note }).catch(() => {});

  // 故意不 await：让播放页的按钮立刻得到「已保存」。
  if (polishContext) polishNoteWhenReady(note.id, polishContext, videoTitle);

  return { success: true, note, removedCount: mutation.removed.length };
}

async function handleGetNotes(videoIdInput, site = "bilibili", scope = "video", page) {
  const notes = await readNotes();
  if (scope === "all") {
    return {
      success: true,
      ...pageNotes(notes, page),
    };
  }
  const regularNotes = notes.filter(
    (note) => !["memo", "ai_note", "ai_chat"].includes(note.kind),
  );
  const resource = videoIdInput ? resolveVideo(site, videoIdInput) : null;
  const selectedNotes = resource
    ? regularNotes.filter(
        (note) =>
          (note.site || "bilibili") === resource.site &&
          note.bvid === resource.videoId,
      )
    : regularNotes;
  return {
    success: true,
    ...pageNotes(selectedNotes, page),
  };
}

async function handleSaveMemo({
  text,
  kind,
  site,
  bvid: videoIdInput,
  page = 1,
  videoTitle,
  timestamp,
}) {
  const memoText = String(text || "").trim().slice(0, 10_000);
  if (!memoText) {
    return { success: false, error: "EMPTY_MEMO", message: "请先输入手记内容。" };
  }

  const memo = {
    id: `memo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind: kind === "ai_note" ? "ai_note" : "memo",
    text: memoText,
    createdAt: Date.now(),
  };
  const resource = videoIdInput ? resolveVideo(site, videoIdInput, page) : null;
  if (resource) {
    const seconds = Math.max(0, Math.floor(Number(timestamp) || 0));
    Object.assign(memo, {
      site: resource.site,
      bvid: resource.videoId,
      videoId: resource.videoId,
      page: resource.page,
      videoTitle: String(videoTitle || resource.videoId).trim().slice(0, 500),
      timestamp: BILI_TRANSCRIPT.formatTimestamp(seconds),
      timestampSeconds: seconds,
      timestampedUrl: canonicalVideoUrl(resource, seconds),
    });
  }

  const mutation = await mutateNotes((notes) => {
    notes.unshift(memo);
    return notes;
  }, { protectedNoteId: memo.id });
  chrome.runtime.sendMessage({ action: "noteSaved", note: memo }).catch(() => {});
  return { success: true, memo, removedCount: mutation.removed.length };
}

async function handleGetMemos(kind, page) {
  const notes = await readNotes();
  const memos = notes.filter((note) =>
    kind === "ai_note"
      ? note.kind === "ai_note" || note.kind === "ai_chat"
      : note.kind === "memo",
  );
  return { success: true, ...pageNotes(memos, page) };
}

async function handleDeleteNote(noteId) {
  await mutateNotes((notes) => notes.filter((note) => note.id !== noteId));
  return { success: true };
}

async function handleDeleteNotes(noteIds) {
  const ids = new Set(
    Array.isArray(noteIds)
      ? noteIds.filter((noteId) => typeof noteId === "string" && noteId)
      : [],
  );
  if (!ids.size) return { success: false, error: "EMPTY_SELECTION", message: "请先选择笔记。" };
  let deletedCount = 0;
  await mutateNotes((notes) =>
    notes.filter((note) => {
      const matched = ids.has(note.id);
      if (matched) deletedCount += 1;
      return !matched;
    }),
  );
  return { success: true, deletedCount };
}

function noteMatchesScope(note, { site, bvid, scope }) {
  if (scope === "all") return true;
  if (scope === "memo") return note.kind === "memo";
  if (scope === "ai") return note.kind === "ai_note" || note.kind === "ai_chat";
  if (scope !== "video") return false;
  const resource = bvid ? resolveVideo(site, bvid) : null;
  return Boolean(
    resource &&
      !["memo", "ai_note", "ai_chat"].includes(note.kind) &&
      (note.site || "bilibili") === resource.site &&
      note.bvid === resource.videoId,
  );
}

async function handleClearNotes({ site = "bilibili", bvid, scope = "video" }) {
  let deletedCount = 0;
  await mutateNotes((notes) =>
    notes.filter((note) => {
      const matched = noteMatchesScope(note, { site, bvid, scope });
      if (matched) deletedCount += 1;
      return !matched;
    }),
  );
  return { success: true, deletedCount };
}

async function handleUpdateNote(noteId, text) {
  const nextText = String(text || "").trim().slice(0, 12_000);
  if (!nextText) {
    return { success: false, error: "EMPTY_NOTE", message: "笔记内容不能为空。" };
  }
  let found = false;
  await mutateNotes((notes) =>
    notes.map((note) => {
      if (note.id !== noteId) return note;
      found = true;
      // 手动修改应胜过尚未完成的 AI 润色，避免后台结果把用户编辑覆盖掉。
      return { ...note, text: nextText, pending: false, updatedAt: Date.now() };
    }),
    { protectedNoteId: noteId },
  );
  if (!found) return { success: false, error: "NOTE_NOT_FOUND", message: "笔记不存在。" };
  chrome.runtime.sendMessage({ action: "noteUpdated", noteId }).catch(() => {});
  return { success: true };
}

// 开新标签页前先问一句视频还在不在，免得用户等页面加载完才看到「稿件不可见」。
// 判不准时一律放行：拦下还能看的视频比多开一个标签页糟糕得多。
async function handleCheckVideoAvailable(videoIdInput, site = "bilibili") {
  const resource = resolveVideo(site, videoIdInput);
  if (!resource) return { available: false, message: "这条笔记没有记下有效的视频号。" };

  if (resource.site === "youtube") return { available: true };

  try {
    await BILI_API.fetchVideoInfo(resource.videoId);
    return { available: true };
  } catch (error) {
    if (error?.code === "VIDEO_UNAVAILABLE") {
      return { available: false, message: "视频已下架，无法查看原视频。" };
    }
    return { available: true };
  }
}
