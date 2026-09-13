const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

/**
 * 侧边栏的渲染集成测试。
 *
 * 这里加载的是真正的 sidepanel.js，只把 DOM 和 chrome API 换成桩，
 * 然后走完整的 loadTranscript 流程。这样测的是真实的分支与调用顺序，
 * 而不是另写一份逻辑自己跟自己对答案。
 *
 * 之所以不用浏览器端到端：侧边栏跑在 chrome-extension:// 里，
 * 需要先把扩展装进真实浏览器，还得有 B 站登录态和一个真的 AI 密钥，
 * 每跑一次都要花钱、且结果不确定。而这个 bug 的因果完全在渲染路径上，
 * 在这一层就能钉死。
 */

const ROOT = path.join(__dirname, "..");

/** 属性随便读写、方法都不做事的元素桩，够渲染路径用即可。 */
function createElement(tag = "div") {
  const queried = new Map();
  let text = "";
  return {
    tagName: tag,
    className: "",
    get textContent() {
      return text;
    },
    set textContent(value) {
      text = String(value);
      if (text === "") this.children = [];
    },
    value: "",
    hidden: false,
    disabled: false,
    style: {},
    dataset: {},
    children: [],
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    append(...nodes) {
      this.children.push(...nodes);
    },
    insertBefore(node) {
      this.children.push(node);
      return node;
    },
    remove() {},
    scrolled: false,
    scrollIntoView() {
      this.scrolled = true;
    },
    focus() {},
    listeners: new Map(),
    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    },
    removeEventListener() {},
    // 同一个选择器要返回同一个对象，否则写进去的值下次就读不到了。
    querySelector(selector) {
      if (!queried.has(selector)) queried.set(selector, createElement("div"));
      return queried.get(selector);
    },
    querySelectorAll(selector) {
      const results = [];
      const match = (node) => {
        if (!node) return;
        if (typeof selector === "string") {
          if (
            selector.startsWith(".") &&
            node.className &&
            node.className.split(/\s+/).includes(selector.slice(1))
          ) {
            results.push(node);
          } else if (selector.startsWith("#") && node.id === selector.slice(1)) {
            results.push(node);
          } else if (node.tagName && node.tagName.toLowerCase() === selector.toLowerCase()) {
            results.push(node);
          }
        }
        if (Array.isArray(node.children)) {
          for (const child of node.children) {
            match(child);
          }
        }
      };
      if (Array.isArray(this.children)) {
        for (const child of this.children) {
          match(child);
        }
      }
      return results;
    },
  };
}

function createContext({
  transcript,
  analysis,
  videoAvailable = { available: true },
  siteEnabled = true,
  tabsQuery,
}) {
  const elements = new Map();
  const docListeners = new Map();
  const byId = (id) => {
    if (!elements.has(id)) elements.set(id, createElement("div"));
    return elements.get(id);
  };

  const sent = [];
  // 真实页面中的三个复选框在 HTML 里默认全选；桩没有解析 HTML，显式补上。
  for (const id of [
    "chatContextTranscript",
    "chatContextOverview",
    "chatContextNotes",
  ]) {
    byId(id).checked = true;
  }
  const openedTabs = [];
  const seeks = [];
  const context = {
    console,
    URL,
    setTimeout,
    clearTimeout,
    setInterval,
    CSS: { escape: (value) => value },
    window: { getSelection: () => null, addEventListener() {}, removeEventListener() {} },
    document: {
      getElementById: byId,
      createElement: (tag) => createElement(tag),
      createTextNode: (text) => ({ tagName: "#text", textContent: String(text) }),
      createElementNS: (namespace, tag) => createElement(tag),
      createDocumentFragment: () => createElement("#fragment"),
      querySelector: () => createElement("div"),
      querySelectorAll: () => [],
      addEventListener(type, listener) {
        if (!docListeners.has(type)) docListeners.set(type, []);
        docListeners.get(type).push(listener);
      },
    },
    navigator: { clipboard: { writeText: async () => {} } },
    chrome: {
      runtime: {
        async sendMessage(message) {
          sent.push(message);
          if (message.action === "isSiteEnabled") return { enabled: siteEnabled };
          if (message.action === "fetchTranscript") return transcript;
          if (message.action === "analyzeTranscript") return analysis;
          if (message.action === "askVideo") {
            return { success: true, answer: `回答：${message.question}` };
          }
          if (message.action === "translateSegments") {
            const translated = {};
            for (const id of message.segmentIds) translated[id] = `${id} 的译文`;
            return { success: true, translated };
          }
          if (message.action === "checkVideoAvailable") return videoAvailable;
          return { success: true };
        },
        onMessage: { addListener() {} },
      },
      tabs: {
        query: async (query) =>
          tabsQuery
            ? tabsQuery(query)
            : [{ id: 1, windowId: 1, url: "https://www.bilibili.com/video/BV1xx411c7mD" }],
        sendMessage: async (tabId, message) => {
          if (message?.action === "seekTo") seeks.push(message.seconds);
          return {};
        },
        create: async (options) => {
          openedTabs.push(options.url);
          return { id: 2 };
        },
        onActivated: { addListener() {} },
        onUpdated: { addListener() {} },
      },
      windows: { getCurrent: async () => ({ id: 1 }) },
      storage: { local: { get: async () => ({}), set: async () => {} } },
    },
    BILI_TRANSCRIPT: require("../lib/transcript.js"),
    BILI_AI: require("../lib/ai.js"),
    BILI_CONCURRENCY: require("../lib/concurrency.js"),
    BILI_MARKDOWN: require("../lib/markdown.js"),
    BILI_SETTINGS: require("../settings.js"),
  };
  context.globalThis = context;

  vm.createContext(context);
  // sidepanel.js 顶层用的是 const，在 vm 里不会挂到全局对象上，
  // 所以在末尾追加一行，从同一个词法作用域里把要测的绑定递出来。
  const source = fs.readFileSync(path.join(ROOT, "sidepanel.js"), "utf8");
  vm.runInContext(
    `${source}\n;globalThis.__api = { state, uiText, parseVideoRef, activeTab, syncWithActiveTab, loadTranscript, analyze, renderSegments, renderAnalysis, segmentDisplayText, noteTextForSegment, saveTextAsVideoNote, paintSegmentText, setTranscriptMode, selectionContext, applySearchFilter, updateFollowPill, jumpToActive, closeSearch, renderNoteCard, renderMemoCard, playNote, saveMemo, currentMemoVideoContext, submitChatQuestion, saveChatAsNote, renderChat, renderChatPresetQuestions, openChatQuestionsModal, closeChatQuestionsModal, addChatQuestion, resetChatQuestions, saveChatQuestions, setupEventListeners, switchTab, renderOverviewPrompt, resetOverviewPrompt, chatContextSelection };`,
    context,
  );

  return {
    ...context.__api,
    el: byId,
    chrome: context.chrome,
    sent,
    openedTabs,
    seeks,
    BILI_SETTINGS: context.BILI_SETTINGS,
    triggerDocumentKeydown(event) {
      const listeners = docListeners.get("keydown") || [];
      for (const fn of listeners) fn(event);
    },
  };
}

