import sys, json
from playwright.sync_api import sync_playwright
# usage: battle-shot.py out.png width height [script-js] [wait_ms]
out=sys.argv[1]; w=int(sys.argv[2]); h=int(sys.argv[3])
js=sys.argv[4] if len(sys.argv)>4 else ''
wait=int(sys.argv[5]) if len(sys.argv)>5 else 1800
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':w,'height':h}, has_touch=(w<700), is_mobile=(w<700), device_scale_factor=2 if w<700 else 1)
    pg=ctx.new_page()
    errs=[]
    pg.on('console',lambda m: errs.append(m.type+': '+m.text) if m.type in('error','warning') else None)
    pg.on('pageerror',lambda e: errs.append('PAGEERR '+str(e)))
    import os
    pg.goto('file:///home/claude/nine-lives/battle-demo.html?'+('phone=1&' if w<700 else '')+os.environ.get('Q',''))
    pg.wait_for_timeout(wait)
    if js:
        r=pg.evaluate(js)
        if r is not None: print('JS:',r)
        pg.wait_for_timeout(int(sys.argv[6]) if len(sys.argv)>6 else 800)
    pg.screenshot(path=out)
    print('\n'.join(errs))
    b.close()
