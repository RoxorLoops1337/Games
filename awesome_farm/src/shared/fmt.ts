// Times as text, the same on the HUD, in a card and in a coach line. Pure functions: no DOM, no Phaser.

/** "4:05": a number of seconds as minutes and seconds (a countdown, a time to ripe, a run's clock). */
export function clock (secs: number) {
    const s = Math.floor(secs);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "07:30": an hour of the day (with its fraction) the way the HUD clock shows it, to the ten minutes. */
export function hhmm (hour: number) {
    const hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60 / 10) * 10;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
