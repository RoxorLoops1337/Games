// Where the live Battle Call server runs.
//
// Leave SERVER empty when the Worker serves this app itself (https://battle-call.<you>.workers.dev/):
// the app then talks to its own origin and there is nothing to set up.
//
// When the app is opened from somewhere else (the Pages copy at /battle_call/), put the Worker's address here once
// after `npx wrangler deploy`, e.g.  export const SERVER = 'https://battle-call.yourname.workers.dev';
// A visitor can also open the app once with ?server=https://... and it is remembered on that phone.
export const SERVER = '';
