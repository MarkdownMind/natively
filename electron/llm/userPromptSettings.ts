import { SettingsManager } from '../services/SettingsManager';
import {
  DEFAULT_PROMPT_SETTINGS,
  SHORTCUT_PROMPT_KEYS,
  type PromptSettings,
  type ShortcutPromptKey,
} from '../../src/types/promptSettings';

// Built-in prompts are intentionally long. The editor must be able to show
// and save the complete prompt instead of silently truncating it into a
// partial replacement.
const MAX_PROMPT_CHARS = 100_000;

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

/**
 * Resolve the complete prompt for one action. A configured action prompt is
 * authoritative: it replaces the compiled-in action prompt byte-for-byte.
 */
export function resolveShortcutPrompt(basePrompt: string, key: ShortcutPromptKey): string {
  return getUserPromptSettings().shortcutPrompts[key] || basePrompt;
}

/**
 * Resolve the complete global system prompt. A configured system prompt is
 * authoritative: it replaces the compiled-in system prompt instead of being
 * appended to it.
 *
 * A shortcut prompt is more specific than the global prompt. Preserve it when
 * both settings are present so editing one shortcut does not silently replace
 * it with the global setting.
 */
export function resolveSystemPrompt(basePrompt: string): string {
  const settings = getUserPromptSettings();
  const configuredShortcutPrompts = Object.values(settings.shortcutPrompts);
  if (configuredShortcutPrompts.includes(basePrompt)) return basePrompt;
  return settings.systemPrompt || basePrompt;
}
