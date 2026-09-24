import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../src/errors.js";
import { readResponseTextLimited } from "../../src/ai.js";
import {
  AI_RESPONSE_MAX_BYTES_ENV,
  isAiResponseByteLimitExceeded,
  resolveAiResponseMaxBytes
} from "../../src/ai-response-limit.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("AI 响应字节上限配置", () => {
  it("默认关闭字节上限", () => {
    expect(resolveAiResponseMaxBytes({})).toBeNull();
    expect(isAiResponseByteLimitExceeded(20 * 1024 * 1024 + 1, null)).toBe(false);
  });

  it("正整数环境变量启用字节上限", () => {
    expect(resolveAiResponseMaxBytes({ [AI_RESPONSE_MAX_BYTES_ENV]: " 1048576 " })).toBe(1_048_576);
    expect(isAiResponseByteLimitExceeded(65, 64)).toBe(true);
    expect(isAiResponseByteLimitExceeded(64, 64)).toBe(false);
  });

  it.each(["", "0", "-1", "1.5", "invalid", "9007199254740992"])(
    "环境变量 %s 表示不启用字节上限",
    (value) => {
      expect(resolveAiResponseMaxBytes({ [AI_RESPONSE_MAX_BYTES_ENV]: value })).toBeNull();
    }
  );
});

describe("readResponseTextLimited", () => {
  it("默认不因原 20 MiB 上限拒绝响应", async () => {
    vi.stubEnv(AI_RESPONSE_MAX_BYTES_ENV, "");
    const response = new Response("hello-ai", {
      status: 200,
      headers: { "content-type": "text/plain", "content-length": String(20 * 1024 * 1024 + 1) }
    });
    await expect(readResponseTextLimited(response)).resolves.toBe("hello-ai");
  });

  it("在 Content-Length 声明超过配置上限时直接拒绝", async () => {
    const response = new Response("ignored", {
      status: 200,
      headers: { "content-length": "65" }
    });
    await expect(readResponseTextLimited(response, 64)).rejects.toMatchObject({
      code: "AI_RESPONSE_TOO_LARGE"
    } satisfies Partial<AppError>);
  });

  it("在读取响应正文时超过配置字节上限会中止", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("abcdefghij"));
        controller.enqueue(encoder.encode("klmnopqrst"));
        controller.close();
      }
    });
    const response = new Response(stream, { status: 200 });
    await expect(readResponseTextLimited(response, 12)).rejects.toMatchObject({
      code: "AI_RESPONSE_TOO_LARGE"
    } satisfies Partial<AppError>);
  });
});
