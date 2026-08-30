// Deliberately NOT a markdown parser — the AI Quickstart guide's prose
// (headers, bold text, bullet lists) renders exactly as it always has,
// plain preformatted text. This only carves out the two structures that
// were actually hard to read as raw text: fenced code blocks and pipe
// tables. Expanding further (real header/bold/list rendering) is a
// bigger, different undertaking than what was actually asked for here.

export type DocSegment =
  | { type: 'prose'; content: string }
  | { type: 'code'; language: string; content: string };

// Splits on ```lang\n...\n``` fences already present in the source —
// no new markup needed, these already exist for the doc's own 5 JSON
// examples.
export function splitFencedCode(doc: string): DocSegment[] {
  const segments: DocSegment[] = [];
  const fenceRegex = /```(\w+)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(doc))) {
    if (match.index > lastIndex) {
      segments.push({ type: 'prose', content: doc.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'code', language: match[1], content: match[2].replace(/\n$/, '') });
    lastIndex = fenceRegex.lastIndex;
  }
  if (lastIndex < doc.length) {
    segments.push({ type: 'prose', content: doc.slice(lastIndex) });
  }
  return segments;
}

export type ProseSegment = { type: 'text'; content: string } | { type: 'table'; headers: string[]; rows: string[][] };

// Regex/line-based, not a real markdown parser — detects a pipe-table
// by its header row followed by a |---|---| separator row, which is
// the one, reliable structural signal a real table needs regardless of
// column count or alignment markers. No handling for escaped pipes
// within a cell — the real content here has none, and adding that
// complexity for a case that doesn't occur would be solving a problem
// that isn't there.
export function splitTables(text: string): ProseSegment[] {
  const lines = text.split('\n');
  const segments: ProseSegment[] = [];
  let textBuffer: string[] = [];
  let i = 0;

  const isPipeRow = (line: string) => /^\s*\|.*\|\s*$/.test(line);
  const isSeparatorRow = (line: string) => /^\s*\|[\s:|-]+\|\s*$/.test(line) && line.includes('-');
  // Split only on unescaped pipes — some cells here use markdown's \|
  // escape to show a literal pipe as an alternative-values separator
  // within one cell (e.g. `"number"` \| `"text"` \| `"boolean"`),
  // which a naive split('|') would wrongly treat as extra columns.
  // Negative lookbehind finds real column boundaries; \| is then
  // unescaped back to a plain | in the resulting cell text.
  const parseRow = (line: string) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim().replace(/\\\|/g, '|'));

  function flushText() {
    if (textBuffer.length > 0) {
      segments.push({ type: 'text', content: textBuffer.join('\n') });
      textBuffer = [];
    }
  }

  while (i < lines.length) {
    if (isPipeRow(lines[i]) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      flushText();
      const headers = parseRow(lines[i]);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isPipeRow(lines[i])) {
        rows.push(parseRow(lines[i]));
        i++;
      }
      segments.push({ type: 'table', headers, rows });
    } else {
      textBuffer.push(lines[i]);
      i++;
    }
  }
  flushText();
  return segments;
}