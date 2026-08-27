// The icons a person has to press, drawn rather than typed.
//
// THE BUG, circled in a screenshot on an Android phone: the sign-out button in
// the header was an empty box. Not a wrong icon, not a missing image, a tofu
// box, which is what a font draws when it has no glyph for a character.
//
// The character was `⏻`, U+23FB POWER SYMBOL. It lives in the Miscellaneous
// Technical block, and that is the whole problem: it LOOKS like an emoji and is
// not one. Emoji get a guaranteed fallback, because every phone ships a colour
// emoji font covering the whole emoji set. A symbol from Miscellaneous
// Technical gets no such promise: it is drawn only if the text font happens to
// include it. Apple's system font does. Android's Noto Sans does not.
//
// So it rendered on the iPhone it was written on, on the Mac it was tested on,
// and on the reviewer's laptop, and it was a blank box for everybody on Android.
//
// THE SAME TRAP WAS SET IN SIX OTHER PLACES, all of them controls a person has
// to press to use the app rather than decoration: the media player's previous,
// next, play, pause and skip buttons, and the mailbox chevron. Every one is a
// character from Miscellaneous Technical or Geometric Shapes.
//
// An inline SVG has no font behind it. It draws the same on every device, at
// any size, in any colour, with no download and no fallback to hope for. For a
// control somebody must find and press, that is the only honest choice.
//
// EMOJI ARE STILL FINE and are used all over the app for decoration and for
// section markers. `🔔`, `⛪`, `📖` are covered by the emoji font on every
// platform. The rule is not "no characters"; it is "nothing from a symbol block
// that no font promises to carry".

interface GlyphProps {
  /** Matches the surrounding text size by default, like a character would. */
  size?: number;
  className?: string;
}

/** Shared: currentColor throughout, so it inherits like text. */
function Svg({ size = 20, className = '', children, label }: GlyphProps & {
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block shrink-0 ${className}`}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Sign out. The one that was a blank box on every Android phone. */
export function PowerGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M12 3v9" />
      <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
    </Svg>
  );
}

export function PlayGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M7 4.5v15l12-7.5z" fill="currentColor" strokeWidth={1.5} />
    </Svg>
  );
}

export function PauseGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M9 4.5v15M15 4.5v15" strokeWidth={3} />
    </Svg>
  );
}

export function PreviousGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M18 5.5v13L8.5 12z" fill="currentColor" strokeWidth={1.5} />
      <path d="M6 5v14" strokeWidth={2.5} />
    </Svg>
  );
}

export function NextGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M6 5.5v13L15.5 12z" fill="currentColor" strokeWidth={1.5} />
      <path d="M18 5v14" strokeWidth={2.5} />
    </Svg>
  );
}

/** Skip backwards. The number of seconds is drawn inside it. */
export function BackGlyph({ seconds = 10, ...props }: GlyphProps & { seconds?: number }) {
  return (
    <Svg {...props}>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4 3.5V8h4.5" />
      <text
        x="12" y="15.5" textAnchor="middle"
        fontSize="8" fontWeight="700" fill="currentColor" stroke="none"
      >
        {seconds}
      </text>
    </Svg>
  );
}

/** Skip forwards. */
export function ForwardGlyph({ seconds = 10, ...props }: GlyphProps & { seconds?: number }) {
  return (
    <Svg {...props}>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M20 3.5V8h-4.5" />
      <text
        x="12" y="15.5" textAnchor="middle"
        fontSize="8" fontWeight="700" fill="currentColor" stroke="none"
      >
        {seconds}
      </text>
    </Svg>
  );
}

export function CloseGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

/** Points down when a section is open, right when it is shut. */
export function ChevronGlyph({ open = false, ...props }: GlyphProps & { open?: boolean }) {
  return (
    <Svg {...props}>
      {open ? <path d="M6 9l6 6 6-6" /> : <path d="M9 6l6 6-6 6" />}
    </Svg>
  );
}

/** A phone or browser menu button, for install instructions that name one. */
export function MenuGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

/** The other menu button: three dots in a column. */
export function KebabGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none" />
    </Svg>
  );
}
