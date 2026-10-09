// The worlds one Cloudflare worker hosts, to pick from on the title screen ("Play online"). Each is its own Durable Object with its
// own save (`server/cf/worker.ts`), awake only while somebody is in it, so three cost no more than one. The first, `farm`, is the world
// that existed before there were three: its id (the Durable Object's name) never changes, or its save would be left behind.
// Pure: the worker, the title screen and the tests read the same list and the same address rules.

export interface WorldInfo { id: string; name: string; blurb: string }

export const WORLDS: readonly WorldInfo[] = [
    { id: 'farm', name: 'Meadow', blurb: 'The original world.' },
    { id: 'quarry', name: 'Quarry', blurb: 'A world of its own, started fresh.' },
    { id: 'snowcap', name: 'Snowcap', blurb: 'A world of its own, started fresh.' },
];

/** The world an address with no world in it (the old links) means. */
export const DEFAULT_WORLD = 'farm';

/** The worker's own address (`https://awesome-farm.<you>.workers.dev`), so a first-time visitor gets the server buttons with no typing. Empty: only a `?server=` link or an address typed once shows them. */
export const PUBLIC_SERVER = '';

export const worldInfo = (id: string): WorldInfo | undefined => WORLDS.find((w) => w.id === id);

/** `/w/<world>/status` -> `{ world, rest: '/status' }`; a path that names no world of ours -> null. The worker hands `rest` to that world. */
export function routeOf (pathname: string): { world: string; rest: string } | null {
    const m = /^\/w\/([a-z0-9_-]{1,24})(\/.*)?$/.exec(pathname);
    if (!m || !worldInfo(m[1])) return null;
    return { world: m[1], rest: m[2] || '/' };
}

/**
 * Any way of writing a server address -> the host part (what `/worlds` is asked of) and the world it names, if any:
 * `https://x.workers.dev`, `https://x.workers.dev/w/quarry`, `x.workers.dev/w/quarry/ws` and `…/status` all give base `x.workers.dev` forms.
 * Never throws.
 */
export function splitAddress (address: string): { base: string; world: string | null } {
    let a = String(address ?? '').trim().replace(/\/+$/, '').slice(0, 300);
    a = a.replace(/\/(ws|status)$/, '');
    const m = /\/w\/([a-z0-9_-]{1,24})$/.exec(a);
    if (m && worldInfo(m[1])) return { base: a.slice(0, m.index), world: m[1] };
    return { base: a, world: null };
}

/** The address that names one world on a base. */
export const worldAddress = (base: string, id: string) => `${base.replace(/\/+$/, '')}/w/${id}`;
