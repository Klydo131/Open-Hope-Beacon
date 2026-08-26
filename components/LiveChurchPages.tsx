'use client';

// The last two screens that still fell through to the placeholder.
//
// /church and /mail were written against the in-browser store, so on a live
// deployment both showed AppShell's grey "This live screen is being connected"
// card. That card was the single most-reported thing in this app, and every
// report was the same underlying fault: a page with no live version.
//
// /mail needed more than a port. In the tutorial it is a SIMULATED mailbox —
// "what Beacon would send you" — which is a teaching device and means nothing
// on a real deployment, where mail goes to real inboxes. Its honest live
// counterpart is the outbox: who has been invited, who has not arrived, and the
// link to hand over when the email did not make it.

import { useCallback, useEffect, useState } from 'react';
import { copyText } from '@/lib/share';
import { Button, Card } from '@/components/ui';
import { roleNoun } from '@/lib/brand';
import * as live from '@/lib/live/data';
import { useLiveSession } from '@/lib/live/session';
import { LiveChurchOverview, LiveBoardReport } from '@/components/LiveExecutive';
import { LiveBillboard } from '@/components/LiveBillboard';

const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : 'Something went wrong. Please try again.';

const ago = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
};

export function LiveChurchPage() {
  const { profile } = useLiveSession();
  const [churchName, setChurchName] = useState<string>();

  useEffect(() => {
    live.myChurch().then((c) => setChurchName(c?.name ?? undefined)).catch(() => {});
  }, []);


  if (!profile) return <p className="text-gray-500">Loading…</p>;
  const leads = profile.role === 'admin' || profile.role === 'executive';

  return (
    <div className="space-y-6">
      {/* THE BOARD, not a heading and two numbers. Masthead, anything waiting
          for a Director, and the church's own notices. */}
      <LiveBillboard churchName={churchName} />
      <LiveChurchOverview />
      {/* The board report is numbers only, and it names nobody — so it is safe
          for every role to see, not just leadership. A Guide who can see what
          their church reports upward is a Guide who trusts the reporting. */}
      {leads && <LiveBoardReport churchName={churchName} />}
    </div>
  );
}

