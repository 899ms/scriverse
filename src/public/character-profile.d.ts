export type CharacterDetail = { label: string; value: string };
export type CharacterSection = { title: string; content: string };
export type CharacterAttributes = {
  identity?: string;
  species?: string;
  details?: CharacterDetail[];
};

export function normalizeCharacterDetails(value: unknown): CharacterDetail[];
export function normalizeCharacterAttributes(value: unknown): CharacterAttributes;
export function normalizeCharacterState(value: unknown): Record<string, unknown>;
export function normalizeCharacterSections(value: unknown): CharacterSection[];
export function buildCharacterDetails(labels: unknown[], values: unknown[]): CharacterDetail[];
export function buildCharacterSections(titles: unknown[], contents: unknown[]): CharacterSection[];
export function characterStateEntries(value: unknown): CharacterDetail[];
export function buildCharacterState(labels: unknown[], values: unknown[], previous?: Record<string, unknown>): Record<string, unknown>;
