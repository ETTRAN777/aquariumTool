// Deliberately NOT a full markdown parser — only carves out the
// structures that were actually hard to read as raw text: fenced code
// blocks, pipe tables, headers, and bullet lists. Bold text and inline
// code spans are left as literal ** and ` characters on purpose — those
// need a real inline tokenizer (splitting text *within* a line into
// styled spans), a meaningfully different and bigger kind of parsing
// than the line-level classification everything here does. Scoped down
// to line-level structure deliberately, not by omission.

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

export type ProseSegment =
  | { type: 'text'; content: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'heading'; level: 1 | 2 | 3; content: string }
  | { type: 'bullets'; items: { text: string; nested: boolean }[] }
  | { type: 'boldLine'; content: string };

// Regex/line-based, not a real markdown parser — detects a pipe-table
// by its header row followed by a |---|---| separator row, which is
// the one, reliable structural signal a real table needs regardless of
// column count or alignment markers. No handling for escaped pipes
// within a cell — the real content here has none, and adding that
// complexity for a case that doesn't occur would be solving a problem
// that isn't there.
//
// Headers and bullets get the same treatment as tables — a reliable
// line-start signal, checked against the real content before writing
// this (H1/H2/H3 only, no H4+; only "- " bullets, no "*" variant; a
// handful of once-indented "  - " bullets, everything else flat).
export function splitProse(text: string): ProseSegment[] {
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

  const headingMatch = (line: string) => line.match(/^(#{1,3}) (.+)$/);
  const bulletMatch = (line: string) => line.match(/^(\s*)- (.+)$/);
  // A whole line that's nothing but **bold text** — the doc's own
  // pattern for a feature-name pseudo-heading (`**Roster**`, `**Plan**`,
  // etc.), distinct from bold used inline within running prose (e.g.
  // `**Fin-nipping risk** — pairwise, same shape as...`), which this
  // deliberately does NOT catch — that needs real inline tokenization to
  // render correctly (bold span followed by plain text on the same
  // line), a bigger, different kind of parsing than anything here does.
  // [^*]+ rather than .+ so this can't accidentally cross into a second
  // **bold** span later on the same line; $ requires the line to end
  // immediately after the closing **, so a line with anything else
  // after it (plain text, italics) correctly falls through untouched.
  const boldLineMatch = (line: string) => line.match(/^\*\*([^*]+)\*\*$/);

  function flushText() {
    if (textBuffer.length > 0) {
      segments.push({ type: 'text', content: textBuffer.join('\n') });
      textBuffer = [];
    }
  }

  while (i < lines.length) {
    const heading = headingMatch(lines[i]);
    const bullet = bulletMatch(lines[i]);
    const boldLine = boldLineMatch(lines[i]);

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
    } else if (heading) {
      flushText();
      segments.push({ type: 'heading', level: heading[1].length as 1 | 2 | 3, content: heading[2] });
      i++;
    } else if (boldLine) {
      flushText();
      segments.push({ type: 'boldLine', content: boldLine[1] });
      i++;
    } else if (bullet) {
      flushText();
      const items: { text: string; nested: boolean }[] = [];
      while (i < lines.length) {
        const b = bulletMatch(lines[i]);
        if (!b) break;
        items.push({ text: b[2], nested: b[1].length > 0 });
        i++;
      }
      segments.push({ type: 'bullets', items });
    } else {
      textBuffer.push(lines[i]);
      i++;
    }
  }
  flushText();
  return segments;
}