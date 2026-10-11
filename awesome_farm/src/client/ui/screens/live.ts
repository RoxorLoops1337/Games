// Which windows leave a solo world running. Every menu pauses the solo world, except the ones that watch something happen: a machine's
// window shows its bar filling and its output arriving, so the world must keep going while it is open (online it always does).
const LIVE = new Set(['machine', 'device']);

export const pausesWorld = (screen: string) => !LIVE.has(screen);
