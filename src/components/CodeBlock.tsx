import { useState } from 'react';

// Reusable, generic code-display component — not hardcoded to any one
// snippet. Built for the widget's embed code first, but with a future
// "annotated code" feature in mind: exposing and explaining the app's
// own privacy-relevant code (e.g. GoatCounter's analytics snippet) to
// anyone who wants to verify what it actually does rather than just
// trust a written claim. Annotations aren't built here — deliberately
// held off, no unused props added for a feature that doesn't exist yet
// — but rendering line-by-line internally rather than as one opaque
// block means adding per-line hover/tooltip support later is additive,
// not a rewrite of how this displays code at all.
//
// Wraps rather than horizontally scrolls — same "grows to fit content
// instead of scrolling/clipping" philosophy AutoResizeTextarea already
// established elsewhere in the app (Targets.tsx/Roster.tsx's free-text
// fields), just reached here via plain CSS rather than JS height
// measurement, since a <pre> doesn't have a <textarea>'s fixed-size
// limitation to begin with — it already sizes to its content.
//
// Highlighting is a real hand-rolled tokenizer, not a library — HTML is
// simple enough to tokenize reliably with a single regex pass, which is
// the same "verify a real specific need before reaching for a
// dependency" bar this app has applied everywhere else (e.g. the
// tide-wipe animation choosing hand-rolled CSS keyframes over
// framer-motion). A language with real syntax complexity — JS, for the
// future annotated-tracking-code feature — would be a much harder bar
// to hand-roll well and might actually clear it; that's a decision for
// when that feature is real, not preemptively now. TOKENIZERS is keyed
// by language specifically so adding one later is additive.
const TOKENIZERS: Record<string, (code: string) => Token[]> = {
  html: tokenizeHtml,
  json: tokenizeJson,
};

type Token = { text: string; type: 'tag' | 'attr' | 'string' | 'punct' | 'key' | 'number' | 'keyword' };

function tokenizeHtml(code: string): Token[] {
  const pattern = /(<\/?[a-zA-Z][\w-]*)|([a-zA-Z-]+)(?==)|("(?:[^"\\]|\\.)*")|(\/?>)/g;
  const tokens: Token[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(code))) {
    if (match.index > lastIndex) {
      tokens.push({ text: code.slice(lastIndex, match.index), type: 'punct' });
    }
    if (match[1] || match[4]) tokens.push({ text: match[1] ?? match[4], type: 'tag' });
    else if (match[2]) tokens.push({ text: match[2], type: 'attr' });
    else if (match[3]) tokens.push({ text: match[3], type: 'string' });
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < code.length) {
    tokens.push({ text: code.slice(lastIndex), type: 'punct' });
  }
  return tokens;
}

// Regex-based, not a real parser — relies on standard pretty-printed
// JSON conventions (a quoted string immediately followed by a colon is
// a key, any other quoted string is a value) rather than tracking
// actual object/array nesting. Correct for the well-formatted example
// JSON this app actually generates and displays; not a general-purpose
// JSON tokenizer and not meant to be one.
function tokenizeJson(code: string): Token[] {
  const pattern =
    /("(?:[^"\\]|\\.)*")(?=\s*:)|("(?:[^"\\]|\\.)*")|(-?\d+\.?\d*)|(\btrue\b|\bfalse\b|\bnull\b)|([{}[\],:])/g;
  const tokens: Token[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(code))) {
    if (match.index > lastIndex) {
      tokens.push({ text: code.slice(lastIndex, match.index), type: 'punct' });
    }
    if (match[1]) tokens.push({ text: match[1], type: 'key' });
    else if (match[2]) tokens.push({ text: match[2], type: 'string' });
    else if (match[3]) tokens.push({ text: match[3], type: 'number' });
    else if (match[4]) tokens.push({ text: match[4], type: 'keyword' });
    else if (match[5]) tokens.push({ text: match[5], type: 'punct' });
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < code.length) {
    tokens.push({ text: code.slice(lastIndex), type: 'punct' });
  }
  return tokens;
}

const TOKEN_CLASSES: Record<Token['type'], string> = {
  tag: 'text-amber',
  attr: 'text-sand',
  key: 'text-sand',
  string: 'text-moss-light',
  number: 'text-amber',
  keyword: 'text-amber',
  punct: 'text-foam-dim',
};

export default function CodeBlock({ code, language = 'code' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const tokenize = TOKENIZERS[language];

  function handleCopy() {
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }

  return (
    <div className="rounded-lg border border-moss/30 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-deepwater-2 border-b border-moss/20">
        <span className="font-mono text-[10px] uppercase tracking-wide text-foam-dim">{language}</span>
        <button
          onClick={handleCopy}
          className="font-mono text-[10px] uppercase tracking-wide text-sand hover:text-amber transition-colors"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre className="px-3 py-2.5 bg-deepwater m-0 whitespace-pre-wrap break-words">
        <code className="font-mono text-xs leading-relaxed">
          {code.split('\n').map((line, i) => (
            // \u00A0 rather than an empty string — an empty div would
            // collapse to zero height and lose a blank line's spacing.
            // pl-[1.5em] + indent-[-1.5em] is a hanging indent: padding
            // shifts the whole line right, negative text-indent pulls
            // just the FIRST visual line back to the original margin —
            // text-indent only ever applies to a line's first row, so
            // any wrapped continuation stays shifted, reading as part of
            // the same logical line rather than a fresh one starting
            // flush at the edge.
            <div key={i} className="pl-[1.5em] indent-[-1.5em]">
              {line === ''
                ? '\u00A0'
                : tokenize
                  ? tokenize(line).map((token, j) => (
                      <span key={j} className={TOKEN_CLASSES[token.type]}>
                        {token.text}
                      </span>
                    ))
                  : <span className="text-foam-dim">{line}</span>}
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}