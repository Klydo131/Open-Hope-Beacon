'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useDemo, QUEST_KEY } from '@/lib/demo/store';
import { NAVY, GOLD } from '@/lib/brand';
import {
  QUEST_EVENTS,
  completeByEvent,
  currentStepIndex,
  questProgress,
  stepsFor,
  tasksIn,
} from '@/lib/quest';

// The follow-the-arrow tutorial overlay.
//
// The hard problem here is not drawing a spotlight, it is never standing in
// front of the thing you are pointing at. Earlier versions tried to guess a
// free side — put the panel at the top when the target sits low, at the bottom
// when it sits high — and then flipped if it detected an overlap. That guessing
// cannot work: on a phone the panel is often taller than the space either side
// of the target, so "the side with more room" is still not enough room, the
// flip lands on the same side, and the panel covers the control. A tester
// then cannot tap the very thing the arrow is pointing at.
//
// So the geometry is inverted. The panel has ONE fixed home at the bottom, its
// height is measured, and the target is scrolled into the clear band that is
// left between the header and the panel. Overlap is not detected and corrected;
// it is made impossible. The panel also collapses to a single line, which is
// both an escape hatch for the user and what keeps the band usable on a short
// screen.

// Progress is stored per track. Without that, finishing the missionary walk
// marked the admin walk complete too — same key, same ids for 'done' — and a
// director who switched personas was told they had already been taught a job
// they had never seen.
function keyFor(track: string): string {
  return `${QUEST_KEY}-${track}`;
}

function load(track: string): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(keyFor(track));
    if (raw) return JSON.parse(raw).completed ?? [];
  } catch {}
  return [];
}

function isVisible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

// Is this element pinned to the viewport? A target inside a sticky header or a
// fixed bar does not move when the page scrolls, so trying to scroll it into a
// clear band is not just useless — the drift check then sees it "above" the
// header on every tick and scrolls again, forever, dragging the spotlight off
// the thing it is meant to be pointing at.
function isPinned(el: Element): boolean {
  let node: Element | null = el;
  while (node && node !== document.body) {
    const pos = getComputedStyle(node).position;
    if (pos === 'sticky' || pos === 'fixed') return true;
    node = node.parentElement;
  }
  return false;
}

// Where the page's own sticky header ends, so we never scroll a target under it.
function headerBottom(): number {
  const h = document.querySelector('header');
  if (!h) return 12;
  const r = h.getBoundingClientRect();
  return r.top <= 1 ? r.bottom + 12 : 12;
}

