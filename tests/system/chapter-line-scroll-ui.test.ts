import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("正文行号绑定滚动界面", () => {
  it("行号与正文共用同一滚动容器且不再独立滚动", async () => {
    const publicPath = join(process.cwd(), "src", "public");
    const [page, application, styles, scroll] = await Promise.all([
      readFile(join(publicPath, "index.html"), "utf8"),
      readFile(join(publicPath, "app.js"), "utf8"),
      readFile(join(publicPath, "styles.css"), "utf8"),
      readFile(join(publicPath, "chapter-editor-scroll.js"), "utf8")
    ]);
    expect(page).toContain('id="chapter-editor-scroll" class="chapter-editor-scroll"');
    expect(page).toContain("feature=chapter-line-scroll-bind-v1");
    expect(application).toContain('/chapter-editor-scroll.js?v=20260916-line-scroll-bind-v1');
    expect(application).toContain("function getChapterEditorScroller()");
    expect(application).toContain('$("#chapter-editor-scroll").addEventListener("scroll", syncChapterLineNumberScroll');
    expect(application).not.toContain("inner.style.transform = `translateY(${-input.scrollTop}px)`");
    expect(application).not.toContain("whitespace.style.transform = `translate(${-input.scrollLeft}px, ${-input.scrollTop}px)`");
    expect(application).toContain("chapterLineNumberLayerTransform()");
    expect(application).toContain("transferNestedEditorScroll(input, scroller)");
    expect(styles).toContain(".chapter-editor-scroll { position: relative; display: grid; grid-template-columns: 38px minmax(0, 1fr); flex: 1 1 auto; width: 100%; min-height: 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }");
    expect(styles).toContain(".chapter-line-numbers { position: relative; z-index: 2; grid-column: 1; grid-row: 1; min-height: 0; overflow: clip; overflow-clip-margin: 12px;");
    expect(styles).toContain(".chapter-content { position: relative; z-index: 1; grid-column: 2; grid-row: 1; resize: none; width: 100%; height: auto; min-height: 100%; margin: 0; padding: 32px 36px 72px;");
    expect(styles).toContain("overflow-wrap: break-word; overflow: hidden; }");
    expect(styles).toContain("#chapter-line-numbers-inner { position: absolute; top: 32px; left: 0; right: 0; }");
    expect(styles).not.toContain("#chapter-line-numbers-inner { position: absolute; top: 32px; left: 0; right: 0; will-change: transform; }");
    expect(scroll).toContain("export function chapterLineNumberLayerTransform()");
    expect(scroll).toContain('return "none"');
  });
});
