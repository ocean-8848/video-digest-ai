/**
 * Video Digest AI — 侧边栏：字幕 / 概览 / 笔记 / 问 AI 四个标签页。
 *
 * 字幕区三视图（原文 / 译文 / 双语）人人都有，翻译方向由字幕语种决定；
 * 「顺句」只给中文字幕，且与三视图可叠加（开着顺句时原文指顺句稿）。
 * 侧边栏是全窗口共享的，标签页查询都限定在本面板所属窗口内。
 */

"use strict";

const POLL_INTERVAL_MS = 1000;
// 用户手动滚动后先别抢滚动条；有「回到当前句」浮标兜底，这个窗口可以放宽。
const AUTOSCROLL_SUPPRESS_MS = 8000;

const SIDE_PANEL_EN = Object.freeze({
  "缓存": "Cached",
  "字幕": "Transcript",
  "概览": "Overview",
  "笔记": "Notes",
  "问 AI": "Ask AI",
  "正在获取字幕…": "Fetching captions…",
  "打开一个视频": "Open a video",
  "支持 YouTube 标准播放页，以及 Bilibili 普通视频、合集和分P页面。":
    "Supports standard YouTube watch pages and Bilibili videos, collections, and multi-part pages.",
  "此网站已停用": "This site is disabled",
  "可在设置的“适用范围”中重新开启。":
    "Re-enable it under Site availability in Settings.",
  "打开设置": "Open settings",
  "出错了": "Something went wrong",
  "字幕需要登录": "Sign-in required for captions",
  "没能取到字幕": "Could not fetch captions",
  "未知错误，请重试。": "Unknown error. Please try again.",
  "重试": "Retry",
  "去登录 Bilibili": "Sign in to Bilibili",
  "顺句": "Polish",
  "原文": "Original",
  "译文": "Translation",
  "双语": "Bilingual",
  "复制": "Copy",
  "导出": "Export",
  "回到当前句": "Back to current line",
  "生成 AI 概览": "Generate AI overview",
  "把整段字幕交给大模型，产出覆盖全片的章节和 3-5 条金句。需要先在设置页配置 AI 服务。":
    "Generate chapters covering the full video and 3–5 key quotes. Configure an AI provider in Settings first.",
  "生成概览": "Generate overview",
  "正在生成概览…": "Generating overview…",
  "正在准备…": "Preparing…",
  "长视频会切成多块并发生成，可在设置页调整并发数。":
    "Long videos are processed in parallel chunks. Concurrency can be changed in Settings.",
  "重新生成": "Regenerate",
  "章节": "Chapters",
  "金句": "Key quotes",
  "本视频": "This video",
  "全部": "All",
  "手记": "Memos",
  "AI 记": "AI Notes",
  "还没有笔记": "No notes yet",
  "播放时点播放器上的「笔记」按钮，或按 n，就能记下当前时间点的一条笔记。":
    "Use the Note button on the player, or press N, to save a note at the current time.",
  "播放时点播放器上的「笔记」按钮，或按":
    "Use the Note button on the player, or press",
  "，就能记下当前时间点的一条笔记。":
    "to save a note at the current timestamp.",
  "记录一条手记": "Write a memo",
  "视频页保存时会附带当前播放位置":
    "When saved on a video page, the current playback position is included",
  "保存": "Save",
  "还没有手记": "No memos yet",
  "无需打开视频，也可以随时记录文字。":
    "You can write a memo at any time, even without a video open.",
  "还没有 AI 记": "No AI notes yet",
  "在“问 AI”中可将任意回答保存到这里。":
    "Save any answer from Ask AI here.",
  "有视频上下文时优先结合，也支持普通问答":
    "Uses video context when available and also supports general questions",
  "关联上下文": "Use context",
  "关联字幕": "Use transcript",
  "关联概述": "Use overview",
  "关联 Note": "Use notes",
  "清空对话": "Clear chat",
  "Enter 发送 · Shift+Enter 换行": "Enter to send · Shift+Enter for a new line",
  "发送": "Send",
  "常用提问": "Suggested questions",
  "编辑预设": "Edit presets",
  "管理预设问题": "Manage preset questions",
  "自定义常用问题": "Custom preset questions",
  "输入新的预设问题…": "Enter a new preset question…",
  "恢复默认": "Reset to default",
  "完成": "Done",
  "添加": "Add",
  "想问 AI 什么？": "What would you like to ask?",
  "有字幕或概览时会自动结合视频；没有上下文也可以自由问答。":
    "Video captions and the overview are used when available; you can also ask without context.",
  "解释": "Explain",
  "输入问题…": "Type a question…",
  "向 AI 提问": "Ask AI",
  "写下想法、待办或灵感…": "Write down an idea, task, or thought…",
  "重新获取字幕（跳过缓存）": "Refresh captions (skip cache)",
  "重新获取字幕": "Refresh captions",
  "用 AI 补标点、改同音错别字（需先配置 AI 服务）":
    "Use AI to add punctuation and fix recognition errors (AI provider required)",
  "在字幕里搜索（快捷键 /）": "Search transcript (shortcut: /)",
  "搜索字幕": "Search transcript",
  "搜索字幕（原文、顺句稿、译文都会搜）":
    "Search original, polished, and translated text",
  "关闭搜索": "Close search",
  "请先输入问题。": "Enter a question first.",
  "AI 正在思考…": "AI is thinking…",
  "存入 AI 记": "Save to AI Notes",
  "已存入 AI 记": "Saved to AI Notes",
  "保存失败": "Save failed",
  "保存中…": "Saving…",
  "已保存": "Saved",
  "存为笔记": "Save as note",
  "打开": "Open",
  "播放": "Play",
  "链接": "Link",
  "已复制": "Copied",
  "删除这条笔记": "Delete this note",
  "删除这条手记": "Delete this memo",
  "删除这条 AI 记": "Delete this AI note",
  "删除": "Delete",
  "选择这条笔记": "Select this note",
  "已选": "Selected",
  "全选已加载": "Select loaded",
  "取消全选已加载": "Deselect loaded",
  "删除所选": "Delete selected",
  "清空当前范围": "Clear current scope",
  "跳到这个时间点": "Jump to this timestamp",
  "在新标签页打开原视频并跳到这一刻":
    "Open the original video at this timestamp in a new tab",
  "复制笔记正文": "Copy note text",
  "复制带时间戳的视频链接": "Copy timestamped video link",
  "打开视频并跳到记录位置": "Open the video at the saved timestamp",
  "复制手记正文": "Copy memo text",
  "编辑": "Edit",
  "编辑这条笔记": "Edit this note",
  "保存修改": "Save changes",
  "取消": "Cancel",
  "笔记内容不能为空。": "Note content cannot be empty.",
  "保存失败，请重试。": "Save failed. Please try again.",
  "回答中…": "Answering…",
  "概览生成失败": "Overview generation failed",
  "概览提示词（可调整）": "Overview prompt (editable)",
  "修改会自动保存在本机，并用于下一次生成。":
    "Changes are saved locally and used for the next generation.",
  "已自动保存": "Saved automatically",
  "请稍后重试。": "Please try again later.",
  "这个视频还没有笔记": "No notes for this video",
  "还没有任何笔记": "No notes yet",
  "导出当前范围": "Export current scope",
  "导出为 JSON": "Export as JSON",
  "导出为 Markdown": "Export as Markdown",
  "导出为 CSV": "Export as CSV",
  "同步全部笔记": "Sync all notes",
  "同步飞书": "sync2lark",
  "将全部笔记逐条同步到飞书": "Sync all notes to Lark, one record per request",
  "将这条笔记同步到飞书": "Sync this note to Lark",
  "正在同步…": "Syncing…",
  "已同步": "Synced",
  "同步失败": "Sync failed",
  "请先在设置中保存飞书多维表格 Webhook。":
    "Save a Lark Bitable Webhook in Settings first.",
  "没有可同步的笔记。": "There are no notes to sync.",
  "加载更多": "Load more",
  "已显示": "Showing",
  "共": "of",
  "访问锚点": "Open timestamp",
  "已保存，并记录当前视频访问锚点。":
    "Saved with the current video timestamp.",
  "已保存。": "Saved.",
  "请先输入手记内容。": "Write something before saving.",
  "顺句中": "Polishing…",
  "翻译中…": "Translating…",
  "AI 正在润色这条笔记…": "AI is polishing this note…",
  "正在解释…": "Explaining…",
});

const SIDE_PANEL_ZH = Object.freeze(
  Object.fromEntries(Object.entries(SIDE_PANEL_EN).map(([zh, en]) => [en, zh])),
);

function uiText(text) {
  const value = String(text ?? "");
  const dictionary = state.uiLanguage === "en" ? SIDE_PANEL_EN : SIDE_PANEL_ZH;
  if (dictionary[value]) return dictionary[value];
  const normalized = value.replace(/\s+/g, " ").trim();
  if (dictionary[normalized]) return dictionary[normalized];
  const replacements =
    state.uiLanguage === "en"
      ? [
          [/^(\d+) 段$/, "$1 segments"],
          [/^(\d+) 章节$/, "$1 chapters"],
          [/^(\d+) 金句$/, "$1 key quotes"],
          [/^(\d+) 条$/, "$1 items"],
          [/^(\d+) 条命中$/, "$1 matches"],
          [/^已选 (\d+) 条$/, "$1 selected"],
          [/^已显示 (\d+) \/ 共 (\d+) 条$/, "Showing $1 of $2"],
          [/^正在同步飞书 (\d+)\/(\d+)…$/, "Syncing to Lark $1/$2…"],
          [/^已同步 (\d+) 条笔记。$/, "$1 notes synced."],
          [/^已同步 (\d+) 条，(\d+) 条失败。$/, "$1 notes synced; $2 failed."],
          [/^(\d+) 块失败，结果不完整$/, "$1 chunks failed; result incomplete"],
          [/^已保存$/, "Saved"],
        ]
      : [
          [/^(\d+) segments$/, "$1 段"],
          [/^(\d+) chapters$/, "$1 章节"],
          [/^(\d+) key quotes$/, "$1 金句"],
          [/^(\d+) items$/, "$1 条"],
          [/^(\d+) matches$/, "$1 条命中"],
          [/^(\d+) selected$/, "已选 $1 条"],
          [/^Showing (\d+) of (\d+)$/, "已显示 $1 / 共 $2 条"],
          [/^Syncing to Lark (\d+)\/(\d+)…$/, "正在同步飞书 $1/$2…"],
          [/^(\d+) notes synced\.$/, "已同步 $1 条笔记。"],
          [/^(\d+) notes synced; (\d+) failed\.$/, "已同步 $1 条，$2 条失败。"],
          [/^(\d+) chunks failed; result incomplete$/, "$1 块失败，结果不完整"],
          [/^Saved$/, "已保存"],
        ];
  return replacements.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    value,
  );
}

function applySidepanelLanguage() {
  document.documentElement.lang = state.uiLanguage;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (
      node.parentElement?.closest?.(
        ".segment-text, .entry-text, .chat-message-text, .video-title, .note-meta, .memo-created",
      )
    ) {
      continue;
    }
    const match = node.nodeValue.match(/^(\s*)(.*?)(\s*)$/s);
    if (!match?.[2]) continue;
    node.nodeValue = `${match[1]}${uiText(match[2])}${match[3]}`;
  }
  for (const element of document.querySelectorAll("[placeholder], [title], [aria-label]")) {
    for (const attribute of ["placeholder", "title", "aria-label"]) {
      if (element.hasAttribute(attribute)) {
        element.setAttribute(attribute, uiText(element.getAttribute(attribute)));
      }
    }
  }
  const syncAllButton = el("syncAllNotesLarkBtn");
  if (syncAllButton) {
    syncAllButton.textContent = uiText("同步飞书");
    syncAllButton.title = uiText("将全部笔记逐条同步到飞书");
  }
}

