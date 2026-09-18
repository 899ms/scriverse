export type ChapterEditorScrollMetrics = {
  scrollTop: number;
  scrollLeft: number;
  clientHeight: number;
  clientWidth: number;
  scrollHeight: number;
};

export type ChapterLineVirtualWindow = {
  start: number;
  end: number;
  lineCount: number;
  top: number;
  bottom: number;
};

export function readChapterEditorScrollMetrics(scroller?: { scrollTop?: number; scrollLeft?: number; clientHeight?: number; clientWidth?: number; scrollHeight?: number } | null): ChapterEditorScrollMetrics;

export function calculateChapterEditorContentHeight(input?: {
  measureHeight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  viewportHeight?: number;
}): number;

export function needsChapterLineVirtualWindowRefresh(
  virtualWindow?: ChapterLineVirtualWindow | null,
  metrics?: Pick<ChapterEditorScrollMetrics, "scrollTop" | "clientHeight"> | null,
  bufferRatio?: number
): boolean;

export function chapterLineNumberLayerTransform(): "none";

export function transferNestedEditorScroll(
  source?: { scrollTop?: number; scrollLeft?: number } | null,
  destination?: { scrollTop?: number; scrollLeft?: number } | null
): { transferredTop: number; transferredLeft: number };
