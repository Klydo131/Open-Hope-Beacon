'use client';

// The box you write a message in.
//
// WHAT WAS WRONG. It was an `<input>`. A single line, 4000 characters allowed
// into it, and no way to see more than about forty of them at once. Somebody
// writing a real message — the kind people actually send their Guide, several
// sentences about something difficult — could see only the fragment under the
// cursor, and the text scrolled sideways as they typed. It was reported as "I
// can't see the whole message, and I can't scroll up or down", and the second
// half of that sentence is the diagnosis: there is no up or down in a one-line
// input. Nothing was broken, and nothing could have been scrolled.
//
// WHAT IT IS NOW. A textarea that grows as you write, up to a cap, and scrolls
// inside itself after that. It starts exactly one line tall, so a short reply
// looks and feels the way it always did.
//
// WHY THE CAP. Left to grow freely, a long message pushes the Send button off
// the bottom of a phone — replacing "I can't see what I wrote" with "I can't
// send it", which is worse. Growing to at most 40% of the window keeps both the
// text and the button on screen.
//
// THE ENTER KEY, which is the part worth being careful about:
//
//   On a phone or tablet, Return always makes a new line. The Send button is
//   right there and visible, and a keyboard whose Return key fires off a
//   half-written message is how people send half a thought to their pastor.
//
//   On a desktop, Enter sends and Shift+Enter makes a new line, which is what
//   every chat application has trained people to expect.
//
// The two are told apart by `pointer: coarse` — a touch device — and not by
// screen width. A small window on a laptop is still a laptop, and a tablet with
// a keyboard case still has a touchscreen.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Grow to at most this share of the window, so Send is never pushed off. */
const MAX_SHARE = 0.4;

export function MessageBox({
  value,
  onChange,
  onSend,
  placeholder = 'Write a message',
  maxLength = 4000,
  ariaLabel = 'Message',
  className = '',
}: {
  value: string;
  onChange: (next: string) => void;
  /** Called when Enter should send. The form's own submit still works too. */
  onSend?: () => void;
  placeholder?: string;
  maxLength?: number;
  ariaLabel?: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [touch, setTouch] = useState(false);

  useEffect(() => {
    // In an effect, not at render: matchMedia does not exist on the server, and
    // reading it during render would make the first paint differ from the
    // markup Next.js sent.
    setTouch(
      typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(pointer: coarse)').matches,
    );
  }, []);

  // Re-measure on every change. `height: auto` first, or scrollHeight only ever
  // reports the height it already has and the box can grow but never shrink.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const cap = Math.max(120, Math.round(window.innerHeight * MAX_SHARE));
    const next = Math.min(el.scrollHeight, cap);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > cap ? 'auto' : 'hidden';
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      maxLength={maxLength}
      placeholder={placeholder}
      aria-label={ariaLabel}
      // `resize-none` because the box sizes itself; a drag handle that fights
      // the measurement above just looks broken.
      className={`tap min-w-0 flex-1 resize-none rounded-xl bg-gray-100 px-4 py-4 text-base leading-snug outline-none focus:ring-2 focus:ring-gold ${className}`}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return;
        if (touch) return;              // phones and tablets: Return = new line
        if (event.shiftKey) return;     // desktop: Shift+Enter = new line
        event.preventDefault();
        if (!value.trim()) return;
        if (onSend) { onSend(); return; }
        // Submit the form this box sits in, so the page's own onSubmit runs and
        // there is only one send path. requestSubmit() also honours validation;
        // the click fallback is for engines too old to have it (Safari < 16).
        const form = event.currentTarget.form;
        if (!form) return;
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
      }}
    />
  );
}
