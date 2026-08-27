'use client';

// Inviting twenty-five people at once.
//
// WHY IT IS A LOOP AND NOT A BATCH ENDPOINT. Every rule that governs a single
// invitation lives in the edge function: the refusal when an address already
// belongs to a member, the one-invitation-per-address rule that switches off
// the previous link, the per-address cooldown, the role-specific message. A
// batch endpoint would have to reimplement all four, and the first one it got
// wrong would send a stranger a broken link. So this calls the same function
// the single form calls, once per person.
//
// NOTHING IS SENT UNTIL THE LIST HAS BEEN READ BACK. Pasting twenty-five
// addresses is exactly the moment a stray line, a duplicate or a typo gets
// through, and an invitation cannot be recalled. The preview is not a courtesy
// step; it is the only place those are catchable.
//
// ONE FAILURE DOES NOT STOP THE REST. A single "already a member" in the middle
// of a list must not abandon the twenty-four after it, and the Director has to
// be told which line failed and why, by address, so they can act on that line
// rather than re-running the whole thing.

import { useState } from 'react';
import * as live from '@/lib/live/data';
import { Button, Card } from '@/components/ui';
import { roleNoun } from '@/lib/brand';
import type { Role } from '@/lib/types';
import { humanError } from '@/lib/live/errors';

interface Parsed {
  email: string;
  name: string;
  /** Why this line cannot be sent, or '' when it can. */
  problem: string;
}

/**
 * Read whatever was pasted.
 *
 * Accepts one per line, or separated by commas or semicolons, and both
 * `someone@example.org` and `Their Name <someone@example.org>`, which is what
 * comes out of a mail client when somebody copies a group. Spreadsheet cells
 * arrive tab-separated, so tabs split too.
 */
export function parseInviteList(raw: string): Parsed[] {
  const seen = new Set<string>();
  const out: Parsed[] = [];

  for (const chunk of raw.split(/[\n,;\t]+/)) {
    const line = chunk.trim();
    if (!line) continue;

    // "Name <address>" first, since the address inside would otherwise match
    // on its own and lose the name.
    const pair = /^(.*?)[<(]\s*([^>)\s]+)\s*[>)]$/.exec(line);
    const email = (pair ? pair[2] : line).trim().toLowerCase();
    const name = (pair ? pair[1] : '').replace(/["']/g, '').trim();

    // Deliberately loose. The edge function and the database both check the
    // address properly; this only catches what is obviously not one, so that a
    // stray word in a pasted block does not become a send attempt.
    const looksLikeEmail = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(email);

    let problem = '';
    if (!looksLikeEmail) problem = 'That does not look like an email address';
    else if (seen.has(email)) problem = 'Listed twice';

    if (looksLikeEmail) seen.add(email);
    out.push({ email, name, problem });
  }
  return out;
}

type Outcome = { email: string; ok: boolean; detail: string };

export function LiveBulkInvite({ roles }: { roles: Role[] }) {
  const [raw, setRaw] = useState('');
  const [role, setRole] = useState<Role>(roles[0] ?? 'ds');
  const [preview, setPreview] = useState<Parsed[] | null>(null);
  const [results, setResults] = useState<Outcome[] | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);

  const sendable = (preview ?? []).filter((p) => !p.problem);

  const send = async () => {
    setBusy(true);
    setResults(null);
    setProgress(0);
    const done: Outcome[] = [];

    for (const person of sendable) {
      try {
        const result = await live.inviteMember({
          email: person.email,
          role,
          // The form requires a name and the edge function puts it in the
          // message. A pasted list often has none, and the address is a better
          // greeting than an empty one.
          fullName: person.name || person.email.split('@')[0],
        });
        done.push({
          email: person.email,
          ok: true,
          detail: result.delivery === 'link'
            ? 'Created, but the email did not go. Send their link by hand.'
            : 'Invitation sent',
        });
      } catch (cause) {
        done.push({
          email: person.email,
          ok: false,
          detail: humanError(cause, 'Could not send'),
        });
      }
      setProgress((n) => n + 1);
      setResults([...done]);
    }

    setBusy(false);
    setPreview(null);
    setRaw('');
  };

  const sent = (results ?? []).filter((r) => r.ok).length;
  const failed = (results ?? []).filter((r) => !r.ok);

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">📋 Invite several people at once</h2>
      <p className="mt-1 text-sm text-gray-500">
        Paste any number of email addresses. One per line, or separated by
        commas. Everybody in one batch gets the same role.
      </p>

      <textarea
        value={raw}
        onChange={(e) => { setRaw(e.target.value); setPreview(null); }}
        rows={5}
        placeholder={'someone@example.org\nAnother Person <another@example.org>\nthird@example.org'}
        className="mt-3 w-full rounded-xl border border-gray-300 px-3 py-2 font-mono text-sm"
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="text-sm font-semibold text-navy">
          Invite all of them as{' '}
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="rounded-xl border border-gray-300 px-2 py-1"
          >
            {roles.map((r) => <option key={r} value={r}>{roleNoun(r)}</option>)}
          </select>
        </label>
        <Button
          variant="ghost"
          disabled={busy || !raw.trim()}
          onClick={() => { setResults(null); setPreview(parseInviteList(raw)); }}
        >
          Check the list
        </Button>
      </div>

      {/* THE PREVIEW. Read back before anything is sent. */}
      {preview && (
        <div className="mt-4 rounded-xl bg-gray-50 p-3">
          <p className="text-sm font-bold text-navy">
            {sendable.length} to invite as {roleNoun(role)}
            {preview.length - sendable.length > 0
              ? `, ${preview.length - sendable.length} skipped` : ''}
          </p>
          <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto text-sm">
            {preview.map((p, i) => (
              <li key={`${p.email}-${i}`} className={p.problem ? 'text-amber-800' : 'text-gray-700'}>
                {p.problem ? '⚠️ ' : '· '}
                <span className="font-mono">{p.email || '(blank)'}</span>
                {p.name ? ` · ${p.name}` : ''}
                {p.problem ? ` · ${p.problem}` : ''}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="gold" disabled={busy || sendable.length === 0} onClick={() => void send()}>
              {busy ? `Sending ${progress} of ${sendable.length}…` : `Send ${sendable.length} invitations`}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setPreview(null)}>Cancel</Button>
          </div>
          {sendable.length > 0 && (
            <p className="mt-2 text-xs text-gray-500">
              Sent one at a time, so one refusal does not stop the others. Anybody
              who already holds an invitation gets a fresh link, and their old one
              stops working.
            </p>
          )}
        </div>
      )}

      {results && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-bold text-navy">
            {sent} sent{failed.length > 0 ? `, ${failed.length} could not be` : ''}
          </p>
          {failed.length > 0 && (
            <ul className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
              {failed.map((r) => (
                <li key={r.email}><span className="font-mono">{r.email}</span> · {r.detail}</li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => setResults(null)}
            className="text-xs font-semibold text-gray-400 underline"
          >
            Dismiss
          </button>
        </div>
      )}
    </Card>
  );
}
