import { z } from "zod";
import { normalizeCharacterAttributes, normalizeCharacterState } from "./public/character-profile.js";

/** 角色扩展属性：把模型混写的自由对象剪枝为 identity / details。省略该字段时保持不变。 */
export const characterAttributesInputSchema = z.record(z.string(), z.unknown()).transform(
  (value) => normalizeCharacterAttributes(value)
);

/** 当前状态：去掉空字符串和非法键名。省略该字段时保持不变。 */
export const characterStateInputSchema = z.record(z.string(), z.unknown()).transform(
  (value) => normalizeCharacterState(value)
);