const state = {
  windowId: null,
  uiLanguage: "zh-CN",
  tabId: null,
  site: null,
  bvid: null,
  page: 1,
  data: null,
  analysis: null,
  analysisLanguage: null,
  polished: {}, // 分段 id → 顺句后的文字
  polishMode: false,
  translated: {}, // 分段 id → 译文（中文字幕对应英文，外文字幕对应中文）
  transcriptMode: "original", // original | translated | bilingual
  isChinese: true, // 决定顺句入口的有无与翻译方向的提示
  polishRun: 0, // 换视频/切换显示方式时自增，用来作废进行中的批次
  view: "idle", // idle | disabled | loading | error | ready
  errorResult: null,
  tab: "transcript",
  notesScope: "video", // video | all | memo | ai
  activeIndex: -1,
  lastUserScrollAt: 0,
  lastAutoScrollAt: 0,
  searchQuery: "", // 搜索期间暂停自动跟随，命中行之外全部藏起
  currentTime: 0,
  chatMessages: [], // 当前视频的多轮问答，仅在本次侧栏会话中保留
  chatSending: false,
  chatQuestionsEditing: null,
  appSettings: null,
  notesForExport: [],
  notesLoaded: [],
  notesTotalCount: 0,
  notesHasMore: false,
  notesDeleteMode: false,
  selectedNoteIds: new Set(),
  overviewPrompts: { ...BILI_SETTINGS.DEFAULT_OVERVIEW_PROMPTS },
  // 提示词的编辑语言可独立于侧栏界面语言；例如中文界面也能直接维护英文模板。
  overviewPromptLanguage: "zh-CN",
};

const el = (id) => document.getElementById(id);

// 字幕行的 DOM 索引，renderSegments 时重建。直接持有节点引用让查找变 O(1)：
// 用 querySelector 找行的话，上千段的视频全量重画就是 O(n²)，切视图会卡。
const segmentView = {
  rows: [], // 与 segments 同下标
  byId: new Map(), // 分段 id → { row, text }
  activeRow: null,
};

// ============================================================
// 渲染调度
// ============================================================

const SECTIONS = [
  "loadingState",
  "idleState",
  "disabledState",
  "errorState",
  "transcriptPanel",
  "overviewPanel",
  "notesPanel",
  "chatPanel",
];

// 笔记独立于字幕管线：即使字幕拉取失败，之前存的笔记也应该能看。
function render() {
  for (const id of SECTIONS) el(id).hidden = true;

  if (state.view === "disabled") {
    el("disabledState").hidden = false;
    return;
  }
  if (state.tab === "notes") {
    el("notesPanel").hidden = false;
    return;
  }
  // 问 AI 与字幕管线解耦：字幕加载中、失败或当前没有视频上下文时，均可对话。
  if (state.tab === "chat") {
    el("chatPanel").hidden = false;
    return;
  }
  if (state.view !== "ready") {
    el(`${state.view}State`).hidden = false;
    return;
  }
  const panel =
    state.tab === "overview"
      ? "overviewPanel"
      : state.tab === "chat"
        ? "chatPanel"
        : "transcriptPanel";
  el(panel).hidden = false;
}

function setView(view, errorResult = null) {
  state.view = view;
  state.errorResult = errorResult;

  if (view === "error" && errorResult) {
    const needLogin = errorResult.error === "NEED_LOGIN";
    el("errorTitle").textContent = uiText(
      needLogin ? "字幕需要登录" : "没能取到字幕",
    );
    el("errorText").textContent =
      uiText(errorResult.message || errorResult.error || "未知错误，请重试。");
    el("errorLoginLink").hidden = !needLogin;
  }
  render();
}

function switchTab(tab) {
  state.tab = tab;
  for (const button of document.querySelectorAll(".tab")) {
    button.classList.toggle("active", button.dataset.tab === tab);
  }
  hideExplain();
  updateFollowPill();
  if (tab === "notes") loadNotes();
  if (tab === "chat") {
    renderChat();
    el("chatInput").focus();
  }
  render();
}

// ============================================================
// 当前标签页
// ============================================================

function parseVideoRef(input) {
  const text = String(input || "");
  try {
    const url = new URL(text);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (hostname === "youtube.com" && url.pathname === "/watch") {
      const videoId = url.searchParams.get("v") || "";
      return /^[A-Za-z0-9_-]{6,20}$/.test(videoId)
        ? { site: "youtube", videoId, page: 1 }
        : null;
    }
    if (hostname === "bilibili.com") {
      const match = text.match(/BV[0-9A-Za-z]{10}/);
      if (!match) return null;
      const page = Math.max(1, Number(url.searchParams.get("p")) || 1);
      return { site: "bilibili", videoId: match[0], page: Math.floor(page) };
    }
  } catch (error) {
    return null;
  }
  return null;
}

async function activeTab(preferredTab = null) {
  if (preferredTab?.url && parseVideoRef(preferredTab.url)) return preferredTab;

  // side panel 在 Chrome / Edge 中对 currentWindow 的归属并不完全一致。
  // 逐个尝试并优先返回真正的受支持视频页，避免拿到别的窗口活动标签。
  const queries = [
    { active: true, lastFocusedWindow: true },
    state.windowId == null ? null : { active: true, windowId: state.windowId },
    { active: true, currentWindow: true },
    { active: true },
  ].filter(Boolean);
  let fallback = preferredTab || null;
  for (const query of queries) {
    let tabs = [];
    try {
      tabs = await chrome.tabs.query(query);
    } catch (error) {
      continue;
    }
    fallback ||= tabs[0] || null;
    const videoTab = tabs.find((tab) => parseVideoRef(tab?.url));
    if (videoTab) return videoTab;
  }
  return fallback;
}

// 跟随当前标签页：换了视频就重新取字幕，不是播放页就回到提示态。
async function syncWithActiveTab({ force = false, tab: preferredTab = null } = {}) {
  const tab = await activeTab(preferredTab);
  const video = parseVideoRef(tab?.url);

  if (!video) {
    resetChat();
    state.site = null;
    state.bvid = null;
    state.data = null;
    state.analysis = null;
    setView("idle");
    return;
  }

  let scope = { enabled: true };
  try {
    scope = await chrome.runtime.sendMessage({
      action: "isSiteEnabled",
      site: video.site,
    });
  } catch (error) {
    // 后台短暂重启不应让已打开的侧边栏闪成停用状态。
  }

  if (scope?.enabled === false) {
    const siteName = video.site === "youtube" ? "YouTube" : "Bilibili";
    resetChat();
    state.tabId = tab.id;
    state.site = video.site;
    state.bvid = video.videoId;
    state.page = video.page;
    state.data = null;
    state.analysis = null;
    el("disabledTitle").textContent =
      state.uiLanguage === "en"
        ? `${siteName} is disabled under Site availability`
        : `${siteName} 已在适用范围中关闭`;
    el("disabledText").textContent =
      state.uiLanguage === "en"
        ? `Video Digest AI will not add buttons or read captions on ${siteName}.`
        : `Video Digest AI 不会在 ${siteName} 页面注入按钮或读取字幕。`;
    setView("disabled");
    return;
  }

  const unchanged =
    video.site === state.site &&
    video.videoId === state.bvid &&
    video.page === state.page &&
    state.data;
  if (!unchanged) resetChat();
  state.tabId = tab.id;
  state.site = video.site;
  state.bvid = video.videoId;
  state.page = video.page;
  if (unchanged && !force) return;

  state.analysis = null;
  await loadTranscript({ force });
  if (state.tab === "notes") loadNotes();
}

// ============================================================
// 字幕
// ============================================================

async function loadTranscript({ force = false } = {}) {
  el("loadingTitle").textContent = uiText("正在获取字幕…");
  el("loadingSubtitle").textContent = force
    ? state.uiLanguage === "en" ? "Cache bypassed" : "已跳过缓存"
    : "";
  el("videoMeta").hidden = true;
  setView("loading");

  let result;
  try {
    result = await chrome.runtime.sendMessage({
      action: "fetchTranscript",
      site: state.site,
      bvid: state.bvid,
      page: state.page,
      tabId: state.tabId,
      forceRefresh: force,
    });
  } catch (error) {
    setView("error", { message: error.message });
    return;
  }

  if (!result?.success) {
    if (result?.videoInfo) renderMeta(result.videoInfo, null, false);
    setView("error", result);
    return;
  }

  state.data = result;
  state.activeIndex = -1;
  // 之前顺过的句、翻过的译随缓存一起回来了，直接复用，不必再花一次钱。
  state.polished = result.polished || {};
  state.translated = result.translated || {};
  state.polishRun += 1;
  // 缓存里有就直接摆出来，否则用户会以为上次白跑了。
  state.polishMode = Object.keys(state.polished).length > 0;
  state.isChinese = BILI_TRANSCRIPT.isChineseSubtitle(result.language);
  state.transcriptMode = Object.keys(state.translated).length > 0 ? "bilingual" : "original";
  renderMeta(result.videoInfo, result, result.fromCache);
  renderSegments(result.segments);
  // 换了视频，上一个视频的搜索词不该继续过滤新列表。
  closeSearch();
  updateTranscriptControls();
  const analysisLanguage = result.analysisLanguage || "zh-CN";
  restoreOverview(
    analysisLanguage === state.uiLanguage ? result.analysis : null,
    analysisLanguage,
  );
  setView("ready");
}

function renderMeta(videoInfo, result, fromCache) {
  el("videoTitle").textContent = videoInfo?.title || "";
  el("videoOwner").textContent = videoInfo?.owner || "";

  const badge = el("subtitleBadge");
  if (result) {
    badge.textContent = `${result.languageLabel || result.language}${result.isAiSubtitle ? " · AI" : ""}`;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }

  el("cacheBadge").hidden = !fromCache;
  el("videoMeta").hidden = false;
}

function renderSegments(segments = []) {
  const list = el("transcriptList");
  list.textContent = "";
  el("segmentCount").textContent = segmentCountText();
  segmentView.rows = [];
  segmentView.byId = new Map();
  segmentView.activeRow = null;

  const fragment = document.createDocumentFragment();
  segments.forEach((segment, index) => {
    const row = document.createElement("div");
    row.className = "segment";
    row.dataset.index = String(index);
    row.dataset.id = segment.id;

    const time = document.createElement("span");
    time.className = "segment-time";
    time.textContent = formatTimestamp(segment.start);

    const text = document.createElement("span");
    text.className = "segment-text";
    paintSegmentText(text, segment);

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "ghost-btn segment-save-btn";
    saveBtn.textContent = uiText("存为笔记");
    saveBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      await saveTextAsVideoNote(saveBtn, {
        timestamp: segment.start,
        text: noteTextForSegment(segment),
      });
    });

    row.append(time, text, saveBtn);
    row.addEventListener("click", (event) => onEntryClick(event, segment.start));
    fragment.appendChild(row);
    segmentView.rows.push(row);
    segmentView.byId.set(segment.id, { row, text });
  });
  list.appendChild(fragment);
}

// 这一段的「原文」——中文字幕开着顺句时，原文指的是顺句稿。
function sourceText(segment) {
  if (state.isChinese && state.polishMode && state.polished[segment.id]) {
    return state.polished[segment.id];
  }
  return segment.text;
}

// 这一段该显示什么文字。双语模式要两行，不走这里，见 paintSegmentText。
function segmentDisplayText(segment) {
  if (state.transcriptMode === "translated") {
    // 还没翻到这一段时先摆原文，比留一片空白好读。
    return state.translated[segment.id] || sourceText(segment);
  }
  return sourceText(segment);
}

// 笔记跟随当前阅读视图：双语时同时保存原文和已取得的译文，单语时保存当前显示内容。
function noteTextForSegment(segment) {
  if (state.transcriptMode === "bilingual") {
    return [sourceText(segment), state.translated[segment.id]].filter(Boolean).join("\n");
  }
  return segmentDisplayText(segment);
}

