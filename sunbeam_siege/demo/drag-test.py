import sys
from playwright.sync_api import sync_playwright
w=int(sys.argv[1]); h=int(sys.argv[2]); out=sys.argv[3]
with sync_playwright() as p:
    b=p.chromium.launch()
    ctx=b.new_context(viewport={'width':w,'height':h}, device_scale_factor=1)
    pg=ctx.new_page()
    errs=[]
    pg.on('pageerror',lambda e: errs.append('PAGEERR '+str(e)))
    pg.goto('file:///home/claude/nine-lives/battle-demo.html')
    pg.wait_for_timeout(1800)
    # find the Fence Walker card
    card=pg.locator('.b-hand .card', has_text='Fence Walker').first
    bb=card.bounding_box(); print('card',bb)
    pg.mouse.move(bb['x']+bb['width']/2, bb['y']+bb['height']/2)
    pg.mouse.down()
    pg.mouse.move(bb['x']+bb['width']/2, bb['y']-60, steps=5)
    fl=pg.locator('.b-floor[data-floor="2"]').bounding_box()
    pg.mouse.move(fl['x']+fl['width']*0.3, fl['y']+fl['height']/2, steps=8)
    pg.wait_for_timeout(100)
    pg.screenshot(path=out+'1.png')
    pg.mouse.up()
    pg.wait_for_timeout(1200)
    pg.screenshot(path=out+'2.png')
    print(pg.evaluate("JSON.stringify(SB.ui.battle.state().floors.map(f=>f.cats.map(c=>c.name)))"))
    print(errs)
    b.close()
