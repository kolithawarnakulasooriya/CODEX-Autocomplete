import { CompletionContext, CursorContextInput } from './types';

export interface ContextLimits {
  beforeLines: number;
  afterLines: number;
  maxCharacters: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function buildCompletionContext(
  input: CursorContextInput,
  limits: ContextLimits,
): CompletionContext {
  const offset = clamp(input.offset, 0, input.text.length);
  const beforeCursor = input.text.slice(0, offset);
  const afterCursor = input.text.slice(offset);
  const beforeParts = beforeCursor.split(/\r?\n/);
  const afterParts = afterCursor.split(/\r?\n/);
  const linePrefix = beforeParts.at(-1) ?? '';
  const lineSuffix = afterParts[0] ?? '';
  const line = beforeParts.length - 1;
  const character = linePrefix.length;

  let prefix = beforeParts.slice(-Math.max(1, limits.beforeLines + 1)).join('\n');
  let suffix = afterParts.slice(0, Math.max(1, limits.afterLines + 1)).join('\n');
  const budget = Math.max(100, limits.maxCharacters);

  if (prefix.length + suffix.length > budget) {
    const suffixBudget = Math.min(suffix.length, Math.floor(budget * 0.3));
    const prefixBudget = budget - suffixBudget;
    prefix = prefix.slice(-prefixBudget);
    suffix = suffix.slice(0, suffixBudget);
  }

  return {
    language: input.languageId,
    filePath: input.filePath,
    line,
    character,
    linePrefix,
    lineSuffix,
    prefix,
    suffix,
  };
}

export function createContextCacheKey(context: CompletionContext, model: string): string {
  return JSON.stringify([
    model,
    context.language,
    context.filePath,
    context.line,
    context.character,
    context.prefix,
    context.suffix,
  ]);
}
