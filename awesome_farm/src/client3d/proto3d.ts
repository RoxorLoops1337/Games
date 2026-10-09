// Dev-only entry (npm run dev, then /proto3d.html): the recovered low-poly 3D prototype running on its own,
// on a solo world of the real simulation. Not part of the production build and not linked from the game.
import { boot, fail } from './main';

requestAnimationFrame(() => setTimeout(() => {
    try {
        boot();
    } catch (err) {
        fail(err);
    }
}, 30));
