"""Losslessly pack GPU-rendered sprites; no resampling or art pixel changes."""
import argparse, copy, hashlib, json, math
from pathlib import Path
from PIL import Image

def layout(items, width):
    rows=[];x=y=row_height=0;placed={}
    for index,w,h in sorted(items,key=lambda a:(-a[2],-a[1],a[0])):
        if x+w>width:x=0;y+=row_height;row_height=0
        placed[index]=(x,y);x+=w;row_height=max(row_height,h)
    return placed, int(math.ceil((y+row_height)/4)*4)

def pack(source, destination):
    source,destination=Path(source),Path(destination);m=json.loads((source/'metadata.json').read_text());old=copy.deepcopy(m)
    assert not m['atlas'].get('packing')
    color=Image.open(source/'atlas.png').convert('RGBA');mask=Image.open(source/'body-alpha.png').convert('RGBA')
    crops={};items=[]
    for f in m['frames']:
        b=f['outlineBounds'];s=f['rect'];x=max(0,int(b['x'])-2);y=max(0,int(b['y'])-2);w=min(s['width'],int(b['x']+b['width'])+2)-x;h=min(s['height'],int(b['y']+b['height'])+2)-y
        crops[f['index']]=(x,y,w,h);items.append((f['index'],w,h))
    choices=[]
    for width in [1024,1536,2048,2560,3072,4096]:
        places,height=layout(items,width)
        if height<=8192:choices.append((width*height,width,height,places))
    _,width,height,places=min(choices,key=lambda a:a[0]);newcolor=Image.new('RGBA',(width,height));newmask=Image.new('RGBA',(width,height))
    visible_digest=hashlib.sha256();new_digest=hashlib.sha256();changed=0
    def shift_bounds(bounds,x,y):
        if bounds is None:return None
        return {**bounds,'x':bounds['x']-x,'y':bounds['y']-y}
    for f in m['frames']:
        oldrect=f['rect'];x,y,w,h=crops[f['index']];px,py=places[f['index']];box=(oldrect['x']+x,oldrect['y']+y,oldrect['x']+x+w,oldrect['y']+y+h)
        a=color.crop(box);b=mask.crop(box);newcolor.paste(a,(px,py));newmask.paste(b,(px,py));visible_digest.update(a.tobytes());new_digest.update(newcolor.crop((px,py,px+w,py+h)).tobytes())
        assert a.tobytes()==newcolor.crop((px,py,px+w,py+h)).tobytes()
        assert b.tobytes()==newmask.crop((px,py,px+w,py+h)).tobytes()
        # Prove no opaque pixels are discarded, including the outline.
        full=color.crop((oldrect['x'],oldrect['y'],oldrect['x']+oldrect['width'],oldrect['y']+oldrect['height']));restore=Image.new('RGBA',full.size);restore.paste(a,(x,y))
        # Transparent RGB is not displayed; preserve and compare visible RGBA.
        full.putalpha(full.getchannel('A')); opaque=full.getchannel('A').point(lambda z:255 if z else 0)
        assert Image.composite(full,Image.new('RGBA',full.size),opaque).tobytes()==Image.composite(restore,Image.new('RGBA',full.size),opaque).tobytes()
        f['rect']={'x':px,'y':py,'width':w,'height':h};f['footPivot']={'x':f['footPivot']['x']-x,'y':f['footPivot']['y']-y}
        for key in ['alphaBounds','outlineBounds','coreBounds','combinedAlphaBounds']:
            if key in f:f[key]=shift_bounds(f[key],x,y)
        c=f.get('bodyIdentificationContour')
        if c:
            for key in ['left','right','top']:c[key]=[{'x':p['x']-x,'y':p['y']-y} for p in c[key]]
        f['untrimmedOffset']={'x':x,'y':y};changed+=1
    assert visible_digest.hexdigest()==new_digest.hexdigest()
    m['atlas'].update({'packing':'trimmed-v1','width':width,'height':height,'columns':old['atlas']['columns'],'rows':old['atlas']['rows']})
    m['packing']={'method':'lossless visible RGBA crop; no resize; deterministic shelf pack','sourceAtlasSHA256':hashlib.sha256((source/'atlas.png').read_bytes()).hexdigest(),'sourceDecodedBytes':old['atlas']['width']*old['atlas']['height']*4,'packedDecodedBytes':width*height*4,'visiblePixelsSHA256':visible_digest.hexdigest(),'allFramesPixelExact':True,'frameSizeMeaning':'untrimmed source canvas; per-frame rect and pivot define placement'}
    destination.mkdir(parents=True,exist_ok=True);newcolor.save(destination/'atlas.png',optimize=True);newmask.save(destination/'body-alpha.png',optimize=True);(destination/'metadata.json').write_text(json.dumps(m,separators=(',',':'))+'\n')
    return {'directory':str(destination),'frames':changed,'sourceMiB':m['packing']['sourceDecodedBytes']/1048576,'packedMiB':m['packing']['packedDecodedBytes']/1048576,'pixelExact':True,'clipped':sum(f['clipped'] for f in m['frames'])}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('source');parser.add_argument('destination');args=parser.parse_args();print(json.dumps(pack(args.source,args.destination)))
