/**
 * Persist AI API keys (provider, model, key, optional Azure endpoint).
 * Stored in localStorage for dev. In production this would be server-side.
 */

export const AI_API_KEYS_STORAGE_KEY = 'dadix-ai-api-keys';

export type AIApiProvider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'azure';

export interface AIModelOption {
  id: string;
  name: string;
}

/** Model options per provider (aligned with AI API Tester Pro). */
export const AI_MODEL_OPTIONS: Record<AIApiProvider, AIModelOption[]> = {
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o (Best quality, Fast)' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Very cheap & fast)' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo (Legacy)' },
  ],
  anthropic: [
    { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet (Best All-rounder)' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus (Very smart, slow)' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku (Lightning fast)' },
  ],
  google: [
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Fast & Cheap)' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Strong Reasoning)' },
    { id: 'gemini-1.0-pro', name: 'Gemini 1.0 Pro' },
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek V3 (Chat)' },
    { id: 'deepseek-reasoner', name: 'DeepSeek R1 (Reasoner)' },
  ],
  azure: [], // Model is determined by deployment URL
};

export const AI_PROVIDER_LABELS: Record<AIApiProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic (Claude)',
  google: 'Google (Gemini)',
  deepseek: 'DeepSeek',
  azure: 'Microsoft Azure',
};

export interface AIApiKeyEntry {
  id: string;
  /** Provider id. Legacy entries may have 'OpenAI' | 'Claude' | 'Grok' | 'Other'. */
  provider: AIApiProvider | string;
  /** Model id (e.g. gpt-4o). For Azure, model is in the endpoint URL. */
  model?: string;
  /** Only for Azure: deployment endpoint URL. */
  azureEndpoint?: string;
  name: string;
  key: string;
  createdAt: string;
}

function getStored(): AIApiKeyEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(AI_API_KEYS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setStored(entries: AIApiKeyEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AI_API_KEYS_STORAGE_KEY, JSON.stringify(entries));
  } catch {}
}

export function getAIApiKeys(): AIApiKeyEntry[] {
  return getStored();
}

export function addAIApiKey(
  entry: Omit<AIApiKeyEntry, 'id' | 'createdAt'>
): AIApiKeyEntry {
  const list = getStored();
  const id = `key-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const newEntry: AIApiKeyEntry = {
    ...entry,
    id,
    createdAt: new Date().toISOString(),
  };
  setStored([...list, newEntry]);
  return newEntry;
}

export function updateAIApiKey(
  id: string,
  data: Partial<
    Pick<AIApiKeyEntry, 'name' | 'key' | 'provider' | 'model' | 'azureEndpoint'>
  >
): void {
  const list = getStored();
  const next = list.map((e) => (e.id === id ? { ...e, ...data } : e));
  setStored(next);
}

export function removeAIApiKey(id: string): void {
  setStored(getStored().filter((e) => e.id !== id));
}

export function getAIApiKeyById(id: string): AIApiKeyEntry | undefined {
  return getStored().find((e) => e.id === id);
}
