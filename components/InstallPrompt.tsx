'use client';

import { onCanonicalHost } from '@/lib/canonical';
import { useDemo } from '@/lib/demo/store';
import { useEffect, useState } from 'react';
import { HopeBeaconMark } from '@/components/HopeBeaconMark';

// -------------------------------------------------------------------------
// "Install Hope Beacon".
//
// The old version was a thin bar at the bottom of the screen with a small
// button, and on a desktop monitor that is the easiest thing in the world to
// miss — it reads as a cookie notice, which everybody has trained themselves
// to ignore. On a Mac it never appeared at all: Safari does not fire
// `beforeinstallprompt`, and the code only handled iPhones and iPads.
//
// Now:
//  • Desktop gets a real card in the corner — icon, what installing gets you,
//    and a full-size button. It is hard to mistake for chrome.
//  • macOS Safari gets the "Add to Dock" steps; iOS gets "Add to Home Screen".
//  • Dismiss is a SNOOZE, not a tombstone. Seven days later it asks once more.
//    The old version wrote a permanent flag, so one stray tap meant the person
//    was never offered the install again on that device.
// -------------------------------------------------------------------------

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const SNOOZE_KEY = 'beacon-install-snoozed-until';
const SNOOZE_DAYS = 7;

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// Only the app's home address may be installed.
//
// Hosts give every deployment its own permanent URL, production builds
// included, and a different hostname is a different app to the browser: its own
// icon, its own service worker, its own storage. Installing from one of those
// pins the person to that single build forever, because no later deploy can ever
// reach that origin. Somebody with Beacon already installed opened a deployment
// address, was offered the install again, accepted, and ended up with two
// identical icons, one of them frozen.
//
// The first version of this checked the environment LABEL for 'preview', which
// missed the case entirely: a per-deployment URL of a production build reports
// 'production', because that is what it is. Only the hostname settles it.
//
// This is the whole protection now, and it is deliberately silent. A banner
// across the front door announcing that the address is wrong reads to a visitor
// like a security warning about the site itself, which is worse than the problem
// it describes. Simply not offering the install prevents the frozen copy from
// ever existing; Settings explains the situation to anyone who goes looking.
function isInstallable(): boolean {
  return onCanonicalHost();
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS 13+ reports itself as a Mac; the touch points give it away.
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  );
}

function isMacSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return (
    /Macintosh/.test(ua) &&
    /Safari/.test(ua) &&
    !/Chrome|Chromium|Edg\//.test(ua) &&
    navigator.maxTouchPoints <= 1
  );
}

function isDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(min-width: 768px)').matches;
}

