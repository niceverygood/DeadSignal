import {createHash} from 'node:crypto';

// QA source transform only. It never imports/runs Game or writes a product file.
// Scope: normal unchanged Math.exp/intrinsics during an updateEnemies call.
// Replacing Math.exp from an actor getter is not an equivalence claim. Primitive
// numeric dt needs only its first actually reached damping calculation; other dt
// values retain every original unary-minus/multiply/Math.exp coercion and call.
const BASE_SHA256='72487b352161059b5745a3e5cfc149ff71ae3f7b98c7e310b5d8b3a5345260ce';
const OLD_HEADER='  updateEnemies(dt){\n    const p=this.player,cell=55;';
const NEW_HEADER='  updateEnemies(dt){\n    const p=this.player,cell=55,numericDt=typeof dt===\'number\';let enemyDamping;';
const OLD_PAIR='e.vx*=Math.exp(-dt*9);e.vy*=Math.exp(-dt*9);';
const RHS="(numericDt?(enemyDamping??=Math.exp(-dt*9)):Math.exp(-dt*9))";
const NEW_PAIR='e.vx*='+RHS+';e.vy*='+RHS+';';

function occurrences(source,text){let count=0,at=0;while((at=source.indexOf(text,at))!==-1){count++;at+=text.length;}return count;}

export function buildDampingCandidate(source){
 if(typeof source!=='string')throw new TypeError('damping-candidate-source-string-required');
 if(createHash('sha256').update(source,'utf8').digest('hex')!==BASE_SHA256)throw new Error('damping-candidate-original-sha-mismatch');
 if(occurrences(source,OLD_HEADER)!==1||occurrences(source,OLD_PAIR)!==2)throw new Error('damping-candidate-original-sites-mismatch');
 const candidate=source.replace(OLD_HEADER,NEW_HEADER).split(OLD_PAIR).join(NEW_PAIR);
 if(occurrences(candidate,NEW_HEADER)!==1||occurrences(candidate,NEW_PAIR)!==2)throw new Error('damping-candidate-new-sites-mismatch');
 const inverse=candidate.split(NEW_PAIR).join(OLD_PAIR).replace(NEW_HEADER,OLD_HEADER);
 if(inverse!==source)throw new Error('damping-candidate-inverse-mismatch');
 return candidate;
}
