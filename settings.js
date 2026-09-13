/** 共享的非机密配置：默认值、厂商预设与校验逻辑。密钥由 options.js 写入存储。 */
var BILI_SETTINGS = (() => {
  const STORAGE_KEY = "video_digest_settings";
  const LEGACY_STORAGE_KEY = "bili_digest_settings";

  // 只做两种协议：「OpenAI 兼容」是事实标准，Anthropic 是唯一值得单独适配的例外。
  const PROTOCOLS = Object.freeze({
    OPENAI: "openai",
    ANTHROPIC: "anthropic",
  });

  // 只预置 protocol 和 baseUrl；model 故意留空——模型名换代很快，
  // 写死等于埋一个过期默认值，设置页有「拉取模型列表」兜底。
  const PRESETS = Object.freeze([
    {
      id: "deepseek",
      label: "DeepSeek",
      protocol: PROTOCOLS.OPENAI,
      baseUrl: "https://api.deepseek.com",
      // 唯一预置模型：本项目已实测验证过。
      model: "deepseek-v4-flash",
      docsUrl: "https://platform.deepseek.com/api_keys",
    },
    {
      id: "openai",
      label: "OpenAI",
      protocol: PROTOCOLS.OPENAI,
      baseUrl: "https://api.openai.com/v1",
      model: "",
      docsUrl: "https://platform.openai.com/api-keys",
    },
    {
      id: "anthropic",
      label: "Anthropic Claude",
      protocol: PROTOCOLS.ANTHROPIC,
      baseUrl: "https://api.anthropic.com",
      model: "",
      docsUrl: "https://console.anthropic.com/settings/keys",
    },
    {
      id: "gemini",
      label: "Google Gemini（OpenAI 兼容端点）",
      protocol: PROTOCOLS.OPENAI,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      model: "",
      docsUrl: "https://aistudio.google.com/apikey",
    },
    {
      id: "moonshot",
      label: "月之暗面 Kimi",
      protocol: PROTOCOLS.OPENAI,
      baseUrl: "https://api.moonshot.cn/v1",
      model: "",
      docsUrl: "https://platform.moonshot.cn/console/api-keys",
    },
    {
      id: "zhipu",
      label: "智谱 GLM",
      protocol: PROTOCOLS.OPENAI,
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      model: "",
      docsUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    },
    {
      id: "dashscope",
      label: "阿里云百炼（通义千问）",
      protocol: PROTOCOLS.OPENAI,
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      model: "",
      docsUrl: "https://bailian.console.aliyun.com/",
    },
    {
      id: "volcengine_ark",
      label: "火山方舟（Agent Plan）",
      protocol: PROTOCOLS.OPENAI,
      baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3",
      model: "",
      docsUrl: "https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement?advancedActiveKey=agentPlan",
    },
    {
      id: "siliconflow",
      label: "硅基流动 SiliconFlow",
      protocol: PROTOCOLS.OPENAI,
      baseUrl: "https://api.siliconflow.cn/v1",
      model: "",
      docsUrl: "https://cloud.siliconflow.cn/account/ak",
    },
    {
      id: "openrouter",
      label: "OpenRouter",
      protocol: PROTOCOLS.OPENAI,
      baseUrl: "https://openrouter.ai/api/v1",
      model: "",
      docsUrl: "https://openrouter.ai/keys",
    },
    {
      id: "ollama",
      label: "本地 Ollama",
      protocol: PROTOCOLS.OPENAI,
      baseUrl: "http://localhost:11434/v1",
      model: "",
      docsUrl: "https://ollama.com/",
    },
    {
      id: "custom",
      label: "自定义",
      protocol: PROTOCOLS.OPENAI,
      baseUrl: "",
      model: "",
      docsUrl: "",
    },
  ]);

  const DEFAULT_PRESET = PRESETS[0];
  const CUSTOM_PRESET_ID = "custom";
  const MAX_AI_PROVIDERS = 8;

  // YouTube 字幕服务商是独立于 AI Provider 的有序回退链。每项只保存服务商和密钥，
  // 请求地址与鉴权方式由 lib/youtube-api.js 固定，避免用户误把密钥发到错误域名。
  const YOUTUBE_CAPTION_PROVIDERS = Object.freeze([
    {
      id: "supadata",
      label: "Supadata",
      origin: "https://api.supadata.ai/",
      docsUrl: "https://docs.supadata.ai/get-transcript",
      dashboardUrl: "https://dash.supadata.ai",
      detail:
        "只获取 YouTube 现有字幕；没有字幕时会自动尝试列表中的下一项。",
      detailEn:
        "Fetches existing YouTube captions only; if unavailable, the next provider is tried.",
    },
    {
      id: "captapi",
      label: "Captapi",
      origin: "https://api.captapi.com/",
      docsUrl: "https://captapi.com/how-to/youtube-transcript",
      dashboardUrl: "https://captapi.com/dashboard",
      detail:
        "返回 YouTube 已发布的带时间戳字幕；没有字幕时会自动尝试列表中的下一项。",
      detailEn:
        "Returns published YouTube captions with timestamps; if unavailable, the next provider is tried.",
    },
    {
      id: "transcriptfetch",
      label: "TranscriptFetch",
      origin: "https://transcriptfetch.com/",
      docsUrl: "https://transcriptfetch.com/docs/endpoints",
      dashboardUrl: "https://transcriptfetch.com/dashboard",
      detail:
        "以 captions 模式只读取现有字幕；没有字幕时会自动尝试列表中的下一项。",
      detailEn:
        "Uses captions mode to read existing captions only; if unavailable, the next provider is tried.",
    },
    {
      id: "transcriptapi",
      label: "TranscriptAPI",
      origin: "https://transcriptapi.com/",
      docsUrl: "https://transcriptapi.com/docs/api/",
      dashboardUrl: "https://transcriptapi.com/dashboard/api-keys",
      detail:
        "返回 YouTube 字幕及时间戳；服务端支持按语言优先级选择字幕。",
      detailEn:
        "Returns YouTube captions with timestamps and supports language-priority selection.",
    },
  ]);
  const MAX_YOUTUBE_CAPTION_PROVIDERS = 8;

  // 并发上限压在 8：再高容易撞限流；超时上限 10 分钟是为了照顾本地推理。
  const LIMITS = Object.freeze({
    concurrency: Object.freeze({ min: 1, max: 8, default: 3 }),
    timeoutSeconds: Object.freeze({ min: 30, max: 600, default: 120 }),
    // 笔记正文长度差异很大，条目数只是保留策略；实际写入还会由 background
    // 的 7 MB 安全线兜底，避免挤满 chrome.storage.local。
    noteLimit: Object.freeze({ min: 1, max: 400, default: 100 }),
  });

  const DEFAULTS = Object.freeze({
    presetId: DEFAULT_PRESET.id,
    protocol: DEFAULT_PRESET.protocol,
    aiApiKey: "",
    aiBaseUrl: DEFAULT_PRESET.baseUrl,
    aiModel: DEFAULT_PRESET.model,
    aiConcurrency: LIMITS.concurrency.default,
    aiTimeoutSeconds: LIMITS.timeoutSeconds.default,
    // 字幕轨优先级：UP 主中文 > AI 中文 > 英文（见 lib/bili-api.js）。
    subtitleLangPreference: Object.freeze([
      "zh-CN",
      "zh-Hans",
      "zh-Hant",
      "zh",
      "ai-zh",
      "en-US",
      "en",
      "ai-en",
    ]),
  });

  const DEFAULT_CHAT_QUESTIONS = Object.freeze([
    "200字以内总结视频内容",
    "提取视频核心要点与关键结论",
    "梳理视频时间线与主要脉络",
  ]);

  const APP_DEFAULTS = Object.freeze({
    aiProviders: Object.freeze([
      Object.freeze({ id: "ai-1", ...DEFAULTS }),
    ]),
    aiConcurrency: LIMITS.concurrency.default,
    aiTimeoutSeconds: LIMITS.timeoutSeconds.default,
    youtubeCaptionProviders: Object.freeze([
      Object.freeze({ providerId: "supadata", apiKey: "" }),
    ]),
    youtubeEnabled: true,
    bilibiliEnabled: true,
    noteLimit: LIMITS.noteLimit.default,
    uiLanguage: "zh-CN",
    chatDefaultQuestions: DEFAULT_CHAT_QUESTIONS,
  });

  const DEFAULT_OVERVIEW_PROMPTS = Object.freeze({
    "zh-CN":
      "请基于完整视频字幕生成结构化概览：按话题转折划分覆盖全片的章节，每章包含准确时间戳、简洁标题和摘要；另外提取 3–5 条有信息量、可独立阅读的金句并保留准确时间戳。不要编造字幕中不存在的信息。用中文输出章节标题、摘要和金句。",
    en:
      "Create a structured overview from the complete video transcript. Divide it into chapters at genuine topic shifts, covering the full timeline; each chapter needs an accurate timestamp, concise title, and summary. Also extract 3–5 informative, standalone key quotes with accurate timestamps. Do not invent information absent from the transcript. Output in English: chapter titles, summaries, and key quotes must all be in English.",
  });

  function normalizeOverviewPrompts(input) {
    const source = input && typeof input === "object" ? input : {};
    return Object.fromEntries(
      Object.entries(DEFAULT_OVERVIEW_PROMPTS).map(([language, fallback]) => {
        const value = typeof source[language] === "string" ? source[language].trim() : "";
        return [language, (value || fallback).slice(0, 5000)];
      }),
    );
  }

  function normalizeChatDefaultQuestions(input) {
    if (!Array.isArray(input)) return [...DEFAULT_CHAT_QUESTIONS];
    const cleaned = input
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .slice(0, 20)
      .map((item) => item.slice(0, 300));
    return cleaned.length ? cleaned : [...DEFAULT_CHAT_QUESTIONS];
  }

  const captionProviderById = (id) =>
    YOUTUBE_CAPTION_PROVIDERS.find((provider) => provider.id === id) || null;

  function normalizeAiProviderId(value, index, usedIds) {
    const preferred =
      typeof value === "string" && /^ai-[A-Za-z0-9_-]{1,80}$/.test(value)
        ? value
        : `ai-${index + 1}`;
    let id = preferred;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${preferred}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    return id;
  }

  /**
   * AI 服务是有序回退链。旧版的 primary/backup 配置仍可读取：只有过去启用过
   * 备用服务时才迁入第二项，避免把未配置的备用卡片变成必填项。
   */
  function normalizeAiProviders(input, legacySource = {}) {
    const legacy = legacySource && typeof legacySource === "object" ? legacySource : {};
    const hasLegacyRoutes = Boolean(legacy.primaryProvider || legacy.backupProvider);
    const source = Array.isArray(input)
      ? input
      : [
          hasLegacyRoutes ? legacy.primaryProvider : legacy,
          hasLegacyRoutes && legacy.failoverEnabled ? legacy.backupProvider : null,
        ].filter(Boolean);
    const usedIds = new Set();
    return source
      .slice(0, MAX_AI_PROVIDERS)
      .map((item, index) => {
        const raw = item && typeof item === "object" ? item : {};
        return {
          id: normalizeAiProviderId(raw.id, index, usedIds),
          ...normalize(raw),
        };
      });
  }

  function normalizeYoutubeCaptionProviders(input, legacySupadataApiKey = "") {
    // 有数组即视为用户已明确编辑过列表；即使是空数组也要保留，让用户可以先清空再添加。
    const source = Array.isArray(input)
      ? input
      : [{ providerId: "supadata", apiKey: legacySupadataApiKey }];
    return source
      .slice(0, MAX_YOUTUBE_CAPTION_PROVIDERS)
      .map((item) => {
        const raw = item && typeof item === "object" ? item : {};
        const providerId = typeof raw.providerId === "string" ? raw.providerId : "";
        if (!captionProviderById(providerId)) return null;
        return {
          providerId,
          apiKey: typeof raw.apiKey === "string" ? raw.apiKey.trim().slice(0, 1000) : "",
        };
      })
      .filter(Boolean);
  }

  const LANG_CODE_PATTERN = /^[A-Za-z]{2,8}(-[A-Za-z0-9]{2,8})*$/;

  function clampNumber(value, { min, max, default: fallback }) {
    // 空值不能交给 Number()——它把 null 和 "" 都算作 0，「没配过」会被夹成下界。
    if (value === null || value === undefined || value === "") return fallback;

    const number = Math.floor(Number(value));
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function normalizeLangPreference(input) {
    if (!Array.isArray(input)) return [...DEFAULTS.subtitleLangPreference];
    const cleaned = input
      .map((lang) => (typeof lang === "string" ? lang.trim() : ""))
      .filter((lang) => LANG_CODE_PATTERN.test(lang))
      .slice(0, 20);
    return cleaned.length ? cleaned : [...DEFAULTS.subtitleLangPreference];
  }

  function normalizeAvailableModels(input) {
    if (!Array.isArray(input)) return [];
    return [
      ...new Set(
        input
          .map((model) => (typeof model === "string" ? model.trim() : ""))
          .filter(Boolean)
          .map((model) => model.slice(0, 200)),
      ),
    ].slice(0, 500);
  }

  const presetById = (id) => PRESETS.find((preset) => preset.id === id) || null;

  const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

  // 密钥会随请求发到这个地址，所以这里也是安全边界：明文 http 只对本机放行
  //（本地推理服务不配证书），其余一律要求 https。
  function validateBaseUrl(input, protocol = PROTOCOLS.OPENAI) {
    const text = String(input || "").trim();
    if (!text) return { ok: false, error: "请填写 API 地址。" };

    let parsed;
    try {
      parsed = new URL(text);
    } catch (error) {
      return { ok: false, error: "API 地址不是合法的 URL。" };
    }

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { ok: false, error: "API 地址必须以 http:// 或 https:// 开头。" };
    }
    if (parsed.protocol === "http:" && !LOCAL_HOSTS.has(parsed.hostname)) {
      return {
        ok: false,
        error: "只有本机地址允许用 http，其余请用 https，否则密钥会明文传输。",
      };
    }

    // 用户常常直接把文档里的完整端点粘进来。与其报错，不如把它还原成 base。
    let pathname = parsed.pathname.replace(/\/+$/, "");
    for (const suffix of ["/chat/completions", "/v1/messages", "/messages"]) {
      if (pathname.endsWith(suffix)) {
        pathname = pathname.slice(0, -suffix.length);
        break;
      }
    }
    // Anthropic 的端点自带 /v1，base 里再留一个会拼成 /v1/v1/messages。
    if (protocol === PROTOCOLS.ANTHROPIC && pathname.endsWith("/v1")) {
      pathname = pathname.slice(0, -3);
    }

    const url = `${parsed.origin}${pathname}`;
    return { ok: true, url, origin: `${parsed.origin}/` };
  }

  // 申请 host 权限时用的来源，形如 https://api.deepseek.com/。
  function originOf(baseUrl) {
    const result = validateBaseUrl(baseUrl);
    return result.ok ? result.origin : null;
  }

  function chatCompletionsUrl(settings) {
    const { aiBaseUrl, protocol } = normalize(settings);
    const base = validateBaseUrl(aiBaseUrl, protocol);
    if (!base.ok) return null;
    return protocol === PROTOCOLS.ANTHROPIC
      ? `${base.url}/v1/messages`
      : `${base.url}/chat/completions`;
  }

  function modelsUrl(settings) {
    const { aiBaseUrl, protocol } = normalize(settings);
    const base = validateBaseUrl(aiBaseUrl, protocol);
    if (!base.ok) return null;
    return protocol === PROTOCOLS.ANTHROPIC
      ? `${base.url}/v1/models`
      : `${base.url}/models`;
  }

  function normalize(input = {}) {
    const source = input && typeof input === "object" ? input : {};

    const preset = presetById(source.presetId) || DEFAULT_PRESET;
    const isCustom = preset.id === CUSTOM_PRESET_ID;

    // 选了具体厂商时，协议和地址完全由预设说了算——厂商换域名时老用户跟着
    // 升级走，而不是被存储里的旧值钉死。
    const protocol = !isCustom
      ? preset.protocol
      : Object.values(PROTOCOLS).includes(source.protocol)
        ? source.protocol
        : preset.protocol;

    const rawBaseUrl = !isCustom
      ? preset.baseUrl
      : typeof source.aiBaseUrl === "string" && source.aiBaseUrl.trim()
        ? source.aiBaseUrl.trim()
        : preset.baseUrl;
    const rawModel =
      typeof source.aiModel === "string" && source.aiModel.trim()
        ? source.aiModel.trim()
        : preset.model;
    // 整理不通过就原样保留，让设置页把错误指出来，而不是悄悄改回默认值。
    const checked = validateBaseUrl(rawBaseUrl, protocol);

    return {
      presetId: preset.id,
      protocol,
      aiApiKey: typeof source.aiApiKey === "string" ? source.aiApiKey.trim() : "",
      aiBaseUrl: checked.ok ? checked.url : rawBaseUrl,
      aiModel: rawModel.slice(0, 200),
      // 模型列表来自用户主动拉取，只保存在本机，供设置页下次打开时继续选择。
      availableModels: normalizeAvailableModels(source.availableModels),
      aiConcurrency: clampNumber(source.aiConcurrency, LIMITS.concurrency),
      aiTimeoutSeconds: clampNumber(source.aiTimeoutSeconds, LIMITS.timeoutSeconds),
      subtitleLangPreference: normalizeLangPreference(source.subtitleLangPreference),
    };
  }

  // 配置是否足以发起一次请求。设置页和 background 共用同一套判断。
  function validate(settings) {
    const normalized = normalize(settings);
    const errors = [];
    if (!normalized.aiApiKey && !isLocalBaseUrl(normalized.aiBaseUrl)) {
      errors.push("请填写 API 密钥。");
    }
    const base = validateBaseUrl(normalized.aiBaseUrl, normalized.protocol);
    if (!base.ok) errors.push(base.error);
    if (!normalized.aiModel) errors.push("请填写模型名，或点「拉取模型列表」选一个。");
    return { ok: errors.length === 0, errors, settings: normalized };
  }

  /**
   * 应用级配置把有序 provider 列表和全局执行参数分开保存。
   * 旧版只有一套扁平配置；首次读取时自动把它迁到 aiProviders 列表。
   */
  function normalizeAppSettings(input = {}) {
    const source = input && typeof input === "object" ? input : {};
    const aiProviders = normalizeAiProviders(source.aiProviders, source);
    // 保留派生字段，确保旧版调用方与已有本地配置可以平滑过渡；新代码只读取
    // aiProviders，并且写回时以它为准。
    const primaryProvider = aiProviders[0] || normalize({});
    const backupProvider = aiProviders[1] || normalize({
      presetId: "openai",
      aiApiKey: "",
      aiModel: "",
    });

    return {
      aiProviders,
      primaryProvider,
      backupProvider,
      failoverEnabled: aiProviders.length > 1,
      aiConcurrency: clampNumber(
        source.aiConcurrency ?? primaryProvider.aiConcurrency,
        LIMITS.concurrency,
      ),
      aiTimeoutSeconds: clampNumber(
        source.aiTimeoutSeconds ?? primaryProvider.aiTimeoutSeconds,
        LIMITS.timeoutSeconds,
      ),
      subtitleLangPreference: normalizeLangPreference(
        source.subtitleLangPreference ?? primaryProvider.subtitleLangPreference,
      ),
      // Supadata 单密钥是旧设置格式；首次读取时无感升级为列表的第一项。
      youtubeCaptionProviders: normalizeYoutubeCaptionProviders(
        source.youtubeCaptionProviders,
        source.supadataApiKey,
      ),
      // 老版本没有适用范围字段；只有显式保存为 false 才关闭，升级后仍默认全开。
      youtubeEnabled: source.youtubeEnabled !== false,
      bilibiliEnabled: source.bilibiliEnabled !== false,
      noteLimit: clampNumber(source.noteLimit, LIMITS.noteLimit),
      uiLanguage: source.uiLanguage === "en" ? "en" : "zh-CN",
      overviewPrompts: normalizeOverviewPrompts(source.overviewPrompts),
      chatDefaultQuestions: normalizeChatDefaultQuestions(source.chatDefaultQuestions),
    };
  }

  function providerFingerprint(provider) {
    const normalized = normalize(provider);
    return `${normalized.protocol}|${normalized.aiBaseUrl}|${normalized.aiModel}`;
  }

  function validateAppSettings(input = {}) {
    const settings = normalizeAppSettings(input);
    const providers = settings.aiProviders.map((provider, index) => ({
      index,
      provider,
      check: validate(provider),
    }));
    const errors = [];
    if (!providers.length) errors.push("请至少添加一个 AI 服务。");
    for (const { index, check } of providers) {
      errors.push(...check.errors.map((error) => `AI 服务 ${index + 1}：${error}`));
    }

    return {
      ok: errors.length === 0,
      errors,
      settings,
      providers,
      // 兼容此前读取 primary/backup 校验结果的调用方。
      primary: providers[0]?.check || validate(settings.primaryProvider),
      backup: providers[1]?.check || { ok: true, errors: [], settings: settings.backupProvider },
    };
  }

  function activeProviders(input = {}) {
    const settings = normalizeAppSettings(input);
    return settings.aiProviders.map((provider, index) => ({
      id: provider.id,
      role: index === 0 ? "primary" : "fallback",
      label: index === 0 ? "主服务" : `备用服务 ${index}`,
      settings: provider,
    }));
  }

  // 本地推理服务通常不校验密钥，不该因为密钥为空就拦下来。
  function isLocalBaseUrl(baseUrl) {
    try {
      return LOCAL_HOSTS.has(new URL(String(baseUrl)).hostname);
    } catch (error) {
      return false;
    }
  }

  return {
    STORAGE_KEY,
    LEGACY_STORAGE_KEY,
    PROTOCOLS,
    PRESETS,
    CUSTOM_PRESET_ID,
    MAX_AI_PROVIDERS,
    DEFAULTS,
    APP_DEFAULTS,
    DEFAULT_CHAT_QUESTIONS,
    YOUTUBE_CAPTION_PROVIDERS,
    MAX_YOUTUBE_CAPTION_PROVIDERS,
    DEFAULT_OVERVIEW_PROMPTS,
    LIMITS,
    normalize,
    normalizeAiProviders,
    normalizeAppSettings,
    normalizeYoutubeCaptionProviders,
    normalizeLangPreference,
    normalizeOverviewPrompts,
    normalizeChatDefaultQuestions,
    validate,
    validateAppSettings,
    providerFingerprint,
    activeProviders,
    validateBaseUrl,
    isLocalBaseUrl,
    originOf,
    presetById,
    captionProviderById,
    chatCompletionsUrl,
    modelsUrl,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = BILI_SETTINGS;
}