function snoozed(): boolean {
  try {
    const until = Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
    return Date.now() < until;
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  // Out of the way while the tutorial runs. Both live in the bottom-right
  // corner, so the card lands on top of the step panel at exactly the moment
  // someone is being asked to follow instructions.
  const { tutorialActive } = useDemo();
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [show, setShow] = useState(false);
  const [manual, setManual] = useState<'ios' | 'mac' | null>(null);
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (!isInstallable()) return; // a preview must never become a second icon
    if (snoozed()) return;

    setDesktop(isDesktop());

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    const onInstalled = () => {
      setShow(false);
      setDeferred(null);
    };
    window.addEventListener('appinstalled', onInstalled);

    // Safari — desktop or mobile — never fires beforeinstallprompt, so the
    // only honest thing to do is show the steps. A short delay keeps it from
    // landing on top of the page before it has finished painting.
    let t: ReturnType<typeof setTimeout>;
    if (isIos()) {
      t = setTimeout(() => {
        setManual('ios');
        setShow(true);
      }, 1200);
    } else if (isMacSafari()) {
      t = setTimeout(() => {
        setManual('mac');
        setShow(true);
      }, 1200);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      clearTimeout(t);
    };
  }, []);

  // Separate from the snooze on purpose. Snooze means "not right now"; this
  // means "you are wrong, I already have it", and asking again in a week would
  // be the app arguing with someone about their own machine. It is also the
  // honest answer to the confusing case: the browser only knows about installs
  // on THIS address, so a copy installed from a preview link is invisible to it
  // and it offers the install again in good faith.
  const alreadyHave = () => {
    setShow(false);
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + 3650 * 24 * 60 * 60 * 1000));
    } catch {}
  };

  const snooze = () => {
    setShow(false);
    try {
      localStorage.setItem(
        SNOOZE_KEY,
        String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000),
      );
    } catch {}
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    setShow(false);
    // "Not now" in the browser's own dialog is still a no — respect it for a
    // week rather than asking again on the next page load.
    if (outcome === 'dismissed') snooze();
  };

  if (!show || tutorialActive) return null;

  const steps =
    manual === 'mac'
      ? ['Open the Share menu in Safari’s toolbar', 'Choose “Add to Dock”']
      : ['Tap Share at the bottom of Safari', 'Choose “Add to Home Screen”'];

  // Desktop: a proper card, bottom-right, impossible to read as a cookie bar.
  if (desktop) {
    return (
      <div className="no-print fixed bottom-4 right-4 z-[55] w-[22rem] max-w-[calc(100vw-2rem)]">
        <div className="animate-drop overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10">
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{ backgroundColor: '#1E2A4A' }}
          >
            <HopeBeaconMark size={40} />
            <div className="min-w-0 flex-1">
              <p className="font-extrabold text-white">Install Hope Beacon</p>
              <p className="text-xs text-white/60">
                {manual ? 'Two steps, no app store' : 'One click, no app store'}
              </p>
            </div>
            <button
              onClick={snooze}
              aria-label="Not now"
              className="tap-sm shrink-0 rounded-lg px-2 text-lg text-white/60 hover:text-white"
            >
              ×
            </button>
          </div>

          <div className="space-y-3 p-4">
            <ul className="space-y-1.5 text-sm text-gray-600">
              <li className="flex gap-2">
                <span aria-hidden>⚡</span> Opens in its own window, no tabs
              </li>
              <li className="flex gap-2">
                <span aria-hidden>📶</span> Keeps working without a signal
              </li>
              <li className="flex gap-2">
                <span aria-hidden>🔔</span> Alerts on your desktop
              </li>
            </ul>

            {manual ? (
              <ol className="space-y-1.5 rounded-xl bg-gray-50 p-3 text-sm text-navy">
                {steps.map((s, i) => (
                  <li key={s} className="flex gap-2">
                    <span
                      className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: '#1E2A4A' }}
                    >
                      {i + 1}
                    </span>
                    {s}
                  </li>
                ))}
              </ol>
            ) : (
              <button
                onClick={install}
                className="tap w-full rounded-xl text-base font-bold text-white"
                style={{ backgroundColor: '#1E2A4A' }}
              >
                Install Hope Beacon
              </button>
            )}
            <button
              onClick={alreadyHave}
              className="w-full rounded-xl py-2 text-sm font-semibold text-gray-400 hover:text-gray-600"
            >
              I already have Beacon installed
            </button>
            <p className="text-xs leading-snug text-gray-400">
              Seeing this when you already have the icon usually means that icon
              came from a preview link, which is a separate app. Settings shows
              which one you are in.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Phone / tablet: the compact bar, which is right for a small screen.
  return (
    <div className="no-print fixed inset-x-0 bottom-0 z-[55] flex justify-center p-3">
      <div className="animate-drop flex w-full max-w-md items-center gap-3 rounded-2xl bg-white p-3 shadow-2xl ring-1 ring-black/10">
        <HopeBeaconMark size={40} />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-navy">Install Hope Beacon</p>
          {manual ? (
            <p className="text-sm text-gray-500">
              Tap Share, then “{manual === 'mac' ? 'Add to Dock' : 'Add to Home Screen'}”.
            </p>
          ) : (
            <p className="text-sm text-gray-500">
              Add it to your device. No app store needed.
            </p>
          )}
        </div>
        {!manual && (
          <button
            onClick={install}
            className="tap shrink-0 rounded-xl px-4 text-base font-bold text-white"
            style={{ backgroundColor: '#1E2A4A' }}
          >
            Install
          </button>
        )}
        <button
          onClick={snooze}
          aria-label="Not now"
          className="tap shrink-0 rounded-xl bg-gray-100 px-3 text-lg text-gray-500"
        >
          ×
        </button>
      </div>
    </div>
  );
}
