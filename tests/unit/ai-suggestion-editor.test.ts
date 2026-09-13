import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("创作助手正文写入边界", () => {
  it("不提供采纳按钮、采纳接口或正文写入实现", () => {
    const page = readFileSync("src/public/index.html", "utf8");
    const application = readFileSync("src/public/app.js", "utf8");
    const server = readFileSync("src/app.ts", "utf8");
    const ai = readFileSync("src/ai.ts", "utf8");

    expect(page).toContain("feature=ai-prose-acceptance-removed-v1");
    expect(application).not.toContain("采纳到正文");
    expect(application).not.toContain("attachWritingSuggestion");
    expect(application).not.toContain("writingSuggestionId");
    expect(server).not.toContain('app.post("/api/suggestions/:suggestionId/accept"');
    expect(ai).not.toContain("acceptSuggestion(");
    expect(ai).not.toContain('saveChapter(String(chapter.id), { content: nextContent }, "ai-suggestion"');
  });

  it("要求续写和润色 Skill 只返回对话文本", () => {
    const continuation = readFileSync("src/skills/continue-writing/SKILL.md", "utf8");
    const polish = readFileSync("src/skills/polish-writing/SKILL.md", "utf8");

    expect(continuation).toContain("输出只显示在创作助手对话中");
    expect(continuation).toContain("系统不会提供直接写入正文的操作");
    expect(polish).toContain("输出只显示在创作助手对话中");
    expect(polish).toContain("系统不会提供直接替换正文的操作");
  });
});
