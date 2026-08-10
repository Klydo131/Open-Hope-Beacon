'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Card, Button } from '@/components/ui';
import { useLocale, LANGUAGES } from '@/lib/i18n';
import { useDemo } from '@/lib/demo/store';
import { useNotificationPrefs } from '@/lib/notification-prefs';
import { useUpdateState, checkForUpdate, versionLabel, hardRefresh, BUILD_TIME } from '@/lib/app-update';
import { remindersOn, setRemindersOn } from '@/lib/update-prefs';
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
  const { state, checkedAt, apply } = useUpdateState();
  const [checking, setChecking] = useState(false);
  // Read after mount: localStorage does not exist while this renders on the
  // server, and guessing would flip the switch under the person on first paint.
  const [remind, setRemind] = useState(true);
  useEffect(() => setRemind(remindersOn()), []);

  const label =
    state === 'required'
      ? 'This version is out of date'
      : state === 'ready'
        ? 'A new version is ready'
        : state === 'unsupported'
          ? 'Updates run when the app is installed'
          : "You're on the latest version";

  const tone =
    state === 'required'
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
        Beacon updates itself. You never need to uninstall and reinstall.
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
          {state === 'required'
            ? '⚠️'
            : state === 'ready'
              ? '✨'
              : state === 'unsupported'
                ? 'ℹ️'
                : '✓'}{' '}
          {label}
        </p>
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
          {(state === 'ready' || state === 'required') && apply ? (
            <Button variant="gold" onClick={apply}>
              {state === 'required' ? 'Update now' : 'Restart to update'}
            </Button>
          ) : (
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
          )}
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

      {/* On by default. Off is a real choice, so the hint says plainly what it
          costs rather than pretending the switch is free. */}
      <div className="mt-3">
        <SettingsToggle
          label="Remind me about updates"
          hint={
            remind
              ? 'A reminder appears at the top of the screen when a new version is out. "×" puts it away and it comes back later.'
              : 'Off. Beacon will not tell you when a new version is out, so check this screen now and then.'
          }
          checked={remind}
          onChange={(v) => {
            setRemind(v);
            setRemindersOn(v);
          }}
        />
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