const SEGMENTS = [
  { id: "s1", start: 0, text: "第一段原文" },
  { id: "s2", start: 5, text: "第二段原文" },
];

const ANALYSIS = {
  chapters: [
    { timestamp: "0:00", timestampSeconds: 0, title: "开场", summary: "讲了开场" },
  ],
  keyQuotes: [{ timestamp: "0:05", timestampSeconds: 5, quote: "一句金句" }],
};

test("字幕片段可一键存为带时间锚点的视频笔记", async () => {
  const ctx = createContext({ transcript: transcriptResult() });
  ctx.state.site = "bilibili";
  ctx.state.bvid = "BV1xx411c7mD";
  ctx.state.page = 1;
  ctx.renderSegments(SEGMENTS);

  const row = ctx.el("transcriptList").children[0].children[0];
  const save = row.children[2];
  await save.listeners.get("click")({ stopPropagation() {} });

  const message = ctx.sent.find((item) => item.action === "saveNote");
  assert.equal(message.timestamp, 0);
  assert.equal(message.text, "第一段原文");
  assert.equal(message.bvid, "BV1xx411c7mD");
});

test("概览章节与金句都可一键存为视频笔记", async () => {
  const ctx = createContext({ transcript: transcriptResult() });
  ctx.state.site = "bilibili";
  ctx.state.bvid = "BV1xx411c7mD";
  ctx.state.page = 1;
  ctx.renderAnalysis(ANALYSIS, false);

  const chapterSave = ctx.el("chapterList").children[0].children[2].children[0];
  await chapterSave.listeners.get("click")({ stopPropagation() {} });
  const quoteSave = ctx.el("quoteList").children[0].children[2].children[0];
  await quoteSave.listeners.get("click")({ stopPropagation() {} });

  const saved = ctx.sent.filter((item) => item.action === "saveNote");
  assert.deepEqual(
    saved.map(({ timestamp, text }) => ({ timestamp, text })),
    [
      { timestamp: 0, text: "开场\n讲了开场" },
      { timestamp: 5, text: "一句金句" },
    ],
  );
});

test("英文界面会翻译侧边栏菜单和动态计数", () => {
  const ctx = createContext({ transcript: transcriptResult() });
  ctx.state.uiLanguage = "en";

  assert.equal(ctx.uiText("字幕"), "Transcript");
  assert.equal(ctx.uiText("概览"), "Overview");
  assert.equal(ctx.uiText("笔记"), "Notes");
  assert.equal(ctx.uiText("问 AI"), "Ask AI");
  assert.equal(ctx.uiText("7 章节"), "7 chapters");
  assert.equal(ctx.uiText("5 金句"), "5 key quotes");
});

test("概览提示词可在中文界面切换为英文默认版本", () => {
  const ctx = createContext({ transcript: transcriptResult() });
  const defaults = require("../settings.js").DEFAULT_OVERVIEW_PROMPTS;
  ctx.state.uiLanguage = "zh-CN";
  ctx.state.overviewPrompts = {
    "zh-CN": "保留的中文自定义提示词",
    en: "Existing English prompt",
  };

  ctx.resetOverviewPrompt("en");

  assert.equal(ctx.state.overviewPromptLanguage, "en");
  assert.equal(ctx.el("overviewPrompt").value, defaults.en);
  assert.equal(ctx.state.overviewPrompts["zh-CN"], "保留的中文自定义提示词");

  ctx.resetOverviewPrompt("zh-CN");
  assert.equal(ctx.state.overviewPromptLanguage, "zh-CN");
  assert.equal(ctx.el("overviewPrompt").value, defaults["zh-CN"]);
});

function transcriptResult(extra = {}) {
  return {
    success: true,
    fromCache: true,
    segments: SEGMENTS,
    videoInfo: { title: "标题", owner: "UP主" },
    ...extra,
  };
}

test("当前网站在适用范围中关闭时，侧边栏不请求字幕", async () => {
  const ctx = createContext({
    transcript: transcriptResult(),
    siteEnabled: false,
  });

  await ctx.syncWithActiveTab();

  assert.equal(ctx.state.view, "disabled");
  assert.equal(ctx.el("disabledState").hidden, false);
  assert.equal(
    ctx.sent.some((message) => message.action === "fetchTranscript"),
    false,
  );
});

