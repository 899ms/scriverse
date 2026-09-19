import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("角色属性剪枝界面", () => {
  it("编辑器按剪枝后的 identity 和 details 展示并提交，不再回写额外键", async () => {
    const publicPath = join(process.cwd(), "src/public");
    const [application, page] = await Promise.all([
      readFile(join(publicPath, "app.js"), "utf8"),
      readFile(join(publicPath, "index.html"), "utf8")
    ]);

    expect(application).toContain('from "/character-profile.js?v=20260919-character-attributes-prune-v1"');
    expect(application).toContain("normalizeCharacterAttributes(item?.attributes)");
    expect(application).toContain('field("identity", "身份与定位", "text", attributes.identity)');
    expect(application).toContain('field("details", "扩展属性", "key-value-list", attributes.details, { multilineValue: true })');
    expect(application).toContain("attributes: normalizeCharacterAttributes({");
    expect(application).toContain("species: typeof item?.attributes?.species === \"string\" ? item.attributes.species : \"\"");
    expect(application).not.toContain("...(item?.attributes ?? {}),");
    expect(page).toContain("feature=character-attributes-prune-v1");
  });
});
