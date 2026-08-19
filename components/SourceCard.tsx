'use client';

// Where this app's source code is — offered from inside the app, on purpose.
//
// THIS IS A LICENCE OBLIGATION, NOT A COURTESY. Open Hope Beacon is AGPL-3.0,
// and section 13 says that anyone who MODIFIES the program and lets people use
// it over a network must prominently offer those people the source of the
// version they are actually using. A link on the signed-out front page is not
// enough on its own: most people who use this app never see that page again
// after their first visit.
//
// IF YOU FORK THIS AND CHANGE ANYTHING, CHANGE THE URL BELOW to point at your
// own repository. Leaving it pointing upstream while your deployment differs is
// the single likeliest way an honest church ends up in breach — it tells your
// congregation "here is the code you are running" and then shows them somebody
// else's.

import { Card } from '@/components/ui';

/** Change this if you deploy a modified version. See the note above. */
const SOURCE_URL = 'https://github.com/Klydo131/Open-Hope-Beacon';

export function SourceCard() {
  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">📖 This app is free software</h2>
      <p className="mt-1 text-sm text-gray-600">
        Hope Beacon is open source under the GNU AGPL-3.0. You are welcome to
        read it, run it for your own church, and change it. If you change it and
        run it for other people, you pass those same freedoms on to them.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={SOURCE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="tap inline-flex items-center rounded-xl bg-gray-100 px-4 font-semibold text-navy hover:bg-gray-200"
        >
          View the source code ↗
        </a>
        <a
          href={`${SOURCE_URL}/blob/main/LICENSE`}
          target="_blank"
          rel="noopener noreferrer"
          className="tap inline-flex items-center rounded-xl px-4 font-semibold text-navy underline underline-offset-4"
        >
          Read the licence ↗
        </a>
      </div>
    </Card>
  );
}
