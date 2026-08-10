'use client';

import { useRouter } from 'next/navigation';
import { useDemo } from '@/lib/demo/store';
import { QuestPicker } from '@/components/QuestPicker';
import { FeedbackButton } from '@/components/Feedback';
import { NAVY, ROLE_LABELS } from '@/lib/brand';
import { Button, Card } from '@/components/ui';
import { useLocale } from '@/lib/i18n';
import type { Role } from '@/lib/types';
import { HopeBeaconMark } from '@/components/HopeBeaconMark';

// The front door. Explains Hope Beacon in a glance, then offers three doors: take the
// guided tutorial, sign in locally, or (if already signed in) continue.
export default function Home() {
  const { currentUser } = useDemo();

  // The hero button scrolls to the chooser rather than starting a walk. Which
  // walk is the first thing this page has to establish, and guessing it is what
  // put every church director into a missionary's job.
  const openPicker = () => {
    document
      .getElementById('tutorial-picker')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const { t } = useLocale();
  const router = useRouter();


  const HOME: Record<Role, string> = {
    executive: '/admin',
    admin: '/admin',
    dm: '/dm',
    ds: '/ds',
  };

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <header
        className="px-4 pb-14 pt-12 text-center text-white"
        style={{ backgroundColor: NAVY }}
      >
        <div className="mx-auto max-w-2xl">
          <HopeBeaconMark size={92} className="mx-auto" />
          <h1 className="mt-5 text-5xl font-extrabold tracking-tight">Hope Beacon</h1>
          <p className="mt-3 text-xl text-white/80">{t('appTagline')}</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button variant="gold" onClick={openPicker} className="px-7 text-xl">
              ✦ {t('takeTutorial')}
            </Button>
            {currentUser ? (
              <Button
                variant="ghost"
                className="px-7 text-xl"
                onClick={() => router.push(HOME[currentUser.role])}
              >
                Continue as {currentUser.full_name.split(' ')[0]} →
              </Button>
            ) : (
              <Button
                variant="ghost"
                className="px-7 text-xl"
                onClick={() => router.push('/login')}
              >
                {t('signIn')}
              </Button>
            )}
          </div>
          <p className="mt-4 text-sm text-white/50">
            No download. Works on phone and computer. Your data stays on your
            device.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-10 px-4 py-12">
        {/* The six-stage ladder used to be spelled out here, coloured chip by
            coloured chip. The client circled it and asked for it to be hidden
            from seekers, and this page is the one place that cannot be done
            selectively: it is unauthenticated, so there is nobody to check.
            Removing it removes it for admins and missionaries too, who see the
            stages in the app where they actually use them. Stated plainly
            because it is a real trade-off, not a free one. */}
        <section>
          <h2 className="mb-1 text-center text-2xl font-bold text-navy">
            One person, walking with one person
          </h2>
          <p className="text-center text-gray-500">
            Hope Beacon pairs someone exploring faith with one member of the church
            who stays with them: messages, readings, and a conversation nobody
            else can read.
          </p>
        </section>

        {/* Roles */}
        <section>
          <h2 className="mb-6 text-center text-2xl font-bold text-navy">
            Everyone has a place
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                r: 'ds',
                icon: '🌱',
                d: 'Explore faith at your own pace, guided by one caring person.',
              },
              {
                r: 'dm',
                icon: '🤝',
                d: 'Walk with your seekers: message, share, and celebrate each step.',
              },
              {
                r: 'admin',
                icon: '🛡️',
                d: 'Approve members, pair people, and keep the library.',
              },
            ].map((x) => (
              <Card key={x.r} className="flex items-start gap-3 p-5">
                <span className="text-3xl" aria-hidden>
                  {x.icon}
                </span>
                <div>
                  <p className="text-lg font-bold text-navy">
                    {ROLE_LABELS[x.r]}
                  </p>
                  <p className="text-gray-600">{x.d}</p>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* Privacy */}
        <section>
          <Card className="p-6">
            <h2 className="text-xl font-bold text-navy">
              Private by design 🔒
            </h2>
            <ul className="mt-3 space-y-2 text-gray-600">
              <li>• A missionary sees only their own seekers.</li>
              <li>
                • A seeker’s profile is visible only to their missionary and the
                admin.
              </li>
              <li>
                • Leaders see totals and trends only — never anyone’s identity.
              </li>
              <li>
                • Personal data stays on the device; only anonymous totals are
                shared for the church’s own analysis.
              </li>
            </ul>
          </Card>
        </section>

        <section id="tutorial-picker" className="scroll-mt-24">
          <h2 className="text-center text-2xl font-extrabold text-navy">
            Who are you in your church?
          </h2>
          <p className="mx-auto mb-4 mt-2 max-w-md text-center text-gray-500">
            Pick the one that fits and we will walk you through your own part.
            Two minutes, on safe demo data. Nothing you press reaches a real
            person.
          </p>
          <div className="mx-auto max-w-md">
            <QuestPicker />
          </div>
          {/* On the front door, not only in Settings. This is the build being
              handed to testers, and the person most worth hearing from is the
              one who has just decided something is wrong and is about to leave. */}
          <div className="mt-6">
            <FeedbackButton className="tap" label="Send feedback" />
            <p className="mt-2 text-sm text-gray-400">
              Anything confusing or broken, tell us. It takes a sentence.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-black/5 py-6 text-center text-sm text-gray-400">
        Hope Beacon · a local-church discipleship app
      </footer>
    </div>
  );
}
