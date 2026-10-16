"""Add conservative multi-limb skeletal deformation to existing final-boss GLBs.

No generated/repainted pixels, topology replacement or Meshy requests. Original
binary prefix and attributes remain intact. These are locally authored rigs;
structural validation does not constitute visual approval or anatomical IK.
"""
import copy, hashlib, json, math, struct
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
MODELS = ROOT / 'outputs/dead-signal/production-assets/models'
OUT = ROOT / 'outputs/dead-signal/production-assets/audits/2026-10-16'
SOURCES = {1:'boss-01-final-v2',2:'boss-02-final-v1',3:'boss-03-final-v1',4:'boss-04-final-v1',5:'boss-05-final-v1',6:'boss-06-final-v1',7:'boss-07-final-v2',8:'boss-08-final-v1',9:'boss-09-final-v1',10:'boss-10-final-repaired-v2',11:'boss-11-final-v2',12:'boss-12-final-v1'}
# Family profiles alter timing and restrained articulation without inventing limbs.
PROFILES = {1:('hammer',4,2,.95),2:('crawler',4,4,1.15),3:('radio',4,4,.72),4:('toxin',4,2,.85),5:('shield',4,2,.75),6:('leaper',4,4,1.05),7:('conductor',6,2,.9),8:('furnace',4,4,.72),9:('mine',4,4,.8),10:('crusher',4,4,.65),11:('artillery',6,4,.78),12:('storm',6,4,.86)}
SPANS = {'idle':{'start':0,'count':4,'duration':1.8,'loop':True},'walk':{'start':4,'count':8,'duration':1.2,'loop':True},'windup':{'start':12,'count':6,'duration':.8,'loop':False},'attack':{'start':18,'count':6,'duration':.55,'loop':False},'hit':{'start':24,'count':2,'duration':.22,'loop':False},'death':{'start':26,'count':6,'duration':1.15,'loop':False}}

def read_glb(path):
    raw=path.read_bytes(); assert raw[:4]==b'glTF'
    n=struct.unpack_from('<I',raw,12)[0]; doc=json.loads(raw[20:20+n]); start=20+n
    bn=struct.unpack_from('<I',raw,start)[0]
    return raw,doc,bytearray(raw[start+8:start+8+bn])

