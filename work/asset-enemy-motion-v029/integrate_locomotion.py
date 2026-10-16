"""Register all 31 completed lossless NPC walk atlases in the v029 draft.

No source GLB, baseline atlas, portrait, hero mapping, environment or save state
is modified. All source files are validated before the manifest changes.
"""
import argparse, hashlib, json, shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
DRAFT=ROOT/'work/dead-signal-enemy-motion-v029-draft'
SPRITES=ROOT/'outputs/dead-signal/production-assets/sprites'
REPORTS=ROOT/'outputs/dead-signal/production-assets/audits/2026-10-16'
BATCH=ROOT/'work/asset-enemy-motion-baker-v029/batches/locomotion-hq32.json'

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    path=DRAFT/'dist/production-manifest.js';text=path.read_text();manifest=json.loads(text[text.index('{'):text.rindex('}')+1]);baseline=json.loads(json.dumps(manifest))
    jobs=json.loads(BATCH.read_text())['jobs'];assert len(jobs)==31
    reports=[]
    for job in jobs:
        ident=job['id'];source=SPRITES/ident;m=json.loads((source/'metadata.json').read_text())
        assert m['atlas']['packing']=='trimmed-v1' and m['atlas']['samples']==32 and m['atlas']['directions']==16
        assert m['animation']['name']==job['clip'] and m['animation']['loop'] is True
        assert m['packing']['allFramesPixelExact'] and len(m['frames'])==512 and not any(f['clipped'] for f in m['frames'])
        assert m['source']['file']==job['model'] and m['source']['scale']==job['uniformScale'] and m['source']['originPivot']==job['originPivot']
        assert m['source']['rig']['skins']>0 and m['source']['rig']['bones']>0
        assert all(f.get('bodyIdentificationContour') for f in m['frames'])
        assert (source/'atlas.png').is_file() and (source/'body-alpha.png').is_file()
        old_id=ident.replace('-locomotion-hq32','-rig-motion');assert old_id in manifest['assets'] and ident not in manifest['assets']
        section='bosses' if ident.startswith('boss-') else 'enemies';key=ident.removesuffix('-locomotion-hq32') if section=='bosses' else ident.removeprefix('enemy-').removesuffix('-locomotion-hq32')
        assert manifest[section][key]==old_id
        reports.append({'id':ident,'oldActionId':old_id,'section':section,'key':key,'sourceDirectory':str(source),'decodedBytes':m['atlas']['width']*m['atlas']['height']*4,'frames':len(m['frames']),'samples':32,'clip':m['animation']['name'],'metadataSHA256':sha(source/'metadata.json'),'atlasSHA256':sha(source/'atlas.png'),'pixelExact':True})
    # Only complete batches enter the runtime catalog.
    for r in reports:
        ident=r['id'];shutil.copytree(SPRITES/ident,DRAFT/'dist/assets/production'/ident,dirs_exist_ok=False)
        manifest['assets'][ident]={**manifest['assets'][r['oldActionId']],'metadata':ident+'/metadata.json','atlas':ident+'/atlas.png','bodyAlpha':ident+'/body-alpha.png','revision':r['metadataSHA256']}
        manifest[r['section']][r['key']]={'idle':ident,'walk':ident,'actions':r['oldActionId']}
    for key in ['characters','bossPortraits','bossDetailPortraits','environment','environmentRules']:
        assert baseline.get(key)==manifest.get(key)
    for key,value in baseline['assets'].items():assert manifest['assets'][key]==value
    assert len(manifest['assets'])==len(baseline['assets'])+31
    manifest['motionRevision']='0.29.0'
    path.write_text('// Original GLB textures retained. NPC locomotion uses 32 actual poses per direction; sprite crops are lossless.\nexport const productionManifest='+json.dumps(manifest,ensure_ascii=False,indent=2)+';\n')
    REPORTS.mkdir(parents=True,exist_ok=True)
    result={'version':'0.29.0','draft':str(DRAFT),'registered':len(reports),'oldAssetCount':len(baseline['assets']),'newAssetCount':len(manifest['assets']),'images':reports,'existingAssetRecordsPreserved':True,'heroPortraitsEnvironmentPreserved':True,'savesTouched':False}
    (REPORTS/'V029-LOCOMOTION-REGISTRATION.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k!='images'}))
if __name__=='__main__':main()
