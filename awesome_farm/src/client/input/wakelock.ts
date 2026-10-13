// Keep the screen on while the game is open (a phone that dims in the middle of a boss fight is no fun). The browser drops the
// lock whenever the page is hidden, so it is asked for again each time the page comes back. Browsers without the API do nothing.

interface Sentinel { release (): Promise<void>; addEventListener (t: 'release', f: () => void): void }
type WakeApi = { request (t: 'screen'): Promise<Sentinel> };

export function keepAwake () {
    const api = (navigator as unknown as { wakeLock?: WakeApi }).wakeLock;
    if (!api || typeof document === 'undefined') return;
    let held: Sentinel | null = null;
    const ask = async () => {
        if (held || document.visibilityState !== 'visible') return;
        try {
            const s = await api.request('screen');
            held = s;
            s.addEventListener('release', () => { if (held === s) held = null; });
        } catch { /* low battery, or no permission yet: try again on the next tap */ }
    };
    document.addEventListener('visibilitychange', () => { void ask(); });
    // a lock can only be taken after the player has touched the page
    for (const ev of ['pointerdown', 'keydown'] as const) window.addEventListener(ev, () => { void ask(); }, { passive: true });
    void ask();
}
