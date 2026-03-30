import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { OpenAIChat } from './Vendors/OpenAI';

export const MODELS: Record<string, string> = {
  's'  : 'openrouter:stepfun/step-3.5-flash:free:none',
  'n'  : 'openrouter:nvidia/nemotron-3-super-120b-a12b:free:none',
};

export type Vendor = 'openrouter';
export type ThinkingLevel = 'none' | 'low' | 'medium' | 'high' | 'max' | 'auto';

export interface ResolvedModelSpec {
  vendor: Vendor;
  model: string;
  thinking: ThinkingLevel;
  fast: boolean;
}

export type JsonSchema = Record<string, any>;

export interface ToolDef {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
}

export interface ToolCall {
  id?: string;
  name: string;
  input: Record<string, any>;
}

export interface AskResult {
  text: string;
  toolCalls: ToolCall[];
}

export interface AskOptions {
  system?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface AskToolsOptions extends AskOptions {
  tools: ToolDef[];
}

export interface ChatInstance {
  ask(userMessage: string | null, options: AskOptions): Promise<string | { messages: any[] }>;
  askTools(userMessage: string, options: AskToolsOptions): Promise<AskResult>;
}

const VALID_THINKING = new Set<string>(['none', 'low', 'medium', 'high', 'max', 'auto']);

const API_KEY_ENV_VARS: Record<string, string[]> = {
  openrouter: ['OPENROUTER_API_KEY'],
};

async function getToken(vendor: string): Promise<string> {
  const envCandidates = API_KEY_ENV_VARS[vendor] ?? [`${vendor.toUpperCase()}_API_KEY`];
  for (const envVar of envCandidates) {
    const value = process.env[envVar]?.trim();
    if (value) {
      return value;
    }
  }

  const tokenPath = path.join(os.homedir(), '.config', `${vendor}.token`);
  try {
    const token = (await fs.readFile(tokenPath, 'utf8')).trim();
    if (token) {
      return token;
    }
    throw new Error(`${tokenPath} is empty`);
  } catch (err) {
    throw new Error(
      `Missing API key for "${vendor}". Set ${envCandidates.join(' or ')} or create ${tokenPath}. ` +
      `Underlying error: ${(err as Error).message}`,
    );
  }
}

/**
 * Parse a model spec string into vendor, model, thinking, and fast.
 *
 * Supports these formats:
 *   - Alias:              "s"
 *   - Model with slash:   "stepfun/step-3.5-flash:free"
 *   - Full spec:          "openrouter:stepfun/step-3.5-flash:free:medium"
 *
 * The parser handles colons inside model names (like ":free" in OpenRouter IDs)
 * by checking whether the first part is a known vendor and the last part is a
 * valid thinking level, then joining everything in between as the model name.
 */
export function resolveModelSpec(spec: string): ResolvedModelSpec {
  let trimmed = spec.trim();
  if (!trimmed) {
    throw new Error('Model spec must be provided');
  }

  // '.' prefix enables fast mode
  let fast = false;
  if (trimmed.startsWith('.')) {
    fast = true;
    trimmed = trimmed.slice(1);
  }

  const parts = trimmed.split(':');

  // Check if last part is 'fast'
  if (parts.length > 1 && parts[parts.length - 1].trim().toLowerCase() === 'fast') {
    fast = true;
    parts.pop();
    trimmed = parts.join(':');
  }

  // Single part: alias lookup or direct model name
  if (parts.length === 1) {
    const alias = MODELS[trimmed];
    if (alias) {
      const resolved = resolveModelSpec(alias);
      resolved.fast = resolved.fast || fast;
      return resolved;
    }
    // Bare model name — must contain '/' for openrouter
    if (!trimmed.includes('/')) {
      throw new Error(`Unknown model alias "${trimmed}". Available: ${Object.keys(MODELS).join(', ')}`);
    }
    return { model: trimmed, vendor: 'openrouter', thinking: 'auto', fast };
  }

  // Multiple parts: check if first part is vendor 'openrouter'
  const firstPart = parts[0].trim().toLowerCase();
  if (firstPart === 'openrouter') {
    const lastPart = parts[parts.length - 1].trim().toLowerCase();
    const hasThinking = parts.length > 2 && VALID_THINKING.has(lastPart);

    const modelParts = hasThinking ? parts.slice(1, -1) : parts.slice(1);
    const model = modelParts.join(':').trim();
    const thinking: ThinkingLevel = hasThinking ? (lastPart as ThinkingLevel) : 'auto';

    if (!model) {
      throw new Error('Model name must be provided after vendor');
    }

    return { vendor: 'openrouter', model, thinking, fast };
  }

  // No vendor prefix — rejoin and check for slash (openrouter model with colon in name)
  const lastPart = parts[parts.length - 1].trim().toLowerCase();
  const hasThinking = parts.length > 1 && VALID_THINKING.has(lastPart);

  const modelStr = hasThinking ? parts.slice(0, -1).join(':').trim() : trimmed;
  const thinking: ThinkingLevel = hasThinking ? (lastPart as ThinkingLevel) : 'auto';

  if (!modelStr.includes('/')) {
    throw new Error(`Unknown model "${modelStr}". Use a model with vendor/name format or an alias: ${Object.keys(MODELS).join(', ')}`);
  }

  return { vendor: 'openrouter', model: modelStr, thinking, fast };
}

export async function AskAI(modelSpec: string): Promise<ChatInstance> {
  const resolved = resolveModelSpec(modelSpec);
  const apiKey = await getToken('openrouter');
  const baseURL = 'https://openrouter.ai/api/v1';
  return new OpenAIChat(apiKey, baseURL, resolved.model);
}
