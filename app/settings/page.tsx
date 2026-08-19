'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { InstallCard } from '@/components/InstallCard';
import { SourceCard } from '@/components/SourceCard';
import { LiveAppShell } from '@/components/LiveAppShell';
import { LiveSettingsPage } from '@/components/LiveAccountPages';
import { useIsLive } from '@/lib/tutorial';
import { Card, Button } from '@/components/ui';
import { useLocale, LANGUAGES } from '@/lib/i18n';
import { useDemo } from '@/lib/demo/store';
import { useNotificationPrefs } from '@/lib/notification-prefs';
import { useUpdateState, checkForUpdate, versionLabel, hardRefresh, BUILD_TIME, BUILD_ID } from '@/lib/app-update';
import { attemptsFor, MAX_ATTEMPTS, ATTEMPTS_KEY } from '@/lib/auto-update';
import { QuestPicker } from '@/components/QuestPicker';
import { TRACK_LABELS } from '@/lib/quest';
import { OnlineRow } from '@/components/OnlineStatus';
import { WhatsNewButton } from '@/components/WhatsNew';
import { WhichApp } from '@/components/WhichApp';
import { FeedbackButton } from '@/components/Feedback';
import { DataManager } from '@/components/DataManager';
import { pushSupported, permission as pushPermission, requestPermission, subscribeToPush, showLocalNotification } from '@/lib/push';
import type { Role } from '@/lib/types';

// Executives included.
//
// Every one of these lists omitted 'executive', so a church director could not
// open their own settings or their own profile: the shell bounced them to the
// login screen. Same fault as /admin, three routes deep, and invisible for the
// same reason — there was no executive persona to sign in as until now.
const ALL: Role[] = ['executive', 'admin', 'dm', 'ds'];

const SIZES: { key: 'small' | 'normal' | 'large' | 'xlarge'; scale: number }[] = [
  { key: 'small', scale: 0.9 },
  { key: 'normal', scale: 1 },
  { key: 'large', scale: 1.15 },
  { key: 'xlarge', scale: 1.3 },
];

export default function SettingsPage() {
  // Live settings are their own screen. The tutorial's version manages sample
  // data — export it, wipe it, restore it — and none of those are things a
  // church's real database should offer behind a settings tab.
  if (useIsLive()) {
    return (
      <LiveAppShell allow={ALL}>
        <LiveSettingsPage />
      </LiveAppShell>
    );
  }
  return (
    <AppShell allow={ALL}>
      <Body />
    </AppShell>
  );
}

// Admins can name / rename the church.
function ChurchNameCard() {
  const { db, setChurchName } = useDemo();
  const { t } = useLocale();
  const [name, setName] = useState(db.church_name);
  const [saved, setSaved] = useState(false);
  return (
    <Card className="p-5">
      <h2 className="mb-1 text-xl font-bold text-navy">⛪ {t('churchName')}</h2>
      <p className="mb-4 text-sm text-gray-500">
        Name or rename your church. Everyone in the app sees this name.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          placeholder="Your church name"
          className="tap flex-1 rounded-xl bg-gray-100 px-4 text-lg outline-none focus:ring-2 focus:ring-gold"
          aria-label="Church name"
        />
        <Button
          variant="gold"
          disabled={!name.trim()}
          onClick={() => {
            setChurchName(name);
            setSaved(true);
          }}
        >
          {t('save')}
        </Button>
      </div>
      {saved && <p className="mt-2 font-semibold text-green-600">✓ Saved</p>}
    </Card>
  );
}

