"""Independently reload persisted PNG pairs and prove all 15,872 visible frames.

Preserves original GLB pixels, resolution, source projection, root compensation,
per-frame anchors and alpha masks. This verifies saved files after packing, not
only an in-memory paste or a metadata assertion.
"""
import argparse,hashlib,json
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];BAKER=ROOT/'work/asset-enemy-motion-baker-v029';SPRITES=ROOT/'outputs/dead-signal/production-assets/sprites';AUDIT=ROOT/'outputs/dead-signal/production-assets/audits/2026-10-16'

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def verify(job):
    ident=job['id'];folders=[p for p in (BAKER/'exports').glob(ident+'-*') if (p/'metadata.json').is_file()];assert len(folders)==1
    source=folders[0];dest=SPRITES/ident;before=json.loads((source/'metadata.json').read_text());after=json.loads((dest/'metadata.json').read_text())
    for key in ['source','projection','animation','appearance','coreRegion']:assert before[key]==after[key],(ident,key)
    color=Image.open(source/'atlas.png').convert('RGBA');packed=Image.open(dest/'atlas.png').convert('RGBA');mask=Image.open(source/'body-alpha.png').convert('RGBA');pmask=Image.open(dest/'body-alpha.png').convert('RGBA');digest=hashlib.sha256();unique={i:set() for i in range(16)}
    for a,b in zip(before['frames'],after['frames']):
        for key in ['index','direction','sample','angle','time','groundBounds','rootCompensation','screenForward','weaponPose','weaponAnchor','weaponAttachment','weaponMuzzle','projectedBodyBounds','projectedCoreBounds','clipped']:assert a.get(key)==b.get(key),(ident,a['index'],key)
        off=b['untrimmedOffset'];assert abs(a['footPivot']['x']-b['footPivot']['x']-off['x'])<1e-9 and abs(a['footPivot']['y']-b['footPivot']['y']-off['y'])<1e-9
        r=b['rect'];s=a['rect'];newbox=(r['x'],r['y'],r['x']+r['width'],r['y']+r['height']);oldbox=(s['x']+off['x'],s['y']+off['y'],s['x']+off['x']+r['width'],s['y']+off['y']+r['height'])
        for src,dst,label in [(color,packed,'color'),(mask,pmask,'bodyMask')]:
            old=src.crop(oldbox);new=dst.crop(newbox);assert old.tobytes()==new.tobytes(),(ident,a['index'],label);digest.update(new.tobytes())
            full=src.crop((s['x'],s['y'],s['x']+s['width'],s['y']+s['height']));restored=Image.new('RGBA',full.size);restored.paste(new,(off['x'],off['y']));opaque=full.getchannel('A').point(lambda z:255 if z else 0);zero=Image.new('RGBA',full.size)
            assert Image.composite(full,zero,opaque).tobytes()==Image.composite(restored,zero,opaque).tobytes(),(ident,a['index'],label,'visible boundary')
        unique[a['direction']].add(hashlib.sha256(color.crop((s['x'],s['y'],s['x']+s['width'],s['y']+s['height'])).tobytes()).hexdigest())
    report={'id':ident,'frames':len(after['frames']),'sourceDirectory':str(source),'sourceAtlasSHA256':sha(source/'atlas.png'),'sourceBodyMaskSHA256':sha(source/'body-alpha.png'),'sourceMetadataSHA256':sha(source/'metadata.json'),'atlasSHA256':sha(dest/'atlas.png'),'bodyMaskSHA256':sha(dest/'body-alpha.png'),'metadataSHA256':sha(dest/'metadata.json'),'visibleColorAndMaskSHA256':digest.hexdigest(),'allVisibleRGBAAndMaskPixelsExact':True,'projectionAndGroundAnchorsExact':True,'uniquePosesPerDirection':{str(k):len(v) for k,v in unique.items()}}
    print(json.dumps({'id':ident,'frames':report['frames'],'pixelExact':True,'uniqueMin':min(report['uniquePosesPerDirection'].values())}),flush=True);return report
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--batch',default='locomotion-hq32.json');args=parser.parse_args();jobs=json.loads((BAKER/'batches'/args.batch).read_text())['jobs'];reports=[verify(j) for j in jobs]
    result={'actors':len(reports),'frames':sum(r['frames'] for r in reports),'allSavedPixelsVerified':True,'assets':reports};(AUDIT/('V029-LOCOMOTION-PIXEL-VERIFICATION'+('' if args.batch=='locomotion-hq32.json' else '-'+Path(args.batch).stem)+'.json')).write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'actors':len(reports),'frames':result['frames'],'allSavedPixelsVerified':True}))
