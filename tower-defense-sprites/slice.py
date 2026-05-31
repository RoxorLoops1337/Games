from PIL import Image
import numpy as np
from scipy import ndimage
import os, json

HERE=os.path.dirname(os.path.abspath(__file__))
SRC=os.path.join(HERE,'spritesheet.png')
OUT=HERE
im=Image.open(SRC).convert('RGB'); a=np.array(im).astype(int)
rgb=np.array(im)
hsv=np.array(im.convert('HSV')).astype(int); sat=hsv[:,:,1]; val=hsv[:,:,2]
bg=np.array([9,12,14]); dist=np.sqrt(((a-bg)**2).sum(2))
mask=dist>30
md=ndimage.binary_dilation(mask,iterations=1)
lbl,n=ndimage.label(md,structure=np.ones((3,3)))

regions=[
 ('towers',0,0,1536,185),
 ('enemies',0,185,480,705),
 ('projectiles',480,185,815,700),
 ('tiles',815,185,1536,705),
 ('effects',0,700,955,885),
 ('ui-icons',955,700,1305,885),
 ('wave-indicators',1305,690,1536,940),
 ('health-bars',0,885,405,1024),
 ('misc',405,885,1015,1024),
]
def assign(cx,cy):
    for nm,x0,y0,x1,y1 in regions:
        if x0<=cx<x1 and y0<=cy<y1: return nm
    # nearest center
    best=None;bd=1e9
    for nm,x0,y0,x1,y1 in regions:
        ccx=(x0+x1)/2;ccy=(y0+y1)/2;dd=(cx-ccx)**2+(cy-ccy)**2
        if dd<bd:bd=dd;best=nm
    return best

items=[]
for i,sl in enumerate(ndimage.find_objects(lbl)):
    if sl is None: continue
    cid=i+1
    ys,xs=sl; y0,y1,x0,x1=ys.start,ys.stop,xs.start,xs.stop
    comp=mask[ys,xs] & (lbl[ys,xs]==cid)
    area=int(comp.sum())
    if area<70: continue
    h=y1-y0;w=x1-x0
    ms=int(np.median(sat[ys,xs][comp])); mv=int(np.median(val[ys,xs][comp]))
    if ms<10 and mv>140 and h<34: continue  # drop text labels
    cx=(x0+x1)/2; cy=(y0+y1)/2
    items.append([assign(cx,cy),x0,y0,x1,y1,comp])

# sort within category by row then col, name & export
items.sort(key=lambda r:(r[0], round(r[2]/40), r[1]))
counts={}
manifest=[]
for cat,x0,y0,x1,y1,comp in items:
    counts.setdefault(cat,0); counts[cat]+=1
    idx=counts[cat]
    d=os.path.join(OUT,cat); os.makedirs(d,exist_ok=True)
    region=ndimage.binary_fill_holes(comp)
    crop=rgb[y0:y1,x0:x1]
    alpha=(region*255).astype('uint8')
    out=np.dstack([crop,alpha])
    fn=f"{cat}_{idx:02d}.png"
    Image.fromarray(out,'RGBA').save(os.path.join(d,fn))
    manifest.append({'file':f"{cat}/{fn}",'x':int(x0),'y':int(y0),'w':int(x1-x0),'h':int(y1-y0)})

json.dump(manifest,open(os.path.join(OUT,'sprites.json'),'w'),indent=1)
print('exported',len(manifest))
for k in sorted(counts):print(f"  {k}: {counts[k]}")
