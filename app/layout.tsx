import type { Metadata, Viewport } from 'next';
import './globals.css';
import { DemoProvider } from '@/lib/demo/store';
import { ServiceWorker } from '@/components/ServiceWorker';
import { SelfHeal } from '@/components/SelfHeal';
import { TutorialHost } from '@/components/TutorialHost';
import { InstallPrompt } from '@/components/InstallPrompt';
import { FeedbackNudgeHost } from '@/components/FeedbackNudgeHost';

import { AutoUpdate } from '@/components/AutoUpdate';
import { VersionWatch } from '@/components/VersionWatch';
import { OnlineStatus } from '@/components/OnlineStatus';
import { ConsentHost } from '@/components/ConsentHost';
import { DemoRibbon } from '@/components/DemoRibbon';
import { LocaleProvider } from '@/lib/i18n';
import { BUILD_ID } from '@/lib/build-info';
import { APP_NAME, APP_SHORT_NAME, APP_DESCRIPTION } from '@/lib/brand';
import { INDEXABLE } from '@/lib/site-visibility';

export const metadata: Metadata = {
  // The name comes from lib/brand.ts so a fork changes it in one place. It also
  // has to be distinct from any other Beacon you can install: an installed app
  // shows no address bar, so an ambiguous title is what leaves two identical
  // icons in a dock with no way to tell which is which.
  title: APP_NAME,
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: APP_SHORT_NAME },
  // NOINDEX BY DEFAULT, AND THIS IS DELIBERATE.
  //
  // A church deployment holds real people's names and conversations, and a
  // shared deep link that gets indexed is the cheapest possible data leak. So
  // the default is to stay out of every search engine, and a deployment that
  // genuinely wants to be found has to say so on purpose — BEACON_PUBLIC_SITE=1,
  // which is the showcase's case and almost never a church's.
  //
  // This emits <meta name="robots" content="…"> on every page, the most reliable
  // signal and the one independent of hosting. It is reinforced by app/robots.ts
  // and by the X-Robots-Tag header in next.config.mjs. All three used to be
  // changed by hand and told you so in a comment; they now read the same switch
  // from lib/site-visibility.ts, because "remember to change three files" is a
  // rule that gets followed twice out of three times.
  robots: {
    index: INDEXABLE,
    follow: INDEXABLE,
    nocache: !INDEXABLE,
    googleBot: { index: INDEXABLE, follow: INDEXABLE, noimageindex: !INDEXABLE },
  },
  // The build this page was rendered from, readable without opening Settings.
  // When someone reports "it did not update", the first question is which build
  // they are actually running, and asking a person to read a version string off
  // a settings screen is a slow way to find out.
  other: { 'beacon-build': BUILD_ID },
};

export const viewport: Viewport = {
  themeColor: '#1E2A4A',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* First thing in the document: it has to be listening before any
            bundle is requested, because a bundle failing to load is the signal
            it exists to catch. */}
        <SelfHeal />
        <LocaleProvider>
          <DemoProvider>
            {children}
            <ConsentHost />
            <TutorialHost />
            {/* Delete this line when you connect a real backend — see
                components/DemoRibbon.tsx. */}
            <DemoRibbon />
            {/* Inside the provider because it now hides itself while the
                tutorial is running: both sit in the bottom-right corner, so the
                install card landed on top of the step panel at exactly the
                moment someone was being asked to follow instructions. */}
            <InstallPrompt />
            <FeedbackNudgeHost />
          </DemoProvider>

          <AutoUpdate />
          <VersionWatch />
          <OnlineStatus />
        </LocaleProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
