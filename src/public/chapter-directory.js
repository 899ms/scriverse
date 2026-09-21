export function chapterDirectoryEntry(chapter) {
  const { id, workId, volumeId, title, chapterType, sortOrder, wordCount, versionNo, analysisStatus, excludedFromAnalysis, createdAt, updatedAt } = chapter;
  return { id, workId, volumeId, title, chapterType, sortOrder, wordCount, versionNo, analysisStatus, excludedFromAnalysis, createdAt, updatedAt };
}

export function applyChapterDirectoryMove(work, moved) {
  if (work.id !== moved.workId) return [];
  const source = work.volumes.find((volume) => volume.chapters.some((chapter) => chapter.id === moved.id));
  const target = work.volumes.find((volume) => volume.id === moved.volumeId);
  if (!source || !target) return [];
  const affected = source === target ? [source] : [source, target];
  source.chapters = source.chapters.filter((chapter) => chapter.id !== moved.id);
  target.chapters.splice(Math.min(moved.sortOrder, target.chapters.length), 0, chapterDirectoryEntry(moved));
  for (const volume of affected) {
    volume.chapters = volume.chapters.map((chapter, sortOrder) => chapter.sortOrder === sortOrder
      ? chapter
      : { ...chapter, sortOrder, updatedAt: moved.updatedAt });
    volume.chapterCount = volume.chapters.length;
  }
  work.updatedAt = moved.updatedAt;
  return affected.map((volume) => volume.id);
}
