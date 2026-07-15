/**
 * Split text into playback "tokens": alternating runs of non-whitespace and
 * whitespace. Streaming the answer one token at a time at a chosen tokens/second
 * gives a natural typewriter cadence, and `tokens.join('')` is loss-free.
 */
export function tokenize(text: string): string[] {
  return text.match(/\s+|\S+/g) ?? [];
}