async function saveTextAsVideoNote(button, { timestamp, text }) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = uiText("保存中…");
  let result;
  try {
    result = await chrome.runtime.sendMessage({
      action: "saveNote",
      site: state.site,
      bvid: state.bvid,
      page: state.page,
      timestamp,
      text,
    });
  } catch (error) {
    result = { success: false };
  }
  button.textContent = uiText(result?.success ? "已保存" : "保存失败");
  setTimeout(() => {
    button.disabled = false;
    button.textContent = original;
  }, 1_500);
}

// 把文字写进节点，命中搜索词的部分套上 <mark>。字幕是外部内容，
// 一律 textContent 逐节点写、不拼 HTML；没有搜索词时走快路径。
function writeText(node, text) {
  const query = state.searchQuery;
  const source = String(text || "");
  if (!query) {
    node.textContent = source;
    return;
  }

  const lower = source.toLowerCase();
  let cursor = 0;
  node.textContent = "";
  for (let at = lower.indexOf(query); at >= 0; at = lower.indexOf(query, cursor)) {
    if (at > cursor) {
      const plain = document.createElement("span");
      plain.textContent = source.slice(cursor, at);
      node.appendChild(plain);
    }
    const hit = document.createElement("mark");
    hit.className = "search-hit";
    hit.textContent = source.slice(at, at + query.length);
    node.appendChild(hit);
    cursor = at + query.length;
  }

  // 一条也没命中：双语的另一行命中了，这一行照常显示。
  if (cursor === 0) {
    node.textContent = source;
    return;
  }
  if (cursor < source.length) {
    const tail = document.createElement("span");
    tail.textContent = source.slice(cursor);
    node.appendChild(tail);
  }
}

function paintSegmentText(node, segment) {
  if (state.transcriptMode === "bilingual") {
    node.textContent = "";
    const source = document.createElement("span");
    source.className = "segment-source";
    writeText(source, sourceText(segment));

    const translation = document.createElement("span");
    const ready = state.translated[segment.id];
    translation.className = ready
      ? "segment-translation"
      : "segment-translation pending";
    if (ready) writeText(translation, ready);
    else translation.textContent = uiText("翻译中…");

    node.append(source, translation);
    return;
  }
  writeText(node, segmentDisplayText(segment));
}

