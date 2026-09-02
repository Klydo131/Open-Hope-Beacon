'use client';

import { NAVY } from '@/lib/brand';

// Small, dependency-free building blocks. Senior-friendly by default:
// big text, big tap targets, high contrast.

export function Card({
  children,
  className = '',
  id,
  'data-panel': dataPanel,
  'data-live-conversation': liveConversation,
}: {
  children: React.ReactNode;
  className?: string;
  /**
   * A link target.
   *
   * Declared for the reason the note below gives: a fixed prop list drops what
   * it does not name, so `<Card id="prayer">` compiled fine and put no id in
   * the DOM, and the link pointing at it landed at the top of the page. That is
   * the same failure the note already describes, found again.
   */
  id?: string;
  /**
   * A stable hook for a test that needs to read ONE card rather than guessing
   * which div on the page is the right one. Declared rather than spread,
   * because a fixed prop list silently drops anything it does not name — which
   * is exactly how five tutorial anchors once compiled fine and never reached
   * the DOM.
   */
  'data-panel'?: string;
  /**
   * The private conversation, which globals.css bounds to the height actually
   * left on the glass.
   *
   * DECLARED FOR THE THIRD TIME IN THIS FILE, for the third instance of the
   * same bug. A JSX attribute whose name contains a dash is exempt from excess
   * property checking, so `<Card data-live-conversation>` compiled, passed
   * review, was asserted on by a test that read the SOURCE, and never once
   * reached the DOM. Every rule written against that selector matched nothing,
   * which is why the conversation kept overflowing a phone while a check
   * called "live conversations fit phones and tablets" stayed green.
   */
  'data-live-conversation'?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl bg-white shadow-sm ring-1 ring-black/5 ${className}`}
      id={id}
      data-panel={dataPanel}
      data-live-conversation={liveConversation ? '' : undefined}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  disabled = false,
  className = '',
  // The tutorial's anchor, declared rather than spread.
  //
  // This component takes a fixed prop list, so `data-quest` written on a
  // <Button> was accepted by the compiler and then dropped on the floor: the
  // attribute never reached the DOM, the tutorial's spotlight had nothing to
  // find, and five steps across three walks pointed at buttons that — as far
  // as the page was concerned — carried no anchor at all. Naming it here makes
  // it a real prop that cannot silently evaporate again.
  'data-quest': dataQuest,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'gold' | 'danger';
  type?: 'button' | 'submit';
  disabled?: boolean;
  className?: string;
  'data-quest'?: string;
}) {
  const styles: Record<string, string> = {
    primary: 'text-white',
    gold: 'text-navy',
    ghost: 'bg-white text-navy ring-1 ring-navy/20',
    // DELIBERATELY THE SMALLEST AND THE ONLY RED ONE.
    //
    // Disconnecting two people, or removing somebody from the church, is a
    // thing a Director should be able to do and should almost never want to.
    // It used to be a plain `ghost` button: the same size and the same weight
    // as everything else on the row, which is how a screen tells you an action
    // is ordinary. The reported version was worse still — it looked LARGER
    // than the text beside it, so the most destructive control on the page was
    // also the most inviting.
    //
    // Smaller and red, on white rather than filled: red on white reads as a
    // warning, and a filled red block reads as a call to action. Nothing else
    // in the app is red, so the colour means exactly one thing.
    danger: 'bg-white text-red-700 ring-1 ring-red-300 hover:bg-red-50',
  };
  const bg =
    variant === 'primary' ? NAVY : variant === 'gold' ? '#E8B84B' : undefined;
  // A destructive button is smaller than an ordinary one: 44px against 56, and
  // the text a size down. Still comfortably above the 44px minimum for a touch
  // target — discouraged is not the same as hard to press.
  const size = variant === 'danger'
    ? 'tap-sm px-4 text-sm font-bold'
    : 'tap px-5 text-lg font-semibold';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-quest={dataQuest}
      data-danger={variant === 'danger' ? '' : undefined}
      style={bg ? { backgroundColor: bg } : undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-xl transition active:scale-[0.98] disabled:opacity-40 ${size} ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Avatar({
  name,
  size = 48,
  photo,
  avatar,
  onDark = false,
}: {
  name: string;
  size?: number;
  photo?: string;
  avatar?: string;
  /** The fallback circle is navy, which vanishes against the navy header. */
  onDark?: boolean;
}) {
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={photo}
        alt={name}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        backgroundColor: onDark ? 'rgba(255,255,255,0.16)' : NAVY,
        fontSize: size / 2.4,
      }}
      aria-hidden
    >
      {avatar ? <span>{avatar}</span> : initials}
    </div>
  );
}

export function Badge({
  children,
  color = NAVY,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold text-white"
      style={{ backgroundColor: color }}
    >
      {children}
    </span>
  );
}

// The tab strip. Kept here (rather than in the seeker room) because the demo
// and live rooms both use it and must not drift apart.
//
// On a phone the tabs share the width evenly, icon above label, so all of them
// are visible at once. They used to be a row that scrolled sideways, which
// hides whatever does not fit — and a tab you have to go looking for is a tab
// most people never open. From `sm` up there is room for a normal row.
//
// `badge` puts a count on a tab so a missionary can see there is something
// waiting without opening it.
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string; icon?: string; badge?: number }[];
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div
      role="tablist"
      className="no-print grid gap-1 sm:flex sm:flex-wrap"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={on}
            // Lets the tutorial point at a tab when the control it really wants
            // is behind that tab and therefore not yet in the DOM.
            data-quest={`tab-${t.key}`}
            onClick={() => onChange(t.key)}
            className={`tap relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-semibold transition sm:flex-row sm:gap-2 sm:px-4 sm:text-base ${
              on ? 'text-white' : 'bg-gray-100 text-navy/70 hover:bg-gray-200'
            }`}
            style={on ? { backgroundColor: NAVY } : undefined}
          >
            {t.icon && (
              <span aria-hidden className="text-base sm:text-inherit">
                {t.icon}
              </span>
            )}
            <span className="max-w-full truncate">{t.label}</span>
            {!!t.badge && (
              <span
                className="absolute right-1 top-1 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-bold text-navy sm:static sm:h-6 sm:min-w-6 sm:px-1.5 sm:text-xs"
                style={{ backgroundColor: '#E8B84B' }}
              >
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-navy/15 p-8 text-center">
      <p className="text-lg font-semibold text-navy">{title}</p>
      {hint && <p className="mt-1 text-gray-500">{hint}</p>}
    </div>
  );
}