test("视频地址识别兼容不带 www 的 YouTube 与 B站域名", () => {
  const ctx = createContext({ transcript: transcriptResult() });

  assert.equal(
    ctx.parseVideoRef("https://bilibili.com/video/BV1xx411c7mD")?.videoId,
    "BV1xx411c7mD",
  );
  assert.equal(
    ctx.parseVideoRef("https://youtube.com/watch?v=dQw4w9WgXcQ")?.videoId,
    "dQw4w9WgXcQ",
  );
});

test("侧栏窗口查询不到标签页时会从最后聚焦窗口找到 B站视频", async () => {
  const queries = [];
  const ctx = createContext({
    transcript: transcriptResult(),
    tabsQuery: async (query) => {
      queries.push(query);
      if (query.lastFocusedWindow) {
        return [{ id: 7, windowId: 9, url: "https://www.bilibili.com/video/BV1xx411c7mD" }];
      }
      return [];
    },
  });
  ctx.state.windowId = 1;

  await ctx.syncWithActiveTab();

  assert.equal(ctx.state.tabId, 7);
  assert.equal(ctx.state.bvid, "BV1xx411c7mD");
  assert.equal(ctx.state.view, "ready");
  assert.equal(queries[0].lastFocusedWindow, true);
});

test("Digest 按钮传来的标签页可直接驱动侧栏，不依赖窗口查询", async () => {
  let queryCount = 0;
  const ctx = createContext({
    transcript: transcriptResult(),
    tabsQuery: async () => {
      queryCount += 1;
      return [];
    },
  });

  await ctx.syncWithActiveTab({
    tab: { id: 8, windowId: 5, url: "https://www.bilibili.com/video/BV1xx411c7mD" },
  });

  assert.equal(queryCount, 0);
  assert.equal(ctx.state.tabId, 8);
  assert.equal(ctx.state.view, "ready");
});

// ============================================================
// 缓存里已有的结果要自动摆出来
// ============================================================

test("缓存里带着概览时，进来就直接展示，不用再点一次生成", async () => {
  const ctx = createContext({
    transcript: transcriptResult({ analysis: ANALYSIS }),
  });
  ctx.state.bvid = "BV1xx411c7mD";

  await ctx.loadTranscript();

  assert.equal(
    ctx.el("overviewResult").hidden,
    false,
    "结果就在手上却不显示，用户会以为上次生成失败了",
  );
  assert.equal(ctx.el("overviewEmpty").hidden, true);
  assert.deepEqual(ctx.state.analysis, ANALYSIS);
});

test("没有概览时保持空态，不会摆出一个空壳", async () => {
  const ctx = createContext({ transcript: transcriptResult() });
  ctx.state.bvid = "BV1xx411c7mD";

  await ctx.loadTranscript();

  assert.equal(ctx.el("overviewResult").hidden, true);
  assert.equal(ctx.el("overviewEmpty").hidden, false);
  assert.equal(ctx.state.analysis, null);
});

test("缓存里带着顺句结果时，直接显示顺过的文字", async () => {
  const ctx = createContext({
    transcript: transcriptResult({ polished: { s1: "第一段原文。" } }),
  });
  ctx.state.bvid = "BV1xx411c7mD";

  await ctx.loadTranscript();

  assert.equal(
    ctx.state.polishMode,
    true,
    "顺句是花钱换来的，回来默认显示原文等于让用户以为白顺了",
  );
  assert.equal(ctx.segmentDisplayText(SEGMENTS[0]), "第一段原文。");
  // 没顺到的那条仍然回落到原文
  assert.equal(ctx.segmentDisplayText(SEGMENTS[1]), "第二段原文");
});

test("没有顺句结果时不进入顺句态", async () => {
  const ctx = createContext({ transcript: transcriptResult() });
  ctx.state.bvid = "BV1xx411c7mD";

  await ctx.loadTranscript();

  assert.equal(ctx.state.polishMode, false);
  assert.equal(ctx.segmentDisplayText(SEGMENTS[0]), "第一段原文");
});

test("换视频时，上一个视频的概览不会串台", async () => {
  const ctx = createContext({
    transcript: transcriptResult({ analysis: ANALYSIS }),
  });
  ctx.state.bvid = "BV1xx411c7mD";
  await ctx.loadTranscript();
  assert.equal(ctx.el("overviewResult").hidden, false);

  // 换到一个没有概览的视频
  ctx.chrome.runtime.sendMessage = async (message) =>
    message.action === "fetchTranscript" ? transcriptResult() : { success: true };
  await ctx.loadTranscript();

  assert.equal(ctx.state.analysis, null);
  assert.equal(ctx.el("overviewResult").hidden, true);
  assert.equal(ctx.el("overviewEmpty").hidden, false);
});

// ============================================================
// 生成完成后的渲染
// ============================================================

test("生成成功后立即展示结果，并收起加载态", async () => {
  const ctx = createContext({
    transcript: transcriptResult(),
    analysis: { success: true, analysis: ANALYSIS },
  });
  ctx.state.bvid = "BV1xx411c7mD";
  await ctx.loadTranscript();

  await ctx.analyze();

  assert.equal(ctx.el("overviewLoading").hidden, true);
  assert.equal(ctx.el("overviewResult").hidden, false);
  assert.deepEqual(ctx.state.analysis, ANALYSIS);
});

// ============================================================
// 双语对照：三视图人人都有，顺句只给中文字幕
// ============================================================

const EN = { language: "en-US", languageLabel: "英语（自动生成）" };

test("中文字幕：顺句开关和三视图都给（中文译成英文）", async () => {
  const ctx = createContext({ transcript: transcriptResult({ language: "ai-zh" }) });
  ctx.state.bvid = "BV1xx411c7mD";

  await ctx.loadTranscript();

  assert.equal(ctx.state.isChinese, true);
  assert.equal(ctx.el("polishBtn").hidden, false);
  assert.equal(
    ctx.el("transcriptMode").hidden,
    false,
    "中文字幕也要给三视图——译成英文",
  );
});

