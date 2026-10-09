// The Defense Lab (`?lab=defense` on the solo page): a test arena for towers, walls and raids, in a world of its own.
// This is the one place the client reads the switch. With it on, every key this browser keeps per farmer gets the `:lab` suffix
// (profile.ts: the profile, the solo world, blueprints, the tutorial), the lab world is never saved, and the first-time hints,
// tips, welcome card and tutorial stay away, so nothing of the player's real farm is read or written.

/** 'defense' when the page was opened with `?lab=defense`, else ''. */
export const LAB: '' | 'defense' = (() => {
    try { return new URLSearchParams(globalThis.location?.search ?? '').get('lab') === 'defense' ? 'defense' : ''; } catch { return ''; }
})();
