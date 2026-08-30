import { useState } from 'react';
import { Link } from 'react-router-dom';
import { JSON_FORMAT_DOCS } from '../data/apiDocs';
import Toast from '../components/Toast';
import CodeBlock from '../components/CodeBlock';
import { splitFencedCode, splitTables, type ProseSegment } from '../lib/docParsing';

// Computed once at module load, not per-render or even per-component-
// instance — JSON_FORMAT_DOCS is a static constant, so there's no
// reason to re-parse it on every mount. Verified behaviorally against
// the real content before wiring this in: fence-splitting round-trips
// to the exact original string (zero data loss), and all 7 of the
// doc's real tables parse with correct column counts, including one
// that uses markdown's \| escape for a literal pipe inside a cell.
const AI_QUICKSTART_SEGMENTS = splitFencedCode(JSON_FORMAT_DOCS);

// Two tabs, deliberately different in kind, not just topic — "AI
// Quickstart" is written FOR an AI assistant and meant to be copied
// verbatim into a chat; "Features Guide" is written for a person reading
// it directly in the app, and has nothing to copy-paste anywhere. That's
// why only the first tab has a copy button and a <pre> block, and the
// second is real formatted JSX instead of a text dump.
//
// AI Quickstart stays the DEFAULT tab and its content/copy behavior is
// completely unchanged from before this became tabbed — anything that
// already links or bookmarks straight to /docs (the onboarding screen,
// for one) still lands on exactly what it always has. JSON_FORMAT_DOCS
// itself isn't touched by this file at all; docs.txt (generated from it
// directly by scripts/generate-static-docs.mjs, independent of this
// component) is unaffected by construction, not just by care taken here.
export default function JsonDocs() {
  const [tab, setTab] = useState<'ai' | 'features'>('ai');
  const [copied, setCopied] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(JSON_FORMAT_DOCS);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setToastMessage('Could not copy automatically — select the text below and copy manually.');
    }
  }

  return (
    <div className="min-h-screen bg-deepwater text-foam font-body">
      <header className="border-b border-moss/30 px-6 md:px-10 py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <Link to="/" className="text-xs text-foam-dim hover:text-amber font-mono">
            ← Back
          </Link>
          <h1 className="font-display text-3xl md:text-4xl font-semibold mt-1">
            {tab === 'ai' ? 'AI Quickstart & Import Guide' : 'Features Guide'}
          </h1>
        </div>
        {tab === 'ai' && (
          <button onClick={handleCopy} className="btn btn-primary self-start">
            {copied ? '✓ Copied' : 'Copy full documentation'}
          </button>
        )}
      </header>

      <div className="px-6 md:px-10 pt-6 flex gap-2">
        <DocsTabPill active={tab === 'ai'} onClick={() => setTab('ai')} label="AI Quickstart" />
        <DocsTabPill active={tab === 'features'} onClick={() => setTab('features')} label="Features Guide" />
      </div>

      <main className="px-6 md:px-10 py-8 max-w-4xl mx-auto space-y-6">
        {tab === 'ai' ? (
          <>
            <div className="card p-5">
              <p className="text-sm text-foam-dim leading-relaxed">
                This page is written for an AI assistant, and gives it real context on this whole
                site — not just how to generate an import file. Copy the whole thing above and paste
                it into a chat with an AI, along with your own aquarium build plan (in whatever level
                of detail you have). It can talk through what the app actually does, help you think
                through a plan, and — once you're ready — generate a file you bring in from the{' '}
                <span className="text-foam">New Tank</span> screen's{' '}
                <span className="text-foam">"Import a tank from a backup file"</span> section — works
                even as a brand-new user with no existing tanks.
              </p>
            </div>

            <div className="card p-5 space-y-4">
              {AI_QUICKSTART_SEGMENTS.map((segment, i) =>
                segment.type === 'code' ? (
                  <CodeBlock key={i} language={segment.language} code={segment.content} />
                ) : (
                  <ProseWithTables key={i} content={segment.content} />
                )
              )}
            </div>
          </>
        ) : (
          <FeaturesGuide />
        )}
      </main>

      <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
    </div>
  );
}

