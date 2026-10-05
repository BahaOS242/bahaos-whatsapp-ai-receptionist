import { normalizeText } from "./text";

/**
 * Parse step of the ingestion pipeline: bytes/text of a given type ->
 * normalized plain/markdown text that the chunker understands.
 *
 * Built in: plain text, Markdown, HTML (tags stripped, headings kept as
 * Markdown headings), and FAQ JSON ([{question, answer}]).
 *
 * NOT built in: PDF / DOCX. Real extraction needs a parser dependency this
 * project does not yet carry; rather than fake it, those types are
 * rejected with UnsupportedDocumentTypeError unless a parser is
 * registered via registerDocumentParser (the extension point for Phase 2).
 */

export class UnsupportedDocumentTypeError extends Error {
  constructor(public readonly mimeType: string) {
    super(`No parser registered for document type "${mimeType}".`);
  }
}

export interface ParseInput {
  content: string | Uint8Array;
  mimeType?: string;
  fileName?: string;
}

export type DocumentParser = (input: ParseInput) => string | Promise<string>;

const registry = new Map<string, DocumentParser>();

export function registerDocumentParser(mimeType: string, parser: DocumentParser): void {
  registry.set(mimeType.toLowerCase(), parser);
}

function toText(content: string | Uint8Array): string {
  return typeof content === "string" ? content : new TextDecoder("utf-8", { fatal: false }).decode(content);
}

function inferMime(input: ParseInput): string {
  if (input.mimeType) return input.mimeType.toLowerCase().split(";")[0].trim();
  const name = input.fileName?.toLowerCase() ?? "";
  if (name.endsWith(".md") || name.endsWith(".markdown")) return "text/markdown";
  if (name.endsWith(".html") || name.endsWith(".htm")) return "text/html";
  if (name.endsWith(".json")) return "application/json";
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "text/plain";
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level: string, inner: string) => `\n\n${"#".repeat(Number(level))} ${inner.replace(/<[^>]+>/g, "").trim()}\n\n`)
    .replace(/<\/(p|div|li|tr|section|article|br)>|<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m);
}

function faqJsonToText(raw: string): string {
  const data: unknown = JSON.parse(raw);
  const items = Array.isArray(data) ? data : (data as { faqs?: unknown[] })?.faqs;
  if (!Array.isArray(items)) throw new Error("FAQ JSON must be an array of {question, answer} objects.");
  return items
    .map((item) => {
      const q = (item as { question?: unknown; q?: unknown }).question ?? (item as { q?: unknown }).q;
      const a = (item as { answer?: unknown; a?: unknown }).answer ?? (item as { a?: unknown }).a;
      if (typeof q !== "string" || typeof a !== "string") throw new Error("Each FAQ item needs string question and answer fields.");
      return `Q: ${q.trim()}\nA: ${a.trim()}`;
    })
    .join("\n\n");
}

export async function parseDocument(input: ParseInput): Promise<string> {
  const mime = inferMime(input);
  const custom = registry.get(mime);
  if (custom) return normalizeText(await custom(input));

  if (mime === "text/plain" || mime === "text/markdown") return normalizeText(toText(input.content));
  if (mime === "text/html") return normalizeText(htmlToText(toText(input.content)));
  if (mime === "application/json") return normalizeText(faqJsonToText(toText(input.content)));
  throw new UnsupportedDocumentTypeError(mime);
}
