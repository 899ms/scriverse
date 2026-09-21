import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRuntime, type Runtime } from "../../src/app.js";

describe("正文评论与待办筛选界面", () => {
  let runtime: Runtime;

  beforeAll(() => {
    runtime = createRuntime({
      databasePath: ":memory:",
      masterSecret: "chapter-comments-filter-ui-test-secret",
      disableUserAuth: true,
      serveUi: true
    });
  });

  afterAll(() => runtime.close());

  it("提供默认收起的章节与关键词筛选以及已完成待办折叠组", async () => {
    const page = await request(runtime.app).get("/").expect(200);
    const application = await request(runtime.app).get("/app.js").expect(200);
    const styles = await request(runtime.app).get("/styles.css").expect(200);

    expect(page.text).toContain("&feature=chapter-comment-filters-v1");
    expect(application.text).toContain('aria-label="筛选正文评论与待办" aria-controls="chapter-comment-filter-panel"');
    expect(application.text).toContain('id="chapter-comment-filter-panel" class="character-filter-toolbar chapter-comment-filter-toolbar${chapterCommentFiltersPanelOpen ? "" : " hidden"}"');
    expect(application.text).toContain('id="chapter-comment-chapter-filter" aria-label="按章节筛选正文评论与待办"');
    expect(application.text).toContain('id="chapter-comment-keyword-filter" type="search"');
    expect(application.text).toContain('parameters.set("chapterId", chapterCommentFilters.chapterId)');
    expect(application.text).toContain('parameters.set("q", chapterCommentFilters.keyword.trim())');
    expect(application.text).toContain('<details class="chapter-comment-completed-group"><summary><span>已完成待办</span>');
    expect(application.text).not.toContain('<details class="chapter-comment-completed-group" open>');
    expect(styles.text).toContain(".chapter-comment-filter-toolbar { grid-template-columns:");
    expect(styles.text).toContain(".chapter-comment-completed-group > summary");
    expect(styles.text).toContain(".chapter-comment-completed-list { display: grid;");
    expect(styles.text).toContain(".chapter-comment-filter-toolbar { grid-template-columns: minmax(0, 1fr); }");
  });

  it("从健康接口读取正文评论长度上限并用于输入框", async () => {
    const page = await request(runtime.app).get("/").expect(200);
    const application = await request(runtime.app).get("/app.js").expect(200);
    const health = await request(runtime.app).get("/api/health").expect(200);

    expect(page.text).toContain("&feature=annotation-note-limit-v1");
    expect(application.text).toContain("let chapterAnnotationNoteMaxLength = 6000;");
    expect(application.text).toContain("function applyChapterAnnotationNoteMaxLength(value)");
    expect(application.text).toContain("chapterAnnotationNoteMaxLength = Math.min(20000, Math.max(2000, parsed));");
    expect(application.text).toContain("applyChapterAnnotationNoteMaxLength(payload.data?.chapterAnnotationNoteMaxLength);");
    expect(application.text).toContain("maxLength: chapterAnnotationNoteMaxLength");
    expect(health.body.data.chapterAnnotationNoteMaxLength).toBe(6000);
  });

  it("把自定义评论长度上限暴露为运行时配置", async () => {
    const limited = createRuntime({
      databasePath: ":memory:",
      masterSecret: "chapter-comment-note-limit-override-test-secret",
      disableUserAuth: true,
      chapterAnnotationNoteMaxLength: 20000
    });
    try {
      const health = await request(limited.app).get("/api/health").expect(200);
      expect(health.body.data.chapterAnnotationNoteMaxLength).toBe(20000);
    } finally {
      await limited.close();
    }
  });
});