function formatTimestamp(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// 用户正在选词时，点击不应该被当成跳转。
function hasTextSelection() {
  const selection = window.getSelection();
  return !!selection && selection.rangeCount > 0 && !selection.isCollapsed;
}

function onEntryClick(event, seconds) {
  if (hasTextSelection()) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  seekTo(seconds);
}

async function seekTo(seconds) {
  if (!state.tabId) return;
  try {
    await chrome.tabs.sendMessage(state.tabId, {
      action: "seekTo",
      seconds: Math.floor(seconds),
    });
  } catch (error) {
    // 页面刚刷新时 content script 可能还没就位，忽略即可。
  }
}

// ============================================================
// 播放进度跟随
// ============================================================

function highlightActive(currentSeconds) {
  state.currentTime = Math.max(0, Number(currentSeconds) || 0);
  const segments = state.data?.segments || [];
  if (!segments.length || state.tab !== "transcript") return;

  // 分段按开始时间有序，二分找「最后一个 start <= 当前时刻」的下标。
  let low = 0;
  let high = segments.length - 1;
  let index = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (segments[mid].start <= currentSeconds) {
      index = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  if (index === state.activeIndex) return;

  segmentView.activeRow?.classList.remove("active");
  state.activeIndex = index;
  segmentView.activeRow = index >= 0 ? segmentView.rows[index] || null : null;
  if (!segmentView.activeRow) return;
  segmentView.activeRow.classList.add("active");

  // 搜索时列表被过滤过，滚动条属于搜索结果，不抢。
  if (state.searchQuery) return;
  if (Date.now() - state.lastUserScrollAt < AUTOSCROLL_SUPPRESS_MS) return;
  state.lastAutoScrollAt = Date.now();
  segmentView.activeRow.scrollIntoView({ block: "center", behavior: "smooth" });
}

async function trackPlayback() {
  if (!state.tabId || !state.bvid) return;
  try {
    const response = await chrome.tabs.sendMessage(state.tabId, {
      action: "getPlaybackTime",
    });
    if (response) highlightActive(Number(response.currentTime) || 0);
  } catch (error) {
    // content script 不在（页面正在跳转）——下一轮再试。
  }
  // 挂在轮询里而不是滚动事件里，抑制窗口过期后浮标才能自己消失。
  updateFollowPill();
}

// ============================================================
// 「回到当前句」浮标 + 字幕搜索
// ============================================================

// 自动跟随停下来时（用户滚开了，或正在搜索），给一条一键回到播放位置的路。
function updateFollowPill() {
  const suppressed = Date.now() - state.lastUserScrollAt < AUTOSCROLL_SUPPRESS_MS;
  const show =
    state.view === "ready" &&
    state.tab === "transcript" &&
    state.activeIndex >= 0 &&
    (Boolean(state.searchQuery) || suppressed);
  el("followPill").hidden = !show;
}

function scrollToActive() {
  const row = segmentView.rows[state.activeIndex];
  if (!row) return;
  // 记一笔，免得这次滚动被滚动监听当成「用户滚开了」。
  state.lastAutoScrollAt = Date.now();
  row.scrollIntoView({ block: "center", behavior: "smooth" });
}

function jumpToActive() {
  // 从搜索结果跳回来时顺手收掉搜索，否则当前句多半被过滤藏着；
  // closeSearch 自己会把视线送回当前句，这里不必再滚一次。
  if (state.searchQuery) closeSearch();
  else scrollToActive();
  state.lastUserScrollAt = 0;
  updateFollowPill();
}

// 搜索匹配「屏幕上可能出现过的所有文字」：原文、顺句稿、译文。
function segmentSearchText(segment) {
  return [segment.text, state.polished[segment.id], state.translated[segment.id]]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

function applySearchFilter(query) {
  state.searchQuery = String(query || "").trim().toLowerCase();
  const segments = state.data?.segments || [];

  let hits = 0;
  let firstHit = null;
  segments.forEach((segment, index) => {
    const match =
      !state.searchQuery || segmentSearchText(segment).includes(state.searchQuery);
    if (match) {
      hits += 1;
      if (!firstHit) firstHit = segmentView.rows[index] || null;
    }
    const row = segmentView.rows[index];
    if (row) row.hidden = !match;
  });

  // 重画是为了给命中的字套上 <mark>，光靠过滤眼睛没有落点。
  repaintSegmentText();
  el("searchCount").textContent = state.searchQuery
    ? uiText(`${hits} 条命中`)
    : "";

  // 滚到首个命中行，否则用户看到一片空白会以为搜索没生效。
  // 逐键过滤时用瞬时滚动，平滑动画会互相打架。
  if (state.searchQuery && firstHit) {
    state.lastAutoScrollAt = Date.now();
    firstHit.scrollIntoView({ block: "center", behavior: "auto" });
  }
  updateFollowPill();
}

function openSearch() {
  el("searchRow").hidden = false;
  el("searchInput").focus?.();
}

function closeSearch() {
  el("searchRow").hidden = true;
  el("searchInput").value = "";
  applySearchFilter("");
  // 收起搜索后视线还留在某条命中上，把它送回正在播的那句。
  scrollToActive();
}

// ============================================================
// 进度条
// ============================================================

const PROGRESS_NODES = {
  // 顺句和翻译按语种二选一，同一时刻只会有一个在跑，共用这一条进度。
  rewrite: { row: "rewriteProgress", bar: "rewriteProgressBar", text: "rewriteProgressText" },
  analysis: { row: null, bar: "overviewProgressBar", text: "overviewProgressText" },
};

function showProgress(kind, done, total) {
  const nodes = PROGRESS_NODES[kind];
  if (!nodes) return;
  const row = nodes.row ? el(nodes.row) : null;
  const bar = el(nodes.bar);
  const text = el(nodes.text);
  if (row) row.hidden = false;

  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  if (bar) bar.style.width = `${percent}%`;
  if (text) {
    text.textContent = total > 0
      ? state.uiLanguage === "en"
        ? `${done}/${total} batches complete (${percent}%)`
        : `${done}/${total} 批完成（${percent}%）`
      : uiText("正在准备…");
  }
}

function hideProgress(kind) {
  const nodes = PROGRESS_NODES[kind];
  if (!nodes) return;
  const row = nodes.row ? el(nodes.row) : null;
  const bar = el(nodes.bar);
  if (row) row.hidden = true;
  if (bar) bar.style.width = "0%";
}

// 设置在设置页改动后不会自动同步过来，每次用之前读一遍。
async function loadSettings() {
  const stored = await chrome.storage.local.get([
    BILI_SETTINGS.STORAGE_KEY,
    BILI_SETTINGS.LEGACY_STORAGE_KEY,
  ]);
  return BILI_SETTINGS.normalizeAppSettings(
    stored[BILI_SETTINGS.STORAGE_KEY] ?? stored[BILI_SETTINGS.LEGACY_STORAGE_KEY],
  );
}

function segmentCountText() {
  return uiText(`${state.data?.segments?.length || 0} 段`);
}

// 借分段计数那一行显示临时提示，几秒后还原。
function showSegmentNotice(message) {
  el("segmentCount").textContent = message;
  setTimeout(() => {
    el("segmentCount").textContent = segmentCountText();
  }, 5000);
}

// 顺句只给中文字幕（外文字幕本来就带标点）；顺句和翻译任何一个在跑时
// 两套控件都锁住，免得两轮改写互相踩对方的批次。
function updateTranscriptControls(running) {
  const busy = Boolean(running);

  const button = el("polishBtn");
  button.hidden = !state.isChinese;
  button.disabled = busy;
  button.textContent = uiText(
    running === "polish" ? "顺句中" : state.polishMode ? "原文" : "顺句",
  );

  const modes = el("transcriptMode");
  modes.hidden = !state.data;
  for (const node of modes.querySelectorAll(".segmented-btn")) {
    const active = node.dataset.mode === state.transcriptMode;
    node.classList.toggle("active", active);
    node.setAttribute("aria-pressed", String(active));
    node.disabled = busy;
  }
}

// 只重画文字，不重建整个列表——重建会丢掉高亮和滚动位置。
function repaintSegmentText(segmentIds) {
  const segments = state.data?.segments || [];
  const wanted = segmentIds ? new Set(segmentIds) : null;

  for (const segment of segments) {
    if (wanted && !wanted.has(segment.id)) continue;
    const nodes = segmentView.byId.get(segment.id);
    if (nodes) paintSegmentText(nodes.text, segment);
  }
}

// 顺句和翻译是同一套流程，差异集中在这张表里。
const REWRITE_KINDS = Object.freeze({
  polish: {
    action: "polishSegments",
    field: "polished",
    label: "顺句",
    plan: (segments) => BILI_AI.planPunctuationBatches(segments),
  },
  translate: {
    action: "translateSegments",
    field: "translated",
    label: "翻译",
    plan: (segments) => BILI_AI.planTranslationBatches(segments),
  },
});

// 偶发失败（限流、超时抖动）自动补一轮前的等待。太短会撞回同一次限流窗口。
const REWRITE_RETRY_DELAY_MS = 1500;

async function togglePolish() {
  if (!state.data) return;

  state.polishMode = !state.polishMode;
  // 关掉再打开时，上一轮还在飞的批次不应该再往界面上写。
  state.polishRun += 1;
  repaintSegmentText();
  updateTranscriptControls();

  if (state.polishMode) await runRewrite("polish", state.polishRun);
}

async function setTranscriptMode(mode) {
  if (!state.data) return;
  if (!["original", "translated", "bilingual"].includes(mode)) return;
  if (mode === state.transcriptMode) return;

  state.transcriptMode = mode;
  state.polishRun += 1;
  repaintSegmentText();
  updateTranscriptControls();

  if (mode !== "original") await runRewrite("translate", state.polishRun);
}

// 从当前播放位置切开、后半段优先：眼前的内容几秒内就有结果，
// 前面的部分随后补齐——总量和费用完全不变。
function orderFromPlayback(todo) {
  const segments = state.data?.segments || [];
  const active = segments[state.activeIndex];
  if (!active) return todo;

  const ahead = [];
  const behind = [];
  for (const segment of todo) {
    (segment.start >= active.start ? ahead : behind).push(segment);
  }
  return [...ahead, ...behind];
}

async function runRewrite(kind, run) {
  const task = REWRITE_KINDS[kind];
  const segments = state.data?.segments || [];
  const todo = segments.filter((segment) => !state[task.field][segment.id]);
  if (!todo.length) {
    updateTranscriptControls();
    return;
  }

  const batches = task.plan(orderFromPlayback(todo));
  const concurrency = (await loadSettings()).aiConcurrency;

  showProgress("rewrite", 0, batches.length);
  updateTranscriptControls(kind);

  const runBatch = async (batch) => {
    if (run !== state.polishRun) return null;
    const result = await chrome.runtime.sendMessage({
      action: task.action,
      site: state.site,
      bvid: state.bvid,
      page: state.page,
      segmentIds: batch.map((segment) => segment.id),
    });
    if (!result?.success) throw new Error(result?.message || `${task.label}失败`);

    // 每批一回来就刷到界面上，用户可以边生成边往下读。
    if (run === state.polishRun) {
      const done = result[task.field] || {};
      Object.assign(state[task.field], done);
      repaintSegmentText(Object.keys(done));
    }
    return result;
  };

  const results = await BILI_CONCURRENCY.mapWithConcurrency(
    batches,
    concurrency,
    runBatch,
    (done, total) => {
      if (run === state.polishRun) showProgress("rewrite", done, total);
    },
  );

  // 偶发失败（限流、超时抖动）静默补一轮，别让用户手点。
  // 全军覆没就不补了——那多半是配置错误，重试只会把同一个错误再撞一遍。
  const failedIndexes = results
    .map((result, index) => (result.status === "rejected" ? index : -1))
    .filter((index) => index >= 0);
  if (
    failedIndexes.length &&
    failedIndexes.length < batches.length &&
    run === state.polishRun
  ) {
    await new Promise((resolve) => setTimeout(resolve, REWRITE_RETRY_DELAY_MS));
    const retried = await BILI_CONCURRENCY.mapWithConcurrency(
      failedIndexes.map((index) => batches[index]),
      concurrency,
      runBatch,
    );
    failedIndexes.forEach((batchIndex, i) => {
      if (retried[i].status === "fulfilled") results[batchIndex] = retried[i];
    });
  }

  if (run !== state.polishRun) return;
  hideProgress("rewrite");

  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length === batches.length) {
    // 全失败多半是没配好或被限流，退回原文并说明原因。
    if (kind === "polish") state.polishMode = false;
    else state.transcriptMode = "original";
    repaintSegmentText();
    showSegmentNotice(failures[0].reason?.message || `${task.label}失败`);
  } else if (failures.length) {
    // 部分失败仍保留已成功的部分，剩下的再点一次即可补齐。
    showSegmentNotice(`${failures.length} 批失败，再点一次「${task.label}」可以补齐。`);
  }
  updateTranscriptControls();
}

// ============================================================
// 问 AI
// ============================================================

function getChatDefaultQuestions() {
  const questions = state.appSettings?.chatDefaultQuestions;
  if (Array.isArray(questions) && questions.length > 0) {
    return questions;
  }
  return [...BILI_SETTINGS.DEFAULT_CHAT_QUESTIONS];
}

function renderChatPresetQuestions() {
  const questions = getChatDefaultQuestions();
  const emptyChips = el("chatChipsEmpty");
  const quickChips = el("chatQuickChips");
  const quickBar = el("chatQuickBar");

  if (emptyChips) {
    emptyChips.textContent = "";
    for (const question of questions) {
      const chip = document.createElement("button");
      chip.className = "chat-chip";
      chip.type = "button";
      chip.textContent = question;
      chip.addEventListener("click", () => submitChatQuestion(question));
      emptyChips.appendChild(chip);
    }
  }

  if (quickChips) {
    quickChips.textContent = "";
    for (const question of questions) {
      const chip = document.createElement("button");
      chip.className = "chat-chip";
      chip.type = "button";
      chip.title = question;
      chip.textContent = question;
      chip.addEventListener("click", () => submitChatQuestion(question));
      quickChips.appendChild(chip);
    }
  }

  if (quickBar) {
    quickBar.hidden = state.chatMessages.length === 0 || state.chatSending;
  }
}

function openChatQuestionsModal() {
  state.chatQuestionsEditing = [...getChatDefaultQuestions()];
  const input = el("newChatQuestionInput");
  if (input) input.value = "";
  renderChatQuestionsManageList();
  const modal = el("chatQuestionsModal");
  if (modal) modal.hidden = false;
  if (input) input.focus();
}

function closeChatQuestionsModal() {
  const modal = el("chatQuestionsModal");
  if (modal) modal.hidden = true;
  state.chatQuestionsEditing = null;
}

function resetChat() {
  state.chatMessages = [];
  state.chatSending = false;
  if (el("chatMessages")) renderChat();
}

function chatContextSelection() {
  return {
    transcript: Boolean(el("chatContextTranscript").checked),
    overview: Boolean(el("chatContextOverview").checked),
    notes: Boolean(el("chatContextNotes").checked),
  };
}

function renderChat() {
  const list = el("chatMessages");
  const empty = el("chatEmpty");
  if (!list || !empty) return;
  list.textContent = "";

  empty.hidden = state.chatMessages.length > 0 || state.chatSending;

  const quickBar = el("chatQuickBar");
  if (quickBar) {
    quickBar.hidden = state.chatMessages.length === 0 || state.chatSending;
  }

  const emptyChips = el("chatChipsEmpty");
  if (emptyChips && emptyChips.children.length === 0) {
    renderChatPresetQuestions();
  }

  for (const message of state.chatMessages) {
    const bubble = document.createElement("article");
    bubble.className = `chat-message ${message.role}${message.error ? " error" : ""}`;

    const text = document.createElement("p");
    text.className = "chat-message-text";
    if (message.role === "assistant" && !message.error) {
      text.classList.add("markdown-body");
      BILI_MARKDOWN.render(text, message.content, document);
    } else {
      text.textContent = message.content;
    }
    bubble.appendChild(text);

    if (message.role === "assistant" && !message.error) {
      const actions = document.createElement("div");
      actions.className = "entry-actions";
      const save = document.createElement("button");
      save.className = "ghost-btn";
      save.type = "button";
      save.textContent = uiText("存入 AI 记");
      save.addEventListener("click", () => saveChatAsNote(message, save));
      actions.appendChild(save);
      bubble.appendChild(actions);
    }
    list.appendChild(bubble);
  }

  if (state.chatSending) {
    const thinking = document.createElement("article");
    thinking.className = "chat-message assistant chat-thinking";
    thinking.textContent = uiText("AI 正在思考…");
    list.appendChild(thinking);
  }

  el("chatInput").disabled = state.chatSending;
  el("sendChatBtn").disabled = state.chatSending;
  el("sendChatBtn").textContent = uiText(state.chatSending ? "回答中…" : "发送");
  list.scrollTop = list.scrollHeight;
}

function syncEditingQuestionsFromDOM() {
  const list = el("chatQuestionsManageList");
  if (!list || !list.children || list.children.length === 0) return;
  const inputs = list.querySelectorAll(".chat-question-input");
  state.chatQuestionsEditing = Array.from(inputs).map((inp) => inp.value.trim()).filter(Boolean);
}

function renderChatQuestionsManageList() {
  const list = el("chatQuestionsManageList");
  if (!list) return;
  list.textContent = "";

  const questions = Array.isArray(state.chatQuestionsEditing)
    ? state.chatQuestionsEditing
    : getChatDefaultQuestions();

  questions.forEach((question, index) => {
    const item = document.createElement("div");
    item.className = "chat-question-item";

    const input = document.createElement("input");
    input.className = "chat-question-input";
    input.type = "text";
    input.maxLength = 300;
    input.value = question;
    input.addEventListener("input", () => {
      if (Array.isArray(state.chatQuestionsEditing)) {
        state.chatQuestionsEditing[index] = input.value;
      }
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "icon-btn delete-question-btn";
    deleteBtn.type = "button";
    deleteBtn.title = uiText("删除");
    deleteBtn.setAttribute("aria-label", uiText("删除"));
    deleteBtn.appendChild(icon("trash"));
    deleteBtn.addEventListener("click", () => {
      syncEditingQuestionsFromDOM();
      if (Array.isArray(state.chatQuestionsEditing)) {
        state.chatQuestionsEditing.splice(index, 1);
        renderChatQuestionsManageList();
      }
    });

    item.appendChild(input);
    item.appendChild(deleteBtn);
    list.appendChild(item);
  });
}

function addChatQuestion() {
  syncEditingQuestionsFromDOM();
  const input = el("newChatQuestionInput");
  if (!input) return;
  const text = String(input.value || "").trim().slice(0, 300);
  if (!text) {
    input.focus();
    return;
  }
  if (!Array.isArray(state.chatQuestionsEditing)) {
    state.chatQuestionsEditing = [...getChatDefaultQuestions()];
  }
  state.chatQuestionsEditing.push(text);
  input.value = "";
  renderChatQuestionsManageList();
  input.focus();
}

function resetChatQuestions() {
  state.chatQuestionsEditing = [...BILI_SETTINGS.DEFAULT_CHAT_QUESTIONS];
  renderChatQuestionsManageList();
}

async function saveChatQuestions() {
  syncEditingQuestionsFromDOM();
  const list = Array.isArray(state.chatQuestionsEditing)
    ? state.chatQuestionsEditing
    : getChatDefaultQuestions();
  const cleaned = BILI_SETTINGS.normalizeChatDefaultQuestions(list);

  try {
    const currentSettings = await loadSettings();
    const updatedSettings = {
      ...currentSettings,
      chatDefaultQuestions: cleaned,
    };
    await chrome.storage.local.set({
      [BILI_SETTINGS.STORAGE_KEY]: updatedSettings,
    });
    state.appSettings = updatedSettings;
    renderChatPresetQuestions();
    closeChatQuestionsModal();
  } catch (error) {
    console.error("Failed to save chat default questions:", error);
  }
}

async function submitChatQuestion(questionInput) {
  if (state.chatSending) return;
  const input = el("chatInput");
  const question = String(questionInput ?? input.value).trim().slice(0, 2_000);
  if (!question) {
    input.focus();
    return;
  }

  const history = state.chatMessages
    .filter((message) => !message.error)
    .map(({ role, content }) => ({ role, content }));
  const timestampSeconds = Math.max(0, Math.floor(state.currentTime));
  state.chatMessages.push({ role: "user", content: question, timestampSeconds });
  state.chatSending = true;
  input.value = "";
  renderChat();

  let result;
  try {
    result = await chrome.runtime.sendMessage({
      action: "askVideo",
      site: state.site,
      bvid: state.bvid,
      page: state.page,
      tabId: state.tabId,
      videoInfo: state.data?.videoInfo || state.errorResult?.videoInfo || null,
      question,
      history,
      contextSelection: chatContextSelection(),
    });
  } catch (error) {
    result = { success: false, message: error.message };
  }

  if (result?.success) {
    state.chatMessages.push({
      role: "assistant",
      content: result.answer,
      question,
      timestampSeconds,
    });
  } else {
    state.chatMessages.push({
      role: "assistant",
      content: result?.message || "问答失败，请稍后重试。",
      question,
      timestampSeconds,
      error: true,
    });
  }
  state.chatSending = false;
  renderChat();
  input.focus();
}

async function saveChatAsNote(message, button) {
  if (!message?.content || !message?.question) return;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = state.uiLanguage === "en" ? "Saving…" : "保存中…";
  const videoContext = await currentMemoVideoContext(message.timestampSeconds);
  let result;
  try {
    result = await chrome.runtime.sendMessage({
      action: "saveMemo",
      kind: "ai_note",
      text: (
        state.uiLanguage === "en"
          ? `Q: ${message.question}\n\nA: ${message.content}`
          : `问：${message.question}\n\n答：${message.content}`
      ).slice(0, 12_000),
      ...(videoContext || {}),
    });
  } catch (error) {
    result = { success: false };
  }
  button.textContent = uiText(result?.success ? "已存入 AI 记" : "保存失败");
  setTimeout(() => {
    button.disabled = false;
    button.textContent = original;
  }, 1_500);
}

// ============================================================
// AI 概览
// ============================================================

const OVERVIEW_EMPTY_TITLE = "生成 AI 概览";
const OVERVIEW_EMPTY_TEXT =
  "把整段字幕交给大模型，产出覆盖全片的章节和 3-5 条金句。需要先在设置页配置 AI 服务。";
let overviewPromptSaveTimer = null;

function normalizeOverviewPromptLanguage(language) {
  return language === "en" ? "en" : "zh-CN";
}

function renderOverviewPrompt() {
  const language = normalizeOverviewPromptLanguage(state.overviewPromptLanguage);
  el("overviewPrompt").value =
    state.overviewPrompts[language] ||
    BILI_SETTINGS.DEFAULT_OVERVIEW_PROMPTS[language];
}

async function persistOverviewPrompts() {
  const settings = await loadSettings();
  await chrome.storage.local.set({
    [BILI_SETTINGS.STORAGE_KEY]: {
      ...settings,
      overviewPrompts: state.overviewPrompts,
    },
  });
  el("overviewPromptStatus").textContent = uiText("已自动保存");
}

function updateOverviewPrompt() {
  const language = normalizeOverviewPromptLanguage(state.overviewPromptLanguage);
  const value = el("overviewPrompt").value.trim();
  state.overviewPrompts[language] =
    value || BILI_SETTINGS.DEFAULT_OVERVIEW_PROMPTS[language];
  clearTimeout(overviewPromptSaveTimer);
  overviewPromptSaveTimer = setTimeout(() => persistOverviewPrompts(), 400);
}

function resetOverviewPrompt(language) {
  const targetLanguage = normalizeOverviewPromptLanguage(language);
  state.overviewPrompts[targetLanguage] =
    BILI_SETTINGS.DEFAULT_OVERVIEW_PROMPTS[targetLanguage];
  state.overviewPromptLanguage = targetLanguage;
  renderOverviewPrompt();
  clearTimeout(overviewPromptSaveTimer);
  persistOverviewPrompts();
}

function resetOverview() {
  state.analysis = null;
  state.analysisLanguage = null;
  const empty = el("overviewEmpty");
  // 上一个视频可能把这里改成了错误提示，换视频时要还原。
  empty.querySelector(".state-title").textContent = uiText(OVERVIEW_EMPTY_TITLE);
  empty.querySelector(".state-text").textContent = uiText(OVERVIEW_EMPTY_TEXT);
  el("analyzeBtn").textContent = uiText("生成概览");
  empty.hidden = false;
  el("overviewLoading").hidden = true;
  el("overviewResult").hidden = true;
}

// 概览随字幕缓存一起回来，有就直接摆出来——否则一次已完成的生成会看起来像失败了。
function restoreOverview(analysis, analysisLanguage = state.uiLanguage) {
  resetOverview();
  if (!analysis) return;
  state.analysis = analysis;
  state.analysisLanguage = analysisLanguage;
  renderAnalysis(analysis, true);
}

async function analyze({ force = false } = {}) {
  if (!state.bvid) return;
  el("overviewEmpty").hidden = true;
  el("overviewResult").hidden = true;
  el("overviewLoading").hidden = false;
  // 分块数量由 background 算，这里先归零，等第一条进度广播回来再填。
  showProgress("analysis", 0, 0);

  let result;
  try {
    result = await chrome.runtime.sendMessage({
      action: "analyzeTranscript",
      site: state.site,
      bvid: state.bvid,
      page: state.page,
      forceRefresh: force,
      customPrompt: el("overviewPrompt").value.trim(),
    });
  } catch (error) {
    result = { success: false, message: error.message };
  }

  el("overviewLoading").hidden = true;
  hideProgress("analysis");

  if (!result?.success) {
    // 概览失败不该把整个面板打回错误态——字幕还在，用户可以继续读。
    el("overviewEmpty").hidden = false;
    el("overviewEmpty").querySelector(".state-title").textContent =
      uiText("概览生成失败");
    el("overviewEmpty").querySelector(".state-text").textContent =
      uiText(result?.message || "请稍后重试。");
    el("analyzeBtn").textContent = uiText("重试");
    return;
  }

  state.analysis = result.analysis;
  state.analysisLanguage = result.analysisLanguage || state.uiLanguage;
  renderAnalysis(result.analysis, result.fromCache, {
    failedChunks: result.failedChunks,
  });
}

function renderAnalysis(analysis, fromCache, { failedChunks = 0 } = {}) {
  const parts = [
    uiText(`${analysis.chapters.length} 章节`),
    uiText(`${analysis.keyQuotes.length} 金句`),
  ];
  if (fromCache) parts.push(uiText("缓存"));
  // 部分块失败时结果是不完整的，必须让用户知道，否则他会以为这就是全片概览。
  if (failedChunks) parts.push(uiText(`${failedChunks} 块失败，结果不完整`));
  el("overviewMeta").textContent = parts.join(" · ");

  const chapters = el("chapterList");
  chapters.textContent = "";
  for (const chapter of analysis.chapters) {
    const card = document.createElement("div");
    card.className = "chapter";

    const head = document.createElement("div");
    head.className = "entry-head";
    const time = document.createElement("span");
    time.className = "entry-time";
    time.textContent = chapter.timestamp;
    const title = document.createElement("span");
    title.className = "entry-title";
    title.textContent = chapter.title;
    head.append(time, title);

    const summary = document.createElement("p");
    summary.className = "entry-text";
    summary.textContent = chapter.summary;

    const actions = document.createElement("div");
    actions.className = "entry-actions";
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "ghost-btn";
    saveBtn.textContent = uiText("存为笔记");
    saveBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      // 章节标题与摘要是同一条概览信息，合并保存才能离线阅读时保留语义。
      await saveTextAsVideoNote(saveBtn, {
        timestamp: chapter.timestampSeconds,
        text: [chapter.title, chapter.summary].filter(Boolean).join("\n"),
      });
    });
    actions.appendChild(saveBtn);

    card.append(head, summary, actions);
    card.addEventListener("click", (event) =>
      onEntryClick(event, chapter.timestampSeconds),
    );
    chapters.appendChild(card);
  }

  const quotes = el("quoteList");
  quotes.textContent = "";
  for (const quote of analysis.keyQuotes) {
    const card = document.createElement("div");
    card.className = "quote";

    const head = document.createElement("div");
    head.className = "entry-head";
    const time = document.createElement("span");
    time.className = "entry-time";
    time.textContent = quote.timestamp;
    time.addEventListener("click", (event) =>
      onEntryClick(event, quote.timestampSeconds),
    );
    head.appendChild(time);

    const text = document.createElement("p");
    text.className = "entry-text";
    text.textContent = quote.quote;

    const actions = document.createElement("div");
    actions.className = "entry-actions";
    const saveBtn = document.createElement("button");
    saveBtn.className = "ghost-btn";
    saveBtn.textContent = uiText("存为笔记");
    saveBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      // 金句已经是模型整理过的文本，直接落库，不必再润色一遍。
      await saveTextAsVideoNote(saveBtn, {
        timestamp: quote.timestampSeconds,
        text: quote.quote,
      });
    });
    actions.appendChild(saveBtn);

    card.append(head, text, actions);
    quotes.appendChild(card);
  }

  el("overviewEmpty").hidden = true;
  el("overviewResult").hidden = false;
}

