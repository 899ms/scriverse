import { describe, expect, it } from "vitest";
import {
  CHAPTER_ANNOTATION_NOTE_MAX_LENGTH_ENV,
  DEFAULT_CHAPTER_ANNOTATION_NOTE_MAX_LENGTH,
  MAX_CHAPTER_ANNOTATION_NOTE_MAX_LENGTH,
  MIN_CHAPTER_ANNOTATION_NOTE_MAX_LENGTH,
  resolveChapterAnnotationNoteMaxLength
} from "../../src/chapter-annotation-note.js";

describe("正文评论内容长度上限", () => {
  it("未配置时使用 6000", () => {
    expect(resolveChapterAnnotationNoteMaxLength({})).toBe(DEFAULT_CHAPTER_ANNOTATION_NOTE_MAX_LENGTH);
    expect(DEFAULT_CHAPTER_ANNOTATION_NOTE_MAX_LENGTH).toBe(6000);
  });

  it("有效整数按 2000 到 20000 钳制，低于 2000 按 2000 处理", () => {
    expect(resolveChapterAnnotationNoteMaxLength({ [CHAPTER_ANNOTATION_NOTE_MAX_LENGTH_ENV]: "0" })).toBe(MIN_CHAPTER_ANNOTATION_NOTE_MAX_LENGTH);
    expect(resolveChapterAnnotationNoteMaxLength({ [CHAPTER_ANNOTATION_NOTE_MAX_LENGTH_ENV]: "1999" })).toBe(MIN_CHAPTER_ANNOTATION_NOTE_MAX_LENGTH);
    expect(resolveChapterAnnotationNoteMaxLength({ [CHAPTER_ANNOTATION_NOTE_MAX_LENGTH_ENV]: "2000" })).toBe(MIN_CHAPTER_ANNOTATION_NOTE_MAX_LENGTH);
    expect(resolveChapterAnnotationNoteMaxLength({ [CHAPTER_ANNOTATION_NOTE_MAX_LENGTH_ENV]: " 8000 " })).toBe(8000);
    expect(resolveChapterAnnotationNoteMaxLength({ [CHAPTER_ANNOTATION_NOTE_MAX_LENGTH_ENV]: "20000" })).toBe(MAX_CHAPTER_ANNOTATION_NOTE_MAX_LENGTH);
    expect(resolveChapterAnnotationNoteMaxLength({ [CHAPTER_ANNOTATION_NOTE_MAX_LENGTH_ENV]: "99999" })).toBe(MAX_CHAPTER_ANNOTATION_NOTE_MAX_LENGTH);
  });

  it("非法配置回退默认值", () => {
    for (const value of ["", "0.5", "false", "NaN", "-1", "6k"]) {
      expect(resolveChapterAnnotationNoteMaxLength({ [CHAPTER_ANNOTATION_NOTE_MAX_LENGTH_ENV]: value })).toBe(DEFAULT_CHAPTER_ANNOTATION_NOTE_MAX_LENGTH);
    }
  });
});