test("中文字幕切译文会发翻译请求（方向由 background 定）", async () => {
  const ctx = createContext({ transcript: transcriptResult({ language: "ai-zh" }) });
  ctx.state.bvid = "BV1xx411c7mD";
  await ctx.loadTranscript();

  await ctx.setTranscriptMode("translated");

  assert.ok(
    ctx.sent.some((message) => message.action === "translateSegments"),
    "中文视频切译文视图也应该走同一条翻译链路",
  );
});

test("双语的上行跟着顺句走：开了顺句就显示顺句稿", async () => {
  const ctx = createContext({
    transcript: transcriptResult({
      language: "ai-zh",
      polished: { s1: "第一段，原文。" },
      translated: { s1: "Line one translated." },
    }),
  });
  ctx.state.bvid = "BV1xx411c7mD";
  await ctx.loadTranscript();

  assert.equal(ctx.state.transcriptMode, "bilingual", "缓存里有译文就该直接进双语");
  const node = ctx.el("probe");
  ctx.paintSegmentText(node, SEGMENTS[0]);
  assert.deepEqual(
    node.children.map((child) => child.textContent),
    ["第一段，原文。", "Line one translated."],
    "顺句稿比无标点的 ASR 原文好读，双语上行没理由退回原文",
  );
});

test("外文字幕给三视图，不给顺句开关", async () => {
  const ctx = createContext({ transcript: transcriptResult(EN) });
  ctx.state.bvid = "BV1xx411c7mD";

  await ctx.loadTranscript();

  assert.equal(ctx.state.isChinese, false);
  assert.equal(ctx.el("transcriptMode").hidden, false);
  assert.equal(
    ctx.el("polishBtn").hidden,
    true,
    "英文字幕本来就带标点，顺句没有意义",
  );
});

test("缓存里带着译文时，进来就是双语，不用再翻一遍", async () => {
  const ctx = createContext({
    transcript: transcriptResult({ ...EN, translated: { s1: "第一段译文" } }),
  });
  ctx.state.bvid = "BV1xx411c7mD";

  await ctx.loadTranscript();

  assert.equal(ctx.state.transcriptMode, "bilingual");
  assert.equal(ctx.state.translated.s1, "第一段译文");
});

test("双语模式下原文和译文各占一行，没翻到的那条给占位", async () => {
  const ctx = createContext({
    transcript: transcriptResult({ ...EN, translated: { s1: "第一段译文" } }),
  });
  ctx.state.bvid = "BV1xx411c7mD";
  await ctx.loadTranscript();

  const node = ctx.el("probe");
  ctx.paintSegmentText(node, SEGMENTS[0]);
  assert.deepEqual(
    node.children.map((child) => child.textContent),
    ["第一段原文", "第一段译文"],
  );

  const pending = ctx.el("probe2");
  ctx.paintSegmentText(pending, SEGMENTS[1]);
  assert.equal(pending.children[1].textContent, "翻译中…");
});

test("切到译文视图会去翻译，结果回填进 state", async () => {
  const ctx = createContext({ transcript: transcriptResult(EN) });
  ctx.state.bvid = "BV1xx411c7mD";
  await ctx.loadTranscript();

  await ctx.setTranscriptMode("translated");

  assert.equal(ctx.state.transcriptMode, "translated");
  assert.equal(ctx.state.translated.s1, "s1 的译文");
  assert.equal(ctx.segmentDisplayText(SEGMENTS[0]), "s1 的译文");
  assert.ok(
    ctx.sent.some((message) => message.action === "translateSegments"),
    "切到译文视图却没发翻译请求",
  );
});

test("切回原文不再发翻译请求", async () => {
  const ctx = createContext({ transcript: transcriptResult(EN) });
  ctx.state.bvid = "BV1xx411c7mD";
  await ctx.loadTranscript();
  await ctx.setTranscriptMode("translated");

  const before = ctx.sent.filter((m) => m.action === "translateSegments").length;
  await ctx.setTranscriptMode("original");

  assert.equal(ctx.state.transcriptMode, "original");
  assert.equal(ctx.segmentDisplayText(SEGMENTS[0]), "第一段原文");
  assert.equal(
    ctx.sent.filter((m) => m.action === "translateSegments").length,
    before,
    "切回原文只是换个显示方式，不该再花钱",
  );
});

test("已经翻过的分段不会再翻第二次", async () => {
  const ctx = createContext({
    transcript: transcriptResult({ ...EN, translated: { s1: "第一段译文", s2: "第二段译文" } }),
  });
  ctx.state.bvid = "BV1xx411c7mD";
  await ctx.loadTranscript();

  await ctx.setTranscriptMode("translated");

  assert.equal(
    ctx.sent.filter((m) => m.action === "translateSegments").length,
    0,
    "缓存里全都有了还去请求，等于白花钱",
  );
  assert.equal(ctx.segmentDisplayText(SEGMENTS[0]), "第一段译文");
});

test("翻译从正在看的位置开始，前面的稍后环绕补齐", async () => {
  const ctx = createContext({ transcript: transcriptResult(EN) });
  ctx.state.bvid = "BV1xx411c7mD";
  await ctx.loadTranscript();

  // 用户看到了第二段（5 秒处）才切译文视图。
  ctx.state.activeIndex = 1;
  await ctx.setTranscriptMode("translated");

  const first = ctx.sent.find((m) => m.action === "translateSegments");
  assert.deepEqual(
    first.segmentIds,
    ["s2", "s1"],
    "眼前这一段应该排在最前，否则长视频里用户要等前面全部翻完",
  );
  // 顺序只影响先后，两段最终都要有结果。
  assert.equal(ctx.state.translated.s1, "s1 的译文");
  assert.equal(ctx.state.translated.s2, "s2 的译文");
});