// ============================================================
// 笔记
// ============================================================

const NOTES_PAGE_SIZE = 100;

async function loadNotes({ append = false } = {}) {
  const offset = append ? state.notesLoaded.length : 0;
  if (!append) {
    state.notesLoaded = [];
    state.notesTotalCount = 0;
    state.notesHasMore = false;
  }
  state.notesForExport = [];
  setNotesExportButtonsDisabled(true);
  const pagination = { offset, limit: NOTES_PAGE_SIZE };
  let result;
  if (state.notesScope === "ai") {
    el("notesEntries").hidden = true;
    el("memoPanel").hidden = true;
    el("aiNotesPanel").hidden = false;
    result = await chrome.runtime.sendMessage({
      action: "getMemos",
      kind: "ai_note",
      ...pagination,
    });
  } else if (state.notesScope === "memo") {
    el("notesEntries").hidden = true;
    el("memoPanel").hidden = false;
    el("aiNotesPanel").hidden = true;
    result = await chrome.runtime.sendMessage({
      action: "getMemos",
      kind: "memo",
      ...pagination,
    });
  } else {
    el("notesEntries").hidden = false;
    el("memoPanel").hidden = true;
    el("aiNotesPanel").hidden = true;
    result = await chrome.runtime.sendMessage({
      action: "getNotes",
      site: state.site,
      bvid: state.notesScope === "video" ? state.bvid : null,
      scope: state.notesScope,
      ...pagination,
    });
  }

  const page = result?.notes || [];
  state.notesLoaded = append ? [...state.notesLoaded, ...page] : page;
  state.notesTotalCount = Number(result?.totalCount) || 0;
  state.notesHasMore = Boolean(result?.hasMore);
  if (state.notesScope === "ai") renderAiNotes(state.notesLoaded, state.notesTotalCount);
  else if (state.notesScope === "memo") renderMemos(state.notesLoaded, state.notesTotalCount);
  else renderNotes(state.notesLoaded, state.notesTotalCount);
  updateNotesPagination();
}

function renderMemos(memos, totalCount = memos.length) {
  el("notesCount").textContent = totalCount ? uiText(`${totalCount} 条`) : "";
  setNotesExportButtonsDisabled(totalCount === 0);
  el("memoEmpty").hidden = totalCount > 0;
  const list = el("memoList");
  list.textContent = "";
  for (const memo of memos) list.appendChild(renderMemoCard(memo));
  updateNotesDeleteControls();
}

function renderAiNotes(notes, totalCount = notes.length) {
  el("notesCount").textContent = totalCount ? uiText(`${totalCount} 条`) : "";
  setNotesExportButtonsDisabled(totalCount === 0);
  el("aiNotesEmpty").hidden = totalCount > 0;
  const list = el("aiNotesList");
  list.textContent = "";
  for (const note of notes) list.appendChild(renderMemoCard(note, { ai: true }));
  updateNotesDeleteControls();
}

const SVG_NS = "http://www.w3.org/2000/svg";

// 引用 sidepanel.html 顶部雪碧图里的一个图形。
function icon(name) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `#i-${name}`);
  svg.appendChild(use);
  return svg;
}

function actionButton({ iconName, label, title, onClick }) {
  const button = document.createElement("button");
  button.className = "ghost-btn";
  button.title = uiText(title || label);
  button.appendChild(icon(iconName));
  if (label) {
    const text = document.createElement("span");
    text.textContent = uiText(label);
    button.appendChild(text);
  } else {
    button.classList.add("icon-only");
    button.setAttribute("aria-label", uiText(title));
  }
  // 把按钮直接递给回调。事件派发结束后 event.currentTarget 会被清空，
  // 回调里一 await（写剪贴板就是）再去读它，拿到的是 null。
  button.addEventListener("click", () => onClick(button));
  return button;
}

function flashActionButton(button, message) {
  const label = button.querySelector("span");
  if (!label) return;
  const original = label.textContent;
  label.textContent = uiText(message);
  setTimeout(() => {
    label.textContent = original;
  }, 1500);
}

