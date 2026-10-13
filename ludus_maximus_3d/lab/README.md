Lab pages for developing and screenshotting 3D modules. Dev only (excluded from dist by build.js DEV_ONLY).
Serve repo root: `python3 -m http.server 8137 --directory /home/user/Games` (pick a free port), then
`node tools/3d_shot.mjs http://127.0.0.1:8137/ludus_maximus_3d/lab/<page>.html out.png --w 1000 --h 700 --secs 1.5`

- `beast_lab.html` (Venatio beasts, js/beast.js): `?beast=all|lion|wolf|bear|boar|nemean|elephant&detail=low|medium|high&anim=idle|walk|run|bite|claw|pounce|roar|death|...&t=<s>`, `view=sheet&times=0,.2,.4&gap=4` pose sheets, `cam=x,y,z,tx,ty,tz`, `blood=0.4&wounds=3`, `hide=bone,eye`, `orbit=1` drag, `spin=1`; `?test=1` runs the headless rig checks (budgets, finite transforms for every clip and gait, paws near the floor, joints, wounds) into `window.__testResult`.