export function LiveMailPage() {
  const { profile } = useLiveSession();
  const [invites, setInvites] = useState<live.OpenInvite[] | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  // Copying can genuinely fail: Safari rejects when the document is not
  // focused, and navigator.clipboard is undefined over plain http. Silence
  // reads as a broken button, so say so and point at the box they can select.
  const [copyFailed, setCopyFailed] = useState(false);
  const [busy, setBusy] = useState('');
  // Set when a resend could not be emailed and must be passed on by hand.
  const [handLink, setHandLink] = useState<{ to: string; url: string; why: string; wait?: number } | null>(null);
  const [sentTo, setSentTo] = useState('');
  const [confirmCancel, setConfirmCancel] = useState('');
  const [cancelled, setCancelled] = useState('');

  const load = useCallback(async () => {
    try { setInvites(await live.listInvites()); setError(''); }
    catch (cause) { setError(message(cause)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // RESEND, WITHOUT RETYPING ANYTHING.
  //
  // The function has handled a repeat invitation since v6 — pressing Invite
  // again on somebody who has not joined refreshes their link and sends it. But
  // the only way to reach that was to type the person's name, address and role
  // into the Director's form a second time, from memory, exactly right. The
  // capability existed and the button did not, which from the outside is
  // indistinguishable from the capability not existing.
  //
  // Everything it needs is already on the row, so nothing is retyped.
  const resend = async (invite: live.OpenInvite) => {
    setBusy(invite.id);
    setError('');
    setSentTo('');
    setHandLink(null);
    try {
      const result = await live.inviteMember({
        email: invite.email,
        role: invite.role,
        fullName: invite.full_name ?? '',
      });
      if (result.delivery === 'link' && result.link) {
        setHandLink({ to: invite.email, url: result.link, why: result.mailNote ?? '', wait: result.waitSeconds });
      } else {
        setSentTo(invite.email);
      }
      await load();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy('');
    }
  };

  const cancel = async (invite: live.OpenInvite) => {
    setBusy(invite.id);
    setError('');
    setSentTo('');
    setHandLink(null);
    try {
      await live.cancelInvite(invite.id);
      setCancelled(invite.email);
      setConfirmCancel('');
      await load();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy('');
    }
  };

  if (!profile) return <p className="text-gray-500">Loading…</p>;

  const leads = profile.role === 'admin' || profile.role === 'executive';
  if (!leads) {
    return (
      <Card className="p-6">
        <h1 className="text-2xl font-extrabold text-navy">Mail</h1>
        <p className="mt-2 text-gray-600">
          Hope Beacon sends real email. Invitations and password resets go to
          your own inbox, not to a page inside the app. There is nothing for you
          to read here.
        </p>
      </Card>
    );
  }

  // Split on whether they FINISHED SIGNING UP — chose a password of their own.
  //
  // Two earlier answers were wrong here, in the same direction. redeemed_at is
  // stamped when the account row is created, which is the moment Send is
  // pressed. last_sign_in_at is stamped when the link is opened, which the
  // Director does on their own device to check it works. Both filed people
  // under Accepted who had never touched anything — and left them with no
  // Re-send button, because the screen believed there was nothing left to do.
  const waiting = (invites ?? []).filter((i) => !i.joined_at);
  const joined = (invites ?? []).filter((i) => i.joined_at);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-room">Invitations</h1>
        <p className="text-room-soft">
          Everyone this church has invited, and who is still on the doorstep.
        </p>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-red-700 ring-1 ring-red-200">{error}</p>
      )}

      {cancelled && (
        <p className="rounded-xl bg-gray-100 px-4 py-3 text-gray-700 ring-1 ring-gray-300">
          Invitation to {cancelled} withdrawn. That address can be invited again.
        </p>
      )}

      {sentTo && (
        <p className="rounded-xl bg-green-50 px-4 py-3 font-semibold text-green-800 ring-1 ring-green-300">
          ✓ Invitation link re-sent to {sentTo}.
        </p>
      )}

      {handLink && (
        // A church with no working mail provider is a normal state and must not
        // be a dead end: the account and the link are real, only the postman is
        // missing, so the Director becomes the postman.
        <div className={`rounded-2xl p-4 ring-1 ${
          handLink.wait ? 'bg-blue-50 ring-blue-300' : 'bg-amber-50 ring-amber-300'
        }`}>
          {/* A cooldown is not a fault. See LiveCorePages for the reasoning. */}
          <p className={`font-bold ${handLink.wait ? 'text-blue-900' : 'text-amber-900'}`}>
            {handLink.wait
              ? `Nearly there. Wait ${handLink.wait} seconds, then press Re-send once`
              : `Send this link to ${handLink.to} yourself`}
          </p>
          <p className={`mt-1 text-sm ${handLink.wait ? 'text-blue-800' : 'text-amber-800'}`}>
            {handLink.why || 'No email service is set up on this project yet.'}
          </p>
          <p className={`mt-1 text-sm ${handLink.wait ? 'text-blue-800' : 'text-amber-800'}`}>
            This link works, and can be used once.
          </p>
          {/* Said plainly because the obvious thing to do with a link you have
              been handed is to click it, and clicking this one uses up somebody
              else's invitation and signs you out of your own account. */}
          <p className="mt-1 text-sm font-semibold text-amber-900">
            Do not open it yourself. Send it to {handLink.to}. It only works
            once, and opening it here would sign you out and start their
            sign-up on your device.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={handLink.url}
              onFocus={(e) => e.currentTarget.select()}
              className={`tap min-w-0 flex-1 rounded-xl bg-white px-3 text-sm ring-1 ${
                handLink.wait ? 'ring-blue-300' : 'ring-amber-300'
              }`}
            />
            {/* Only says Copied when it copied. The old version discarded the
                promise, so a Safari rejection was an unhandled rejection nobody
                saw and the person got no clipboard and no message. */}
            <Button
              variant="ghost"
              onClick={async () => {
                const done = await copyText(handLink.url);
                setCopied(done ? 'hand' : '');
                if (!done) setCopyFailed(true);
              }}
            >
              {copied === 'hand' ? '✓ Copied' : 'Copy link'}
            </Button>
            <Button variant="ghost" onClick={() => setHandLink(null)}>Done</Button>
          </div>
          {copyFailed && (
            // A dead-end message would be worse than the silence it replaces,
            // so it names the way out: the link is already in a box that
            // selects itself when tapped.
            <p className="mt-2 text-sm text-amber-800">
              This browser would not let the app copy for you. Tap the box above
              to select the link, then copy it yourself.
            </p>
          )}
        </div>
      )}

      <Card className="p-5">
        <h2 className="text-xl font-bold text-navy">
          Waiting to accept {invites && <span className="text-gray-400">· {waiting.length}</span>}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Everybody here still needs to set a password of their own. An
          invitation that failed to send looks exactly like one somebody has not
          got round to, so if a person says they never got theirs, press
          <strong> Re-send</strong>. It mints a fresh link and posts it again,
          with nothing to retype.
        </p>
        {/* SAY THE COST OF THE BUTTON NEXT TO THE BUTTON.
            A person may hold only one live invitation, so re-sending switches
            off the link already in their inbox. That is correct -- an old link
            outliving its replacement would be a way in nobody could revoke --
            but every invitation email looks identical, so somebody pressed
            three times, sent the recipient to the oldest of the three, and
            watched it fail as "expired". Nothing here said that would happen. */}
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <strong>Press it once.</strong> Each re-send switches off the link
          already in that person&rsquo;s inbox, so only the newest email will
          work. If they are unsure which to open, tell them to use the most
          recent one.
        </p>

        {!invites ? (
          <p className="mt-4 text-gray-400">Loading…</p>
        ) : waiting.length === 0 ? (
          <p className="mt-4 text-gray-500">Nobody is waiting. Everyone invited has joined.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {waiting.map((i) => {
              const expired = new Date(i.expires_at).getTime() < Date.now();
              return (
                <li key={i.id} className="rounded-xl bg-gray-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-navy">{i.full_name || i.email}</p>
                      <p className="truncate text-sm text-gray-600">{i.email}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {roleNoun(i.role)} · invited {ago(i.created_at)}
                        {expired && <span className="ml-1 font-semibold text-red-600">· link expired</span>}
                        {/* Sending an invitation creates the person's account
                            before the message goes, so ALMOST every row here
                            has one — which is why "has an account" is not shown
                            as a badge. Its absence is the useful half: no
                            account means the send never got that far, so no
                            message can have arrived, however it looked. */}
                        {!i.has_account && (
                          <span className="ml-1 font-semibold text-amber-700">· never sent</span>
                        )}
                        {/* The link was used, and the sign-up was not finished.
                            Most often that is the Director opening it to check
                            it works — which uses the link up, so this row needs
                            a fresh one rather than a reminder. */}
                        {i.opened_at && (
                          <span className="ml-1 text-gray-500">· link opened, no password set yet</span>
                        )}
                      </p>
                    </div>
                    <span className="flex shrink-0 flex-wrap gap-2">
                      <Button variant="gold" disabled={busy === i.id} onClick={() => resend(i)}>
                        {busy === i.id ? 'Sending…' : 'Re-send'}
                      </Button>
                      {/* An invitation sent to the wrong address, or with the
                          wrong role, used to be permanent — and because one
                          open invitation per address is enforced, that slip
                          also blocked the corrected one. Two taps, because
                          deleting the wrong row loses a real invitation. */}
                      <Button
                        variant="ghost"
                        disabled={busy === i.id}
                        onClick={() => setConfirmCancel(confirmCancel === i.id ? '' : i.id)}
                      >
                        {confirmCancel === i.id ? 'Keep it' : 'Cancel'}
                      </Button>
                      {confirmCancel === i.id && (
                        <Button variant="ghost" disabled={busy === i.id} onClick={() => cancel(i)}>
                          Really cancel
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          // Was setCopied() unconditionally, so it said Copied
                          // even when the write had failed.
                          const done = await copyText(i.email);
                          if (done) setCopied(i.id);
                          else setCopyFailed(true);
                        }}
                      >
                        {copied === i.id ? 'Copied' : 'Copy address'}
                      </Button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-xl font-bold text-navy">
          Accepted {invites && <span className="text-gray-400">· {joined.length}</span>}
        </h2>
        {!invites ? (
          <p className="mt-4 text-gray-400">Loading…</p>
        ) : joined.length === 0 ? (
          <p className="mt-4 text-gray-500">Nobody has accepted an invitation yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {joined.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 px-4 py-3">
                <span className="min-w-0">
                  <span className="block font-semibold text-navy">{i.full_name || i.email}</span>
                  <span className="block truncate text-sm text-gray-600">{i.email}</span>
                </span>
                <span className="text-sm text-green-700">✓ joined {ago(i.joined_at!)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
