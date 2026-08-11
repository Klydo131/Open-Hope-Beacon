// Domain types — the shape of everything the app stores. The demo store keeps
// to these exactly, so the screens don't care where the data comes from.

// The Church Board is deliberately NOT a role here.
//
// The client was explicit: "CB has no account in the system. Their approval
// of DMs is off the app." A board member who needs numbers gets them from an
// admin; they do not sign in. Removing the union member is what makes the
// compiler find every screen that still assumed otherwise.
export type Role = 'executive' | 'admin' | 'dm' | 'ds';
export type Stage =
  | 'create'
  | 'connect'
  | 'care'
  | 'call'
  | 'cultivate'
  | 'commission';
export type Track = 'traditional' | 'digital';
export type MaterialType = 'pdf' | 'video' | 'audio' | 'image' | 'link';
export type PairingStatus = 'active' | 'paused' | 'completed' | 'archived';

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  preferred_contact?: string;
  birthday?: string;
  gender?: string;
  status?: string;
  topics_of_interest: string[];
  city_of_residence?: string;
  work_industry?: string;
  preferred_language: string;
  avatar?: string; // chosen preset (emoji)
  photo?: string; // uploaded picture as a data URL (on-device in the demo)
  is_approved: boolean;
  // A missionary who vouched for this sign-up to the admin. It is a note on the
  // approval card, not a gate: the admin decides alone. (This used to be
  // endorsed_by, a Church Board member, and it was step 1 of a two-step gate.
  // The board has no account any more and approves missionaries off the app, so
  // the gate collapsed to the admin's single decision.)
  recommended_by?: string;
  recommended_at?: string;
  consent_at?: string; // when the seeker accepted the privacy notice
  created_at: string;
}

// A scheduled meeting between a missionary and their seeker — a call or an
// in-person study time. Both see it; either can schedule or cancel.
export interface Meeting {
  id: string;
  pairing_id: string;
  title: string;
  when: string; // ISO datetime
  mode: 'online' | 'in_person';
  location?: string;
  created_by: string;
  status: 'scheduled' | 'cancelled';
  created_at: string;
}

// A lesson the missionary assigned to a seeker's pairing, and whether it's done.
// The lesson content itself lives in lib/lessons.ts (a built-in curriculum).
export interface LessonAssignment {
  id: string;
  pairing_id: string;
  lesson_id: string;
  status: 'assigned' | 'completed';
  created_at: string;
  completed_at?: string;
  /** Set when this lesson came from a series rather than being picked alone. */
  series_id?: string;
  /** Position within that series, from 0. What makes "3 of 6" answerable. */
  series_order?: number;
}

// A course, on one area of interest, walked through in order.
//
// The client asked for it in their own words: "Can the library upload lesson
// series on specific areas of interest that can be pushed to seekers and walked
// through with them until they finish?" Every noun in that sentence is here.
//
// A series is grouped by TOPIC, not by journey stage. That distinction matters:
// a stage is a note the church keeps about a person and a seeker never sees it,
// whereas "Prayer" or "Understanding the Bible" is a thing somebody can say out
// loud that they are interested in. Series are the part of the curriculum a
// seeker is allowed to see the shape of.
export interface LessonSeries {
  id: string;
  title: string;
  description?: string;
  /** The area of interest. Free text, so a church can use its own language. */
  topic: string;
  /** Ordered. Position in this array is the order they are walked through. */
  lesson_ids: string[];
  is_published: boolean;
  created_at: string;
}

// A prayer request from a seeker. Always visible to their missionary; if
// share_with_board is true it also appears — WITHOUT the seeker's name — on the
// church-wide prayer wall so the whole church can pray.
export interface PrayerRequest {
  id: string;
  ds_id: string;
  body: string;
  share_with_board: boolean;
  status: 'open' | 'praying' | 'answered';
  created_at: string;
}

// A study item a Digital Seeker keeps for themselves — their own notes and
// uploaded media. Visible to the seeker, their missionary, and (for monitoring)
// admins.
export interface SeekerMedia {
  id: string;
  ds_id: string;
  title: string;
  type: MaterialType;
  note?: string;
  external_url?: string;
  created_at: string;
}

// A file shared inside one pairing: a photo, a voice note, a video, a document.
//
// THE BYTES ARE NOT IN THIS ROW, and that is the whole design. This is metadata
// plus an id; the file itself lives in IndexedDB (lib/localMedia.ts) under that
// same id. It mirrors what a real deployment must do — bytes in object storage,
// a row in the database pointing at them — and it is not optional here either:
// this database is serialised into localStorage on every write, and localStorage
// holds about 5 MB. One phone photo inlined here would break saving for
// everything else in the app.
//
// Who may see it follows the PAIRING, never the file. See mediaFor() in
// lib/demo/store.tsx and the matching policy in docs/examples/schema.sql (2b).
export interface PairingMedia {
  id: string;
  pairing_id: string;
  owner_id: string;
  kind: MaterialType;
  title: string;
  mime?: string;
  size: number;
  created_at: string;
}

