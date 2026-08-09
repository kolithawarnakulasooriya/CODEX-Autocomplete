import { CompletionRequest } from './types';
import { SseParser, textFromEvent } from './sse';

const COMPLETION_INSTRUCTIONS = [
  'You are an inline code completion engine.',
  'Return only the exact text to insert at the cursor: no Markdown, no code fences, no explanation.',
  'Never repeat text already present before the cursor and never duplicate text after the cursor.',
  'Prefer the smallest syntactically useful continuation.',
  'Match the file language, indentation, naming, and nearby style.',
  'Do not rewrite existing code.',
].join(' ');

export interface ResponsesRequestBody {
  model: string;
  instructions: string;
  input: Array<{
    role: 'user';
    content: Array<{ type: 'input_text'; text: string }>;
  }>;
  reasoning: { effort: 'none' | 'low' };
  text: { verbosity: 'low' };
  max_output_tokens?: number;
  stream: true;
  store: false;
}

export interface OpenAIClientOptions {
  endpoint: string;
  accessToken: string;
  authKind?: 'oauth' | 'apiKey';
  accountId?: string;
  fetcher?: typeof fetch;
  log?: (message: string) => void;
  maxRetries?: number;
}

export function assertSafeEndpoint(endpoint: string): void {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error('The configured endpoint is not a valid URL.');
  }
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (url.protocol !== 'https:' && !localHosts.has(url.hostname)) {
    throw new Error('The configured endpoint must use HTTPS (HTTP is allowed only for localhost).');
  }
}

export function buildResponsesRequestBody(
  request: CompletionRequest,
  authKind: 'oauth' | 'apiKey' = 'apiKey',
): ResponsesRequestBody {
  const context = request.context;
  const input = {
    task: 'Complete code at <CURSOR>. Return insertion text only.',
    language: context.language,
    file_path: context.filePath,
    cursor: { line: context.line, character: context.character },
    line_prefix: context.linePrefix,
    line_suffix: context.lineSuffix,
    source_before_cursor: context.prefix,
    source_after_cursor: context.suffix,
  };

  return {
    model: request.model,
    instructions: COMPLETION_INSTRUCTIONS,
    input: [
      {
        role: 'user',
        content: [{ type: 'input_text', text: JSON.stringify(input) }],
      },
    ],
    reasoning: { effort: request.reasoningEffort },
    text: { verbosity: 'low' },
    ...(authKind === 'apiKey' ? { max_output_tokens: request.maxOutputTokens } : {}),
    stream: true,
    store: false,
  };
}

export class OpenAIResponsesClient {
  private readonly fetcher: typeof fetch;
  private readonly log: (message: string) => void;
  private readonly maxRetries: number;

  constructor(private readonly options: OpenAIClientOptions) {
    assertSafeEndpoint(options.endpoint);
    this.fetcher = options.fetcher ?? fetch;
    this.log = options.log ?? (() => undefined);
    this.maxRetries = options.maxRetries ?? 1;
  }

  async complete(request: CompletionRequest, signal: AbortSignal): Promise<string> {
    const body = buildResponsesRequestBody(request, this.options.authKind);
    const response = await this.fetchWithRetry(body, signal);
    if (!response.body) {
      throw new Error('OpenAI returned an empty streaming response.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseParser();
    let output = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        const payloads = done ? parser.finish() : parser.push(decoder.decode(value, { stream: true }));
        for (const payload of payloads) {
          const event = textFromEvent(payload);
          output += event.text;
          if (event.done) {
            return output;
          }
        }
        if (done) {
          return output;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async fetchWithRetry(body: ResponsesRequestBody, signal: AbortSignal): Promise<Response> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const startedAt = Date.now();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.options.accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      };
      if (this.options.authKind === 'oauth' && this.options.accountId) {
        headers['ChatGPT-Account-Id'] = this.options.accountId;
      }
      const response = await this.fetcher(this.options.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });
      this.log(`Responses API status=${response.status} headers=${Date.now() - startedAt}ms`);

      if (response.ok) {
        return response;
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < this.maxRetries) {
        const retryAfterSeconds = Number(response.headers.get('retry-after'));
        const delayMs = Number.isFinite(retryAfterSeconds)
          ? Math.min(1000, Math.max(0, retryAfterSeconds * 1000))
          : 200 * (attempt + 1);
        await abortableDelay(delayMs, signal);
        continue;
      }

      const details = (await response.text()).slice(0, 500);
      throw new Error(`OpenAI request failed (${response.status}): ${details || response.statusText}`);
    }

    throw new Error('OpenAI request failed after retries.');
  }
}

export function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, Math.max(0, milliseconds));
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}
