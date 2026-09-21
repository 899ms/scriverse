import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const application = readFileSync("src/public/app.js", "utf8");
const bindingStart = application.indexOf('  renderedNodes("[data-chapter-id]").forEach');
const bindingEnd = application.indexOf("\nfunction renderChapterBatchDialog", bindingStart);
const bindings = application.slice(bindingStart, bindingEnd).replace(/\n\}\s*$/u, "");
type TestEvent = ReturnType<typeof event>;
function event(onHandle = false) {
  return {
    target: { closest: vi.fn(() => onHandle ? {} : null) },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: { setData: vi.fn(), effectAllowed: "none" },
    altKey: false, shiftKey: false, key: ""
  };
}
function fixture(editable = true, mobile = false) {
  const listeners = new Map<string, ((event: TestEvent) => void | Promise<void>)[]>();
  const button = {
    dataset: { chapterId: "chapter" },
    classList: { add: vi.fn(), remove: vi.fn() },
    focus: vi.fn(),
    addEventListener(type: string, handler: (event: TestEvent) => void | Promise<void>) {
      listeners.set(type, [...(listeners.get(type) ?? []), handler]);
    }
  };
  const context = {
    renderedNodes: () => [button], proseEditable: editable,
    canEditProse: () => editable,
    canWritePermissionModule: () => false,
    state: { work: {} },
    selectChapter: vi.fn(async () => true),
    moveChapterByKeyboard: vi.fn(async () => undefined),
    isMobileViewport: () => mobile,
    panelLayout: { leftCollapsed: false },
    applyPanelLayout: vi.fn(),
    CSS: { escape: (value: string) => value },
    $: () => ({ querySelector: () => button })
  };
  runInNewContext(bindings, context);
  return { context, button, listeners };
}

describe("目录点击与拖动优先级", () => {
  it("标题和字数点击打开章节，点击拖动柄不触发导航", async () => {
    const { context, listeners } = fixture();
    const click = listeners.get("click")![0]!;
    await click(event());
    expect(context.selectChapter).toHaveBeenCalledExactlyOnceWith("chapter");
    await click(event(true));
    expect(context.selectChapter).toHaveBeenCalledOnce();
  });

  it("标题或字数区域拒绝拖动开始，仅手柄允许拖动", () => {
    const { button, listeners } = fixture();
    const dragStart = listeners.get("dragstart")![0]!;
    const titleDrag = event();
    dragStart(titleDrag);
    expect(titleDrag.preventDefault).toHaveBeenCalledOnce();
    expect(titleDrag.dataTransfer.setData).not.toHaveBeenCalled();
    expect(button.classList.add).not.toHaveBeenCalled();
    const handleDrag = event(true);
    dragStart(handleDrag);
    expect(handleDrag.preventDefault).not.toHaveBeenCalled();
    expect(handleDrag.dataTransfer.setData).toHaveBeenCalledWith("text/plain", "chapter");
    expect(handleDrag.dataTransfer.effectAllowed).toBe("move");
    expect(button.classList.add).toHaveBeenCalledWith("is-dragging");
  });

  it("保留键盘跨卷排序，取消切换时不收起手机目录", async () => {
    const { context, button, listeners } = fixture(true, true);
    const key = { ...event(), altKey: true, shiftKey: true, key: "ArrowDown" };
    for (const handler of listeners.get("keydown") ?? []) await handler(key);
    expect(context.moveChapterByKeyboard).toHaveBeenCalledWith("chapter", 1, true);
    context.selectChapter.mockResolvedValueOnce(false);
    await listeners.get("click")![0]!(event());
    expect(button.focus).not.toHaveBeenCalled();
    expect(context.panelLayout.leftCollapsed).toBe(false);
    expect(context.applyPanelLayout).not.toHaveBeenCalled();
  });

  it("只读目录保持点击能力且不绑定拖动开始事件", async () => {
    const { context, listeners } = fixture(false);
    expect(listeners.has("dragstart")).toBe(false);
    await listeners.get("click")![0]!(event());
    expect(context.selectChapter).toHaveBeenCalledWith("chapter");
  });

  it("整行关闭原生拖动，手柄占用原有左缩进且同步资源版本", () => {
    const styles = readFileSync("src/public/styles.css", "utf8");
    const page = readFileSync("src/public/index.html", "utf8");
    expect(application).toContain('draggable="false" title="点击打开章节');
    expect(application).toContain('proseEditable ? \'<span class="chapter-drag-handle" draggable="true" aria-hidden="true"');
    expect(styles).not.toContain('.chapter-node[draggable="true"] { cursor: grab; }');
    expect(styles).toContain("cursor: pointer; user-select: none;");
    expect(styles).toContain(".chapter-drag-handle { position: absolute;");
    expect(page.match(/feature=chapter-directory-click-priority-v1/gu)).toHaveLength(2);
  });
});