test("偶发失败的批次会自动补一轮，不用用户手点", async () => {
  // 5 段会被切成 2 批（每批最多 4 段），好让「部分失败」成立。
  const many = Array.from({ length: 5 }, (_, i) => ({
    id: `s${i + 1}`,
    start: i * 5,
    text: `第 ${i + 1} 段原文`,
  }));
  const ctx = createContext({
    transcript: {
      success: true,
      segments: many,
      videoInfo: { title: "标题", owner: "UP主" },
      language: "en-US",
    },
  });
  ctx.state.bvid = "BV1xx411c7mD";
  await ctx.loadTranscript();

  // 第一个翻译批次模拟限流失败，之后恢复正常。
  const original = ctx.chrome.runtime.sendMessage;
  let failedOnce = false;
  ctx.chrome.runtime.sendMessage = async (message) => {
    if (message.action === "translateSegments" && !failedOnce) {
      failedOnce = true;
      return { success: false, message: "限流" };
    }
    return original(message);
  };

  await ctx.setTranscriptMode("translated");

  for (const segment of many) {
    assert.ok(
      ctx.state.translated[segment.id],
      `${segment.id} 在自动补一轮之后仍然没有译文`,
    );
  }
  assert.ok(
    !ctx.el("segmentCount").textContent.includes("批失败"),
    "补齐之后不该再让用户手点补齐",
  );
});

test("划词解释能在顺句后的文字里找到上下文", async () => {
  const ctx = createContext({
    transcript: transcriptResult({ polished: { s1: "第一段，原文。" } }),
  });
  ctx.state.bvid = "BV1xx411c7mD";
  await ctx.loadTranscript();

  // 屏幕上显示的是顺句稿，用户选中的自然是带标点的版本——原文里并没有这串字。
  const context = ctx.selectionContext("第一段，原文。");
  assert.ok(
    context.includes("第一段，原文。"),
    "在顺句稿里找不到选区，上下文就退化成字幕开头，解释会驴唇不对马嘴",
  );
  assert.ok(context.includes("第二段原文"), "相邻分段也应该进上下文");
});

// ============================================================
// 字幕搜索与「回到当前句」浮标
// ============================================================

test("样式里必须兜住 hidden，否则整套显隐都是摆设", () => {
  // 本页大量元素既写了 display:flex 又靠 hidden 控制显隐（进度条、搜索栏、
  // 跟随浮标、被搜索过滤掉的字幕行……）。作者样式里的 display 会盖过
  // hidden 属性的浏览器默认值，少了这条兜底，它们一个都藏不住——
  // 而 DOM 桩不跑 CSS，只有在这里静态守住。
  const css = fs.readFileSync(path.join(ROOT, "sidepanel.css"), "utf8");
  assert.match(css, /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/);
});

test("命中的字会被 mark 标出来", async () => {
  const ctx = createContext({ transcript: transcriptResult() });
  ctx.state.bvid = "BV1xx411c7mD";
  await ctx.loadTranscript();

  ctx.applySearchFilter("一段");

  const rows = ctx.el("transcriptList").children[0].children;
  const pieces = rows[0].children[1].children;
  assert.deepEqual(
    pieces.map((piece) => [piece.tagName, piece.textContent]),
    [
      ["span", "第"],
      ["mark", "一段"],
      ["span", "原文"],
    ],
    "一屏语气相近的字幕，光过滤还是要一行行找，标出来眼睛才有落点",
  );
});

test("搜索会把第一条命中滚进视野", async () => {
  const ctx = createContext({ transcript: transcriptResult() });
  ctx.state.bvid = "BV1xx411c7mD";
  await ctx.loadTranscript();

  ctx.applySearchFilter("第二段");

  const rows = ctx.el("transcriptList").children[0].children;
  assert.equal(
    rows[1].scrolled,
    true,
    "不滚过去的话命中行可能在几屏之外，用户会以为搜索没生效",
  );
  assert.equal(rows[0].scrolled, false, "没命中的行不该被滚到");
});

test("搜索会过滤字幕行并报命中数，清空后全部恢复", async () => {
  const ctx = createContext({ transcript: transcriptResult() });
  ctx.state.bvid = "BV1xx411c7mD";
  await ctx.loadTranscript();

  ctx.applySearchFilter("第一段");

  const rows = ctx.el("transcriptList").children[0].children;
  assert.equal(rows[0].hidden, false);
  assert.equal(rows[1].hidden, true, "没命中的行应该藏起来");
  assert.equal(ctx.el("searchCount").textContent, "1 条命中");

  ctx.applySearchFilter("");
  assert.equal(rows[1].hidden, false, "清空搜索后列表要完整回来");
  assert.equal(ctx.el("searchCount").textContent, "");
});

test("搜索能命中顺句稿和译文，不只搜原文", async () => {
  const ctx = createContext({
    transcript: transcriptResult({
      polished: { s1: "第一段，顺过了。" },
      translated: { s2: "Second line translated" },
    }),
  });
  ctx.state.bvid = "BV1xx411c7mD";
  await ctx.loadTranscript();

  // 用户眼里的文字是顺句稿/译文，搜不到等于「明明看得见却找不到」。
  ctx.applySearchFilter("顺过了");
  assert.equal(ctx.el("searchCount").textContent, "1 条命中");

  ctx.applySearchFilter("translated");
  assert.equal(ctx.el("searchCount").textContent, "1 条命中");
});

