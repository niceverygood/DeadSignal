"""Combine two fully verified batches without repeating GPU/PNG work."""
import hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];AUDIT=ROOT/'outputs/dead-signal/production-assets/audits/2026-10-16';BAKER=ROOT/'work/asset-enemy-motion-baker-v029'
jobs=json.loads((BAKER/'batches/locomotion-hq32.json').read_text())['jobs'];ids=[j['id'] for j in jobs]
for kind in ['PACKING','PIXEL-VERIFICATION']:
    records=[];inputs=[]
    for batch in ['finals-hq32','characters-hq32']:
        path=AUDIT/f'V029-LOCOMOTION-{kind}-{batch}.json';raw=path.read_bytes();data=json.loads(raw);assert data['actors']==len(data['assets']);records.extend(data['assets']);inputs.append({'path':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(raw).hexdigest()})
    assert len(records)==31 and len({r['id'] for r in records})==31 and sorted(r['id'] for r in records)==sorted(ids)
    lookup={r['id']:r for r in records};records=[lookup[ident] for ident in ids];assert sum(r['frames'] for r in records)==15872
    if kind=='PACKING':
        assert all(r['pixelExact'] and r['clipped']==0 for r in records);result={'actors':31,'frames':15872,'pixelExact':True,'clipped':0,'inputs':inputs,'assets':records}
    else:
        assert all(r['allVisibleRGBAAndMaskPixelsExact'] and r['projectionAndGroundAnchorsExact'] for r in records);result={'actors':31,'frames':15872,'allSavedPixelsVerified':True,'inputs':inputs,'assets':records}
    (AUDIT/f'V029-LOCOMOTION-{kind}.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'actors':31,'frames':15872,'mergedPackingAndPixelEvidence':True}))
