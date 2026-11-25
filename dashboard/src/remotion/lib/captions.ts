import type { CaptionWord } from "./types";

export interface CaptionBlock {
  words: CaptionWord[];
  startMs: number;
  endMs: number;
  text: string;
}

/**
 * Groups word-level captions into display blocks.
 * Same logic as OpenShorts' subtitles._collect_word_blocks: max chars and max
 * duration per block, and a pause or a phrase end closes a block of 2+ words.
 */
const PAUSE_BREAK_MS = 450;
const PHRASE_END = /[.!?,;:]$/;
const WEAK_ENDINGS = new Set(["a", "an", "the", "to", "of", "in", "on", "at", "for",
  "and", "but", "or", "my", "your", "i"]);

export function groupCaptionsIntoBlocks(
  captions: CaptionWord[],
  maxChars = 20,
  maxDurationMs = 2000
): CaptionBlock[] {
  const blocks: CaptionBlock[] = [];
  let currentWords: CaptionWord[] = [];
  let blockStartMs = 0;

  for (const word of captions) {
    if (currentWords.length === 0) {
      currentWords.push(word);
      blockStartMs = word.startMs;
      continue;
    }

    const currentTextLen = currentWords.reduce(
      (sum, w) => sum + w.text.length + 1,
      0
    );
    const duration = word.endMs - blockStartMs;
    const prev = currentWords[currentWords.length - 1];
    const naturalBreak =
      currentWords.length >= 2 &&
      (word.startMs - prev.endMs > PAUSE_BREAK_MS || PHRASE_END.test(prev.text));

    if (
      currentTextLen + word.text.length > maxChars ||
      duration > maxDurationMs ||
      naturalBreak
    ) {
      // Never end a block on "the"/"in"/"to": carry it to the next one.
      const carried: CaptionWord[] = [];
      while (
        !naturalBreak && currentWords.length >= 2 &&
        WEAK_ENDINGS.has(currentWords[currentWords.length - 1].text.toLowerCase())
      ) {
        carried.unshift(currentWords.pop() as CaptionWord);
      }
      // Finalize current block
      const lastWord = currentWords[currentWords.length - 1];
      blocks.push({
        words: [...currentWords],
        startMs: blockStartMs,
        endMs: lastWord.endMs,
        text: currentWords.map((w) => w.text).join(" "),
      });

      currentWords = [...carried, word];
      blockStartMs = currentWords[0].startMs;
    } else {
      currentWords.push(word);
    }
  }

  // Final block
  if (currentWords.length > 0) {
    const lastWord = currentWords[currentWords.length - 1];
    blocks.push({
      words: [...currentWords],
      startMs: blockStartMs,
      endMs: lastWord.endMs,
      text: currentWords.map((w) => w.text).join(" "),
    });
  }

  return blocks;
}

/**
 * Find the active word at a given time in milliseconds.
 */
export function getActiveWordIndex(
  words: CaptionWord[],
  timeMs: number
): number {
  for (let i = 0; i < words.length; i++) {
    if (timeMs >= words[i].startMs && timeMs < words[i].endMs) {
      return i;
    }
  }
  return -1;
}
