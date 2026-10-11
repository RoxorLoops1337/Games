// Which windows leave a solo world running. Every menu pauses the solo world, except the ones that watch something happen: a machine's
// window shows its bar filling and its output arriving, so the world must keep going while it is open (online it always does).
const LIVE = new Set(['machine', 'device']);

export const pausesWorld = (screen: string) => !LIVE.has(screen);

/** Is this object still alive and drawn (itself and every container above it)? */
export function stillThere (o: object): boolean {
    type N = { active?: boolean; visible?: boolean; parentContainer?: N | null };
    for (let n: N | null = o as N; n; n = n.parentContainer ?? null) {
        if (!n.active || n.visible === false) return false;
    }
    return true;
}