// Replaying a tutorial has to be something you go and ask for.
//
// Finishing it must not trap you: nothing here touches your demo data, and the
// tutorial never restarts on its own — the only ways in are the front door and
// this card. There is now a walk per participant rather than one missionary
// walk for everybody, so the card asks WHICH before it starts anything. Picking
// somebody else's walk does sign you in as that sample account, and being moved
// without being told is exactly the surprise this card exists to avoid, so it
// says so before you tap.
function TutorialCard() {
  const { currentUser } = useDemo();
  const [picking, setPicking] = useState(false);
  const mine = currentUser?.role;
  return (
    // The anchor sits on a wrapper because Card takes no id. scroll-mt keeps the
    // heading clear of the sticky header when the sidebar link jumps here.
    <div id="tutorial" className="scroll-mt-24">
    <Card className="p-5">
      <h2 className="mb-1 text-xl font-bold text-navy">✦ Tutorial</h2>
      <p className="mb-4 text-sm text-gray-500">
        A guided walk through your own part of Beacon. There is one for each
        person in the church, and you can run any of them as many times as you
        like. It never changes your demo data.
      </p>

      {!picking ? (
        <>
          <Button variant="gold" onClick={() => setPicking(true)}>
            ✦ Start a tutorial
          </Button>
          {mine && (
            <p className="mt-2 text-sm text-gray-400">
              You are signed in as {TRACK_LABELS[mine]}. Starting a walk for a
              different person signs you in as that sample account, and you can
              switch back any time from the top-right menu.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mb-3 font-semibold text-navy">Which walk?</p>
          <QuestPicker onPicked={() => setPicking(false)} />
          <button
            onClick={() => setPicking(false)}
            className="tap mt-2 rounded-xl px-4 text-sm font-semibold text-gray-500"
          >
            Not now
          </button>
        </>
      )}
    </Card>
    </div>
  );
}

function NotificationCard() {
  const { prefs, update } = useNotificationPrefs();
  const [perm, setPerm] = useState<NotificationPermission>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  );

  const enableAlerts = async () => {
    const p = await requestPermission();
    setPerm(p);
    if (p === 'granted') {
      update({ push: true });
      await subscribeToPush();
      showLocalNotification('Alerts are on', 'Beacon will notify you here and on this device.');
    }
  };

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-xl font-bold text-navy">🔔 Notifications</h2>
      <p className="mb-4 text-sm text-gray-500">
        Choose what notifications you receive. These settings are saved on this
        device.
      </p>
      <div className="space-y-3">
        <SettingsToggle
          label="In-app notifications"
          hint="Show the badge count and notification feed in the bell."
          checked={prefs.inApp}
          onChange={(v) => update({ inApp: v })}
        />
        {pushSupported() && (
          <>
            {perm === 'granted' ? (
              <SettingsToggle
                label="Device alerts"
                hint="Show system notifications on your phone or desktop."
                checked={prefs.push}
                onChange={(v) => update({ push: v })}
              />
            ) : perm === 'denied' ? (
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-sm font-semibold text-gray-500">Device alerts</p>
                <p className="text-sm text-gray-400">
                  Blocked in your browser settings. Open your browser's site
                  settings to allow notifications for this app.
                </p>
              </div>
            ) : (
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="mb-2 text-sm font-semibold text-gray-500">Device alerts</p>
                <button
                  onClick={enableAlerts}
                  className="tap rounded-xl px-5 text-base font-semibold text-white"
                  style={{ backgroundColor: '#1E2A4A' }}
                >
                  Turn on device alerts
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function SettingsToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="compact-ui flex items-start justify-between gap-3 rounded-xl bg-gray-50 p-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-navy">{label}</p>
        <p className="text-sm text-gray-400">{hint}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? 'bg-green-500' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

// "Am I on the latest version?" — with an answer, a timestamp, and a button.
// Without this the auto-update is invisible, and an invisible update is one
// people don't trust, which is what sends them back to reinstalling.
function VersionCard() {
  // No `apply` here on purpose. Applying the update is the app's job now, not
  // the reader's — see components/AutoUpdate.
  const { state, checkedAt } = useUpdateState();
  const [checking, setChecking] = useState(false);

  // Did the app try to install a new version and fail?
  //
  // AutoUpdate gives up after a couple of reloads that land back on the same
  // build, because the alternative is a page that never stops reloading. When
  // that happens "A new version is installing" becomes a lie, and this screen
  // is the one place somebody comes to find out what is going on. Read after
  // mount: sessionStorage does not exist during the server render.
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    try {
      setStalled(attemptsFor(sessionStorage.getItem(ATTEMPTS_KEY), BUILD_ID) >= MAX_ATTEMPTS);
    } catch {
      setStalled(false);
    }
  }, [state]);

  const pending = state === 'ready' || state === 'required';
  const stuck = pending && stalled;

  const label = stuck
    ? 'A new version could not install'
    : state === 'required'
      ? 'This version is out of date'
      : state === 'ready'
        ? 'A new version is installing'
        : state === 'unsupported'
          ? 'Updates run when the app is installed'
          : "You're on the latest version";

  const tone = stuck
    ? '#B91C1C'
    : state === 'required'
      ? '#B91C1C'
      : state === 'ready'
        ? '#B45309'
        : state === 'unsupported'
          ? '#6B7280'
          : '#16A34A';

  return (
    <Card className="p-5">
      <div id="whats-new" className="scroll-mt-24" />
      <div id="feedback" className="scroll-mt-24" />
      <WhichApp />

      <h2 className="mb-1 mt-5 text-xl font-bold text-navy">🔄 App version</h2>
      <p className="mb-4 text-sm text-gray-500">
        Beacon updates itself. There is nothing to press, and you never need to
        uninstall and reinstall. A new version installs on its own, and waits
        until you are not in the middle of writing something.
      </p>

      <div className="mb-3 flex items-center justify-between rounded-xl bg-gray-50 p-4">
        <div>
          <p className="text-sm font-semibold text-navy">Connection</p>
          <p className="text-sm text-gray-400">
            Beacon keeps working offline. Your saved files and this device&rsquo;s
            data are always available.
          </p>
        </div>
        <OnlineRow />
      </div>

      <div className="rounded-xl bg-gray-50 p-4">
        <p className="font-bold" style={{ color: tone }}>
          {stuck
            ? '⚠️'
            : state === 'required'
              ? '⚠️'
              : state === 'ready'
                ? '✨'
                : state === 'unsupported'
                  ? 'ℹ️'
                  : '✓'}{' '}
          {label}
        </p>
        {stuck && (
          <p className="mt-1 text-sm text-gray-500">
            Beacon tried twice and came back on the same version, so it has
            stopped trying rather than keep restarting the screen on you. Press
            <strong> Force a fresh copy</strong> below. Nothing you have saved is
            touched.
          </p>
        )}
        <p className="mt-1 text-sm text-gray-500">
          Version <span className="font-mono">{versionLabel()}</span>
        </p>
        {checkedAt && (
          <p className="text-sm text-gray-400">
            Last checked {new Date(checkedAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {/* No "Restart" button. The app applies the update by itself as soon
              as doing so cannot interrupt anybody — see components/AutoUpdate.
              Offering a button here would put the decision back on the person,
              which is the thing that was removed. "Check for updates" stays,
              because "did it work?" is a fair question and this screen is where
              somebody comes to ask it. */}
          <button
            onClick={async () => {
              setChecking(true);
              await checkForUpdate();
              setChecking(false);
            }}
            disabled={checking || state === 'unsupported'}
            className="tap rounded-xl bg-white px-5 text-base font-semibold text-navy ring-1 ring-navy/20 disabled:opacity-40"
          >
            {checking ? 'Checking…' : 'Check for updates'}
          </button>
          <WhatsNewButton className="tap" />
          <FeedbackButton className="tap" />
          <button
            onClick={() => {
              if (
                window.confirm(
                  'Throw away this copy of the app and download it fresh?\n\nYour data stays. Saved files, sample data and settings are all kept.',
                )
              ) {
                void hardRefresh();
              }
            }}
            className="tap rounded-xl bg-white px-5 text-base font-semibold text-navy ring-1 ring-navy/20"
          >
            Force a fresh copy
          </button>
        </div>
        <p className="mt-2 text-sm text-gray-400">
          If this screen keeps showing an old date after a new release, the app is
          stuck on a cached copy. &ldquo;Force a fresh copy&rdquo; clears it. Your
          saved files and data are not touched.
        </p>
      </div>
    </Card>
  );
}

function Body() {
  const { t, lang, setLang, scale, setScale } = useLocale();
  const { currentUser } = useDemo();
  // Renaming the church was shared with the Church Board. With the board gone
  // as an account, this is an admin power rather than something that quietly
  // disappeared with the role.
  const canRename = currentUser?.role === 'admin';
  const canManageData = currentUser?.role === 'admin';

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold text-navy">⚙️ {t('settings')}</h1>

      {/* The same card the live app shows. Installing is a browser thing, not a
          database thing, so it belongs in both modes — and somebody trying the
          tutorial on a tablet is exactly the person who wants it on their home
          screen. */}
      <InstallCard />
      <SourceCard />

      {canRename && <ChurchNameCard />}

      {canManageData && <DataManager />}

      <TutorialCard />

      <NotificationCard />

      <VersionCard />

      {/* Language */}
      <Card className="p-5">
        <h2 className="mb-1 text-xl font-bold text-navy">🌐 {t('language')}</h2>
        <p className="mb-4 text-sm text-gray-500">
          Choose your language. More of the app is translated over time; anything
          not translated yet stays in English.
        </p>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          className="tap w-full rounded-xl bg-gray-100 px-4 text-lg outline-none focus:ring-2 focus:ring-gold"
          aria-label={t('language')}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.native} — {l.name}
            </option>
          ))}
        </select>
      </Card>

      {/* Text size */}
      <Card className="p-5">
        <h2 className="mb-1 text-xl font-bold text-navy">🔠 {t('textSize')}</h2>
        <p className="mb-4 text-sm text-gray-500">
          Make everything bigger or smaller. Changes apply right away.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SIZES.map((s) => (
            <button
              key={s.key}
              onClick={() => setScale(s.scale)}
              className="tap rounded-xl px-3 font-semibold"
              style={
                Math.abs(scale - s.scale) < 0.001
                  ? { backgroundColor: '#1E2A4A', color: '#fff' }
                  : { backgroundColor: '#EEF1F7', color: '#1E2A4A' }
              }
            >
              <span style={{ fontSize: `${0.9 + (s.scale - 0.9) * 1.2}rem` }}>A</span>{' '}
              {t(s.key)}
            </button>
          ))}
        </div>

        <div className="mt-5 rounded-xl bg-gray-50 p-4">
          <p className="mb-1 text-sm text-gray-400">Preview</p>
          <p className="text-lg text-navy">{t('appTagline')}</p>
        </div>
      </Card>
    </div>
  );
}
