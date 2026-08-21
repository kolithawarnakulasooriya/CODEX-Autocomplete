export interface ResponseStreamEvent {
  type?: string;
  delta?: string;
  error?: { message?: string };
  response?: { error?: { message?: string } };
}

export class SseParser {
  private buffer = '';

  constructor(private readonly maxBufferCharacters = 256 * 1024) {}

  push(chunk: string): string[] {
    this.buffer += chunk.replace(/\r\n/g, '\n');
    if (this.buffer.length > this.maxBufferCharacters) {
      throw new Error('OpenAI stream event exceeded the client size limit.');
    }
    const payloads: string[] = [];
    let boundary = this.buffer.indexOf('\n\n');

    while (boundary >= 0) {
      const block = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (data) {
        payloads.push(data);
      }
      boundary = this.buffer.indexOf('\n\n');
    }

    return payloads;
  }

  finish(): string[] {
    if (!this.buffer.trim()) {
      return [];
    }
    return this.push('\n\n');
  }
}

export function textFromEvent(payload: string): { text: string; done: boolean } {
  if (payload === '[DONE]') {
    return { text: '', done: true };
  }

  let event: ResponseStreamEvent;
  try {
    event = JSON.parse(payload) as ResponseStreamEvent;
  } catch {
    return { text: '', done: false };
  }

  if (event.type === 'error' || event.type === 'response.failed') {
    const message = event.error?.message ?? event.response?.error?.message ?? 'OpenAI stream failed.';
    throw new Error(message);
  }

  if (event.type === 'response.output_text.delta') {
    return { text: typeof event.delta === 'string' ? event.delta : '', done: false };
  }

  return { text: '', done: event.type === 'response.completed' };
}