function renderNotes(notes, totalCount = notes.length) {
  el("notesCount").textContent = totalCount ? uiText(`${totalCount} 条`) : "";
  setNotesExportButtonsDisabled(totalCount === 0);
  el("notesEmpty").hidden = totalCount > 0;
  // 「本视频」下空着，多半只是这个视频没记过，别让人以为笔记全丢了。
  el("notesEmptyTitle").textContent = uiText(
    state.notesScope === "video" ? "这个视频还没有笔记" : "还没有任何笔记",
  );

  const list = el("notesList");
  list.textContent = "";
  for (const note of notes) list.appendChild(renderAnyNote(note));
  updateNotesDeleteControls();
}

function appendNoteSelection(head, note) {
  if (!state.notesDeleteMode) return;
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "note-selection";
  checkbox.dataset.noteId = note.id;
  checkbox.checked = state.selectedNoteIds.has(note.id);
  checkbox.setAttribute("aria-label", uiText("选择这条笔记"));
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) state.selectedNoteIds.add(note.id);
    else state.selectedNoteIds.delete(note.id);
    updateNotesDeleteControls();
  });
  head.appendChild(checkbox);
}

function updateNotesDeleteControls() {
  const inDeleteMode = state.notesDeleteMode;
  const selectedCount = state.selectedNoteIds.size;
  const toggle = el("toggleNotesDeleteModeBtn");
  const bar = el("notesDeleteBar");
  toggle.classList.toggle("active", inDeleteMode);
  toggle.textContent = uiText(inDeleteMode ? "取消" : "删除");
  bar.hidden = !inDeleteMode;
  if (!inDeleteMode) return;
  el("notesSelectionCount").textContent = uiText(`已选 ${selectedCount} 条`);
  const visibleIds = state.notesLoaded.map((note) => note.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => state.selectedNoteIds.has(id));
  el("selectVisibleNotesBtn").textContent = uiText(allVisibleSelected ? "取消全选已加载" : "全选已加载");
  el("deleteSelectedNotesBtn").disabled = selectedCount === 0;
}

function setNotesDeleteMode(enabled) {
  state.notesDeleteMode = enabled;
  state.selectedNoteIds.clear();
  loadNotes();
}

function selectVisibleNotes() {
  const visibleIds = state.notesLoaded.map((note) => note.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => state.selectedNoteIds.has(id));
  for (const id of visibleIds) {
    if (allVisibleSelected) state.selectedNoteIds.delete(id);
    else state.selectedNoteIds.add(id);
  }
  for (const checkbox of document.querySelectorAll(".note-selection")) {
    checkbox.checked = state.selectedNoteIds.has(checkbox.dataset.noteId);
  }
  updateNotesDeleteControls();
}

async function deleteSelectedNotes() {
  const noteIds = [...state.selectedNoteIds];
  if (!noteIds.length) return;
  const warning = state.uiLanguage === "en"
    ? `Delete ${noteIds.length} selected notes permanently?`
    : `确定永久删除已选的 ${noteIds.length} 条笔记吗？`;
  if (!globalThis.confirm(warning)) return;
  const result = await chrome.runtime.sendMessage({ action: "deleteNotes", noteIds });
  if (!result?.success) return;
  state.selectedNoteIds.clear();
  await loadNotes();
}

async function clearCurrentNotes() {
  const totalCount = state.notesTotalCount;
  if (!totalCount) return;
  const warning = state.uiLanguage === "en"
    ? `Permanently clear all ${totalCount} notes in this scope? This includes unloaded pages.`
    : `确定永久清空当前范围的 ${totalCount} 条笔记吗？这也会删除尚未加载的分页内容。`;
  if (!globalThis.confirm(warning)) return;
  const result = await chrome.runtime.sendMessage({
    action: "clearNotes",
    site: state.site,
    bvid: state.notesScope === "video" ? state.bvid : null,
    scope: state.notesScope,
  });
  if (!result?.success) return;
  state.selectedNoteIds.clear();
  await loadNotes();
}

function updateNotesPagination() {
  const button = el("loadMoreNotesBtn");
  if (!button) return;
  button.hidden = !state.notesHasMore;
  button.disabled = false;
  if (state.notesHasMore) {
    button.textContent = uiText("加载更多");
    button.title = uiText(`已显示 ${state.notesLoaded.length} / 共 ${state.notesTotalCount} 条`);
  }
}

async function loadMoreNotes() {
  if (!state.notesHasMore) return;
  const button = el("loadMoreNotesBtn");
  button.disabled = true;
  await loadNotes({ append: true });
}

function setNotesExportButtonsDisabled(disabled) {
  for (const id of [
    "exportNotesJsonBtn",
    "exportNotesMarkdownBtn",
    "exportNotesCsvBtn",
  ]) {
    const button = el(id);
    if (button) button.disabled = disabled;
  }
}

function larkSyncMessage(result) {
  if (Number(result?.total) === 0) return "没有可同步的笔记。";
  if (Number.isFinite(Number(result?.total)) && Number(result.total) > 0 && Number(result.failed) === 0) {
    return `已同步 ${Number(result.synced) || 0} 条笔记。`;
  }
  if (Number.isFinite(Number(result?.total)) && Number(result.total) > 0) {
    return `已同步 ${Number(result.synced) || 0} 条，${Number(result.failed) || 0} 条失败。`;
  }
  return result?.message || "同步失败";
}

async function syncNotesToLark(noteIds, button) {
  if (button) button.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ action: "syncNotesToLark", noteIds });
    const message = larkSyncMessage(result);
    if (button) flashActionButton(button, message);
    el("larkSyncStatus").textContent = uiText(message);
    return result;
  } catch (error) {
    const message = error?.message || "同步失败";
    if (button) flashActionButton(button, message);
    el("larkSyncStatus").textContent = uiText(message);
    return { success: false, message };
  } finally {
    if (button) button.disabled = false;
  }
}

async function syncAllNotesToLark() {
  const button = el("syncAllNotesLarkBtn");
  button.disabled = true;
  button.textContent = uiText("正在同步…");
  try {
    await syncNotesToLark(undefined);
  } finally {
    button.disabled = false;
    button.textContent = uiText("同步飞书");
  }
}

function noteKindLabel(kind) {
  if (state.uiLanguage === "en") {
    if (kind === "memo") return "Memo";
    if (kind === "ai_note" || kind === "ai_chat") return "AI Note";
    return "Video Note";
  }
  if (kind === "memo") return "手记";
  if (kind === "ai_note" || kind === "ai_chat") return "AI 记";
  return "视频笔记";
}

function noteSourceLabel(note) {
  return [note.videoTitle, note.timestamp].filter(Boolean).join(" · ");
}

function noteCreatedAt(note) {
  if (!note.createdAt) return "";
  const date = new Date(note.createdAt);
  return Number.isNaN(date.getTime()) ? String(note.createdAt) : date.toISOString();
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function notesAsCsv(notes) {
  const fields = [
    "id",
    "kind",
    "text",
    "createdAt",
    "createdAtISO",
    "site",
    "bvid",
    "page",
    "videoTitle",
    "ownerName",
    "timestamp",
    "timestampSeconds",
    "timestampedUrl",
    "rawText",
    "pending",
  ];
  return [
    fields.map(csvCell).join(","),
    ...notes.map((note) =>
      fields
        .map((field) =>
          csvCell(field === "createdAtISO" ? noteCreatedAt(note) : note[field]),
        )
        .join(","),
    ),
  ].join("\r\n");
}

function notesAsMarkdown(notes) {
  const english = state.uiLanguage === "en";
  const exportedAt = new Date().toISOString();
  const sections = notes.map((note) => {
    const source = noteSourceLabel(note);
    const lines = [
      `## ${noteKindLabel(note.kind)}${source ? ` · ${source}` : ""}`,
      `- ${english ? "Created" : "创建时间"}: ${noteCreatedAt(note) || (english ? "Unknown" : "未知")}`,
    ];
    if (note.site) lines.push(`- ${english ? "Platform" : "平台"}: ${note.site}`);
    if (note.ownerName) lines.push(`- ${english ? "Author" : "作者"}: ${note.ownerName}`);
    if (note.timestampedUrl) {
      lines.push(`- ${english ? "Source" : "来源"}: ${note.timestampedUrl}`);
    }
    lines.push("", String(note.text || "").trim());
    return lines.join("\n");
  });
  return [
    english ? "# Video Digest AI Notes" : "# Video Digest AI 笔记",
    `${english ? "Exported" : "导出时间"}: ${exportedAt}`,
    "",
    ...sections,
  ].join("\n\n");
}

function notesExportFilename(extension) {
  const scopeLabel =
    state.notesScope === "video"
      ? state.data?.videoInfo?.title || state.bvid || "当前视频"
      : state.notesScope === "memo"
        ? "手记"
        : state.notesScope === "ai"
          ? "AI记"
          : "全部笔记";
  return `${sanitizeFilename(`video-digest-${scopeLabel}`)}.${extension}`;
}

function downloadNotesFile(content, extension, mimeType) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = notesExportFilename(extension);
  link.click();
  URL.revokeObjectURL(url);
}

async function notesForCurrentScope() {
  if (state.notesScope === "ai") {
    const result = await chrome.runtime.sendMessage({ action: "getMemos", kind: "ai_note" });
    return result?.notes || [];
  }
  if (state.notesScope === "memo") {
    const result = await chrome.runtime.sendMessage({ action: "getMemos", kind: "memo" });
    return result?.notes || [];
  }
  const result = await chrome.runtime.sendMessage({
    action: "getNotes",
    site: state.site,
    bvid: state.notesScope === "video" ? state.bvid : null,
    scope: state.notesScope,
  });
  return result?.notes || [];
}

async function exportNotes(format) {
  const notes = await notesForCurrentScope();
  if (!notes.length) return;
  if (format === "json") {
    downloadNotesFile(
      JSON.stringify(
        {
          version: 1,
          exportedAt: new Date().toISOString(),
          scope: state.notesScope,
          notes,
        },
        null,
        2,
      ),
      "json",
      "application/json",
    );
    return;
  }
  if (format === "markdown") {
    downloadNotesFile(notesAsMarkdown(notes), "md", "text/markdown");
    return;
  }
  if (format === "csv") {
    downloadNotesFile(`\ufeff${notesAsCsv(notes)}`, "csv", "text/csv");
  }
}

function renderAnyNote(note) {
  if (["memo", "ai_note", "ai_chat"].includes(note.kind)) {
    return renderMemoCard(note, { ai: note.kind !== "memo" });
  }
  return renderNoteCard(note);
}

function beginNoteEdit(note, textElement, actions) {
  const editor = document.createElement("textarea");
  editor.className = "note-editor";
  editor.rows = 4;
  editor.maxLength = 12_000;
  editor.value = note.text || "";

  const editActions = document.createElement("div");
  editActions.className = "entry-actions note-edit-actions";
  const cancel = actionButton({
    iconName: "copy",
    label: "取消",
    title: "取消",
    onClick: () => {
      editor.replaceWith(textElement);
      editActions.replaceWith(actions);
    },
  });
  const save = actionButton({
    iconName: "edit",
    label: "保存修改",
    title: "保存修改",
    onClick: async (button) => {
      const text = String(editor.value || "").trim();
      if (!text) {
        editor.focus();
        return;
      }
      button.disabled = true;
      let result;
      try {
        result = await chrome.runtime.sendMessage({
          action: "updateNote",
          noteId: note.id,
          text,
        });
      } catch (error) {
        result = { success: false, message: error.message };
      }
      if (result?.success) {
        await loadNotes();
        return;
      }
      button.disabled = false;
      button.title = uiText(result?.message || "保存失败，请重试。");
    },
  });
  editActions.append(cancel, save);
  textElement.replaceWith(editor);
  actions.replaceWith(editActions);
  editor.focus();
}

