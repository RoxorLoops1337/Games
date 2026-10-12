Lab pages for developing and screenshotting 3D modules. Dev only (excluded from dist by build.js DEV_ONLY).
Serve repo root: `python3 -m http.server 8137 --directory /home/user/Games` (pick a free port), then
`node tools/3d_shot.mjs http://127.0.0.1:8137/ludus_maximus_3d/lab/<page>.html out.png --w 1000 --h 700 --secs 1.5`
