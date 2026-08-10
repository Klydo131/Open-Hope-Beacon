import type { Material } from './types';

// The starter toolkit — every account gets this, Executive down to Digital Seeker.
//
// These are REAL published resources from the official free sources, not sample
// rows. Beacon does not host any of them: each entry is a link to the publisher
// that already gives it away for free, which is why this costs nothing to run
// and why nothing here infringes anyone's copyright. The KJV text and the older
// Ellen G. White books are public domain; the Sabbath School guides and the
// statements of belief are published free by the denomination itself.
//
// To keep a copy for offline use: open the item, let the browser download it,
// then add it with "Upload files" on this page. It is then stored on the device
// in IndexedDB and works with no signal.
//
// ponytail: a flat constant, not a table. It is the same list for everyone, it
// changes about once a year, and a constant costs no storage and no query. If a
// church ever needs its own toolkit, promote this to `materials` rows then.

const ADDED = '2026-07-29T00:00:00.000Z';

export const STARTER_KIT: Material[] = [
  // ---- The Bible ----
  {
    id: 'kit-bible-youversion',
    title: 'The Bible, free, with offline download',
    description:
      'YouVersion’s King James Version. Free to read online, and the app lets you download whole books to read with no signal.',
    type: 'link',
    external_url: 'https://www.bible.com/versions/1-kjv-king-james-version',
    topics: ['Bible'],
    is_published: true,
    created_at: ADDED,
  },
  {
    id: 'kit-bible-kjv-pdf',
    title: 'Holy Bible, King James Version (PDF)',
    description:
      'The complete KJV as a single PDF. The KJV text is public domain, so this can be kept, copied and shared freely.',
    type: 'pdf',
    external_url:
      'https://www.holybooks.com/wp-content/uploads/2010/05/The-Holy-Bible-King-James-Version.pdf',
    topics: ['Bible'],
    is_published: true,
    created_at: ADDED,
  },
  {
    id: 'kit-bible-online',
    title: 'King James Bible Online',
    description:
      'Read and search the 1611 and 1769 King James text in a browser, verse by verse.',
    type: 'link',
    external_url: 'https://www.kingjamesbibleonline.org/',
    topics: ['Bible'],
    is_published: true,
    created_at: ADDED,
  },

  // ---- Ellen G. White ----
  {
    id: 'kit-egw-library',
    title: 'Ellen G. White Writings: the complete library',
    description:
      'The Ellen G. White Estate’s official site. Her complete published writings, free to read and download in several formats and many languages.',
    type: 'link',
    external_url: 'https://egwwritings.org/',
    topics: ['Ellen G. White', 'Devotional'],
    is_published: true,
    created_at: ADDED,
  },
  {
    id: 'kit-egw-sc',
    title: 'Steps to Christ (PDF)',
    description:
      'The short classic on coming to Christ, and the most widely translated of her books. Public domain.',
    type: 'pdf',
    external_url: 'https://media3.egwwritings.org/pdf/en_SC.pdf',
    topics: ['Ellen G. White', 'Devotional', 'New believer'],
    is_published: true,
    created_at: ADDED,
  },
  {
    id: 'kit-egw-gc',
    title: 'The Great Controversy, 1911 edition (PDF)',
    description:
      'The full prophetic history, from the fall of Jerusalem to the end of the great controversy. Public domain.',
    type: 'pdf',
    external_url: 'https://media4.egwwritings.org/pdf/en_GC.pdf',
    topics: ['Ellen G. White', 'Prophecy'],
    is_published: true,
    created_at: ADDED,
  },

  // ---- What the church teaches ----
  {
    id: 'kit-beliefs',
    title: 'What Seventh-day Adventists Believe',
    description:
      'The General Conference’s own summary of the 28 fundamental beliefs, with the scripture behind each one.',
    type: 'link',
    external_url: 'https://gc.adventist.org/beliefs/',
    topics: ['Beliefs', 'New believer'],
    is_published: true,
    created_at: ADDED,
  },
  {
    id: 'kit-beliefs-pdf',
    title: 'The 28 Fundamental Beliefs (PDF)',
    description: 'All 28 statements in one printable document.',
    type: 'pdf',
    external_url:
      'https://szu.adventist.org/wp-content/uploads/2016/04/28_Beliefs.pdf',
    topics: ['Beliefs'],
    is_published: true,
    created_at: ADDED,
  },

  // ---- Sabbath School ----
  {
    id: 'kit-ss-current',
    title: 'Sabbath School: this quarter’s lesson',
    description:
      'The current Adult Bible Study Guide: weekly lessons with reading, audio, video and PDF.',
    type: 'link',
    external_url: 'https://www.sabbath.school/',
    topics: ['Sabbath School', 'Bible study'],
    is_published: true,
    created_at: ADDED,
  },
  {
    id: 'kit-ss-net',
    title: 'Sabbath School Net: study guides',
    description:
      'Lesson helps, commentary and discussion for the current and past quarters.',
    type: 'link',
    external_url: 'https://ssnet.org/study-guides/',
    topics: ['Sabbath School', 'Bible study'],
    is_published: true,
    created_at: ADDED,
  },
  {
    id: 'kit-ss-archive',
    title: 'Sabbath School lesson archive',
    description:
      'Adventist Archives’ scanned back-catalogue of Adult Sabbath School Bible Study Guides, free as PDFs.',
    type: 'link',
    external_url: 'https://www.adventistarchives.org/sabbathschoollessons',
    topics: ['Sabbath School', 'Archive'],
    is_published: true,
    created_at: ADDED,
  },
  {
    id: 'kit-gc-publications',
    title: 'General Conference publications',
    description:
      'Official church publications, reports and resources, free to download.',
    type: 'link',
    external_url: 'https://gc.adventist.org/publications/',
    topics: ['Church', 'Archive'],
    is_published: true,
    created_at: ADDED,
  },
];

// Every topic in the kit, for filter chips. Sorted so the order is stable.
export const KIT_TOPICS: string[] = Array.from(
  new Set(STARTER_KIT.flatMap((m) => m.topics)),
).sort();
