'use client';

// KEPT AS A RE-EXPORT, DELIBERATELY.
//
// This file held three thousand lines and nineteen components: the signed-out
// door, the Director's entire admin screen, both Guide screens, the Explorer's
// screen, and every small shared piece. It was split by SCREEN, because that is
// how somebody looks for code: they are fixing the login form, or the roster, or
// the conversation, and they should not have to know those three live together.
//
// Every screen that imported from here still can. Deleting this file would mean
// touching a dozen call sites in the same change as moving three thousand lines,
// and a refactor that big should be provable by "nothing else changed".
//
// NEW CODE SHOULD IMPORT FROM THE FILE THAT HOLDS THE SCREEN:
//
//   components/live/DoorPages.tsx    signed out: home, login, sign-up, join
//   components/live/AdminPage.tsx    the Director and Executive Director screen
//   components/live/GuidePages.tsx   the Guide's roster and one Explorer
//   components/live/ExplorerPage.tsx the Explorer's own journey
//   components/live/shared.tsx       the conversation, and small shared parts

export {
  LiveHomePage, LiveLoginPage, LiveSignupPage, LiveJoinPage,
} from '@/components/live/DoorPages';
export { LiveAdminPage } from '@/components/live/AdminPage';
export { LiveGuidePage, LiveConversationPage } from '@/components/live/GuidePages';
export { LiveExplorerPage } from '@/components/live/ExplorerPage';
