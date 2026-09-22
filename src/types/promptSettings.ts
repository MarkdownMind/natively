export const SHORTCUT_PROMPT_KEYS = [
  'whatToAnswer',
  'processScreenshots',
  'captureAndProcess',
  'clarify',
  'followUp',
  'followUpQuestions',
  'recap',
  'answer',
  'codeHint',
  'brainstorm',
] as const;

export type ShortcutPromptKey = (typeof SHORTCUT_PROMPT_KEYS)[number];

export interface PromptSettings {
  /** Complete system prompt override. When set, it replaces the built-in system prompt. */
  systemPrompt: string;
  /** Complete prompt override for the selected shortcut. When set, it replaces that action's built-in prompt. */
  shortcutPrompts: Partial<Record<ShortcutPromptKey, string>>;
}

export const DEFAULT_PROMPT_SETTINGS: PromptSettings = {
  systemPrompt: '',
  shortcutPrompts: {},
};
