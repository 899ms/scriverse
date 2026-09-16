/** 正文行号与文字共用同一滚动容器，行号层不再独立滚动。 */

export function readChapterEditorScrollMetrics(scroller) {
  return {
    scrollTop: Math.max(0, Number(scroller?.scrollTop) || 0),
    scrollLeft: Number(scroller?.scrollLeft) || 0,
    clientHeight: Math.max(0, Number(scroller?.clientHeight) || 0),
    clientWidth: Math.max(0, Number(scroller?.clientWidth) || 0),
    scrollHeight: Math.max(0, Number(scroller?.scrollHeight) || 0)
  };
}

export function calculateChapterEditorContentHeight({
  measureHeight,
  paddingTop,
  paddingBottom,
  viewportHeight
} = {}) {
  const contentHeight = Math.max(0, Number(measureHeight) || 0)
    + Math.max(0, Number(paddingTop) || 0)
    + Math.max(0, Number(paddingBottom) || 0);
  return Math.max(contentHeight, Math.max(0, Number(viewportHeight) || 0));
}

export function needsChapterLineVirtualWindowRefresh(virtualWindow, metrics, bufferRatio = 0.35) {
  if (!virtualWindow) return false;
  const scrollTop = Math.max(0, Number(metrics?.scrollTop) || 0);
  const clientHeight = Math.max(0, Number(metrics?.clientHeight) || 0);
  const buffer = clientHeight * (Number.isFinite(Number(bufferRatio)) ? Number(bufferRatio) : 0.35);
  const viewportBottom = scrollTop + clientHeight;
  const needsPreviousLines = virtualWindow.start > 0 && scrollTop < virtualWindow.top + buffer;
  const needsNextLines = virtualWindow.end < virtualWindow.lineCount
    && viewportBottom > virtualWindow.bottom - buffer;
  return needsPreviousLines || needsNextLines;
}

export function chapterLineNumberLayerTransform() {
  return "none";
}

export function transferNestedEditorScroll(source, destination) {
  const transferredTop = Number(source?.scrollTop) || 0;
  const transferredLeft = Number(source?.scrollLeft) || 0;
  if (!source || !destination || (transferredTop === 0 && transferredLeft === 0)) {
    return { transferredTop: 0, transferredLeft: 0 };
  }
  destination.scrollTop += transferredTop;
  destination.scrollLeft += transferredLeft;
  source.scrollTop = 0;
  source.scrollLeft = 0;
  return { transferredTop, transferredLeft };
}