test("滚开或搜索时浮标出现，点击后回到当前句并复位", async () => {
  const ctx = createContext({ transcript: transcriptResult() });
  ctx.state.bvid = "BV1xx411c7mD";
  await ctx.loadTranscript();
  ctx.state.activeIndex = 1;

  // 用户刚滚动过 → 自动跟随暂停，浮标要给一条回来的路。
  ctx.state.lastUserScrollAt = Date.now();
  ctx.updateFollowPill();
  assert.equal(ctx.el("followPill").hidden, false);

  ctx.jumpToActive();
  assert.equal(ctx.el("followPill").hidden, true, "回来之后浮标该消失");
  assert.equal(ctx.state.lastUserScrollAt, 0, "点浮标等于明确表态要跟随");

  // 搜索期间同样给浮标：列表被过滤，回到当前句要先收搜索。
  ctx.applySearchFilter("第一段");
  ctx.updateFollowPill();
  assert.equal(ctx.el("followPill").hidden, false);
  ctx.jumpToActive();
  assert.equal(ctx.state.searchQuery, "", "从搜索跳回时应顺手收掉搜索");
});

test("换视频时上一个视频的搜索词不会带过来", async () => {
  const ctx = createContext({ transcript: transcriptResult() });
  ctx.state.bvid = "BV1xx411c7mD";
  await ctx.loadTranscript();

  ctx.applySearchFilter("第一段");
  assert.equal(ctx.state.searchQuery, "第一段");

  await ctx.loadTranscript();
  assert.equal(ctx.state.searchQuery, "", "新视频的列表不该被旧搜索词过滤");
});

// ============================================================
// 笔记回看
// ============================================================

const NOTE = {
  id: "note_1",
  bvid: "BV1yy411c7mD",
  timestamp: "1:05",
  timestampSeconds: 65,
  timestampedUrl: "https://www.bilibili.com/video/BV1yy411c7mD?t=65",
  text: "一条笔记",
  videoTitle: "另一个视频",
  ownerName: "别的 UP",
};

/** 卡片底部那行提示，renderNoteCard 把它放在最后。 */
const noticeOf = (card) => card.children[card.children.length - 1];

test("点当前视频的笔记就地跳转，不开新标签页", async () => {
  const ctx = createContext({ transcript: transcriptResult() });
  ctx.state.bvid = "BV1xx411c7mD";
  ctx.state.tabId = 1;
  await ctx.loadTranscript();

  const note = { ...NOTE, bvid: "BV1xx411c7mD" };
  await ctx.playNote(note, noticeOf(ctx.renderNoteCard(note)));

  assert.deepEqual(ctx.seeks, [65]);
  assert.deepEqual(ctx.openedTabs, [], "同一个视频还开新标签页就是白开一个");
});

test("点别的视频的笔记，确认视频还在之后开新标签页", async () => {
  const ctx = createContext({ transcript: transcriptResult() });
  ctx.state.bvid = "BV1xx411c7mD";
  ctx.state.tabId = 1;
  await ctx.loadTranscript();

  await ctx.playNote(NOTE, noticeOf(ctx.renderNoteCard(NOTE)));

  assert.deepEqual(ctx.openedTabs, [NOTE.timestampedUrl], "链接要带上时间戳");
  assert.deepEqual(ctx.seeks, [], "别的视频没法在当前页跳转");
});

test("后台还在润色的笔记，卡片上有「润色中」提示；僵尸标记不显示", async () => {
  const ctx = createContext({ transcript: transcriptResult() });
  ctx.state.bvid = "BV1xx411c7mD";
  await ctx.loadTranscript();

  // 刚保存、润色还没回来：要说一声，不然正文过几秒突然变了会让人纳闷。
  const fresh = noticeOf(
    ctx.renderNoteCard({ ...NOTE, pending: true, createdAt: Date.now() }),
  );
  assert.equal(fresh.hidden, false);
  assert.match(fresh.textContent, /润色/);

  // pending 卡了半天多半是润色中途 service worker 被回收，别永远挂着「润色中」。
  const stale = noticeOf(
    ctx.renderNoteCard({ ...NOTE, pending: true, createdAt: Date.now() - 10 * 60 * 1000 }),
  );
  assert.equal(stale.hidden, true);
});

test("视频已下架时给出提示，不再开标签页", async () => {
  const ctx = createContext({
    transcript: transcriptResult(),
    videoAvailable: { available: false, message: "视频已下架，无法查看原视频。" },
  });
  ctx.state.bvid = "BV1xx411c7mD";
  ctx.state.tabId = 1;
  await ctx.loadTranscript();

  const notice = noticeOf(ctx.renderNoteCard(NOTE));
  await ctx.playNote(NOTE, notice);

  assert.deepEqual(
    ctx.openedTabs,
    [],
    "笔记能留三十天，视频早没了还开标签页，用户要等整页加载完才知道",
  );
  assert.equal(notice.hidden, false);
  assert.match(notice.textContent, /已下架/);
});

test("生成失败只影响概览这一块，字幕仍然可读", async () => {
  const ctx = createContext({
    transcript: transcriptResult(),
    analysis: { success: false, message: "模型返回了空内容" },
  });
  ctx.state.bvid = "BV1xx411c7mD";
  await ctx.loadTranscript();

  await ctx.analyze();

  assert.equal(ctx.el("overviewLoading").hidden, true);
  assert.equal(ctx.el("overviewEmpty").hidden, false);
  assert.equal(
    ctx.state.view,
    "ready",
    "概览失败不该把整个面板打回错误态，字幕还在",
  );
});

// ============================================================
// 问 AI
// ============================================================

