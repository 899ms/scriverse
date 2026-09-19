export const CHAPTER_ANNOTATION_NOTE_MAX_LENGTH_ENV = "SCRIVERSE_CHAPTER_ANNOTATION_NOTE_MAX_LENGTH";
export const DEFAULT_CHAPTER_ANNOTATION_NOTE_MAX_LENGTH = 6000;
export const MIN_CHAPTER_ANNOTATION_NOTE_MAX_LENGTH = 2000;
export const MAX_CHAPTER_ANNOTATION_NOTE_MAX_LENGTH = 20_000;

export function resolveChapterAnnotationNoteMaxLength(environment: NodeJS.ProcessEnv = process.env): number {
  const raw = environment[CHAPTER_ANNOTATION_NOTE_MAX_LENGTH_ENV]?.trim() ?? "";
  if (!/^\d+$/u.test(raw)) return DEFAULT_CHAPTER_ANNOTATION_NOTE_MAX_LENGTH;
  const configured = Number(raw);
  if (!Number.isSafeInteger(configured)) return DEFAULT_CHAPTER_ANNOTATION_NOTE_MAX_LENGTH;
  return Math.min(
    MAX_CHAPTER_ANNOTATION_NOTE_MAX_LENGTH,
    Math.max(MIN_CHAPTER_ANNOTATION_NOTE_MAX_LENGTH, configured)
  );
}
