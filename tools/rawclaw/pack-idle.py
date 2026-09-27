"""Pack approved ImageGen sheets into aligned runtime frames (no repainting).
Usage: python3 tools/rawclaw/pack-idle.py <key> <source.png>
Dependencies: Pillow, numpy, scipy.
"""
from pathlib import Path
import sys
from PIL import Image
import numpy as np
from scipy import ndimage
key, source=sys.argv[1:]
root=Path(__file__).resolve().parents[2]/'rawclaw/art/enemies/idle'
root.mkdir(parents=True,exist_ok=True);(root/'sheets').mkdir(exist_ok=True)
im=Image.open(source).convert('RGBA');pixels=np.array(im)
labels,n=ndimage.label(pixels[:,:,3]>8)
sizes=np.bincount(labels.ravel());ids=np.argsort(sizes[1:])[-6:]+1
if not all(sizes[i]>10000 for i in ids):
 # Separate sprites whose antialiased edges just touch, retaining original alpha.
 solid,n=ndimage.label(pixels[:,:,3]>200)
 counts=np.bincount(solid.ravel());core=np.argsort(counts[1:])[-6:]+1
 assert all(counts[i]>10000 for i in core), 'six complete sprites required'
 solid[~np.isin(solid,core)]=0
 near=ndimage.distance_transform_edt(solid==0,return_distances=False,return_indices=True)
 labels=np.where(pixels[:,:,3]>8,solid[tuple(near)],0)
 n=int(labels.max());sizes=np.bincount(labels.ravel());ids=core
boxes=ndimage.find_objects(labels)
def center(i):
 y,x=boxes[i-1];return((x.start+x.stop)/2,(y.start+y.stop)/2)
ids=sorted(ids,key=lambda i:center(i)[1]);ids=[i for r in range(2) for i in sorted(ids[r*3:r*3+3],key=lambda i:center(i)[0])]
# Include detached droplets/web details with the nearest sprite; never crop through a neighbor.
groups={i:[i] for i in ids}
for i in range(1,n+1):
 if i in ids or i >= len(sizes) or sizes[i]<3:continue
 c=center(i);near=min(ids,key=lambda j:(c[0]-center(j)[0])**2+(c[1]-center(j)[1])**2);groups[near].append(i)
frames=[]
for i in ids:
 mask=np.isin(labels,groups[i]);ys,xs=np.where(mask)
 l,t,r,b=xs.min(),ys.min(),xs.max()+1,ys.max()+1
 out=pixels[t:b,l:r].copy();out[~mask[t:b,l:r],3]=0
 frames.append(Image.fromarray(out))
w=max(f.width for f in frames)+8;h=max(f.height for f in frames)+8
scale=256/max(w,h);size=(round(w*scale),round(h*scale));atlas=Image.new('RGBA',(size[0]*3,size[1]*2))
for n,f in enumerate(frames):
 canvas=Image.new('RGBA',(w,h));canvas.alpha_composite(f,((w-f.width)//2,h-4-f.height));canvas=canvas.resize(size,Image.Resampling.LANCZOS)
 canvas.save(root/f'{key}_{n}.png',optimize=True);atlas.alpha_composite(canvas,((n%3)*size[0],(n//3)*size[1]))
atlas.save(root/'sheets'/f'{key}.png',optimize=True)
print(key,size,'6 frames')