test("问 AI 支持连续追问并把历史发送给后台", async () => {
  const ctx = createContext({ transcript: transcriptResult() });
  ctx.state.site = "bilibili";
  ctx.state.bvid = "BV1xx411c7mD";
  ctx.state.page = 1;
  await ctx.loadTranscript();

  await ctx.submitChatQuestion("第一问是什么？");
  await ctx.submitChatQuestion("请继续解释");

  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        ctx.state.chatMessages.map(({ role, content }) => [role, content]),
      ),
    ),
    [
      ["user", "第一问是什么？"],
      ["assistant", "回答：第一问是什么？"],
      ["user", "请继续解释"],
      ["assistant", "回答：请继续解释"],
    ],
  );
  const asks = ctx.sent.filter((message) => message.action === "askVideo");
  assert.equal(asks.length, 2);
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(asks[1].history.map(({ role, content }) => [role, content])),
    ),
    [
      ["user", "第一问是什么？"],
      ["assistant", "回答：第一问是什么？"],
    ],
  );
});

test("问 AI 默认关联三类上下文，全部关闭时明确发送纯问答选择", async () => {
  const ctx = createContext({ transcript: transcriptResult() });
  await ctx.submitChatQuestion("默认上下文");
  const [defaultAsk] = ctx.sent.filter((message) => message.action === "askVideo");
  assert.deepEqual(JSON.parse(JSON.stringify(defaultAsk.contextSelection)), {
    transcript: true,
    overview: true,
    notes: true,
  });

  ctx.el("chatContextTranscript").checked = false;
  ctx.el("chatContextOverview").checked = false;
  ctx.el("chatContextNotes").checked = false;
  await ctx.submitChatQuestion("纯问答");
  const asks = ctx.sent.filter((message) => message.action === "askVideo");
  assert.deepEqual(JSON.parse(JSON.stringify(asks.at(-1).contextSelection)), {
    transcript: false,
    overview: false,
    notes: false,
  });
});

test("没有字幕或视频上下文时问 AI 仍可自由对话", async () => {
  const ctx = createContext({
    transcript: { success: false, error: "NO_SUBTITLE", message: "没有字幕" },
    tabsQuery: async () => [{ id: 2, windowId: 1, url: "https://example.com/" }],
  });
  await ctx.syncWithActiveTab();
  assert.equal(ctx.state.view, "idle");

  ctx.switchTab("chat");
  assert.equal(ctx.el("chatPanel").hidden, false);
  assert.equal(ctx.el("idleState").hidden, true);

  await ctx.submitChatQuestion("请介绍一下你自己");
  const ask = ctx.sent.find((message) => message.action === "askVideo");
  assert.ok(ask);
  assert.equal(ask.bvid, null);
  assert.equal(ctx.state.chatMessages.at(-1).content, "回答：请介绍一下你自己");
});

test("AI 回答可一键保存到独立 AI 记并附带视频锚点", async () => {
  const ctx = createContext({ transcript: transcriptResult() });
  ctx.state.site = "bilibili";
  ctx.state.bvid = "BV1xx411c7mD";
  ctx.state.page = 1;
  ctx.state.data = transcriptResult();
  const button = createElement("button");
  button.textContent = "转为笔记";

  await ctx.saveChatAsNote(
    {
      role: "assistant",
      question: "核心观点是什么？",
      content: "核心观点是持续练习。",
      timestampSeconds: 65,
    },
    button,
  );

  const save = ctx.sent.find((message) => message.action === "saveMemo");
  assert.equal(save.kind, "ai_note");
  assert.equal(save.timestamp, 65);
  assert.equal(save.videoTitle, "标题");
  assert.match(save.text, /问：核心观点是什么？/);
  assert.match(save.text, /答：核心观点是持续练习。/);
});

test("没有视频时 AI 回答仍可保存，且不写入视频字段", async () => {
  const ctx = createContext({ transcript: transcriptResult() });
  const button = createElement("button");
  button.textContent = "存入 AI 记";

  await ctx.saveChatAsNote(
    { question: "你好？", content: "你好！", timestampSeconds: 0 },
    button,
  );

  const save = ctx.sent.find((message) => message.action === "saveMemo");
  assert.equal(save.kind, "ai_note");
  assert.equal("bvid" in save, false);
  assert.equal("videoTitle" in save, false);
});

test("手记在视频页保存标题和当前播放锚点", async () => {
  const ctx = createContext({ transcript: transcriptResult() });
  ctx.state.site = "bilibili";
  ctx.state.bvid = "BV1xx411c7mD";
  ctx.state.page = 1;
  ctx.state.tabId = 1;
  ctx.state.currentTime = 88;
  ctx.state.data = transcriptResult();
  ctx.state.notesScope = "memo";
  ctx.el("memoInput").value = "这是视频手记";

  await ctx.saveMemo();

  const save = ctx.sent.find((message) => message.action === "saveMemo");
  assert.equal(save.kind, "memo");
  assert.equal(save.bvid, "BV1xx411c7mD");
  assert.equal(save.videoTitle, "标题");
  assert.equal(save.timestamp, 88);
});

test("普通页面保存手记时不携带任何视频信息", async () => {
  const ctx = createContext({ transcript: transcriptResult() });
  ctx.state.notesScope = "memo";
  ctx.el("memoInput").value = "一条普通手记";

  await ctx.saveMemo();

  const save = ctx.sent.find((message) => message.action === "saveMemo");
  assert.equal(save.kind, "memo");
  assert.equal("bvid" in save, false);
  assert.equal("videoTitle" in save, false);
  assert.equal("timestamp" in save, false);
});