// A missionary's private note about a seeker. The seeker never sees these, and
// neither does an admin — the whole point is a place to record
// what was actually said without it becoming a church record.
export interface SeekerNote {
  id: string;
  pairing_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

// A missionary's own reminder to follow something up — "check in with John
// before Sabbath". Private to the missionary, like the notes.
export interface FollowUp {
  id: string;
  pairing_id: string;
  owner_id: string;
  title: string;
  due_on?: string; // YYYY-MM-DD, date only — the time of day never matters here
  done_at?: string;
  created_at: string;
}

export interface Pairing {
  id: string;
  dm_id: string;
  ds_id: string;
  track: Track;
  journey_stage: Stage;
  status: PairingStatus;
  created_at: string;
}

export interface Message {
  id: string;
  pairing_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at?: string;
}

export interface Material {
  id: string;
  title: string;
  description?: string;
  type: MaterialType;
  external_url?: string;
  topics: string[];
  is_published: boolean;
  created_at: string;
}

export interface MaterialShare {
  id: string;
  material_id: string;
  pairing_id: string;
  shared_by: string;
  note?: string;
  created_at: string;
}

export interface JourneyEvent {
  id: string;
  pairing_id: string;
  from_stage?: Stage;
  to_stage: Stage;
  changed_by: string;
  note?: string;
  created_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body?: string;
  read_at?: string;
  created_at: string;
}

// A behaviour event, logged locally. This is the "local data" the client keeps
// on-device: detailed, per-user, for an admin to analyze. Only an aggregated,
// name-free rollup of these ever becomes "global" data (see the Admin analytics
// view) — personal detail never leaves the device.
export interface AnalyticsEvent {
  id: string;
  user_id: string;
  type:
    | 'signin'
    | 'message'
    | 'material_share'
    | 'material_open'
    | 'stage_advance'
    | 'approve'
    | 'tutorial_done'
    | 'media_upload'
    | 'profile_update'
    | 'recommend'
    | 'prayer_request'
    | 'lesson_assigned'
    | 'lesson_completed'
    | 'meeting_scheduled'
    | 'invite_sent'
    | 'invite_accepted'
    | 'member_kicked'
    | 'member_disapproved'
    | 'note_added'
    | 'followup_added'
    | 'followup_done';
  meta?: string;
  at: string;
}

// An invitation for a new Digital Seeker. The app is invite-only: an admin
// creates an invite (name + email), which yields a secure token. The invited
// person opens /join?token=<token>, completes their sign-up, and only then does
// an account exist. In production the email is sent by the backend (see
// docs/BACKEND-EMAIL-INVITES.md); in the demo the admin copies the invite link.
export interface Invite {
  id: string;
  token: string;
  email: string;
  full_name: string;
  role: Role; // which role the invited person will have
  invited_by: string; // admin/executive profile id
  /** The missionary this invite came from, carried through the whole flow so
   *  that accepting it creates the pairing. This is the client's requirement in
   *  one field: "If the DS accepts the admin's invite, DS enters through the
   *  app with a new account paired to the recommending DM." Set only when the
   *  invite grew out of a recommendation. */
  pair_with_dm?: string;
  recommendation_id?: string;
  status: 'pending' | 'accepted' | 'revoked';
  created_at: string;
  accepted_at?: string;
}

// A message the app *would* have emailed. There is no mail server in this
// build, so instead of silently doing nothing, every send is captured here and
// shown in the admin's Outbox. It is how you demonstrate the invitation flow —
// and check the wording of what a real member receives — without one.
export interface DemoEmail {
  id: string;
  to: string;
  to_name: string;
  /** Set when the message is addressed to a person in this church, so their
   *  inbox can find it. Absent for mail to an outsider (an invitation). */
  to_user_id?: string;
  from: string;
  from_name: string;
  from_user_id?: string;
  subject: string;
  body: string; // plain text, rendered with a heading + button in the viewer
  kind: 'invite' | 'approved' | 'paired' | 'reset' | 'meeting' | 'recommendation';
  link?: string; // the call-to-action the real email would carry
  /** A recommendation carries the sign-up it is about, which is what lets the
   *  admin approve or disapprove from inside the message rather than going to
   *  find them. This is the flow the real app will implement with signed links
   *  in a genuine email. */
  about_profile_id?: string;
  suggested_role?: Role;
  /** A recommendation is now about a person with no account, so there is no
   *  profile id to point at — the recommendation record is the subject. */
  recommendation_id?: string;
  action_taken?: 'approved' | 'disapproved';
  acted_at?: string;
  created_at: string;
  opened_at?: string;
}

// A missionary putting a name forward to the admin. The person has NO account
// yet — that is the whole point, and it is what the old flow got wrong: it
// offered a dropdown of people who had already signed up, so the seeker the
// client described (someone the DM knows, who has never heard of the app)
// could not be recommended at all.
//
// The DM does not invite. They recommend; the admin decides and invites. That
// keeps the existing security boundary exactly where it was.
export interface Recommendation {
  id: string;
  dm_id: string;
  full_name: string;
  email: string;
  note?: string;
  status: 'pending' | 'invited' | 'declined';
  created_at: string;
  decided_by?: string;
  decided_at?: string;
  invite_id?: string;
}

export interface DB {
  profiles: Profile[];
  pairings: Pairing[];
  messages: Message[];
  materials: Material[];
  material_shares: MaterialShare[];
  journey_events: JourneyEvent[];
  notifications: AppNotification[];
  analytics: AnalyticsEvent[];
  seeker_media: SeekerMedia[];
  pairing_media: PairingMedia[];
  prayer_requests: PrayerRequest[];
  lesson_assignments: LessonAssignment[];
  lesson_series: LessonSeries[];
  meetings: Meeting[];
  invites: Invite[];
  recommendations: Recommendation[];
  emails: DemoEmail[];
  seeker_notes: SeekerNote[];
  follow_ups: FollowUp[];
  church_name: string;
}
