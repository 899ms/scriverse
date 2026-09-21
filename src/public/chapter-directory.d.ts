export interface ChapterDirectoryEntry {
  id: string;
  workId: string;
  volumeId: string;
  title?: string;
  chapterType?: string;
  sortOrder: number;
  wordCount?: number;
  versionNo?: number;
  analysisStatus?: string;
  excludedFromAnalysis?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export declare function chapterDirectoryEntry<T extends ChapterDirectoryEntry>(chapter: T): ChapterDirectoryEntry;

export declare function applyChapterDirectoryMove<T extends ChapterDirectoryEntry>(work: {
  id: string;
  updatedAt?: string;
  volumes: { id: string; chapterCount?: number; chapters: ChapterDirectoryEntry[] }[];
}, moved: T): string[];
