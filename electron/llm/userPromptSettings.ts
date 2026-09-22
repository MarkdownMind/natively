import { SettingsManager } from '../services/SettingsManager';
import {
  DEFAULT_PROMPT_SETTINGS,
  SHORTCUT_PROMPT_KEYS,
  type PromptSettings,
  type ShortcutPromptKey,
} from '../../src/types/promptSettings';

const MAX_PROMPT_CHARS = 8_000;
const SYSTEM_PROMPT_MARKER = '<user_system_instructions>';

function clampPrompt(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_PROMPT_CHARS) : '';
}

export function normalizePromptSettings(value: unknown): PromptSettings {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const rawShortcuts = input.shortcutPrompts && typeof input.shortcutPrompts === 'object'
    ? input.shortcutPrompts as Record<string, unknown>
    : {};
  const shortcutPrompts: PromptSettings['shortcutPrompts'] = {};

  for (const key of SHORTCUT_PROMPT_KEYS) {
    const prompt = clampPrompt(rawShortcuts[key]);
    if (prompt) shortcutPrompts[key] = prompt;
  }

  return {
    systemPrompt: clampPrompt(input.systemPrompt),
    shortcutPrompts,
  };
}

export function getUserPromptSettings(): PromptSettings {
  try {
    return normalizePromptSettings(SettingsManager.getInstance().get('promptSettings'));
  } catch {
    return DEFAULT_PROMPT_SETTINGS;
  }
}

export function appendShortcutPrompt(basePrompt: string, key: ShortcutPromptKey): string {
  const custom = getUserPromptSettings().shortcutPrompts[key];
  if (!custom) return basePrompt;
  return `${basePrompt}\n\n<shortcut_instruction name="${key}">\n${custom}\n</shortcut_instruction>`;
}

/**
 * Keep Natively's built-in safety/context contract intact and append the user's
 * instructions as a clearly delimited layer. This makes the setting useful
 * without allowing an accidental blank/partial edit to delete core behavior.
 */
export function appendSystemPromptOverride(basePrompt: string): string {
  const custom = getUserPromptSettings().systemPrompt;
  if (!custom || basePrompt.includes(SYSTEM_PROMPT_MARKER)) return basePrompt;
  return `${basePrompt}\n\n${SYSTEM_PROMPT_MARKER}\n${custom}\n</user_system_instructions>`;
}
