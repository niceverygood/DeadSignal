from pathlib import Path
import datetime, fnmatch, hashlib, json, os, re, shutil, sys

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'outputs/dead-signal/transfer-v029'
PROJECT = OUT / 'project'
BASE = json.loads((ROOT/'work/transfer-baseline-inventory-v029.json').read_text())
MOBILE = json.loads((ROOT/'work/transfer-mobile-inventory-v029.json').read_text())
SKIP_DIRS = set(MOBILE['excludeNames']) | {'.openai', '__pycache__', '.venv', '.pytest_cache', '.cache'}
SKIP_PATTERNS = ['.env*', '.npmrc', '.netrc', '.git-credentials', '*.jks', '*.keystore', '*.p12', '*.pfx', '*.p8', '*.pem', '*.key', '*.mobileprovision', '*.cer', '*.xcuserstate', '*.apk', '*.aab', '*.ipa', '*.log', '*credentials*.json', '*service-account*.json', 'google-services.json', 'GoogleService-Info.plist', 'local.properties', 'key.properties', 'keystore.properties', 'qa-server.json']
SECRET = re.compile(rb'(?:msy_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{25,}|sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)')
TEXT_EXT = {'.txt','.md','.json','.js','.mjs','.cjs','.html','.css','.py','.sh','.ps1','.yml','.yaml','.toml','.xml','.plist','.gradle','.properties','.svg','.pbxproj'}
files = set()
excluded = set()

def allowed(rel):
    p = Path(rel)
    if any(part in SKIP_DIRS for part in p.parts) or any(fnmatch.fnmatch(p.name, pat) for pat in SKIP_PATTERNS):
        return False
    s = p.as_posix()
    return not (s.startswith('work/dead-signal-mobile/android/app/src/main/assets/public/') or s.startswith('work/dead-signal-mobile/ios/App/App/public/') or s.startswith('work/dead-signal-game/work/'))

def add(rel):
    p = ROOT/rel
    if not p.is_file():
        raise FileNotFoundError(rel)
    if not allowed(rel):
        excluded.add(rel); return
    if not p.resolve().is_relative_to(ROOT):
        raise ValueError('Source escapes workspace: '+rel)
    files.add(Path(rel).as_posix())

def tree(rel):
    base = ROOT/rel
    if not base.exists(): raise FileNotFoundError(rel)
    for current, dirs, names in os.walk(base, followlinks=False):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in names:
            p = Path(current)/name
            add(p.relative_to(ROOT).as_posix())

for rel in ['work/dead-signal-game','outputs/dead-signal/production-assets','outputs/dead-signal/moodboards-50','outputs/dead-signal/mobile/v1.0.0/store','outputs/dead-signal/google-play-release']:
    tree(rel)
for rel in BASE['allRequiredExternalGameTestFiles'] + BASE['recommendedLocalUtilityFiles'] + BASE['recommendedToolCodeFiles'] + BASE['recommendedMobileSourceFiles']:
    add(rel)
for rel in ['work/meshy-sprite-baker/models','work/asset-motion-baker-v027/models','work/asset-enemy-motion-baker-v029/models','work/asset-final-rig-v027']:
    tree(rel)
for rel in ['work/transfer-baseline-inventory-v029.json','work/transfer-mobile-inventory-v029.json','work/build-transfer-v029.py']:
    add(rel)
tools_inventory=ROOT/'work/transfer-tools-inventory-v029.json'
if tools_inventory.exists():
    a=json.loads(tools_inventory.read_text())
    for entry in a.get('additionalRequiredFiles',[]): add(entry['path'] if isinstance(entry,dict) else entry)
    add('work/transfer-tools-inventory-v029.json')

assert not PROJECT.exists(), 'Refusing to overwrite an existing transfer snapshot'
OUT.mkdir(parents=True, exist_ok=True)
PROJECT.mkdir()
status={'version':'0.29.0','status':'preparing','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'originalWorkspaceChanged':False,'sourceFiles':len(files),'sourceBytes':sum((ROOT/f).stat().st_size for f in files)}
(OUT/'STATUS.json').write_text(json.dumps(status,indent=2)+'\n')
print(json.dumps(status),flush=True)
records=[]
for index,rel in enumerate(sorted(files),1):
    src=ROOT/rel; dst=PROJECT/rel
    if src.suffix.lower() in TEXT_EXT or src.name.startswith('.'):
        content=src.read_bytes()
        if SECRET.search(content):
            status.update(status='blocked-secret-detected',path=rel)
            (OUT/'STATUS.json').write_text(json.dumps(status,indent=2)+'\n')
            raise RuntimeError('Potential credential content detected; no credential value printed: '+rel)
    dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
    h=hashlib.sha256()
    with src.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
    digest=h.hexdigest()
    records.append({'path':rel,'bytes':src.stat().st_size,'sourceSHA256':digest})
    if index%500==0:print('copied',index,'/',len(files),flush=True)

(PROJECT/'.transfer').mkdir()
(PROJECT/'.transfer/source-manifest.json').write_text(json.dumps({'version':'0.29.0','files':records,'excludedFiles':sorted(excluded)},indent=2)+'\n')
mapping={}
report=json.loads((ROOT/'outputs/dead-signal/production-assets/audits/2026-10-16/V029-LOCOMOTION-PIXEL-VERIFICATION.json').read_text())
for row in report['assets']:
    rel=Path(row['sourceDirectory']).relative_to(ROOT).as_posix()
    assert all((PROJECT/rel/f).is_file() for f in ['atlas.png','body-alpha.png','metadata.json'])
    mapping[row['id']]=rel
(PROJECT/'.transfer/evidence-source-paths.json').write_text(json.dumps(mapping,indent=2)+'\n')
status.update(status='copied-needs-portability-validation',copiedFiles=len(records),copiedBytes=sum(r['bytes'] for r in records))
(OUT/'STATUS.json').write_text(json.dumps(status,indent=2)+'\n')
print(json.dumps(status),flush=True)
