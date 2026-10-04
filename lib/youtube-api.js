/**
 * YouTube 字幕数据源。
 *
 * 服务商由设置页按顺序保存。每个服务商响应失败时才继续尝试下一项，
 * 因此主服务商的额度与延迟不会被后面的服务商重复消耗。
 */
var VIDEO_YOUTUBE_API = (() => {
  const TRANSCRIPT_URL = "https://api.supadata.ai/v1/transcript";
  const CAPTAPI_TRANSCRIPT_URL = "https://api.captapi.com/v1/youtube/transcript";
  const TRANSCRIPTFETCH_TRANSCRIPT_URL =
    "https://transcriptfetch.com/api/v1/transcripts/video";
  const TRANSCRIPTAPI_TRANSCRIPT_URL =
    "https://transcriptapi.com/api/v2/youtube/transcript";
  const GETYOUTUBETRANSCRIPT_TRANSCRIPT_URL =
    "https://getyoutubetranscript.com/api/v1/transcript";

  const PROVIDER_LABELS = Object.freeze({
    supadata: "Supadata",
    captapi: "Captapi",
    transcriptfetch: "TranscriptFetch",
    transcriptapi: "TranscriptAPI",
    getyoutubetranscript: "GetYouTubeTranscript",
  });

  function parseVideoId(input) {
    const text = String(input || "").trim();
    if (/^[A-Za-z0-9_-]{6,20}$/.test(text)) return text;
    try {
      const url = new URL(text);
      if (!/(^|\.)youtube\.com$/.test(url.hostname)) return null;
      const id = url.searchParams.get("v") || "";
      return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
    } catch (error) {
      return null;
    }
  }

  function canonicalVideoUrl(videoId, seconds = 0) {
    const id = parseVideoId(videoId);
    if (!id) throw new Error("无效的 YouTube 视频 ID。");
    const url = new URL("https://www.youtube.com/watch");
    url.searchParams.set("v", id);
    const start = Math.max(0, Math.floor(Number(seconds) || 0));
    if (start) url.searchParams.set("t", `${start}s`);
    return url.toString();
  }

  function makeError(message, code = "TRANSCRIPT_FETCH_FAILED") {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function providerLabel(providerId) {
    return PROVIDER_LABELS[providerId] || "字幕服务商";
  }

  function normalizeTranscript(payload) {
    const content = Array.isArray(payload?.content) ? payload.content : [];
    const transcript = content
      .map((chunk) => {
        const text = String(chunk?.text || "").replace(/>> ?/g, "").trim();
        if (!text) return null;
        return {
          text,
          start: Math.max(0, Number(chunk?.offset) || 0) / 1000,
          duration: Math.max(0, Number(chunk?.duration) || 0) / 1000,
          language: chunk?.lang || payload?.lang || null,
        };
      })
      .filter(Boolean);
    return {
      transcript,
      language:
        typeof payload?.lang === "string"
          ? payload.lang
          : transcript.find((entry) => entry.language)?.language || "",
      availableLanguages: Array.isArray(payload?.availableLangs)
        ? payload.availableLangs
        : [],
    };
  }

  function normalizeSegments(
    chunks,
    { language = "", startField = "start", durationField = "duration", endField = "end" } = {},
  ) {
    const transcript = (Array.isArray(chunks) ? chunks : [])
      .map((chunk) => {
        const text = String(chunk?.text || "").replace(/>> ?/g, "").trim();
        if (!text) return null;
        const start = Math.max(0, Number(chunk?.[startField]) || 0);
        const rawDuration = Number(chunk?.[durationField]);
        const rawEnd = Number(chunk?.[endField]);
        const duration = Number.isFinite(rawDuration)
          ? Math.max(0, rawDuration)
          : Number.isFinite(rawEnd)
            ? Math.max(0, rawEnd - start)
            : 0;
        return {
          text,
          start,
          duration,
          language: chunk?.language || chunk?.lang || language || null,
        };
      })
      .filter(Boolean);
    return {
      transcript,
      language:
        language || transcript.find((entry) => entry.language)?.language || "",
      availableLanguages: language ? [language] : [],
    };
  }

  async function responseJson(response) {
    return response.json().catch(() => ({}));
  }

  function responseError(providerId, response, payload) {
    const label = providerLabel(providerId);
    if (response.status === 206 || response.status === 404) {
      return makeError(`${label} 没有返回可用字幕。`, "NO_SUBTITLE");
    }
    if (response.status === 401 || response.status === 403) {
      return makeError(`${label} API Key 无效，请到设置页检查。`, "INVALID_CAPTION_KEY");
    }
    if (response.status === 429) {
      return makeError(`${label} 已限流，请稍后重试。`, "TRANSCRIPT_RATE_LIMITED");
    }
    const message =
      payload?.message ||
      payload?.error?.message ||
      payload?.error ||
      `${label} 请求失败：HTTP ${response.status}`;
    return makeError(String(message), "TRANSCRIPT_FETCH_FAILED");
  }

  function ensureApiKey(apiKey, providerId) {
    const key = String(apiKey || "").trim();
    if (!key) {
      throw makeError(
        `请先在设置页填写 ${providerLabel(providerId)} API Key。`,
        "NO_CAPTION_PROVIDER_KEY",
      );
    }
    return key;
  }

  async function readSupadataResponse(response) {
    if (!response.ok && response.status !== 202) {
      throw responseError("supadata", response, await responseJson(response));
    }
    return responseJson(response);
  }

  async function pollJob(
    jobId,
    apiKey,
    { fetchImpl = fetch, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {},
  ) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await wait(1000);
      const response = await fetchImpl(
        `${TRANSCRIPT_URL}/${encodeURIComponent(jobId)}`,
        { headers: { "x-api-key": apiKey } },
      );
      const data = await readSupadataResponse(response);
      if (data?.status === "completed") return data.result || data;
      if (data?.status === "failed") {
        throw makeError("Supadata 字幕任务处理失败。", "TRANSCRIPT_JOB_FAILED");
      }
    }
    throw makeError("Supadata 字幕任务处理超时。", "TRANSCRIPT_JOB_TIMEOUT");
  }

  async function fetchSupadataTranscript(
    videoId,
    apiKey,
    { fetchImpl = fetch, wait } = {},
  ) {
    const id = parseVideoId(videoId);
    if (!id) throw makeError("没有识别到 YouTube 视频 ID。", "INVALID_VIDEO_ID");
    const key = ensureApiKey(apiKey, "supadata");

    const url = new URL(TRANSCRIPT_URL);
    url.searchParams.set("url", canonicalVideoUrl(id));
    url.searchParams.set("text", "false");
    url.searchParams.set("lang", "en");
    // Supadata 的 native 模式只读取现有字幕，不会触发音频转写。
    url.searchParams.set("mode", "native");
    const response = await fetchImpl(url.toString(), {
      headers: { "x-api-key": key },
    });
    const job = await readSupadataResponse(response);
    const data = response.status === 202
      ? await pollJob(job.jobId, key, { fetchImpl, wait })
      : job;
    const result = normalizeTranscript(data);
    if (!result.transcript.length) {
      throw makeError("Supadata 返回了空字幕。", "EMPTY_TRANSCRIPT");
    }
    return result;
  }

  async function fetchCaptapiTranscript(videoId, apiKey, { fetchImpl = fetch } = {}) {
    const id = parseVideoId(videoId);
    if (!id) throw makeError("没有识别到 YouTube 视频 ID。", "INVALID_VIDEO_ID");
    const key = ensureApiKey(apiKey, "captapi");
    const url = new URL(CAPTAPI_TRANSCRIPT_URL);
    url.searchParams.set("url", canonicalVideoUrl(id));
    // 共享缓存命中不扣 credits，且不会影响扩展自身 30 天缓存策略。
    url.searchParams.set("cache", "true");
    const response = await fetchImpl(url.toString(), {
      headers: { Authorization: `Bearer ${key}` },
    });
    const payload = await responseJson(response);
    if (!response.ok || payload?.success === false) {
      throw response.ok
        ? makeError(String(payload?.message || "Captapi 未能返回字幕。"), "NO_SUBTITLE")
        : responseError("captapi", response, payload);
    }
    const data = payload?.data || payload;
    // Captapi 的公开响应使用 startMs / endMs。先转换为秒，保持扩展内部
    // transcript 格式与 Bilibili、Supadata 等其他来源一致。
    const segments = Array.isArray(data?.segments)
      ? data.segments.map((segment) => {
          const start = Math.max(0, Number(segment?.startMs) || 0) / 1000;
          const end = Number(segment?.endMs);
          return {
            text: segment?.text,
            start,
            duration: Number.isFinite(end) ? Math.max(0, end / 1000 - start) : 0,
          };
        })
      : data?.transcriptSegments || data?.transcript;
    const result = normalizeSegments(segments, {
      language: data?.returnedLanguage || data?.language || "",
      startField: Array.isArray(data?.segments) ? "start" : "startTime",
    });
    if (!result.transcript.length) {
      throw makeError("Captapi 返回了空字幕。", "EMPTY_TRANSCRIPT");
    }
    return result;
  }

  async function fetchTranscriptFetchTranscript(videoId, apiKey, { fetchImpl = fetch } = {}) {
    const id = parseVideoId(videoId);
    if (!id) throw makeError("没有识别到 YouTube 视频 ID。", "INVALID_VIDEO_ID");
    const key = ensureApiKey(apiKey, "transcriptfetch");
    const response = await fetchImpl(TRANSCRIPTFETCH_TRANSCRIPT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      // captions 模式只读现有字幕；若无字幕由本扩展继续尝试下一项，而不触发音频转写。
      body: JSON.stringify({ video: canonicalVideoUrl(id), mode: "captions", timestamps: true }),
    });
    const payload = await responseJson(response);
    if (!response.ok || payload?.ok === false) {
      throw response.ok
        ? makeError(String(payload?.message || "TranscriptFetch 未能返回字幕。"), "NO_SUBTITLE")
        : responseError("transcriptfetch", response, payload);
    }
    const data = payload?.data || payload;
    const result = normalizeSegments(data?.segments, {
      language: data?.language || data?.language_code || "",
    });
    if (!result.transcript.length) {
      throw makeError("TranscriptFetch 返回了空字幕。", "EMPTY_TRANSCRIPT");
    }
    return result;
  }

  async function fetchTranscriptApiTranscript(videoId, apiKey, { fetchImpl = fetch } = {}) {
    const id = parseVideoId(videoId);
    if (!id) throw makeError("没有识别到 YouTube 视频 ID。", "INVALID_VIDEO_ID");
    const key = ensureApiKey(apiKey, "transcriptapi");
    const url = new URL(TRANSCRIPTAPI_TRANSCRIPT_URL);
    url.searchParams.set("video_url", canonicalVideoUrl(id));
    url.searchParams.set("format", "json");
    url.searchParams.set("include_timestamp", "true");
    const response = await fetchImpl(url.toString(), {
      headers: { Authorization: `Bearer ${key}` },
    });
    const payload = await responseJson(response);
    if (!response.ok) throw responseError("transcriptapi", response, payload);
    const result = normalizeSegments(payload?.transcript, {
      language: payload?.language || "",
    });
    if (!result.transcript.length) {
      throw makeError("TranscriptAPI 返回了空字幕。", "EMPTY_TRANSCRIPT");
    }
    return result;
  }

  async function fetchGetYouTubeTranscriptTranscript(videoId, apiKey, { fetchImpl = fetch } = {}) {
    const id = parseVideoId(videoId);
    if (!id) throw makeError("没有识别到 YouTube 视频 ID。", "INVALID_VIDEO_ID");
    const key = ensureApiKey(apiKey, "getyoutubetranscript");
    const url = new URL(GETYOUTUBETRANSCRIPT_TRANSCRIPT_URL);
    url.searchParams.set("v", id);
    // timestamps=true 才会返回 segments（start / duration 以秒为单位），不影响计费。
    url.searchParams.set("timestamps", "true");
    const response = await fetchImpl(url.toString(), {
      headers: { Authorization: `Bearer ${key}` },
    });
    const payload = await responseJson(response);
    if (!response.ok || payload?.success === false) {
      throw responseError("getyoutubetranscript", response, payload);
    }
    const data = payload?.data || {};
    const result = normalizeSegments(data.segments, { language: data.language_code || "" });
    if (!result.transcript.length) {
      throw makeError("GetYouTubeTranscript 返回了空字幕。", "EMPTY_TRANSCRIPT");
    }
    return result;
  }

  async function fetchTranscriptFromProvider(videoId, provider, options = {}) {
    const item = provider && typeof provider === "object" ? provider : {};
    switch (item.providerId) {
      case "supadata":
        return fetchSupadataTranscript(videoId, item.apiKey, options);
      case "captapi":
        return fetchCaptapiTranscript(videoId, item.apiKey, options);
      case "transcriptfetch":
        return fetchTranscriptFetchTranscript(videoId, item.apiKey, options);
      case "transcriptapi":
        return fetchTranscriptApiTranscript(videoId, item.apiKey, options);
      case "getyoutubetranscript":
        return fetchGetYouTubeTranscriptTranscript(videoId, item.apiKey, options);
      default:
        throw makeError("未知的 YouTube 字幕服务商。", "UNKNOWN_CAPTION_PROVIDER");
    }
  }

  async function fetchTranscriptWithFallback(videoId, providers, options = {}) {
    const configured = (Array.isArray(providers) ? providers : []).filter(
      (provider) =>
        PROVIDER_LABELS[provider?.providerId] && String(provider?.apiKey || "").trim(),
    );
    if (!configured.length) {
      throw makeError(
        "请先在设置页添加并填写至少一个 YouTube 字幕服务商的 API Key。",
        "NO_CAPTION_PROVIDER_KEY",
      );
    }

    const failures = [];
    for (const provider of configured) {
      try {
        const result = await fetchTranscriptFromProvider(videoId, provider, options);
        return { ...result, providerId: provider.providerId };
      } catch (error) {
        failures.push({
          providerId: provider.providerId,
          message: error?.message || "请求失败",
          code: error?.code || "TRANSCRIPT_FETCH_FAILED",
        });
      }
    }

    const summary = failures
      .map(({ providerId, message }) => `${providerLabel(providerId)}：${message}`)
      .join("；");
    const error = makeError(`所有已配置的字幕服务商均未能获取字幕。${summary}`, "TRANSCRIPT_FETCH_FAILED");
    error.failures = failures;
    throw error;
  }

  // 保留旧名称，方便已有调用和单服务商测试继续使用。
  async function fetchTranscript(videoId, apiKey, options = {}) {
    return fetchSupadataTranscript(videoId, apiKey, options);
  }

  return {
    TRANSCRIPT_URL,
    CAPTAPI_TRANSCRIPT_URL,
    TRANSCRIPTFETCH_TRANSCRIPT_URL,
    TRANSCRIPTAPI_TRANSCRIPT_URL,
    GETYOUTUBETRANSCRIPT_TRANSCRIPT_URL,
    PROVIDER_LABELS,
    parseVideoId,
    canonicalVideoUrl,
    normalizeTranscript,
    normalizeSegments,
    fetchTranscript,
    fetchSupadataTranscript,
    fetchCaptapiTranscript,
    fetchTranscriptFetchTranscript,
    fetchTranscriptApiTranscript,
    fetchGetYouTubeTranscriptTranscript,
    fetchTranscriptFromProvider,
    fetchTranscriptWithFallback,
    pollJob,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = VIDEO_YOUTUBE_API;
}
