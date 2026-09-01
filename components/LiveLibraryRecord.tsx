'use client';

import { useCallback, useEffect, useState } from 'react';
import * as live from '@/lib/live/data';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { Button, Card } from '@/components/ui';
import { humanError } from '@/lib/live/errors';

// What the church's people have been sharing, and the switch beside it.
//
// THE DECISION THIS SCREEN CARRIES. A Guide and an Explorer share links with
// each other freely, without asking anybody. That freedom is the point; it is
// also the thing that needs an answer to "and what if somebody misuses it".
// The answer is not a permission gate in front of every share. It is a record
// afterwards, read by the rank above, with a way to stop somebody who is
// misusing it.
//
// WHO SEES WHOM is decided in the database and not here. A Director reads this
// for the Guides and Explorers of a church they lead. An Executive Director
// reads it for Directors, and is shown nothing at all about a Guide or an
// Explorer. Each rank watches the rank below and no further down, which is the
// same shape the security audit room already has.
//
// THIRTY DAYS. Rows older than that are deleted, and the pruning happens
// whenever this is opened or anything new is shared, so there is no scheduled
// job to forget about and discover was never running.

const ROLE_WORD: Record<string, string> = {
  dm: 'Guide',
  ds: 'Explorer',
  admin: 'Director',
  executive: 'Executive Director',
};

function when(iso: string) {
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export function LiveLibraryRecord({ audience }: { audience: 'admin' | 'executive' }) {
  const [rows, setRows] = useState<live.LibraryActivity[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [asking, setAsking] = useState('');
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try { setRows(await live.listLibraryActivity()); setError(''); }
    catch (cause) { setRows([]); setError(humanError(cause, 'Could not load the library record.')); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const setBlock = async (personId: string, blocked: boolean, why?: string) => {
    setBusy(personId);
    setError('');
    try {
      await live.setLibraryBlock(personId, blocked, why);
      setAsking('');
      setReason('');
      await load();
    } catch (cause) {
      setError(humanError(cause, 'That could not be changed.'));
    } finally {
      setBusy('');
    }
  };

  const watching = audience === 'executive' ? 'Directors' : 'Guides and Explorers';

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">📚 Library record</h2>
      <p className="mt-1 text-sm text-gray-500">
        Every resource added and every one shared by the {watching} of your church, newest first.
        Nothing from a conversation appears here.
      </p>
      <p className="mt-2 rounded-xl bg-sky-50 p-3 text-sm text-slate-700 ring-1 ring-sky-100">
        <strong>Kept for 30 days, then deleted.</strong> This is a record for answering
        what happened recently, not an archive. If something here needs to last longer than
        a month, raise a safeguarding report about it, because those are never deleted.
      </p>

      {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">{error}</p>}

      {rows === null ? (
        <BeaconSpinner inline label="Reading the record" className="mt-4" />
      ) : rows.length === 0 ? (
        <p className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
          Nothing shared in the last 30 days.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl bg-gray-50 p-4">
              <p className="text-sm font-bold text-navy">
                {r.actor_name}{' '}
                <span className="font-normal text-gray-500">· {ROLE_WORD[r.actor_role] ?? r.actor_role}</span>
                {r.blocked && (
                  <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">
                    Blocked
                  </span>
                )}
              </p>
              <p className="mt-1 break-words text-sm text-gray-700">
                {r.action === 'added' ? 'Added' : 'Shared'} <strong>{r.title}</strong>
                {r.with_name && <> with {r.with_name}</>}
              </p>
              {/* The address, as plain text rather than a link. A Director
                  checking whether something is appropriate should decide to
                  open it, not open it by brushing the screen with a thumb. */}
              {r.address && (
                <p className="mt-1 break-all text-xs text-gray-500">{r.address}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">{when(r.occurred_at)}</p>

              {r.actor_id && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {r.blocked ? (
                    <Button variant="ghost" disabled={busy === r.actor_id}
                            onClick={() => void setBlock(r.actor_id!, false)}>
                      Let them share again
                    </Button>
                  ) : asking === r.actor_id ? (
                    <div className="w-full rounded-xl bg-red-50 p-3 ring-1 ring-red-200">
                      <p className="text-sm font-semibold text-red-900">
                        Stop {r.actor_name} sharing anything in the library?
                      </p>
                      <p className="mt-1 text-sm text-red-900/80">
                        They keep their account and their conversation. They can be let
                        back in at any time.
                      </p>
                      <input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Why, in a few words"
                        aria-label="Why they are being blocked"
                        className="tap mt-2 w-full rounded-xl bg-white px-3 text-base outline-none ring-1 ring-red-200 focus:ring-2 focus:ring-gold"
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button variant="danger" disabled={busy === r.actor_id}
                                onClick={() => void setBlock(r.actor_id!, true, reason)}>
                          Block
                        </Button>
                        <Button variant="ghost" onClick={() => { setAsking(''); setReason(''); }}>
                          Keep it as it is
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="danger" disabled={busy === r.actor_id}
                            onClick={() => setAsking(r.actor_id!)}>
                      Block from sharing
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
