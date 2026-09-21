import { describe, expect, it } from "vitest";
import { applyChapterDirectoryMove, chapterDirectoryEntry } from "../../src/public/chapter-directory.js";

const chapter = (id: string, volumeId: string, sortOrder: number) => ({ id, workId: "work", volumeId, sortOrder, title: id, chapterType: "正文", wordCount: 12, versionNo: 1, analysisStatus: "pending", excludedFromAnalysis: false, createdAt: "old", updatedAt: "old" });
const fixture = () => ({ id: "work", updatedAt: "old", volumes: [
  { id: "a", chapterCount: 3, chapters: [chapter("a1", "a", 0), chapter("a2", "a", 1), chapter("a3", "a", 2)] },
  { id: "b", chapterCount: 1, chapters: [chapter("b1", "b", 0)] },
  { id: "c", chapterCount: 0, chapters: [] }
] });

describe("章节目录局部排序", () => {
  it("在原卷应用服务端顺序和版本并保留无关分卷", () => {
    const work = fixture();
    const other = work.volumes[1]!.chapters;
    const unchanged = work.volumes[0]!.chapters[2];
    expect(applyChapterDirectoryMove(work, { ...chapter("a2", "a", 0), versionNo: 2, updatedAt: "new", content: "正文不进入目录", lineIds: ["line"] })).toEqual(["a"]);
    expect(work.volumes[0]!.chapters.map(item => [item.id, item.sortOrder])).toEqual([["a2", 0], ["a1", 1], ["a3", 2]]);
    expect(work.volumes[0]!.chapters[0]).toMatchObject({ versionNo: 2, updatedAt: "new" });
    expect(work.volumes[0]!.chapters[0]).not.toHaveProperty("content");
    expect(work.volumes[0]!.chapters[0]).not.toHaveProperty("lineIds");
    expect(work.volumes[0]!.chapters[2]).toBe(unchanged);
    expect(work.volumes[1]!.chapters).toBe(other);
    expect(work.updatedAt).toBe("new");
  });

  it("跨卷更新两侧计数并支持空卷和追加", () => {
    const work = fixture();
    expect(applyChapterDirectoryMove(work, chapter("a1", "b", 1))).toEqual(["a", "b"]);
    expect(work.volumes.slice(0, 2).map(v => v.chapterCount)).toEqual([2, 2]);
    expect(work.volumes[0]!.chapters.map(c => c.sortOrder)).toEqual([0, 1]);
    expect(work.volumes[1]!.chapters.map(c => c.id)).toEqual(["b1", "a1"]);
    applyChapterDirectoryMove(work, chapter("a1", "c", 0));
    expect(work.volumes[2]!.chapters.map(c => c.id)).toEqual(["a1"]);
    expect(work.volumes[2]!.chapterCount).toBe(1);
  });

  it("丢弃其他作品或已不存在目录的响应", () => {
    const work = fixture();
    const before = structuredClone(work);
    expect(applyChapterDirectoryMove(work, { ...chapter("a1", "a", 1), workId: "other" })).toEqual([]);
    expect(applyChapterDirectoryMove(work, chapter("a1", "missing", 0))).toEqual([]);
    expect(applyChapterDirectoryMove(work, chapter("missing", "a", 0))).toEqual([]);
    expect(work).toEqual(before);
    expect(chapterDirectoryEntry({ ...chapter("a1", "a", 0), content: "private" })).not.toHaveProperty("content");
  });
});
