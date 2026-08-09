import { CompletionContext } from './types';

function stripCodeFence(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
  return match ? match[1] : value;
}

function removeRepeatedPrefix(value: string, prefix: string): string {
  if (!prefix || !value.startsWith(prefix)) {
    return value;
  }
  return value.slice(prefix.length);
}

function removeSuffixOverlap(value: string, suffix: string): string {
  if (!suffix) {
    return value;
  }
  const limit = Math.min(value.length, suffix.length);
  for (let size = limit; size > 0; size -= 1) {
    if (value.endsWith(suffix.slice(0, size))) {
      return value.slice(0, -size);
    }
  }
  return value;
}

export function normalizeSuggestion(
  raw: string,
  context: Pick<CompletionContext, 'linePrefix' | 'lineSuffix'>,
  maxLines: number,
): string {
  let value = stripCodeFence(raw).replace(/\r\n/g, '\n');
  value = value.replace(/^(?:Here(?:'s| is) (?:the )?(?:completion|code):?\s*)/i, '');
  value = removeRepeatedPrefix(value, context.linePrefix);
  value = removeSuffixOverlap(value, context.lineSuffix);

  const lines = value.split('\n').slice(0, Math.max(1, maxLines));
  value = lines.join('\n').replace(/[ \t]+$/gm, '');

  if (!context.linePrefix.trim()) {
    value = value.replace(/^\n+/, '');
  }

  return value.trimEnd();
}
