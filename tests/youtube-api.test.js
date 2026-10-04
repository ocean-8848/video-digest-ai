const test = require("node:test");
const assert = require("node:assert/strict");

const youtube = require("../lib/youtube-api.js");

test("解析标准 YouTube 播放页并拒绝 Shorts", () => {
  assert.equal(
    youtube.parseVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30"),
    "dQw4w9WgXcQ",
  );
  assert.equal(youtube.parseVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), null);
});

test("规范链接会移除播放列表和来源参数", () => {
  assert.equal(
    youtube.canonicalVideoUrl("dQw4w9WgXcQ"),
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  );
  assert.equal(
    youtube.canonicalVideoUrl("dQw4w9WgXcQ", 65),
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=65s",
  );
});

test("Supadata 内容归一化为通用秒级字幕并清理说话人标记", () => {
  const result = youtube.normalizeTranscript({
    lang: "en",
    availableLangs: ["en", "zh"],
    content: [
      { text: ">> Hello world", offset: 1500, duration: 2200, lang: "en" },
      { text: "  ", offset: 4000, duration: 1000 },
    ],
  });
  assert.deepEqual(result.transcript, [
    { text: "Hello world", start: 1.5, duration: 2.2, language: "en" },
  ]);
  assert.deepEqual(result.availableLanguages, ["en", "zh"]);
});

test("字幕请求强制 native 模式并只发送规范 URL", async () => {
  let requested;
  const fetchImpl = async (url, options) => {
    requested = { url: new URL(url), options };
    return {
      status: 200,
      ok: true,
      async json() {
        return {
          lang: "en",
          content: [{ text: "Hello", offset: 0, duration: 1000 }],
        };
      },
    };
  };
  const result = await youtube.fetchTranscript("dQw4w9WgXcQ", "secret", {
    fetchImpl,
  });
  assert.equal(requested.url.searchParams.get("mode"), "native");
  assert.equal(
    requested.url.searchParams.get("url"),
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  );
  assert.equal(requested.options.headers["x-api-key"], "secret");
  assert.equal(result.transcript.length, 1);
});

test("Captapi 使用 Bearer 鉴权并归一化时间戳分段", async () => {
  let requested;
  const result = await youtube.fetchCaptapiTranscript("dQw4w9WgXcQ", "capt-key", {
    fetchImpl: async (url, options) => {
      requested = { url: new URL(url), options };
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            success: true,
            data: {
              returnedLanguage: "en",
              segments: [{ text: "Hello", startMs: 1500, endMs: 3500 }],
            },
          };
        },
      };
    },
  });
  assert.equal(requested.url.origin, "https://api.captapi.com");
  assert.equal(requested.options.headers.Authorization, "Bearer capt-key");
  assert.deepEqual(result.transcript, [
    { text: "Hello", start: 1.5, duration: 2, language: "en" },
  ]);
});

test("TranscriptFetch 固定 captions 模式，避免触发音频转写", async () => {
  let requested;
  await youtube.fetchTranscriptFetchTranscript("dQw4w9WgXcQ", "tf-key", {
    fetchImpl: async (url, options) => {
      requested = { url, options };
      return {
        ok: true,
        status: 200,
        async json() {
          return { ok: true, data: { language: "en", segments: [{ text: "Hello", start: 0, duration: 1 }] } };
        },
      };
    },
  });
  assert.equal(requested.url, youtube.TRANSCRIPTFETCH_TRANSCRIPT_URL);
  assert.equal(requested.options.headers.Authorization, "Bearer tf-key");
  assert.deepEqual(JSON.parse(requested.options.body), {
    video: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    mode: "captions",
    timestamps: true,
  });
});

test("TranscriptAPI 使用文档规定的 GET 端点与 Bearer 鉴权", async () => {
  let requested;
  const result = await youtube.fetchTranscriptApiTranscript("dQw4w9WgXcQ", "ta-key", {
    fetchImpl: async (url, options) => {
      requested = { url: new URL(url), options };
      return {
        ok: true,
        status: 200,
        async json() {
          return { language: "en", transcript: [{ text: "Hello", start: 3, duration: 4 }] };
        },
      };
    },
  });
  assert.equal(requested.url.origin, "https://transcriptapi.com");
  assert.equal(requested.url.searchParams.get("include_timestamp"), "true");
  assert.equal(requested.options.headers.Authorization, "Bearer ta-key");
  assert.equal(result.transcript[0].start, 3);
});

test("GetYouTubeTranscript 使用 GET 端点、Bearer 鉴权并返回秒级时间戳", async () => {
  let requested;
  const result = await youtube.fetchGetYouTubeTranscriptTranscript("dQw4w9WgXcQ", "gyt-key", {
    fetchImpl: async (url, options) => {
      requested = { url: new URL(url), options };
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            success: true,
            data: {
              video_id: "dQw4w9WgXcQ",
              language_code: "en",
              transcript: "Hello world",
              segments: [{ start: 1.2, duration: 2.16, text: "Hello world" }],
            },
          };
        },
      };
    },
  });
  assert.equal(requested.url.origin + requested.url.pathname, youtube.GETYOUTUBETRANSCRIPT_TRANSCRIPT_URL);
  assert.equal(requested.url.searchParams.get("v"), "dQw4w9WgXcQ");
  assert.equal(requested.url.searchParams.get("timestamps"), "true");
  assert.equal(requested.options.headers.Authorization, "Bearer gyt-key");
  assert.deepEqual(result.transcript, [
    { text: "Hello world", start: 1.2, duration: 2.16, language: "en" },
  ]);
  assert.equal(result.language, "en");
});

test("GetYouTubeTranscript 无字幕时返回 NO_SUBTITLE，以便回退到下一项", async () => {
  await assert.rejects(
    youtube.fetchGetYouTubeTranscriptTranscript("dQw4w9WgXcQ", "gyt-key", {
      fetchImpl: async () => ({
        ok: false,
        status: 404,
        async json() {
          return { success: false, code: "TRANSCRIPT_NOT_FOUND", message: "No transcript" };
        },
      }),
    }),
    (error) => error.code === "NO_SUBTITLE",
  );
});

test("字幕服务商按保存顺序回退，成功后不会继续请求后续项", async () => {
  const calls = [];
  const result = await youtube.fetchTranscriptWithFallback(
    "dQw4w9WgXcQ",
    [
      { providerId: "supadata", apiKey: "first" },
      { providerId: "captapi", apiKey: "second" },
      { providerId: "transcriptapi", apiKey: "third" },
    ],
    {
      fetchImpl: async (url) => {
        calls.push(url);
        if (url.startsWith(youtube.TRANSCRIPT_URL)) {
          return { ok: false, status: 429, async json() { return {}; } };
        }
        if (url.startsWith(youtube.CAPTAPI_TRANSCRIPT_URL)) {
          return {
            ok: true,
            status: 200,
            async json() {
              return {
                success: true,
                data: { language: "en", transcriptSegments: [{ text: "Fallback", start: 0, duration: 1 }] },
              };
            },
          };
        }
        throw new Error("后续服务商不应被请求");
      },
    },
  );
  assert.equal(result.providerId, "captapi");
  assert.equal(calls.length, 2);
  assert.ok(calls[0].startsWith(youtube.TRANSCRIPT_URL));
  assert.ok(calls[1].startsWith(youtube.CAPTAPI_TRANSCRIPT_URL));
});
