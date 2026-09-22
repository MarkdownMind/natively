export const SHORTCUT_PROMPT_KEYS = [
  'whatToAnswer',
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
  /** Additional system instructions appended to Natively's built-in rules. */
  systemPrompt: string;
  /** Additional instructions appended to the selected shortcut's built-in prompt. */
  shortcutPrompts: Partial<Record<ShortcutPromptKey, string>>;
}

export const DEFAULT_PROMPT_SETTINGS: PromptSettings = {
  systemPrompt: '',
  shortcutPrompts: {},
};