def accessor(doc, binary, index):
    a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
    dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
    dims={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
    size=np.dtype(dtype).itemsize
    return np.ndarray((a['count'],dims),dtype=dtype,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',dims*size),size)).copy()

def append_accessor(doc, binary, data, kind, ctype=5126, target=None):
    data=np.asarray(data,dtype={5126:'<f4',5123:'<u2'}[ctype]);binary.extend(b'\0'*((-len(binary))%4));off=len(binary);raw=data.tobytes();binary.extend(raw)
    view={'buffer':0,'byteOffset':off,'byteLength':len(raw)}
    if target:view['target']=target
    vi=len(doc['bufferViews']);doc['bufferViews'].append(view)
    a={'bufferView':vi,'byteOffset':0,'componentType':ctype,'count':len(data),'type':kind}
    if kind=='SCALAR':a.update(min=[float(data.min())],max=[float(data.max())])
    ai=len(doc['accessors']);doc['accessors'].append(a);return ai

def quat(x=0,y=0,z=0):
    # Intrinsic XYZ composed in glTF xyzw convention.
    cx,sx=math.cos(x/2),math.sin(x/2);cy,sy=math.cos(y/2),math.sin(y/2);cz,sz=math.cos(z/2),math.sin(z/2)
    return [sx*cy*cz+cx*sy*sz,cx*sy*cz-sx*cy*sz,cx*cy*sz+sx*sy*cz,cx*cy*cz-sx*sy*sz]

def ease(p):return p*p*(3-2*p)

def build(number):
    source=MODELS/SOURCES[number]/'model.glb';original,doc,binary=read_glb(source);prefix=bytes(binary);old_doc=copy.deepcopy(doc)
    assert not doc.get('skins')
    family,arm_count,leg_count,strength=PROFILES[number]
    mesh_nodes=[i for i,n in enumerate(doc['nodes']) if 'mesh' in n]
    for ni in mesh_nodes:
        n=doc['nodes'][ni];assert 'translation' not in n and 'rotation' not in n and 'scale' not in n
        if 'matrix' in n:assert np.allclose(np.array(n['matrix']),np.eye(4).reshape(-1))
    positions=np.concatenate([accessor(doc,binary,p['attributes']['POSITION']) for m in doc['meshes'] for p in m['primitives']]);lo=positions.min(0);hi=positions.max(0);extent=hi-lo;center=(hi+lo)/2;H=float(extent[1]);W=float(extent[0]);D=float(extent[2]);floor=float(lo[1])
    coords=[];names=[];parents=[];roles=[]
    def joint(name,point,parent=-1,role=None):
        names.append(name);coords.append(np.array(point,float));parents.append(parent);roles.append(role or {});return len(names)-1
    root=joint('DS_Root',[center[0],floor,center[2]])
    # Chest pivot is independent of planted legs. Flat armor stays on its parent.
    chest=joint('DS_Thorax',[center[0],floor+H*.52,center[2]],root,{'type':'chest'})
    head=joint('DS_Head',[center[0],floor+H*.81,center[2]],chest,{'type':'head'})
    for pair in range(arm_count//2):
        level=.67-pair*.17
        for side in [-1,1]:
            shoulder=joint(f'DS_Arm_{pair}_{side}',[center[0]+side*W*.20,floor+H*level,center[2]],chest,{'type':'arm','pair':pair,'side':side})
            joint(f'DS_Forearm_{pair}_{side}',[center[0]+side*W*.34,floor+H*(level-.12),center[2]],shoulder,{'type':'forearm','pair':pair,'side':side})
    for pair in range(leg_count//2):
        z=center[2]+(0 if leg_count==2 else (pair*2-1)*D*.22)
        for side in [-1,1]:
            hip=joint(f'DS_Leg_{pair}_{side}',[center[0]+side*W*.13,floor+H*.29,z],root,{'type':'leg','pair':pair,'side':side})
            foot=joint(f'DS_Foot_{pair}_{side}',[center[0]+side*W*.23,floor+H*.055,z],hip,{'type':'foot','pair':pair,'side':side})
    coords=np.array(coords);node_offset=len(doc['nodes'])
    for i,name in enumerate(names):
        local=coords[i]-(coords[parents[i]] if parents[i]>=0 else 0)
        node={'name':name,'translation':local.tolist(),'rotation':[0,0,0,1]}
        children=[node_offset+j for j,p in enumerate(parents) if p==i]
        if children:node['children']=children
        doc['nodes'].append(node)
    for scene in doc['scenes']:scene.setdefault('nodes',[]).append(node_offset)
    inv=np.tile(np.eye(4,dtype=np.float32),(len(names),1,1));inv[:,:3,3]=-coords
    # Accessor MAT4 bytes are column-major.
    ia=append_accessor(doc,binary,inv.transpose(0,2,1).reshape(-1,16),'MAT4')
    doc['skins']=[{'name':f'DS_{family}_custom_multi_limb','joints':[node_offset+i for i in range(len(names))],'inverseBindMatrices':ia,'skeleton':node_offset}]
    weight_stats=[]
    for ni in mesh_nodes:
        node=doc['nodes'][ni];node.pop('matrix',None);node['skin']=0
        for primitive in doc['meshes'][node['mesh']]['primitives']:
            pos=accessor(doc,binary,primitive['attributes']['POSITION']);v=len(pos);yn=(pos[:,1]-floor)/H;xn=(pos[:,0]-center[0])/W;zn=(pos[:,2]-center[2])/max(D,1e-6)
            weights=np.zeros((v,len(names)),np.float64)
            # Smooth region field. Restrained rotations deliberately avoid claiming
            # exact automatic anatomical segmentation of fused multi-arm meshes.
            upper=np.clip((yn-.33)/.22,0,1)
            sidefield=np.clip((np.abs(xn)-.14)/.14,0,1)
            limb=sidefield*upper*(1-np.clip((yn-.86)/.09,0,1))
            lower=np.clip((.38-yn)/.13,0,1)
            central=1-lower
            weights[:,chest]=central*(1-limb)
            weights[:,root]=lower*.10
            headmask=np.clip((yn-.77)/.13,0,1)*(1-sidefield)
            weights[:,head]=headmask*.55
            weights[:,chest]*=(1-headmask*.55)
            for i,r in enumerate(roles):
                if r.get('type') in ['arm','forearm']:
                    side=(xn*r['side']>0).astype(float);level=.67-r['pair']*.17
                    band=np.exp(-((yn-(level-.08))/.14)**2)
                    far=np.clip((np.abs(xn)-.29)/.13,0,1)
                    weights[:,i]=limb*side*band*(far if r['type']=='forearm' else 1-far)
                elif r.get('type') in ['leg','foot']:
                    side=(xn*r['side']>=0).astype(float)
                    depth=np.ones(v) if leg_count==2 else np.clip(.5+(r['pair']*2-1)*zn*3,0,1)
                    foot=np.clip((.13-yn)/.08,0,1)
                    weights[:,i]=lower*.9*side*depth*(foot if r['type']=='foot' else 1-foot)
            # Rear steel crossbeams of repaired crusher move rigidly with chassis.
            if number==10 and 'crossbeam' in node.get('name',''):
                weights.fill(0);weights[:,root]=1
            order=np.argsort(weights,axis=1)[:,-4:][:,::-1];top=np.take_along_axis(weights,order,axis=1);zero=top.sum(1)<1e-10;order[zero,0]=root;top[zero,0]=1;top/=top.sum(1)[:,None]
            primitive['attributes']['JOINTS_0']=append_accessor(doc,binary,order,'VEC4',5123,34962)
            primitive['attributes']['WEIGHTS_0']=append_accessor(doc,binary,top,'VEC4',5126,34962)
            assert np.isfinite(top).all() and np.max(np.abs(top.sum(1)-1))<1e-6
            weight_stats.append({'node':node.get('name',str(ni)),'vertices':v,'weightedJoints':int(len(np.unique(order[top>1e-6]))),'maxWeightSumError':float(np.max(np.abs(top.sum(1)-1)))})

    def pose(name,p):
        rotations=[[0,0,0] for _ in names];translations=[coords[i]-(coords[parents[i]] if parents[i]>=0 else 0) for i in range(len(names))]
        wave=math.sin(p*math.tau);pulse=math.sin(p*math.pi);hold=ease(p)
        rotations[chest]=[.008*wave,0,.004*wave]
        if name=='windup':rotations[chest]=[-.06*hold, .015*hold*(1 if number%2 else -1),0]
        elif name=='attack':rotations[chest]=[.095*math.sin(p*math.pi),.03*pulse,0]
        elif name=='hit':rotations[chest]=[-.065*(1-p),0,.045*(1-p)]
        elif name=='death':
            rotations[chest]=[.25*hold,0,.08*hold];translations[chest]=translations[chest]+np.array([0,-H*.11*hold,0])
            rotations[head]=[.20*hold,0,.1*hold]
        for i,r in enumerate(roles):
            typ=r.get('type');side=r.get('side',1);pair=r.get('pair',0)
            if typ in ['arm','forearm']:
                base=.012*math.sin(p*math.tau+pair*.8+side*.4)
                if name=='walk':base=.035*math.sin(p*math.tau+pair*.9+side*1.57)
                elif name=='windup':base=(-.15 if typ=='arm' else -.11)*hold*(1-pair*.12)
                elif name=='attack':base=(.23 if family in ['hammer','leaper','crusher'] else .15)*math.sin(p*math.pi)*(1-pair*.11)
                elif name=='hit':base=-.08*(1-p)
                elif name=='death':base=.16*hold
                rotations[i]=[base*strength,0,side*.02*pulse if name in ['windup','attack'] else 0]
            elif typ in ['leg','foot'] and name=='walk':
                # Plant first half; small swing translated as a rigid chain in second
                # half rather than rotating the sole through the ground plane.
                u=(p+(.5 if side<0 else 0)+pair*.5)%1
                swing=math.sin(max(0,(u-.5)*2)*math.pi)
                if typ=='leg':translations[i]=translations[i]+np.array([0,H*.018*swing,D*.032*math.sin(p*math.tau+side*1.57+pair*math.pi)])
            elif typ=='leg' and name in ['windup','attack','hit']:
                # Feet remain planted. Weight-bearing chassis shifts are upper body only.
                pass
        return [quat(*angles) for angles in rotations],[x.tolist() for x in translations]

    animations=[]
    def animation(name,times,poses):
        ti=append_accessor(doc,binary,np.array(times).reshape(-1,1),'SCALAR');samplers=[];channels=[]
        for i in range(len(names)):
            qs=[x[0][i] for x in poses];ts=[x[1][i] for x in poses]
            for path,data,kind in [('rotation',qs,'VEC4'),('translation',ts,'VEC3')]:
                ai=append_accessor(doc,binary,data,kind);si=len(samplers);samplers.append({'input':ti,'output':ai,'interpolation':'LINEAR'});channels.append({'sampler':si,'target':{'node':node_offset+i,'path':path}})
        animations.append({'name':name,'samplers':samplers,'channels':channels})
    reel=[]
    for name,span in SPANS.items():
        count=25;times=np.linspace(0,span['duration'],count).tolist();poses=[pose(name,i/(count-1)) for i in range(count)];animation('DS_'+name,times,poses)
        for i in range(span['count']):reel.append(pose(name,i/(span['count'] if span['loop'] else max(1,span['count']-1))))
    # Baker sees a looping reel and samples at exact integer positions 0..31.
    animation('DS_MotionReel',[i/12 for i in range(33)],reel+[reel[-1]])
    doc['animations']=animations
    doc['extras']={**doc.get('extras',{}),'deadSignalRig':{'type':'locally-authored multi-limb weighted skeleton','profile':family,'arms':arm_count,'legs':leg_count,'jointCount':len(names),'source':str(source.relative_to(ROOT)),'sourceSHA256':hashlib.sha256(original).hexdigest(),'preservesOriginalBinaryPrefix':True,'newTopology':False,'repaintedTextures':False,'anatomicalAutoRig':False,'requiresVisualReview':True,'atlasClips':SPANS}}
    assert bytes(binary[:len(prefix)])==prefix
    for a,b in zip(old_doc['meshes'],doc['meshes']):
        for pa,pb in zip(a['primitives'],b['primitives']):
            for key,value in pa['attributes'].items():assert pb['attributes'][key]==value
            assert pa.get('indices')==pb.get('indices') and pa.get('material')==pb.get('material')
    doc['buffers'][0]['byteLength']=len(binary);binary.extend(b'\0'*((-len(binary))%4));j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
    result=struct.pack('<III',0x46546c67,2,12+8+len(j)+8+len(binary))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binary),0x004e4942)+binary
    destination=MODELS/f'boss-{number:02d}-final-motion-v1';destination.mkdir(exist_ok=True);(destination/'model.glb').write_bytes(result)
    report={'id':f'boss-{number:02d}-final','source':str(source.relative_to(ROOT)),'model':str((destination/'model.glb').relative_to(ROOT)),'sha256':hashlib.sha256(result).hexdigest(),'profile':family,'joints':len(names),'arms':arm_count,'legs':leg_count,'clips':[a['name'] for a in animations],'atlasClips':SPANS,'originalBinaryBytesUnchanged':len(prefix),'weights':weight_stats,'structuralValidation':'passed','visualApproval':'pending'}
    (destination/'rig-provenance.json').write_text(json.dumps(report,indent=2)+'\n');return report

if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True);reports=[build(i) for i in range(1,13)]
    (OUT/'final-boss-derived-rigs.json').write_text(json.dumps({'count':len(reports),'noPaidRequests':True,'assets':reports},indent=2)+'\n')
    print(json.dumps({'models':len(reports),'joints':sum(x['joints'] for x in reports),'originalBinaryPreserved':True,'visualApproval':'pending'}))
