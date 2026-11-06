import sys, json
from playwright.sync_api import sync_playwright
# usage: battle-drive.py width height outprefix  (runs a scripted session and screenshots)
w=int(sys.argv[1]); h=int(sys.argv[2]); out=sys.argv[3]
steps=json.loads(sys.argv[4]) if len(sys.argv)>4 else []
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':w,'height':h}, has_touch=(w<700), is_mobile=(w<700), device_scale_factor=2 if w<700 else 1)
    pg=ctx.new_page()
    errs=[]
    pg.on('console',lambda m: errs.append(m.type+': '+m.text) if m.type in('error',) else None)
    pg.on('pageerror',lambda e: errs.append('PAGEERR '+str(e)))
    pg.goto('file:///home/claude/nine-lives/battle-demo.html'+('?phone=1' if w<700 else ''))
    pg.wait_for_timeout(1800)
    n=0
    for st in steps:
        k=st[0]
        if k=='wait': pg.wait_for_timeout(st[1])
        elif k=='shot':
            pg.screenshot(path=f'{out}{st[1]}.png')
        elif k=='js':
            r=pg.evaluate(st[1]); print('JS:',r)
        elif k=='click': pg.click(st[1], timeout=3000)
        elif k=='key': pg.keyboard.press(st[1])
    print('\n'.join(errs))
    b.close()
