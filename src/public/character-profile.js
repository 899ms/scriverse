function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const IDENTITY_ALIAS_KEYS = new Set(["identity", "身份", "身份定位", "定位", "身份与定位", "身份简介"]);
const MAX_ATTRIBUTE_DETAILS = 200;
const MAX_ATTRIBUTE_LABEL = 200;
const MAX_ATTRIBUTE_VALUE = 20_000;
const MAX_ATTRIBUTE_IDENTITY = 20_000;
const MAX_ATTRIBUTE_SPECIES = 200;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clipText(value, maximum) {
  return value.length <= maximum ? value : value.slice(0, maximum);
}

function scalarText(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return "";
}

function normalizeDetailLabel(value) {
  return clipText(text(value).replace(/[\s·.•。:：、,，;；]+$/u, ""), MAX_ATTRIBUTE_LABEL);
}

function addCharacterDetail(details, seen, label, rawValue) {
  const previewKey = normalizeDetailLabel(label).toLocaleLowerCase("zh-CN");
  if (details.length >= MAX_ATTRIBUTE_DETAILS && !seen.has(previewKey)) return;
  const normalizedLabel = normalizeDetailLabel(label);
  const normalizedValue = clipText(scalarText(rawValue), MAX_ATTRIBUTE_VALUE);
  if (!normalizedLabel || !normalizedValue || FORBIDDEN_OBJECT_KEYS.has(normalizedLabel)) return;
  const key = normalizedLabel.toLocaleLowerCase("zh-CN");
  if (seen.has(key)) {
    const index = details.findIndex((item) => item.label.toLocaleLowerCase("zh-CN") === key);
    if (index >= 0) details[index] = { label: normalizedLabel, value: normalizedValue };
    return;
  }
  seen.add(key);
  details.push({ label: normalizedLabel, value: normalizedValue });
}

function addCharacterDetailsFromUnknown(details, seen, value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (isPlainObject(item)) addCharacterDetail(details, seen, item.label, item.value);
    }
    return;
  }
  if (!isPlainObject(value)) return;
  if ("label" in value || "value" in value) {
    addCharacterDetail(details, seen, value.label, value.value);
    return;
  }
  for (const [label, item] of Object.entries(value)) addCharacterDetail(details, seen, label, item);
}

export function normalizeCharacterDetails(value) {
  if (Array.isArray(value)) {
    return value.map((item) => ({
      label: text(item?.label),
      value: text(item?.value)
    })).filter((item) => item.label && item.value);
  }
  if (!isPlainObject(value)) return [];
  const details = [];
  const seen = new Set();
  addCharacterDetailsFromUnknown(details, seen, value);
  return details;
}

/** 把模型混写的自由对象剪枝为编辑器可维护的 identity / details。 */
export function normalizeCharacterAttributes(value) {
  if (!isPlainObject(value)) return {};
  const details = [];
  const seen = new Set();
  let identity = clipText(scalarText(value.identity), MAX_ATTRIBUTE_IDENTITY);
  const species = clipText(scalarText(value.species), MAX_ATTRIBUTE_SPECIES);

  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_OBJECT_KEYS.has(key) || key === "details" || key === "species" || key === "identity") continue;
    if (IDENTITY_ALIAS_KEYS.has(key)) {
      const aliasValue = clipText(scalarText(item), MAX_ATTRIBUTE_IDENTITY);
      if (!identity && aliasValue) identity = aliasValue;
      else if (aliasValue && aliasValue !== identity) addCharacterDetail(details, seen, key, aliasValue);
      continue;
    }
    if (Array.isArray(item)) {
      if (item.every((entry) => isPlainObject(entry))) addCharacterDetailsFromUnknown(details, seen, item);
      else if (item.every((entry) => scalarText(entry))) addCharacterDetail(details, seen, key, item.map((entry) => scalarText(entry)).filter(Boolean).join("、"));
      continue;
    }
    if (isPlainObject(item)) {
      addCharacterDetailsFromUnknown(details, seen, item);
      continue;
    }
    addCharacterDetail(details, seen, key, item);
  }
  addCharacterDetailsFromUnknown(details, seen, value.details);

  const result = {};
  if (identity) result.identity = identity;
  if (species) result.species = species;
  if (details.length) result.details = details;
  return result;
}

export function normalizeCharacterState(value) {
  if (!isPlainObject(value)) return {};
  const state = {};
  for (const [key, item] of Object.entries(value)) {
    const label = text(key);
    if (!label || FORBIDDEN_OBJECT_KEYS.has(label)) continue;
    if (item === undefined || item === null) continue;
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (!trimmed) continue;
      state[label] = trimmed;
      continue;
    }
    state[label] = item;
  }
  return state;
}

export function normalizeCharacterSections(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    title: text(item?.title),
    content: text(item?.content)
  })).filter((item) => item.title && item.content);
}

export function buildCharacterDetails(labels, values) {
  const size = Math.max(labels.length, values.length);
  return normalizeCharacterDetails(Array.from({ length: size }, (_, index) => ({
    label: labels[index],
    value: values[index]
  })));
}

export function buildCharacterSections(titles, contents) {
  const size = Math.max(titles.length, contents.length);
  return normalizeCharacterSections(Array.from({ length: size }, (_, index) => ({
    title: titles[index],
    content: contents[index]
  })));
}

function stateDisplayValue(value) {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function characterStateEntries(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).map(([label, item]) => ({ label, value: stateDisplayValue(item) }));
}

export function buildCharacterState(labels, values, previous = {}) {
  const forbidden = new Set(["__proto__", "constructor", "prototype"]);
  const state = Object.create(null);
  const size = Math.max(labels.length, values.length);
  for (let index = 0; index < size; index += 1) {
    const label = text(labels[index]);
    const value = text(values[index]);
    if (!label || !value || forbidden.has(label)) continue;
    state[label] = Object.prototype.hasOwnProperty.call(previous, label) && stateDisplayValue(previous[label]) === value
      ? previous[label]
      : value;
  }
  return state;
}
