// This browser's player identity and last-used server, persisted locally.
// Never rename the storage keys: the id is how a server recognises a returning farmer.

// ?profile=2 in the URL gives this tab a separate identity (and solo world), so one
// browser can play as two farmers — handy for testing a server alone.
const SLOT = new URLSearchParams(location.search).get('profile')?.replace(/[^\w-]/g, '').slice(0, 12) ?? '';
const KEY = 'awesome_farm_profile_v1' + (SLOT ? ':' + SLOT : '');
export const SOLO_KEY = 'awesome_farm_solo_v1' + (SLOT ? ':' + SLOT : '');
export const BLUEPRINT_KEY = 'awesome_farm_blueprints_v1' + (SLOT ? ':' + SLOT : '');
export const TUTORIAL_KEY = 'awesome_farm_tutorial_v1' + (SLOT ? ':' + SLOT : '');

interface Profile {
    id: string;        // stable player id — keeps your farmer, inventory and slot on every server
    name: string;
    server: string;    // last server address you joined
    key?: string;      // your secret word (the server keeps it as a hash): with your name it brings back your farmer on any device
    srv?: Record<string, string>;   // the farmer id each server gave you (so a server sign-in never disturbs your solo farmer)
}

function randomId () {
    const b = new Uint8Array(12);
    crypto.getRandomValues(b);   // works on plain-http LAN pages, unlike crypto.randomUUID
    return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export const profile: Profile = { id: '', name: '', server: '' };
try { Object.assign(profile, JSON.parse(localStorage.getItem(KEY) ?? '{}')); } catch { /* defaults */ }
if (!profile.id) profile.id = randomId();

export function saveProfile () {
    try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { /* private mode */ }
}
saveProfile();