test("问 AI 预设问题默认渲染在空状态与快速提问栏，点击直接发起提问", async () => {
  const ctx = createContext({ transcript: transcriptResult() });
  ctx.renderChatPresetQuestions();

  const emptyChips = ctx.el("chatChipsEmpty");
  const quickChips = ctx.el("chatQuickChips");
  const quickBar = ctx.el("chatQuickBar");

  assert.equal(emptyChips.children.length, 3);
  assert.equal(quickChips.children.length, 3);
  assert.equal(emptyChips.children[0].textContent, "200字以内总结视频内容");
  assert.equal(quickBar.hidden, true);

  // 点击预设问题直接调用提问
  const firstChip = emptyChips.children[0];
  const clickHandler = firstChip.listeners.get("click");
  assert.ok(typeof clickHandler === "function");
  await clickHandler();

  const asks = ctx.sent.filter((message) => message.action === "askVideo");
  assert.equal(asks.length, 1);
  assert.equal(asks[0].question, "200字以内总结视频内容");
});

test("问 AI 存在消息时，快速提问栏展示且点击可追问", async () => {
  const ctx = createContext({ transcript: transcriptResult() });
  ctx.renderChatPresetQuestions();
  ctx.state.chatMessages = [
    { role: "user", content: "前置问题" },
    { role: "assistant", content: "前置回答" },
  ];

  ctx.renderChat();
  assert.equal(ctx.el("chatEmpty").hidden, true);
  assert.equal(ctx.el("chatQuickBar").hidden, false);

  const quickChip = ctx.el("chatQuickChips").children[1];
  await quickChip.listeners.get("click")();

  const asks = ctx.sent.filter((message) => message.action === "askVideo");
  assert.equal(asks.length, 1);
  assert.equal(asks[0].question, "提取视频核心要点与关键结论");
});

test("问答默认问题管理弹窗：增删、重置、持久化保存与关闭", async () => {
  const ctx = createContext({ transcript: transcriptResult() });
  ctx.openChatQuestionsModal();

  const modal = ctx.el("chatQuestionsModal");
  assert.equal(modal.hidden, false);
  const list = ctx.el("chatQuestionsManageList");
  assert.equal(list.children.length, 3);

  // 添加新问题
  ctx.el("newChatQuestionInput").value = "新加的提问";
  ctx.addChatQuestion();
  assert.equal(list.children.length, 4);
  assert.equal(ctx.el("newChatQuestionInput").value, "");

  // 删除第一项
  const firstDeleteBtn = list.children[0].children[1];
  firstDeleteBtn.listeners.get("click")();
  assert.equal(list.children.length, 3);

  // 恢复默认
  ctx.resetChatQuestions();
  assert.equal(list.children.length, 3);

  // 保存并持久化
  let savedStorage = null;
  ctx.chrome.storage.local.set = async (val) => {
    savedStorage = val;
  };
  await ctx.saveChatQuestions();

  assert.equal(modal.hidden, true);
  assert.ok(savedStorage && savedStorage["video_digest_settings"]);
  assert.deepEqual(
    [...savedStorage["video_digest_settings"].chatDefaultQuestions],
    [...ctx.BILI_SETTINGS.DEFAULT_CHAT_QUESTIONS],
  );

  // 再次打开并关闭
  ctx.openChatQuestionsModal();
  assert.equal(modal.hidden, false);
  ctx.closeChatQuestionsModal();
  assert.equal(modal.hidden, true);
  assert.equal(ctx.state.chatQuestionsEditing, null);
});

test("用户在弹窗中新增自定义问题 -> 点击保存 -> 验证使用 BILI_SETTINGS.STORAGE_KEY 写入 chrome.storage.local", async () => {
  const ctx = createContext({ transcript: transcriptResult() });
  ctx.openChatQuestionsModal();

  const modal = ctx.el("chatQuestionsModal");
  assert.equal(modal.hidden, false);

  // 输入新问题并点击添加
  ctx.el("newChatQuestionInput").value = "我的自定义预设提问";
  ctx.addChatQuestion();

  // 验证输入框已被清空且列表中增加了新问题
  assert.equal(ctx.el("newChatQuestionInput").value, "");
  const list = ctx.el("chatQuestionsManageList");
  assert.equal(list.children.length, 4);

  // 点击保存
  let savedStorage = null;
  ctx.chrome.storage.local.set = async (data) => {
    savedStorage = data;
  };
  await ctx.saveChatQuestions();

  // 弹窗关闭，且写入 storage 的数据包含新增问题，且使用 BILI_SETTINGS.STORAGE_KEY
  assert.equal(modal.hidden, true);
  assert.ok(savedStorage);
  assert.ok(savedStorage[ctx.BILI_SETTINGS.STORAGE_KEY]);
  const savedQuestions = savedStorage[ctx.BILI_SETTINGS.STORAGE_KEY].chatDefaultQuestions;
  assert.ok(Array.isArray(savedQuestions));
  assert.equal(savedQuestions.length, 4);
  assert.equal(savedQuestions[savedQuestions.length - 1], "我的自定义预设提问");
});

test("问答预设问题弹窗支持按 Escape 键关闭", async () => {
  const ctx = createContext({ transcript: transcriptResult() });
  ctx.setupEventListeners();
  ctx.openChatQuestionsModal();

  const modal = ctx.el("chatQuestionsModal");
  assert.equal(modal.hidden, false);

  // 触发全局 Escape 按键
  ctx.triggerDocumentKeydown({ key: "Escape" });
  assert.equal(modal.hidden, true);
  assert.equal(ctx.state.chatQuestionsEditing, null);
});

test("saveChatQuestions 发生存储异常时捕获错误并不关闭弹窗", async () => {
  const ctx = createContext({ transcript: transcriptResult() });
  ctx.openChatQuestionsModal();
  const modal = ctx.el("chatQuestionsModal");

  ctx.chrome.storage.local.set = async () => {
    throw new Error("QuotaExceededError");
  };

  await ctx.saveChatQuestions();
  assert.equal(modal.hidden, false);
});
