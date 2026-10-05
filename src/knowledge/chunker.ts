import { normalizeText } from "./text";

/**
 * Structure-aware chunking. NOT "split every N characters":
 *   - headings define sections; a chunk never straddles two sections;
 *   - an FAQ pair ("Q: ... A: ...") is kept atomic;
 *   - paragraphs are packed up to a target size, and an oversize paragraph
 *     is split on sentence boundaries, never mid-sentence;
 *   - a tiny trailing fragment is merged back into its neighbour;
 *   - each chunk carries its heading path as `section`, and retrieval text
 *     is always prefixed with document title + section (chunkRetrievalText),
 *     so a chunk that says "24 hours' notice" is still findable as
 *     "Cancellation policy > Late cancellations".
 */

export interface RawChunk {
  section: string | null;
  content: string;
  /** An FAQ pair: never merged with a neighbour, however short. */
  atomic?: boolean;
}

export interface ChunkOptions {
  /** Pack paragraphs up to roughly this many characters. */
  targetChars: number;
  /** Hard ceiling; a single sentence longer than this is hard-split. */
  maxChars: number;
  /** A trailing chunk shorter than this is merged into the previous one. */
  minChars: number;
}

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = { targetChars: 700, maxChars: 1100, minChars: 120 };

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*$/;
const FAQ_Q_RE = /^(?:q|question)\s*[:.)-]\s*(.+)$/i;
const FAQ_A_RE = /^(?:a|answer)\s*[:.)-]\s*(.+)$/i;

interface Block {
  section: string | null;
  text: string;
  atomic: boolean;
}

function splitSentences(paragraph: string): string[] {
  return paragraph.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

function hardSplit(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) out.push(text.slice(i, i + maxChars));
  return out;
}

function toBlocks(text: string): Block[] {
  const lines = normalizeText(text).split("\n");
  const headingPath: string[] = [];
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let pendingQuestion: string | null = null;

  const section = () => (headingPath.length ? headingPath.join(" > ") : null);
  const flush = () => {
    if (paragraph.length) {
      blocks.push({ section: section(), text: paragraph.join(" ").trim(), atomic: false });
      paragraph = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const heading = HEADING_RE.exec(line);
    if (heading) {
      flush();
      pendingQuestion = null;
      const depth = heading[1].length;
      headingPath.length = Math.min(headingPath.length, depth - 1);
      headingPath[depth - 1] = heading[2].trim();
      continue;
    }
    const q = FAQ_Q_RE.exec(line);
    if (q) {
      flush();
      pendingQuestion = q[1].trim();
      continue;
    }
    const a = FAQ_A_RE.exec(line);
    if (a && pendingQuestion) {
      blocks.push({ section: section(), text: `Q: ${pendingQuestion}\nA: ${a[1].trim()}`, atomic: true });
      pendingQuestion = null;
      continue;
    }
    if (line === "") {
      flush();
      continue;
    }
    // A continuation line of an FAQ answer.
    if (pendingQuestion === null && blocks.length && blocks[blocks.length - 1].atomic && paragraph.length === 0 && !/^[-*•]\s/.test(line)) {
      blocks[blocks.length - 1].text += ` ${line}`;
      continue;
    }
    paragraph.push(line.replace(/^[-*•]\s+/, "• "));
  }
  flush();
  return blocks.filter((b) => b.text.length > 0);
}

export function chunkText(text: string, options: ChunkOptions = DEFAULT_CHUNK_OPTIONS): RawChunk[] {
  const blocks = toBlocks(text);
  const chunks: RawChunk[] = [];
  let current: RawChunk | null = null;

  const push = () => {
    if (current && current.content.trim()) chunks.push(current);
    current = null;
  };

  for (const block of blocks) {
    if (block.atomic) {
      push();
      if (block.text.length <= options.maxChars) {
        chunks.push({ section: block.section, content: block.text, atomic: true });
      } else {
        for (const part of hardSplit(block.text, options.maxChars)) chunks.push({ section: block.section, content: part, atomic: true });
      }
      continue;
    }

    // A new section always starts a new chunk.
    if (current && (current as RawChunk).section !== block.section) push();

    const pieces: string[] =
      block.text.length <= options.maxChars
        ? [block.text]
        : splitSentences(block.text).flatMap((s) => (s.length > options.maxChars ? hardSplit(s, options.maxChars) : [s]));

    for (const piece of pieces) {
      if (!current) {
        current = { section: block.section, content: piece };
      } else if ((current as RawChunk).content.length + 1 + piece.length <= options.targetChars) {
        (current as RawChunk).content += `\n${piece}`;
      } else {
        push();
        current = { section: block.section, content: piece };
      }
    }
  }
  push();

  // Merge a tiny final fragment into the previous chunk of the SAME section.
  const merged: RawChunk[] = [];
  for (const chunk of chunks) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      !prev.atomic &&
      !chunk.atomic &&
      chunk.content.length < options.minChars &&
      prev.section === chunk.section &&
      prev.content.length + chunk.content.length < options.maxChars
    ) {
      prev.content += `\n${chunk.content}`;
    } else {
      merged.push({ ...chunk });
    }
  }
  return merged.map(({ section, content }) => ({ section, content }));
}

/** The text that is scored and embedded for a chunk: title + section give
 * it the context a bare paragraph lacks. */
export function chunkRetrievalText(documentTitle: string, section: string | null, content: string): string {
  return [documentTitle, section, content].filter(Boolean).join(". ");
}