export function Quest() {
  const { endTutorial, tutorialTrack } = useDemo();
  // Which walk this is. The store decides it when the tutorial starts, from the
  // role the person chose; everything below reads it and nothing else changes.
  const steps = stepsFor(tutorialTrack);
  const router = useRouter();
  const pathname = usePathname();
  const [completed, setCompleted] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [manual, setManual] = useState<null | 'open' | 'shut'>(null);
  const [hydrated, setHydrated] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [below, setBelow] = useState(false);
  // The wording for whichever fallback we landed on, or null when we are
  // pointing at the step's real target.
  const [altHint, setAltHint] = useState<string | null>(null);
  // Where the panel sits for this target. Scrolling alone cannot guarantee
  // clearance: a short page simply cannot scroll far enough to lift a wide card
  // out of the panel's corner, and the scroll then silently does nothing. So
  // the panel moves too — and when neither edge has room it shrinks to a bar.
  const [place, setPlace] = useState<'bottom' | 'top' | 'mini'>('bottom');
  const placedFor = useRef<string>('');
  const panelRef = useRef<HTMLElement | null>(null);
  // The target is on this screen but scrolled out of sight. Drawing a ring at
  // coordinates nobody can see is how the tutorial ended up saying "tap the
  // highlighted button" with no highlight anywhere: the button was real, it was
  // just above the fold. Remembered here so the panel can offer to go there.
  const [offScreen, setOffScreen] = useState<'above' | 'below' | null>(null);
  const targetEl = useRef<Element | null>(null);
  const expandedH = useRef<number>(0);

  useEffect(() => {
    setCompleted(load(tutorialTrack));
    setHydrated(true);
  }, [tutorialTrack]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(keyFor(tutorialTrack), JSON.stringify({ completed }));
    } catch {}
  }, [completed, hydrated, tutorialTrack]);

  // Tick steps off when the app announces an action.
  //
  // Subscribed to every event any walk uses, and `steps` decides which ones mean
  // anything here. An admin sending a message does not tick a missionary step,
  // because the missionary's steps are not in this array.
  useEffect(() => {
    const handlers = QUEST_EVENTS.map((type) => {
      const fn = () => setCompleted((c) => completeByEvent(steps, c, type));
      window.addEventListener(type, fn);
      return [type, fn] as const;
    });
    return () => handlers.forEach(([t, fn]) => window.removeEventListener(t, fn));
  }, [steps]);

  const idx = currentStepIndex(steps, completed);
  const step = idx === -1 ? null : steps[idx];
  const { done, total } = questProgress(steps, completed);

  useEffect(() => {
    if (!step || !step.target || dismissed) {
      setRect(null);
      // Must be cleared here too. The closing card points at nothing, so a
      // leftover value from the previous step left it offering "It's above
      // here. Show me" on a step where there was nothing to show.
      setOffScreen(null);
      targetEl.current = null;
      return;
    }

    const find = (name: string) => {
      const el = document.querySelector(`[data-quest="${name}"]`);
      return el && isVisible(el) ? el : null;
    };

    // Can the page actually move that way, or is it already against the end?
    //
    // This guards the deadlock that made the tutorial show no highlight at all.
    // Both placement branches below scroll and then return, on the reasoning
    // that the next tick should measure the settled position. When the page is
    // already at its limit the scroll does nothing, the next tick computes the
    // same request, and it returns again. Forever. The ring is drawn from the
    // measurement that never got taken, so the panel kept saying "tap the
    // highlighted button" while nothing on screen was ever highlighted.
    //
    // Asking first means a page that cannot move is not a reason to give up on
    // pointing at the thing. We point at it where it actually is.
    const canScroll = (delta: number) => {
      const max =
        document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const y = window.scrollY;
      return delta > 0 ? y < max - 1 : y > 1;
    };

    const measure = () => {
      // Prefer the real control, then walk back one hop at a time: the tab that
      // reveals it, then the seeker card that opens the room at all.
      let el = find(step.target);
      let hint: string | null = null;
      let key = step.target;
      if (!el) {
        for (const fb of step.fallbacks ?? []) {
          const cand = find(fb.target);
          if (cand) {
            el = cand;
            hint = fb.hint;
            key = fb.target;
            break;
          }
        }
      }
      setAltHint(hint);

      targetEl.current = el;

      if (!el) {
        setRect(null); // not on this screen; the panel says where to go
        setOffScreen(null);
        return;
      }

      const pinned = isPinned(el);
      const top = headerBottom();
      const vh = window.innerHeight;
      const pnl = panelRef.current?.getBoundingClientRect();
      if (pnl && place !== 'mini') expandedH.current = pnl.height;
      // Bounded, for two reasons that compound into a latch.
      //
      // The height is only re-measured while the panel is expanded, so once it
      // shrinks to a title bar the large old measurement is what keeps getting
      // reserved, which keeps it shrunk. Adding the teaching text made the panel
      // tall enough to trigger that, and it never recovered: every step showed
      // as a bare title with the explanation hidden behind a toggle nobody was
      // told about. Capping it means a wordy step cannot reserve most of the
      // screen, and the body scrolls instead.
      const hExp = Math.min(expandedH.current || 220, vh * 0.45);

      let r = el.getBoundingClientRect();

      // Only the panel's own column matters. On a wide screen the panel is a
      // card in the bottom-right, so a target entirely to its left never
      // conflicts and needs no vertical reservation at all.
      const sameColumn = !pnl || (r.left < pnl.right && r.right > pnl.left);
      const reserve = sameColumn ? hExp + 12 : 12;
      const bandBottom = vh - reserve;
      const band = bandBottom - top;

      // Try to place the target inside the clear band, once per target. Keyed
      // on the step AND which element, so revealing a tab re-places the control
      // that just appeared.
      const placeKey = `${step.id}:${key}`;
      if (!pinned && placedFor.current !== placeKey && band > 40) {
        placedFor.current = placeKey;
        const wantTop = r.height >= band ? top : top + (band - r.height) / 2;
        const delta = r.top - wantTop;
        if (Math.abs(delta) > 6 && canScroll(delta)) {
          window.scrollBy({ top: delta, behavior: 'smooth' });
          return; // re-measure next tick, once the scroll has landed
        }
      }

      r = el.getBoundingClientRect();

      // Is the thing we are pointing at actually visible right now?
      //
      // It can be perfectly real and still be nowhere near the screen, because
      // the person scrolled: reading back through a conversation puts the tab
      // bar well above the fold. The old code drew the ring at its true
      // coordinates regardless, so the panel said "tap the highlighted button"
      // and there was no highlight to be seen. That is the bug this answers.
      //
      // We do NOT scroll them back. Being dragged around by the app is worse
      // than not finding a button, and it was asked for explicitly: guide me,
      // do not drive me. The panel offers a way there instead.
      //
      // A pinned target is never off-screen. It rides the viewport, so it is on
      // screen by construction — but its rect sits *inside* the sticky header,
      // and `top` is measured just BELOW that header, so `r.bottom < top` is
      // true for every header control. That verdict suppressed the ring
      // entirely: the profile step said "tap the highlighted picture" with
      // nothing highlighted, on every attempt, which is the missing-highlight
      // the owner kept hitting. Excluding pinned targets is the whole fix.
      if (pinned) setOffScreen(null);
      else if (r.bottom < top + 4) setOffScreen('above');
      else if (r.top > vh - 4) setOffScreen('below');
      else setOffScreen(null);

      // Placement is not a one-shot. Other things move the page afterwards:
      // the chat scrolls itself to the newest message, a tab panel changes
      // height, and the target can drift back under the sticky header or under
      // the panel. Those are correctness failures, not user scroll preferences,
      // so they get corrected whenever they happen. Being scrolled clean off
      // the screen is excluded here, because that one IS a user preference.
      const drifted =
        !pinned &&
        r.bottom > top &&
        r.top < vh &&
        (r.top < top - 2 ||
        (sameColumn && place !== 'mini' && pnl && r.bottom > pnl.top && r.top < pnl.bottom));
      if (drifted && band > 40) {
        const wantTop = r.height >= band ? top : top + (band - r.height) / 2;
        const delta = r.top - wantTop;
        if (Math.abs(delta) > 8 && canScroll(delta)) {
          window.scrollBy({ top: delta, behavior: 'smooth' });
          return;
        }
      }

      // Decide the panel's home from where the target ACTUALLY ended up, which
      // may not be where we asked for it. Derived purely from the rect, so it
      // settles instead of oscillating.
      let next: 'bottom' | 'top' | 'mini';
      if (pinned) next = 'bottom';
      else if (!sameColumn) next = 'bottom';
      else if (r.bottom + 12 <= vh - hExp) next = 'bottom';
      else if (r.top - 12 >= top + hExp) next = 'top';
      else next = 'mini';
      setPlace(next);

      setRect(r);
      // Arrow above the target normally; below it when the target is tight
      // against the header and there is no room above.
      setBelow(pinned || r.top - top < 44);
    };

    measure();
    const interval = setInterval(measure, 350);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      clearInterval(interval);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [idx, dismissed, step, place]);

  const skip = useCallback(() => {
    if (step) setCompleted((c) => Array.from(new Set([...c, step.id])));
  }, [step]);

  // Going back.
  //
  // Progress is stored as a set of completed ids and the current step is simply
  // the first one not in it, which meant the tutorial only ever moved forwards:
  // skip something by accident and it was gone until you restarted the whole
  // walk. Stepping back un-completes the previous step, which is exactly what
  // "let me see that again" means.
  const back = useCallback(() => {
    const here = idx === -1 ? steps.length : idx;
    if (here <= 0) return;
    const prev = steps[here - 1];
    placedFor.current = ''; // re-place the spotlight for the step we return to
    setCompleted((c) => c.filter((id) => id !== prev.id));
  }, [idx, steps]);

  const canGoBack = (idx === -1 ? steps.length : idx) > 0;
  const finish = useCallback(() => endTutorial(), [endTutorial]);
  const replay = useCallback(() => {
    placedFor.current = '';
    setCompleted([]);
  }, []);

  if (!hydrated) return null;

  // `mini` is a default, not a cage: the user can force the full panel open, or
  // shut it entirely. Left alone, it opens unless there is genuinely no room.
  const open = manual === 'open' || (manual === null && place !== 'mini');

  // Are we already on the screen this step would send us to? `/dm/<id>` counts
  // as being on `/dm`, since the room is inside it.
  const onRoute = !!step?.route && !!pathname && pathname.startsWith(step.route);

  // Hidden: a small tab in the corner, deliberately NOT at bottom-centre where
  // the page's own actions sit.
  if (dismissed) {
    return (
      <button
        onClick={() => setDismissed(false)}
        className="safe-bottom fixed bottom-4 right-4 z-[60] rounded-full px-4 py-2 text-xs font-bold shadow-lg"
        style={{ backgroundColor: GOLD, color: NAVY }}
      >
        ✦ Resume tutorial {done < total ? `· ${done}/${total}` : ''}
      </button>
    );
  }

  const arrowX = rect
    ? Math.min(Math.max(rect.left + rect.width / 2, 26), window.innerWidth - 26)
    : 0;

  return (
    <>
      {rect && step && !offScreen && (
        <div className="pointer-events-none fixed inset-0 z-[55]" aria-hidden>
          <div
            className="absolute rounded-xl"
            style={{
              left: rect.left - 6,
              top: rect.top - 6,
              width: rect.width + 12,
              height: rect.height + 12,
              boxShadow: `0 0 0 3px ${GOLD}, 0 0 0 9999px rgba(30,42,74,0.45)`,
              transition: 'all .18s ease',
            }}
          />
          <div
            className="absolute -translate-x-1/2 text-3xl"
            style={{
              left: arrowX,
              top: below ? rect.bottom + 8 : rect.top - 40,
              color: GOLD,
              filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.5))',
              animation: 'beaconBob 1s ease-in-out infinite',
            }}
          >
            {below ? '▲' : '▼'}
          </div>
        </div>
      )}

      <aside
        ref={panelRef}
        /* THE BOTTOM VARIANT ENDS AT THE BOTTOM OF THE GLASS, which on a
           phone is where the home indicator is drawn. Its Next button sat
           underneath it, and the swipe gesture wins over a tap there, so the
           tutorial could not be advanced from that step at all. Padding rather
           than margin, because this one is meant to reach the edge; only its
           CONTENT has to clear the indicator. Nothing changes on a Mac, where
           the inset is zero. */
        className={`fixed z-[60] mx-auto w-full max-w-md bg-white p-3 shadow-2xl ring-1 ring-black/10 sm:inset-x-auto sm:right-4 sm:w-96 sm:rounded-2xl sm:p-4 ${
          place === 'top'
            ? 'inset-x-0 top-0 rounded-b-2xl sm:top-4'
            : 'inset-x-0 bottom-0 rounded-t-2xl pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:bottom-4 sm:pb-4'
        }`}
        role="dialog"
        aria-label="Beacon tutorial"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-extrabold text-navy">
            ✦ Tutorial{' '}
            <span className="font-semibold text-gray-400">
              {done}/{total}
            </span>
          </span>
          {/* Shrunk to a bar, the instruction still has to be readable — a bar
              that only says "Tutorial" would be worse than no bar. */}
          {!open && step ? (
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-navy">
              {step.title}
            </span>
          ) : (
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-1.5 rounded-full transition-all"
                style={{ width: `${(done / total) * 100}%`, backgroundColor: GOLD }}
              />
            </div>
          )}
          {/* Back and Skip survive the collapse.
              Shrunk to a bar, the panel used to show a title and nothing else,
              so on any screen where the target fit neither above nor below it
              there was no way to move at all: no forward, no back, no controls.
              Whether the tutorial can be navigated must not depend on how much
              room the layout happened to leave. */}
          {!open && step && (
            <>
              <button
                onClick={back}
                disabled={!canGoBack}
                aria-label="Previous step"
                className="compact-ui grid h-8 shrink-0 place-items-center rounded-lg bg-gray-100 px-2 text-xs font-bold text-gray-600 disabled:opacity-40"
              >
                ←
              </button>
              <button
                onClick={step.id === 'done' ? finish : skip}
                aria-label={step.id === 'done' ? 'Finish tutorial' : 'Skip this step'}
                className="compact-ui grid h-8 shrink-0 place-items-center rounded-lg bg-gray-100 px-2 text-xs font-bold text-gray-600"
              >
                {step.id === 'done' ? '✓' : '→'}
              </button>
            </>
          )}
          <button
            onClick={() => setManual(open ? 'shut' : 'open')}
            aria-label={open ? 'Shrink tutorial' : 'Show tutorial step'}
            aria-expanded={open}
            className="compact-ui grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gray-100 text-sm"
          >
            {open ? '▾' : '▴'}
          </button>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Hide tutorial"
            className="compact-ui grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gray-100 text-base"
          >
            ×
          </button>
        </div>

        {/* Capped and scrollable, so what the panel SAYS can never decide
            whether the panel fits. Adding the "what this is" text made it tall
            enough that the placement logic shrank it to a title bar, hiding the
            explanation that was the entire point of adding it. Height is a
            layout concern; it must not depend on how much there is to teach. */}
        {open && (
          <div className="mt-2 max-h-[34vh] overflow-y-auto [max-height:34dvh] sm:max-h-[40vh] sm:[max-height:40dvh]">
            {step ? (
              <>
                {/* Where this happens, before what to do about it. Pointing at
                    a glowing button teaches nobody where anything lives; the
                    arrow disappears and so does the knowledge. Naming the
                    screen is what makes the tutorial worth taking twice. */}
                {step.where && (
                  <p className="mb-1 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-gray-400">
                    <span aria-hidden>📍</span>
                    <span className="min-w-0 truncate">{step.where}</span>
                  </p>
                )}
                <p className="font-bold text-navy">{step.title}</p>
                <p className="mt-0.5 text-sm leading-snug text-gray-600">
                  {altHint ?? step.hint}
                </p>
                {/* The part a colleague would have had to tell them: what the
                    feature is for, and who can see it. Instructions get someone
                    through the step; this is what they still know afterwards. */}
                {step.learn && (
                  <div
                    className="mt-2 rounded-lg border-l-4 bg-gray-50 px-3 py-2"
                    style={{ borderColor: GOLD }}
                  >
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
                      What this is
                    </p>
                    <p className="mt-0.5 text-sm leading-snug text-gray-600">
                      {step.learn}
                    </p>
                  </div>
                )}
                {/* The target is on another screen. Saying so and stopping is a
                    dead end — it leaves the person to work out the navigation
                    themselves, which is the opposite of being guided. Take them
                    there instead. */}
                {/* Only offer to navigate somewhere we are NOT. Offering "Go to
                    My Seekers" while standing on My Seekers gave a button that
                    did nothing when tapped, which reads as broken. */}
                {step.target && !rect && step.route && !onRoute && (
                  <button
                    onClick={() => router.push(step.route!)}
                    className="compact-ui mt-2 flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-bold text-white"
                    style={{ backgroundColor: NAVY }}
                  >
                    <span>{step.routeLabel ?? 'Take me there'}</span>
                    <span aria-hidden>→</span>
                  </button>
                )}
                {step.target && !rect && (!step.route || onRoute) && (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    Scroll down to your Explorers and open one to carry on.
                  </p>
                )}
                {/* On this screen, but scrolled out of sight. Without this the
                    panel says "tap the highlighted button" and there is no
                    highlight anywhere, because it is above or below the fold.
                    Offered as a button rather than done automatically: yanking
                    the page around while someone is reading is the thing that
                    made the tutorial feel like it was driving them. */}
                {offScreen && (
                  <button
                    onClick={() => {
                      targetEl.current?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                      });
                    }}
                    className="compact-ui mt-2 flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-bold"
                    style={{ backgroundColor: GOLD, color: NAVY }}
                  >
                    <span>
                      It&rsquo;s {offScreen === 'above' ? 'above' : 'below'} here.
                      Show me
                    </span>
                    <span aria-hidden>{offScreen === 'above' ? '↑' : '↓'}</span>
                  </button>
                )}
                <div className="mt-2 flex gap-2">
                  {/* Back was missing entirely. Progress is a set of completed
                      ids and the current step is the first one not in it, so
                      the walk only ever moved forwards: skip something by
                      mistake and it was unreachable until you restarted from
                      the beginning. */}
                  <button
                    onClick={back}
                    disabled={!canGoBack}
                    aria-label="Previous step"
                    className="compact-ui rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-600 disabled:opacity-40"
                  >
                    ← Back
                  </button>
                  {step.id === 'done' ? (
                    <button
                      onClick={finish}
                      aria-label="Finish tutorial"
                      className="compact-ui rounded-lg px-4 py-2 text-sm font-bold text-white"
                      style={{ backgroundColor: NAVY }}
                    >
                      Finish ✓
                    </button>
                  ) : (
                    <button
                      onClick={skip}
                      // A stable accessible name, so the visible label can be
                      // reworded without silently breaking screen readers.
                      aria-label="Skip this step"
                      className="compact-ui rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-600"
                    >
                      Skip →
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="font-bold text-navy">Tutorial complete 🎉</p>
                <p className="mt-0.5 text-sm text-gray-600">
                  You’ve learned the heart of Beacon. Keep exploring, or begin for
                  real.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={replay}
                    className="compact-ui rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-600"
                  >
                    Replay
                  </button>
                  <button
                    onClick={finish}
                    className="compact-ui rounded-lg px-4 py-2 text-sm font-bold text-white"
                    style={{ backgroundColor: NAVY }}
                  >
                    Done
                  </button>
                </div>
              </>
            )}

            {/* Desktop only: there is room for the recap there, and on a phone
                it was the thing that made this panel tall enough to bury the
                control it points at. */}
            <ol className="mt-2 hidden space-y-0.5 sm:block">
              {tasksIn(steps).map((s) => {
                const isDone = completed.includes(s.id);
                const isCurrent = step?.id === s.id;
                return (
                  <li
                    key={s.id}
                    className={`flex items-center gap-2 text-sm ${
                      isDone ? 'text-gray-400 line-through' : 'text-navy'
                    } ${isCurrent ? 'font-bold' : ''}`}
                  >
                    <span style={{ color: isDone ? '#7FB03A' : GOLD }}>
                      {isDone ? '✓' : isCurrent ? '▸' : '○'}
                    </span>
                    {s.title}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </aside>
    </>
  );
}