function renderNoteCard(note) {
  const card = document.createElement("div");
  card.className = `note${note.kind === "ai_chat" ? " note-ai-chat" : ""}`;

  // 状态提示（视频已下架之类）常驻在卡片底部，平时藏着。
  const notice = document.createElement("p");
  notice.className = "note-notice";
  notice.hidden = true;
  // 后台还在润色时说一声，不然正文过几秒突然变了会让人纳闷。
  // 时间上限挡住润色中途 service worker 被回收留下的僵尸标记。
  if (note.pending && Date.now() - note.createdAt < 3 * 60 * 1000) {
    setNoteNotice(notice, "AI 正在润色这条笔记…", "muted");
  }
  const play = () => playNote(note, notice);

  const head = document.createElement("div");
  head.className = "entry-head";
  appendNoteSelection(head, note);

  // 时间戳做成按钮才看得出来能点。
  const time = document.createElement("button");
  time.className = "entry-time time-btn";
  time.textContent = note.timestamp;
  time.title = uiText("跳到这个时间点");
  time.addEventListener("click", play);

  const remove = actionButton({
    iconName: "trash",
    title: "删除这条笔记",
    onClick: async () => {
      await chrome.runtime.sendMessage({ action: "deleteNote", noteId: note.id });
      state.selectedNoteIds.delete(note.id);
      loadNotes();
    },
  });
  remove.classList.add("note-delete");

  head.appendChild(time);
  if (note.kind === "ai_chat") {
    const source = document.createElement("span");
    source.className = "note-source-badge";
    source.textContent = state.uiLanguage === "en" ? "AI Q&A" : "AI 问答";
    head.appendChild(source);
  }
  head.appendChild(remove);

  // 笔记与问 AI 共用同一套安全 Markdown 渲染器；原始文本仍保留在
  // note.text，供编辑、复制和本地导出使用。
  const text = document.createElement("div");
  text.className = "entry-text markdown-body";
  BILI_MARKDOWN.render(text, note.text, document);

  const away =
    (note.site || "bilibili") !== (state.site || "bilibili") ||
    note.bvid !== state.bvid;

  // 看的就是这个视频时，再写一遍标题和 UP 主是废话，白占一行。
  const meta = document.createElement("p");
  meta.className = "note-meta";
  meta.textContent = away
    ? [note.videoTitle, note.ownerName].filter(Boolean).join(" · ")
    : "";
  meta.hidden = !meta.textContent;

  const actions = document.createElement("div");
  actions.className = "entry-actions";
  // 别的视频的笔记要开新标签页，图标换成「外链」，免得点下去才发现跳走了。
  actions.append(
    actionButton({
      iconName: "edit",
      label: "编辑",
      title: "编辑这条笔记",
      onClick: () => beginNoteEdit(note, text, actions),
    }),
    actionButton({
      iconName: away ? "external" : "play",
      label: away ? "打开" : "播放",
      title: away ? "在新标签页打开原视频并跳到这一刻" : "跳到这个时间点",
      onClick: play,
    }),
    actionButton({
      iconName: "copy",
      label: "复制",
      title: "复制笔记正文",
      onClick: async (button) => {
        await navigator.clipboard.writeText(note.text);
        flashActionButton(button, "已复制");
      },
    }),
    actionButton({
      iconName: "link",
      label: "链接",
      title: "复制带时间戳的视频链接",
      onClick: async (button) => {
        await navigator.clipboard.writeText(note.timestampedUrl);
        flashActionButton(button, "已复制");
      },
    }),
    actionButton({
      iconName: "external",
      label: "同步飞书",
      title: "将这条笔记同步到飞书",
      onClick: (button) => syncNotesToLark([note.id], button),
    }),
  );

  card.append(head, text, meta, actions, notice);
  return card;
}

function renderMemoCard(memo, { ai = false } = {}) {
  const card = document.createElement("div");
  card.className = `note note-memo${ai ? " note-ai-chat" : ""}`;

  const head = document.createElement("div");
  head.className = "entry-head";
  appendNoteSelection(head, memo);
  const created = document.createElement("span");
  created.className = "memo-created";
  created.textContent = new Date(memo.createdAt).toLocaleString(
    state.uiLanguage === "en" ? "en-US" : "zh-CN",
  );
  const remove = actionButton({
    iconName: "trash",
    title: ai ? "删除这条 AI 记" : "删除这条手记",
    onClick: async () => {
      await chrome.runtime.sendMessage({ action: "deleteNote", noteId: memo.id });
      state.selectedNoteIds.delete(memo.id);
      loadNotes();
    },
  });
  remove.classList.add("note-delete");
  head.appendChild(created);
  if (ai) {
    const badge = document.createElement("span");
    badge.className = "note-source-badge";
    badge.textContent = uiText("AI 记");
    head.appendChild(badge);
  }
  head.appendChild(remove);

  // 手记与 AI 记也支持 Markdown，避免同一份已保存内容在不同栏目展示不一致。
  const text = document.createElement("div");
  text.className = "entry-text markdown-body";
  BILI_MARKDOWN.render(text, memo.text, document);

  const meta = document.createElement("p");
  meta.className = "note-meta";
  meta.textContent = memo.timestampedUrl
    ? [memo.videoTitle, memo.timestamp].filter(Boolean).join(" · ")
    : "";
  meta.hidden = !meta.textContent;

  const actions = document.createElement("div");
  actions.className = "entry-actions";
  if (memo.timestampedUrl) {
    actions.appendChild(
      actionButton({
        iconName: "external",
        label: "访问锚点",
        title: "打开视频并跳到记录位置",
        onClick: () => playNote(memo, document.createElement("p")),
      }),
    );
  }
  actions.appendChild(
    actionButton({
      iconName: "edit",
      label: "编辑",
      title: "编辑这条笔记",
      onClick: () => beginNoteEdit(memo, text, actions),
    }),
  );
  actions.appendChild(
    actionButton({
      iconName: "copy",
      label: "复制",
      title: "复制手记正文",
      onClick: async (button) => {
        await navigator.clipboard.writeText(memo.text);
        flashActionButton(button, "已复制");
      },
    }),
  );
  actions.appendChild(
    actionButton({
      iconName: "external",
      label: "同步飞书",
      title: "将这条笔记同步到飞书",
      onClick: (button) => syncNotesToLark([memo.id], button),
    }),
  );

  card.append(head, text, meta, actions);
  return card;
}

async function currentMemoVideoContext(timestampOverride) {
  if (!state.bvid) return null;
  let pageInfo = {};
  try {
    pageInfo =
      (await chrome.tabs.sendMessage(state.tabId, { action: "getVideoInfo" })) || {};
  } catch (error) {
    // 页面刷新期间拿不到内容脚本时，退回侧栏里已有的元数据。
  }
  const cachedInfo = state.data?.videoInfo || state.errorResult?.videoInfo || {};
  const seconds = Math.max(
    0,
    Number(
      Number.isFinite(Number(timestampOverride))
        ? timestampOverride
        : pageInfo.currentTime ?? state.currentTime,
    ) || 0,
  );
  state.currentTime = seconds;
  return {
    site: state.site,
    bvid: state.bvid,
    page: state.page,
    videoTitle:
      pageInfo.title || cachedInfo.title || el("videoTitle").textContent || state.bvid,
    timestamp: seconds,
  };
}

async function saveMemo() {
  const input = el("memoInput");
  const text = String(input.value || "").trim();
  if (!text) {
    el("memoSaveStatus").textContent = uiText("请先输入手记内容。");
    input.focus();
    return;
  }
  const button = el("saveMemoBtn");
  button.disabled = true;
  button.textContent = uiText("保存中…");
  const videoContext = await currentMemoVideoContext();
  let result;
  try {
    result = await chrome.runtime.sendMessage({
      action: "saveMemo",
      kind: "memo",
      text,
      ...(videoContext || {}),
    });
  } catch (error) {
    result = { success: false, message: error.message };
  }
  button.disabled = false;
  button.textContent = uiText("保存");
  if (!result?.success) {
    el("memoSaveStatus").textContent = uiText(
      result?.message || "保存失败，请重试。",
    );
    return;
  }
  input.value = "";
  el("memoSaveStatus").textContent = uiText(
    videoContext ? "已保存，并记录当前视频访问锚点。" : "已保存。",
  );
  await loadNotes();
}

function setNoteNotice(notice, message, tone = "warn") {
  notice.className = `note-notice ${tone}`;
  notice.textContent = uiText(message);
  notice.hidden = !message;
}

// 同一个视频就地跳转；别的视频开新标签页，开之前先问一句视频还在不在。
async function playNote(note, notice) {
  if (
    (note.site || "bilibili") === (state.site || "bilibili") &&
    note.bvid === state.bvid
  ) {
    seekTo(note.timestampSeconds);
    return;
  }

  setNoteNotice(notice, "正在确认视频是否还在…", "muted");
  const result = await chrome.runtime.sendMessage({
    action: "checkVideoAvailable",
    site: note.site || "bilibili",
    bvid: note.bvid,
  });

  if (result?.available === false) {
    setNoteNotice(notice, result.message || "视频已下架，无法查看原视频。");
    return;
  }
  setNoteNotice(notice, "");
  chrome.tabs.create({ url: note.timestampedUrl });
}

function setNotesScope(scope) {
  state.notesScope = scope;
  state.selectedNoteIds.clear();
  el("notesScopeVideo").classList.toggle("active", scope === "video");
  el("notesScopeAll").classList.toggle("active", scope === "all");
  el("notesScopeMemo").classList.toggle("active", scope === "memo");
  el("notesScopeAi").classList.toggle("active", scope === "ai");
  loadNotes();
}

// ============================================================
// 划词解释
// ============================================================

const EXPLAIN_GAP = 10; // 浮层与选区之间留的缝
const EXPLAIN_MARGIN = 8; // 浮层与内容区边缘留的缝

let pendingSelection = "";
let pendingRange = null;
// 解释浮层锚在被选中的那段文字上。存 Range 而不是坐标：滚动、改窗宽之后
// 重新取一次 getBoundingClientRect 就能算出新位置。
let explainAnchor = null;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function hideExplain() {
  el("explainTooltip").hidden = true;
  el("explainPopover").hidden = true;
  explainAnchor = null;
}

// 选中字幕里的一段文字后，在选区上方浮出「解释」按钮。
function onSelectionChange() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) {
    el("explainTooltip").hidden = true;
    return;
  }

  const text = selection.toString().trim();
  const container = selection.anchorNode?.parentElement;
  if (!text || text.length > 200 || !container?.closest(".content")) {
    el("explainTooltip").hidden = true;
    return;
  }

  const range = selection.getRangeAt(0);
  pendingSelection = text;
  pendingRange = range.cloneRange();

  const rect = range.getBoundingClientRect();
  const bounds = document.querySelector(".content").getBoundingClientRect();
  const tooltip = el("explainTooltip");
  tooltip.hidden = false;
  tooltip.style.left = `${clamp(
    rect.left + rect.width / 2 - tooltip.offsetWidth / 2,
    EXPLAIN_MARGIN,
    window.innerWidth - tooltip.offsetWidth - EXPLAIN_MARGIN,
  )}px`;
  tooltip.style.top = `${clamp(
    rect.top - tooltip.offsetHeight - 6,
    bounds.top + EXPLAIN_MARGIN,
    bounds.bottom - tooltip.offsetHeight - EXPLAIN_MARGIN,
  )}px`;
}

// 浮层贴在选中文字上方；上面塞不下就翻到下方，并始终留在内容区内不压住顶栏。
function positionExplainPopover() {
  const popover = el("explainPopover");
  if (popover.hidden || !explainAnchor) return;

  const rect = explainAnchor.getBoundingClientRect();
  const bounds = document.querySelector(".content").getBoundingClientRect();
  // 被解释的那句已经滚出视野，浮层再赖着就成了没有出处的一块牌子。
  if (rect.bottom < bounds.top || rect.top > bounds.bottom) {
    hideExplain();
    return;
  }

  const { offsetWidth: width, offsetHeight: height } = popover;
  const minTop = bounds.top + EXPLAIN_MARGIN;
  const maxTop = bounds.bottom - height - EXPLAIN_MARGIN;
  const above = rect.top - height - EXPLAIN_GAP;
  const below = rect.bottom + EXPLAIN_GAP;
  const placement = above >= minTop || below > maxTop ? "top" : "bottom";
  const left = clamp(
    rect.left + rect.width / 2 - width / 2,
    EXPLAIN_MARGIN,
    window.innerWidth - width - EXPLAIN_MARGIN,
  );

  popover.dataset.placement = placement;
  popover.style.left = `${left}px`;
  popover.style.top = `${clamp(placement === "top" ? above : below, minTop, maxTop)}px`;
  // 浮层被边缘挡住而偏移时，小三角仍要对准选区中心。
  popover.style.setProperty(
    "--arrow-x",
    `${clamp(rect.left + rect.width / 2 - left, 16, width - 16)}px`,
  );
}

