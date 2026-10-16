"""Compare every stored NPC frame bound/row contour to actual saved PNG alpha."""
import hashlib,json,math
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];SPRITES=ROOT/'outputs/dead-signal/production-assets/sprites';AUDIT=ROOT/'outputs/dead-signal/production-assets/audits/2026-10-16';BATCH=ROOT/'work/asset-enemy-motion-baker-v029/batches/locomotion-hq32.json'
def bounds(a,threshold=8):
 y,x=np.nonzero(a>=threshold)
 return None if len(x)==0 else {'x':int(x.min()),'y':int(y.min()),'width':int(x.max()-x.min()+1),'height':int(y.max()-y.min()+1)}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
checks=[];total=0;rows=0
for job in json.loads(BATCH.read_text())['jobs']:
 ident=job['id'];folder=SPRITES/ident;m=json.loads((folder/'metadata.json').read_text());rgba=Image.open(folder/'atlas.png').convert('RGBA');body=Image.open(folder/'body-alpha.png').convert('RGBA');alpha=np.asarray(rgba)[:,:,3];mask=np.asarray(body)[:,:,3];count=0;rowcount=0
 for f in m['frames']:
  r=f['rect'];a=alpha[r['y']:r['y']+r['height'],r['x']:r['x']+r['width']];b=mask[r['y']:r['y']+r['height'],r['x']:r['x']+r['width']]
  assert bounds(a)==f['outlineBounds'],(ident,f['index'],'outlineBounds');assert bounds(b)==f['alphaBounds'],(ident,f['index'],'alphaBounds');assert f['combinedAlphaBounds']==f['alphaBounds']
  # Lossless packed frames retain their two-pixel transparent safety border.
  assert not np.any(a[0,:]) and not np.any(a[-1,:]) and not np.any(a[:,0]) and not np.any(a[:,-1]),(ident,f['index'],'frame edge alpha')
  bb=f['alphaBounds'];l,t,rr,bot=m['coreRegion']['proportions'] if isinstance(m['coreRegion'],dict) else m['coreRegion']
  x0=max(0,math.floor(bb['x']+bb['width']*l));y0=max(0,math.floor(bb['y']+bb['height']*t));x1=min(r['width'],math.ceil(bb['x']+bb['width']*rr));y1=min(r['height'],math.ceil(bb['y']+bb['height']*bot));core=bounds(b[y0:y1,x0:x1],24)
  if core:core['x']+=x0;core['y']+=y0
  assert core==f['coreBounds'],(ident,f['index'],'coreBounds',core,f['coreBounds'])
  c=f['bodyIdentificationContour'];assert len(c['left'])==len(c['right'])
  for left,right in zip(c['left'],c['right']):
   y=int(left['y']);xs=np.flatnonzero(b[y,:]>=8);assert len(xs)>0;assert int(xs[0])==left['x'] and int(xs[-1])+1==right['x'] and right['y']==left['y'],(ident,f['index'],'contour row',y);rowcount+=1
  assert c['top']==[c['left'][0],c['right'][0]],(ident,f['index'],'top contour');count+=1
 total+=count;rows+=rowcount;check={'id':ident,'frames':count,'contourRows':rowcount,'atlasSHA256':sha(folder/'atlas.png'),'bodyMaskSHA256':sha(folder/'body-alpha.png'),'metadataSHA256':sha(folder/'metadata.json'),'actualBodyOutlineCoreBoundsExact':True,'allFrameEdgeAlphaZero':True,'actualRowContoursExact':True};checks.append(check);print(json.dumps({'id':ident,'frames':count,'contourRows':rowcount}),flush=True)
result={'actors':len(checks),'frames':total,'contourRows':rows,'checks':checks,'allSavedFrameBoundsAndContoursExact':True};assert len(checks)==31 and total==15872;(AUDIT/'V029-SAVED-PIXEL-BOUNDS-VERIFICATION.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='checks'}))
