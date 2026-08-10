'use client';

import { useEffect, useRef, useState } from 'react';
import { useDemo } from '@/lib/demo/store';
import { NAVY } from '@/lib/brand';
import { emitQuest } from '@/lib/quest';
import { Button } from './ui';

// Private 1:1 thread scoped to a single pairing. In the demo, messages live in
// the store; in production this is the `messages` table with Realtime and RLS
// that only lets the two participants read or write.
export function Chat({ pairingId }: { pairingId: string }) {
  const { db, userId, sendMessage, markMessagesRead } = useDemo();
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const thread = db.messages
    .filter((m) => m.pairing_id === pairingId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread.length]);

  // Reading the thread is what marks it read — on open, and again whenever a
  // message lands while it is on screen. markMessagesRead is a no-op when
  // there is nothing unread, so this does not loop.
  useEffect(() => {
    markMessagesRead(pairingId);
  }, [pairingId, thread.length, markMessagesRead]);

  const nameOf = (id: string) =>
    db.profiles.find((p) => p.id === id)?.full_name ?? 'Unknown';

  return (
    <div className="flex h-[26rem] flex-col rounded-2xl bg-white ring-1 ring-black/5">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {thread.length === 0 && (
          <p className="mt-8 text-center text-gray-400">
            No messages yet. Say hello.
          </p>
        )}
        {thread.map((m) => {
          const mine = m.sender_id === userId;
          return (
            <div
              key={m.id}
              className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
            >
              <div
                className="max-w-[80%] rounded-2xl px-4 py-2 text-lg"
                style={
                  mine
                    ? { backgroundColor: NAVY, color: '#fff' }
                    : { backgroundColor: '#EEF1F7', color: '#1a2233' }
                }
              >
                {m.body}
              </div>
              <span className="mt-1 px-1 text-xs text-gray-400">
                {mine ? 'You' : nameOf(m.sender_id)} ·{' '}
                {new Date(m.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form
        // The tutorial says "type in the highlighted box and send", so the
        // highlight has to cover the box as well as the button — it used to
        // ring only Send, which pointed at the wrong half of the instruction.
        data-quest="chat-send"
        className="flex gap-2 border-t border-black/5 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          sendMessage(pairingId, text);
          emitQuest('beacon:message');
          setText('');
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          className="tap w-full min-w-0 flex-1 rounded-xl bg-gray-100 px-4 text-lg outline-none focus:ring-2 focus:ring-gold"
          aria-label="Message"
        />
        <span className="shrink-0">
          <Button type="submit" disabled={!text.trim()} className="px-4 sm:px-5">
            Send
          </Button>
        </span>
      </form>
    </div>
  );
}