// 给模型的上下文：选中处所在段落及前后各一段。用户选中的是屏幕上显示的文字，
// 开着顺句或翻译时那不是原文，所以原文、顺句稿、译文都要找。
function selectionContext(selected) {
  const segments = state.data?.segments || [];
  const index = segments.findIndex(
    (segment) =>
      segment.text.includes(selected) ||
      (state.polished[segment.id] || "").includes(selected) ||
      (state.translated[segment.id] || "").includes(selected),
  );
  if (index === -1) return state.data?.transcriptText?.slice(0, 2000) || "";
  return segments
    .slice(Math.max(0, index - 1), index + 2)
    .map((segment) => segmentDisplayText(segment))
    .join(" ");
}

async function explainSelection() {
  const selected = pendingSelection;
  if (!selected) return;

  el("explainTooltip").hidden = true;
  el("explainTerm").textContent = selected;
  el("explainBody").textContent = uiText("正在解释…");
  el("explainPopover").hidden = false;
  explainAnchor = pendingRange;
  positionExplainPopover();

  const result = await chrome.runtime.sendMessage({
    action: "explainSelection",
    selectedText: selected,
    transcriptContext: selectionContext(selected),
    videoTitle: state.data?.videoInfo?.title || "",
  });

  el("explainBody").textContent = result?.success
    ? result.explanation
    : result?.message || "解释失败，请重试。";
  // 解释文字填进去，浮层高度变了，得重新贴一次。
  positionExplainPopover();
}

// ============================================================
// 复制 / 导出
// ============================================================

// 导出跟着界面走：看到的是哪一份，导出的就是哪一份。
function transcriptAsText() {
  const bilingual = state.transcriptMode === "bilingual";
  return (state.data?.segments || [])
    .map((segment) => {
      const stamp = `[${formatTimestamp(segment.start)}]`;
      if (!bilingual) return `${stamp} ${segmentDisplayText(segment)}`;
      const source = sourceText(segment);
      const translated = state.translated[segment.id];
      return translated
        ? `${stamp} ${source}\n${" ".repeat(stamp.length)} ${translated}`
        : `${stamp} ${source}`;
    })
    .join("\n");
}

function flashButton(button, text) {
  const original = button.textContent;
  button.textContent = text;
  setTimeout(() => {
    button.textContent = original;
  }, 1500);
}

async function copyTranscript() {
  if (!state.data) return;
  try {
    await navigator.clipboard.writeText(transcriptAsText());
    flashButton(el("copyBtn"), "已复制");
  } catch (error) {
    flashButton(el("copyBtn"), "复制失败");
  }
}

function exportTranscript() {
  if (!state.data) return;
  const title = state.data.videoInfo?.title || state.bvid;
  const sourceUrl =
    state.site === "youtube"
      ? `https://www.youtube.com/watch?v=${state.bvid}`
      : `https://www.bilibili.com/video/${state.bvid}${state.page > 1 ? `?p=${state.page}` : ""}`;
  const header = `${title}\n${state.data.videoInfo?.owner || ""}\n${sourceUrl}\n\n`;
  const blob = new Blob([header + transcriptAsText()], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${sanitizeFilename(title)}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

function sanitizeFilename(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) || "transcript";
}

// ============================================================
// 启动
// ============================================================

function setupEventListeners() {
  el("refreshBtn").addEventListener("click", () => {
    if (state.bvid) loadTranscript({ force: true });
  });
  el("optionsBtn").addEventListener("click", () => chrome.runtime.openOptionsPage());
  el("errorRetryBtn").addEventListener("click", () => loadTranscript({ force: true }));
  el("polishBtn").addEventListener("click", togglePolish);
  for (const button of el("transcriptMode").querySelectorAll(".segmented-btn")) {
    button.addEventListener("click", () => setTranscriptMode(button.dataset.mode));
  }
  el("copyBtn").addEventListener("click", copyTranscript);
  el("exportBtn").addEventListener("click", exportTranscript);
  el("searchBtn").addEventListener("click", () => {
    if (el("searchRow").hidden) openSearch();
    else closeSearch();
  });
  el("searchClose").addEventListener("click", closeSearch);
  el("searchInput").addEventListener("input", (event) => {
    applySearchFilter(event.target.value);
  });
  el("searchInput").addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSearch();
  });
  el("followPill").addEventListener("click", jumpToActive);
  // 「/」唤起搜索——正在别的输入框里打字时不抢；Escape 关闭问答预设弹窗。
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const modal = el("chatQuestionsModal");
      if (modal && !modal.hidden) {
        closeChatQuestionsModal();
        return;
      }
    }
    const tag = event.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (event.key === "/" && state.tab === "transcript" && state.view === "ready") {
      event.preventDefault();
      openSearch();
    }
  });
  el("analyzeBtn").addEventListener("click", () => analyze());
  el("reanalyzeBtn").addEventListener("click", () => analyze({ force: true }));
  el("overviewPrompt").addEventListener("input", updateOverviewPrompt);
  el("resetOverviewPromptZhBtn").addEventListener("click", () =>
    resetOverviewPrompt("zh-CN"),
  );
  el("resetOverviewPromptEnBtn").addEventListener("click", () =>
    resetOverviewPrompt("en"),
  );
  el("notesScopeVideo").addEventListener("click", () => setNotesScope("video"));
  el("notesScopeAll").addEventListener("click", () => setNotesScope("all"));
  el("notesScopeMemo").addEventListener("click", () => setNotesScope("memo"));
  el("notesScopeAi").addEventListener("click", () => setNotesScope("ai"));
  el("toggleNotesDeleteModeBtn").addEventListener("click", () =>
    setNotesDeleteMode(!state.notesDeleteMode),
  );
  el("cancelNotesDeleteModeBtn").addEventListener("click", () => setNotesDeleteMode(false));
  el("selectVisibleNotesBtn").addEventListener("click", selectVisibleNotes);
  el("deleteSelectedNotesBtn").addEventListener("click", deleteSelectedNotes);
  el("clearCurrentNotesBtn").addEventListener("click", clearCurrentNotes);
  el("loadMoreNotesBtn").addEventListener("click", loadMoreNotes);
  el("exportNotesJsonBtn").addEventListener("click", () => exportNotes("json"));
  el("exportNotesMarkdownBtn").addEventListener("click", () =>
    exportNotes("markdown"),
  );
  el("exportNotesCsvBtn").addEventListener("click", () => exportNotes("csv"));
  el("syncAllNotesLarkBtn").addEventListener("click", syncAllNotesToLark);
  el("memoForm").addEventListener("submit", (event) => {
    event.preventDefault();
    saveMemo();
  });
  el("chatForm").addEventListener("submit", (event) => {
    event.preventDefault();
    submitChatQuestion();
  });
  el("chatInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitChatQuestion();
    }
  });
  el("clearChatBtn").addEventListener("click", resetChat);
  el("manageChatQuestionsBtn").addEventListener("click", openChatQuestionsModal);
  el("quickManageQuestionsBtn").addEventListener("click", openChatQuestionsModal);
  el("closeChatQuestionsModalBtn").addEventListener("click", closeChatQuestionsModal);
  el("chatQuestionsBackdrop").addEventListener("click", closeChatQuestionsModal);
  el("addChatQuestionBtn").addEventListener("click", addChatQuestion);
  el("newChatQuestionInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addChatQuestion();
    }
  });
  el("resetChatQuestionsBtn").addEventListener("click", resetChatQuestions);
  el("saveChatQuestionsBtn").addEventListener("click", saveChatQuestions);
  el("disabledSettingsBtn").addEventListener("click", () =>
    chrome.runtime.sendMessage({ action: "openOptions" }),
  );
  el("explainBtn").addEventListener("click", explainSelection);
  el("explainClose").addEventListener("click", hideExplain);

  // 按下鼠标就会清空选区，进而触发 selectionchange 把这个按钮藏掉，
  // click 根本没机会发生。阻止默认行为，选区才能活到点击那一刻。
  el("explainTooltip").addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  for (const button of document.querySelectorAll(".tab")) {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  }

  document.addEventListener("selectionchange", onSelectionChange);

  window.addEventListener("resize", positionExplainPopover);

  document.querySelector(".content").addEventListener(
    "scroll",
    () => {
      positionExplainPopover();
      // 刚刚是我们自己滚的就不算用户操作。
      if (Date.now() - state.lastAutoScrollAt > 1000) {
        state.lastUserScrollAt = Date.now();
        updateFollowPill();
      }
    },
    { passive: true },
  );

  chrome.tabs.onActivated.addListener(({ windowId }) => {
    if (windowId === state.windowId) syncWithActiveTab();
  });

  // B 站换视频走 pushState，浏览器会以 changeInfo.url 的形式上报。
  // 不比对 tabId：syncWithActiveTab 自己会解析当前活动标签页，没变就直接返回。
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) syncWithActiveTab();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.action === "startDigestFromButton") {
      syncWithActiveTab({ tab: message.tab || null });
    }
    if (message?.action === "siteScopeChanged") syncWithActiveTab({ force: true });
    if (message?.action === "uiLanguageChanged") {
      state.uiLanguage = message.uiLanguage === "en" ? "en" : "zh-CN";
      state.overviewPromptLanguage = state.uiLanguage;
      applySidepanelLanguage();
      renderOverviewPrompt();
      if (state.analysis && state.analysisLanguage !== state.uiLanguage) {
        resetOverview();
      } else if (state.analysis) {
        renderAnalysis(state.analysis, true);
      }
      if (state.tab === "notes") loadNotes();
      if (state.tab === "chat") renderChat();
      render();
    }
    if (message?.action === "noteSaved" && state.tab === "notes") loadNotes();
    // 笔记先存原始字幕、润色好了再替换正文，所以还有第二次刷新。
    if (message?.action === "noteUpdated" && state.tab === "notes") loadNotes();
    if (message?.action === "larkSyncProgress") {
      el("larkSyncStatus").textContent = uiText(
        `正在同步飞书 ${message.done}/${message.total}…`,
      );
    }
    if (message?.action === "larkAutoSyncResult" && state.tab === "notes") {
      el("larkSyncStatus").textContent = uiText(
        message.success ? "已同步 1 条笔记。" : "同步失败",
      );
    }
    // 概览的分块在 background 里跑，进度只能靠它广播回来。
    if (message?.action === "aiProgress") {
      showProgress(message.kind, message.done, message.total);
    }
    return false;
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const stored = await chrome.storage.local.get([
    BILI_SETTINGS.STORAGE_KEY,
    BILI_SETTINGS.LEGACY_STORAGE_KEY,
  ]);
  const settings = BILI_SETTINGS.normalizeAppSettings(
    stored[BILI_SETTINGS.STORAGE_KEY] ?? stored[BILI_SETTINGS.LEGACY_STORAGE_KEY],
  );
  state.appSettings = settings;
  state.uiLanguage = settings.uiLanguage;
  state.overviewPrompts = { ...settings.overviewPrompts };
  state.overviewPromptLanguage = state.uiLanguage;
  applySidepanelLanguage();
  renderOverviewPrompt();
  renderChatPresetQuestions();
  state.windowId = (await chrome.windows.getCurrent()).id;
  setupEventListeners();
  setInterval(trackPlayback, POLL_INTERVAL_MS);
  await syncWithActiveTab();
});
