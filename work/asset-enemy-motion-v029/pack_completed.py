"""Pack complete GPU exports only; no API or procedural replacement art."""
import argparse,concurrent.futures,importlib.util,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('lossless_pack',ROOT/'work/asset-final-rig-v027/pack_motion_atlas.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
BAKER=ROOT/'work/asset-enemy-motion-baker-v029';SPRITES=ROOT/'outputs/dead-signal/production-assets/sprites';AUDIT=ROOT/'outputs/dead-signal/production-assets/audits/2026-10-16'
jobs=[]
def run(job):
    ident=job['id'];sources=sorted((BAKER/'exports').glob(ident+'-*'))
    sources=[p for p in sources if all((p/n).is_file() for n in ['metadata.json','atlas.png','body-alpha.png'])]
    if len(sources)!=1:raise RuntimeError(f'{ident}: expected one complete export, found {len(sources)}')
    destination=SPRITES/ident
    if destination.exists():raise RuntimeError(f'Refusing to overwrite {destination}')
    report=module.pack(sources[0],destination)
    if report['clipped']:raise RuntimeError(f'{ident} clipped frames')
    report['id']=ident;report['export']=str(sources[0]);print(json.dumps(report),flush=True);return report
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--batch',default='locomotion-hq32.json');args=parser.parse_args();jobs=json.loads((BAKER/'batches'/args.batch).read_text())['jobs']
    # PNG optimization consumes CPU; two workers bound memory to two atlases.
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(run,jobs))
    AUDIT.mkdir(parents=True,exist_ok=True);(AUDIT/('V029-LOCOMOTION-PACKING-'+Path(args.batch).stem+'.json')).write_text(json.dumps({'actors':len(results),'frames':sum(r['frames'] for r in results),'pixelExact':all(r['pixelExact'] for r in results),'clipped':sum(r['clipped'] for r in results),'assets':results},indent=2)+'\n')
    print(json.dumps({'actors':len(results),'frames':sum(r['frames'] for r in results),'decodedMiB':sum(r['packedMiB'] for r in results),'pixelExact':all(r['pixelExact'] for r in results)}))
