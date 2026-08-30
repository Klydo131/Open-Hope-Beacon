'use client';

import { useCallback, useEffect, useState } from 'react';
import * as live from '@/lib/live/data';
import { roleNoun } from '@/lib/brand';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { Button, Card } from '@/components/ui';
import { humanError } from '@/lib/live/errors';

const EVENT_ICON: Record<live.SecurityAuditEvent['event_type'], string> = {
  profile_change: '📝',
  identity_change: '🪪',
  safeguarding_report: '🚩',
  account_suspended: '⛔',
  account_restored: '✅',
  account_removed: '🗑️',
  approval_changed: '🔎',
};

const SEVERITY: Record<live.SecurityAuditEvent['severity'], { label: string; className: string }> = {
  info: { label: 'Recorded', className: 'bg-sky-100 text-sky-900' },
  review: { label: 'Review', className: 'bg-amber-100 text-amber-900' },
  urgent: { label: 'Urgent', className: 'bg-red-100 text-red-900' },
};

function when(iso: string) {
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * The audit feed deliberately contains event summaries, never conversation
 * text, attachment names, e-mail addresses, or changed profile values.
 */
export function LiveSecurityAudit() {
  const [events, setEvents] = useState<live.SecurityAuditEvent[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      setEvents(await live.securityAuditFeed());
    } catch (cause) {
      setEvents([]);
      setError(humanError(cause, 'Could not load the security audit.'));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const needsReview = (events ?? []).filter((event) => event.severity !== 'info').length;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy">🔐 Security audit room</h2>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            A leadership-issued invitation is the account gate. This room records
            profile changes, safeguarding reports, and account actions—not private
            conversations or files.
          </p>
        </div>
        <Button variant="ghost" onClick={() => void load()}>Refresh</Button>
      </div>

        <p className="mt-3 break-words rounded-xl bg-navy/5 px-3 py-2 text-sm text-navy">
        Directors review Guide and Explorer events. Executive Directors also
        review Director events. Executive Director accounts are not shown here.
      </p>

      {error && (
        <p className="mt-3 break-words rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">{error}</p>
      )}

      {events === null ? (
        <BeaconSpinner inline label="Loading the audit" className="mt-4" />
      ) : events.length === 0 ? (
        <p className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
          No account activity has been recorded yet.
        </p>
      ) : (
        <>
          {needsReview > 0 && (
            <p className="mt-4 text-sm font-semibold text-amber-900">
              {needsReview} event{needsReview === 1 ? '' : 's'} need review.
            </p>
          )}
          <ul className="mt-3 space-y-2">
            {events.map((event) => {
              const severity = SEVERITY[event.severity];
              return (
                <li key={event.id} className="rounded-xl bg-gray-50 p-4 ring-1 ring-black/5">
                  <div className="flex flex-wrap items-start gap-2">
                    <span aria-hidden className="text-lg">{EVENT_ICON[event.event_type]}</span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold text-navy">
                        {event.subject_name}
                        <span className="ml-2 font-normal text-gray-500">{roleNoun(event.subject_role)}</span>
                      </p>
                      <p className="mt-0.5 break-words text-sm text-gray-700">{event.summary}</p>
                      <p className="mt-1 break-words text-xs text-gray-500">
                        Recorded by {event.actor_label} · {when(event.occurred_at)}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${severity.className}`}>
                      {severity.label}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
