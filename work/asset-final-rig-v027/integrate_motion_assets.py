"""Register reviewed, lossless packed atlases in the isolated v027 draft only."""
import hashlib, json, shutil
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
DRAFT=ROOT/'work/dead-signal-animation-v027-draft'
SPRITES=ROOT/'outputs/dead-signal/production-assets/sprites'
AUDIT=ROOT/'outputs/dead-signal/production-assets/audits/2026-10-16'

def main():
    baseline=(ROOT/'work/dead-signal-game/dist/production-manifest.js').read_text()
    m=json.loads(baseline[baseline.index('{'):baseline.rindex('}')+1]);before={k:json.dumps(m.get(k),sort_keys=True) for k in ['bossPortraits','bossDetailPortraits','environment','environmentRules']}
    reports=[]
    def register(folder,key=None,base=None):
        source=SPRITES/folder
        if not (source/'metadata.json').is_file():raise FileNotFoundError(source)
        data=(source/'metadata.json').read_bytes();metadata=json.loads(data)
        assert metadata['atlas']['packing']=='trimmed-v1'
        assert metadata['packing']['allFramesPixelExact'] and not any(f['clipped'] for f in metadata['frames'])
        target=DRAFT/'dist/assets/production'/folder;shutil.copytree(source,target,dirs_exist_ok=True)
        key=key or folder
        prior=m['assets'].get(base or key,{})
        m['assets'][key]={**prior,'metadata':folder+'/metadata.json','atlas':folder+'/atlas.png','bodyAlpha':folder+'/body-alpha.png','revision':hashlib.sha256(data).hexdigest()}
        reports.append({'id':key,'folder':folder,'frames':len(metadata['frames']),'decodedMiB':metadata['atlas']['width']*metadata['atlas']['height']*4/1048576,'pixelExact':True,'metadataSHA256':hashlib.sha256(data).hexdigest()})
        return key
    def first(value):
        if isinstance(value,str):return value
        return next(v for v in value.values() if isinstance(v,str))
    for number in range(1,13):
        for role in ['mid','final']:
            boss=f'boss-{number:02d}-{role}';asset=boss+'-rig-motion'
            register(asset,base=first(m['bosses'][boss]));m['bosses'][boss]=asset
    for enemy in ['walker','runner','shield','screamer','gas','elite','collector']:
        asset='enemy-'+enemy+'-rig-motion';register(asset,base=first(m['enemies'][enemy]));m['enemies'][enemy]=asset
    for weapon in ['shotgun','nailgun']:
        for action in ['walk','run']:
            register(f'survivor-{weapon}-{action}-hq32-packed',key=f'survivor-{weapon}-{action}')
        asset=f'survivor-{weapon}-rig-motion';register(asset,base=f'survivor-{weapon}-idle');m['characters'][f'survivor-{weapon}']['actions']=asset
    for key,value in before.items():assert json.dumps(m.get(key),sort_keys=True)==value
    m['motionRevision']='0.27.0'
    out=DRAFT/'dist/production-manifest.js';out.write_text('// Original GLB textures and resolution retained. Action atlas crops are lossless.\nexport const productionManifest='+json.dumps(m,ensure_ascii=False,indent=2)+';\n')
    pkg=json.loads((DRAFT/'package.json').read_text());pkg['version']='0.27.0';(DRAFT/'package.json').write_text(json.dumps(pkg,indent=2)+'\n')
    (AUDIT/'runtime-motion-registration.json').write_text(json.dumps({'version':'0.27.0','draft':str(DRAFT),'count':len(reports),'assets':reports,'staticPortraitsPreserved':True,'environmentAndRulesPreserved':True,'humanProfileTouched':False,'oldSignedBuildsTouched':False},indent=2)+'\n')
    print(json.dumps({'registered':len(reports),'bosses':24,'enemyTypes':7,'playerWeaponVariants':2,'heroHQ32Packed':4,'portraitsPreserved':True}))

if __name__=='__main__':main()