// Only carves tables out of prose — everything else (headers, bold
// text, bullet lists) still renders exactly as it always has, plain
// preformatted text. Full markdown rendering is a bigger, different
// undertaking than what tables specifically needed.
function ProseWithTables({ content }: { content: string }) {
  const segments = splitTables(content);
  return (
    <>
      {segments.map((segment, i) =>
        segment.type === 'table' ? (
          <MarkdownTable key={i} segment={segment} />
        ) : (
          segment.content.trim() && (
            <pre
              key={i}
              className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foam-dim overflow-x-auto"
            >
              {segment.content}
            </pre>
          )
        )
      )}
    </>
  );
}

function MarkdownTable({ segment }: { segment: Extract<ProseSegment, { type: 'table' }> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-moss/30">
            {segment.headers.map((h, i) => (
              <th
                key={i}
                className="text-left font-mono uppercase tracking-wide text-sand px-2 py-1.5 whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {segment.rows.map((row, i) => (
            <tr key={i} className="border-b border-moss/10">
              {row.map((cell, j) => (
                <td key={j} className="align-top px-2 py-1.5 text-foam-dim">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DocsTabPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`pill py-1.5 px-3 text-xs shrink-0 whitespace-nowrap ${
        active ? 'bg-moss text-foam' : 'bg-deepwater text-foam-dim hover:text-foam border border-moss/30'
      }`}
    >
      {label}
    </button>
  );
}

// A real "here's what this app can do that you might not have found"
// tour — written after noticing four genuinely useful features were
// each buried on their own page with no central reference anywhere: an
// AI-handoff prompt is only discoverable if you happen to land on the
// exact page that has the button. The widget just happened to be the
// one that surfaced the gap; this fixes the actual, broader problem.
function FeaturesGuide() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-foam-dim leading-relaxed">
        A few real features live on specific pages and are easy to miss unless you happen to land
        there. Collected here in one place.
      </p>

      <FeatureCard
        icon="🖼"
        title="Concept image prompt"
        location="Dashboard"
        to="/"
      >
        Assembles this tank's real roster (hardscape, substrate, plants, livestock), style, and
        dimensions into a ready-to-paste prompt for whatever AI image tool you already use — a way
        to visualize a build before buying anything. The app never calls an image API itself, only
        assembles the prompt from real data.
      </FeatureCard>

      <FeatureCard
        icon="📋"
        title="Research prompt"
        location="Compatibility"
        to="/targets"
      >
        Hands the actual research step to whatever AI you use, for the tank overall or for a single
        roster item — asks explicitly for real, sourced water-parameter ranges rather than a
        fabricated single number, and for an averaged, clearly-marked estimate wherever a source is
        likely to report a range instead of one figure.
      </FeatureCard>

      <FeatureCard
        icon="📈"
        title="Progress check prompt"
        location="Timeline"
        to="/timeline"
      >
        Assembles this tank's real logged history — phase durations, the major-milestone list, and
        actual entry content grounded to whatever produced a milestone — into a prompt for an honest
        progress check from an AI, not just a recap of the original plan.
      </FeatureCard>

      <FeatureCard icon="📋" title="Tidemark Widget">
        <p className="mb-3">
          Embeds this tank's name, age, most relevant schedule task, and last log entry on another
          page you control, live and refreshed on load. Chrome is the browser this is expected to
          work in reliably; Safari has real, accepted limitations around the storage access this
          needs.
        </p>
        <CodeBlock language="html" code={WIDGET_EMBED_SNIPPET} />
      </FeatureCard>
    </div>
  );
}

// Static — doesn't depend on which tank happens to be active while
// viewing this doc. Widget.tsx reads whatever tank is active in the
// browser the embed is actually viewed from, not one baked into this
// snippet, so there's nothing tank-specific to parameterize here.

const WIDGET_EMBED_SNIPPET =
  '<iframe src="https://ettran777.github.io/aquariumTool/#/widget" style="border:0;width:300px;height:220px;overflow:hidden" loading="lazy"></iframe>';

function FeatureCard({
  icon,
  title,
  location,
  to,
  children,
}: {
  icon: string;
  title: string;
  location?: string;
  to?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="font-display text-lg font-semibold">
          {icon} {title}
        </p>
        {location && to && (
          <Link to={to} className="text-xs font-mono text-sand hover:text-amber whitespace-nowrap">
            {location} →
          </Link>
        )}
      </div>
      <div className="text-sm text-foam-dim leading-relaxed">{children}</div>
    </div>
  );
}