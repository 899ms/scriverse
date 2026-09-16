import { describe, expect, it } from "vitest";
import {
  calculateChapterEditorContentHeight,
  chapterLineNumberLayerTransform,
  needsChapterLineVirtualWindowRefresh,
  readChapterEditorScrollMetrics,
  transferNestedEditorScroll
} from "../../src/public/chapter-editor-scroll.js";

describe("正文行号绑定滚动", () => {
  it("读取共用滚动容器的视口度量", () => {
    expect(readChapterEditorScrollMetrics({
      scrollTop: 480,
      scrollLeft: 12,
      clientHeight: 720,
      clientWidth: 640,
      scrollHeight: 3600
    })).toEqual({
      scrollTop: 480,
      scrollLeft: 12,
      clientHeight: 720,
      clientWidth: 640,
      scrollHeight: 3600
    });
  });

  it("按测量高度和视口高度决定正文盒高度", () => {
    expect(calculateChapterEditorContentHeight({
      measureHeight: 2400,
      paddingTop: 32,
      paddingBottom: 72,
      viewportHeight: 800
    })).toBe(2504);
    expect(calculateChapterEditorContentHeight({
      measureHeight: 120,
      paddingTop: 32,
      paddingBottom: 72,
      viewportHeight: 800
    })).toBe(800);
  });

  it("行号层不再使用独立 transform 滚动", () => {
    expect(chapterLineNumberLayerTransform()).toBe("none");
  });

  it("滚动接近虚拟窗口边缘时才需要补渲染行号", () => {
    const virtualWindow = {
      start: 20,
      end: 180,
      lineCount: 200,
      top: 400,
      bottom: 5000
    };
    expect(needsChapterLineVirtualWindowRefresh(virtualWindow, {
      scrollTop: 2000,
      clientHeight: 800
    })).toBe(false);
    expect(needsChapterLineVirtualWindowRefresh(virtualWindow, {
      scrollTop: 500,
      clientHeight: 800
    })).toBe(true);
    expect(needsChapterLineVirtualWindowRefresh(virtualWindow, {
      scrollTop: 4000,
      clientHeight: 800
    })).toBe(true);
  });

  it("把嵌套编辑区残留滚动转移到共用容器", () => {
    const source = { scrollTop: 40, scrollLeft: 8 };
    const destination = { scrollTop: 200, scrollLeft: 0 };
    expect(transferNestedEditorScroll(source, destination)).toEqual({
      transferredTop: 40,
      transferredLeft: 8
    });
    expect(source).toEqual({ scrollTop: 0, scrollLeft: 0 });
    expect(destination).toEqual({ scrollTop: 240, scrollLeft: 8 });
  });
});
