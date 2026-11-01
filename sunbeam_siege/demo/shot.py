import sys
from playwright.sync_api import sync_playwright
src,out=sys.argv[1],sys.argv[2]
w=int(sys.argv[3]) if len(sys.argv)>3 else 1400
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':w,'height':900})
    errs=[]; pg.on('console',lambda m: errs.append(m.text) if m.type in('error','warning') else None); pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.goto('file://'+src+(sys.argv[4] if len(sys.argv)>4 else '')); pg.wait_for_timeout(500)
    pg.screenshot(path=out,full_page=True); print('\n'.join(errs)); b.close()
