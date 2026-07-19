import { useState } from 'react';
import { Link } from 'react-router-dom';
import { JSON_FORMAT_DOCS } from '../data/apiDocs';

export default function JsonDocs() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(JSON_FORMAT_DOCS);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Could not copy automatically — select the text below and copy manually.');
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
            AI Quickstart &amp; Import Guide
          </h1>
        </div>
        <button onClick={handleCopy} className="btn btn-primary self-start">
          {copied ? '✓ Copied' : 'Copy full documentation'}
        </button>
      </header>

      <main className="px-6 md:px-10 py-8 max-w-4xl mx-auto space-y-6">
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

        <div className="card p-5">
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foam-dim overflow-x-auto">
            {JSON_FORMAT_DOCS}
          </pre>
        </div>
      </main>
    </div>
  );
}