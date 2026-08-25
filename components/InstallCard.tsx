'use client';

// Installing the app, as something you can go and find.
//
// WHY THE AUTOMATIC PROMPT IS NOT ENOUGH, and this is not belt-and-braces.
//
//   * Chrome fires `beforeinstallprompt` only once its own engagement
//     heuristics are satisfied — a certain amount of time on the site, a
//     certain number of visits. On a phone handed round at a demo, that is
//     usually never.
//   * Firefox does not fire it at all, on any platform.
//   * Safari has never had it, on Mac or on iPhone.
//   * And once anybody presses "Later", the prompt is quiet for days.
//
// So the floating card is a nudge for the people who happen to qualify, and
// this is the answer for everybody else: a permanent entry in Settings that
// works on every device, and says exactly what to press on the one you are
// holding.
//
// It hides itself when the app is already installed. An install button inside
// an installed app is the clearest possible sign that nobody tested it.

import { useEffect, useState } from 'react';
import { Button, Card } from '@/components/ui';
import {
  inAppBrowser,
  iosShareLocation,
  isInstallable,
  isIos,
  isMacSafari,
  isStandalone,
} from '@/components/InstallPrompt';

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Platform = 'auto' | 'ios' | 'mac' | 'other';

export function InstallCard() {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [wrongHost, setWrongHost] = useState(false);
  const [steps, setSteps] = useState(false);
  const [inApp, setInApp] = useState('');
  const [shareWhere, setShareWhere] = useState('at the bottom of Safari');

  useEffect(() => {
    if (isStandalone()) { setInstalled(true); return; }
    if (!isInstallable()) { setWrongHost(true); return; }

    setPlatform(isIos() ? 'ios' : isMacSafari() ? 'mac' : 'other');
    setInApp(inAppBrowser());
    setShareWhere(iosShareLocation());

    // Arrived from the header's Install chip, which on Apple is the only thing
    // it can do. Somebody who has just pressed a button labelled Install has
    // asked the question already; making them press "Show me how" to get an
    // answer is one refusal too many. Open the steps for them.
    try {
      if (window.location.hash === '#install') setSteps(true);
    } catch {}

    // If the browser offers a real install, take it — a one-tap install beats
    // any set of written instructions. This listener stays for the life of the
    // screen because Chrome can fire it at any point, not just on load.
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setPlatform('auto');
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <Card className="p-5">
        <h2 className="text-xl font-bold text-navy">📱 Hope Beacon is installed</h2>
        <p className="mt-1 text-sm text-gray-600">
          You are using the installed app on this device. It updates itself.
        </p>
      </Card>
    );
  }

  if (wrongHost) {
    // Deliberately quiet about it. Every deployment gets its own permanent
    // address, and a copy installed from one of those can never receive an
    // update — so the install is withheld rather than offered and regretted.
    return (
      <Card className="p-5">
        <h2 className="text-xl font-bold text-navy">📱 Install Hope Beacon</h2>
        <p className="mt-1 text-sm text-gray-600">
          Open the church&rsquo;s main address first. This one is a preview, and an
          app installed from a preview can never receive an update.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">📱 Install Hope Beacon</h2>
      <p className="mt-1 text-sm text-gray-600">
        Put it on your home screen and it opens like any other app — its own
        icon, no address bar, and it keeps working without a signal.
      </p>

      {inApp ? (
        // NOTHING ELSE ON THIS CARD IS TRUE INSIDE AN APP'S OWN BROWSER. On
        // iOS only Safari can add to the home screen, so every other set of
        // steps here sends the reader looking for a control that is not there
        // — the reported bug, from a link shared in Messenger.
        <div className="mt-4 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <p className="font-semibold text-amber-900">
            You are in {inApp}&rsquo;s built-in browser
          </p>
          <p className="mt-1 text-sm text-amber-900">
            It cannot install apps — only Safari can. Open this page in Safari
            first and the option appears.
          </p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-amber-900">
            <li>Tap the <strong>•••</strong> menu, usually top right.</li>
            <li>Choose <strong>Open in Safari</strong>, or <strong>Open in browser</strong>.</li>
            <li>In Safari, tap <strong>Share</strong> {shareWhere.replace(/^at /, '')}, then <strong>Add to Home Screen</strong>.</li>
          </ol>
        </div>
      ) : deferred ? (
        <Button
          variant="gold"
          className="mt-4"
          onClick={async () => {
            await deferred.prompt();
            const { outcome } = await deferred.userChoice;
            if (outcome === 'accepted') setInstalled(true);
            setDeferred(null);
          }}
        >
          Install now
        </Button>
      ) : (
        <>
          <Button variant="ghost" className="mt-4" onClick={() => setSteps((v) => !v)}>
            {steps ? 'Hide the steps' : 'Show me how'}
          </Button>
          {steps && <Steps platform={platform ?? 'other'} />}
        </>
      )}
    </Card>
  );
}

/**
 * What to press, on the device in your hand.
 *
 * Written out per platform rather than as one vague "use your browser's menu",
 * because the menu is in a different place with a different name in every one
 * of them, and a non-technical person told to "find the install option" simply
 * does not find it.
 */
function Steps({ platform }: { platform: Platform }) {
  if (platform === 'ios') {
    return (
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-gray-700">
        <li>Tap the <strong>Share</strong> button — the square with an arrow coming out of it, {iosShareLocation()}.</li>
        <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
        <li>Tap <strong>Add</strong>, top right.</li>
        <li className="text-gray-500">It must be Safari. Chrome on an iPhone cannot install apps.</li>
      </ol>
    );
  }
  if (platform === 'mac') {
    return (
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-gray-700">
        <li>In Safari&rsquo;s menu bar, choose <strong>File</strong>.</li>
        <li>Choose <strong>Add to Dock</strong>.</li>
        <li>Give it a name and press <strong>Add</strong>.</li>
      </ol>
    );
  }
  return (
    <div className="mt-3 space-y-3 text-sm text-gray-700">
      <div>
        <p className="font-semibold text-navy">Android — Chrome</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>Tap the <strong>⋮</strong> menu, top right.</li>
          <li>Tap <strong>Add to Home screen</strong> or <strong>Install app</strong>.</li>
        </ol>
      </div>
      <div>
        <p className="font-semibold text-navy">Windows or Mac — Chrome or Edge</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>Look for the <strong>install icon</strong> at the right-hand end of the address bar — a screen with a downward arrow.</li>
          <li>If it is not there, open the <strong>⋮</strong> menu and choose <strong>Install Hope Beacon</strong> (sometimes under <em>Cast, save and share</em>, or <em>Apps</em>).</li>
        </ol>
      </div>
      <p className="text-gray-500">
        Firefox cannot install web apps on a computer. Use Chrome, Edge or Safari
        for that; on Android, Firefox can add it to the home screen from its menu.
      </p>
    </div>
  );
}
