// Select original live poses by combat relevance, independent of painter depth.
export function selectLiveEnemies(game,limit=12,{radius=150,visible=()=>true}={}){
 const p=game?.player;if(!p)return new Set();const candidates=[];
 for(const e of game.enemies||[]){
  if(!e||e.dead||e.bossKey)continue;const distance=(e.x-p.x)**2+(e.y-p.y)**2;
  const boss=game.boss?.id!==undefined&&e.id===game.boss.id;
  const attack=['windup','charge'].includes(e.attackState)||e.attackCd>.65&&e.attackCd<=.9;
  const tier=boss?0:attack?1:e.hitFlash>0?2:3;
  if(tier===3&&distance>=radius*radius||!visible(e))continue;candidates.push({e,tier,distance});
 }
 candidates.sort((a,b)=>a.tier-b.tier||a.distance-b.distance||(a.e.id||0)-(b.e.id||0));
 return new Set(candidates.slice(0,Math.max(0,Math.floor(limit))).map(item=>item.e));
}

export function selectLiveCorpses(game,limit=12,{visible=()=>true}={}){
 const p=game?.player;if(!p)return new Set();return new Set((game.corpses||[]).filter(c=>!c.bossKey&&(c.duration??12)-(c.time??12)<1.2&&visible(c)).map(c=>({c,tier:c.type==='collector'?0:1,distance:(c.x-p.x)**2+(c.y-p.y)**2})).sort((a,b)=>a.tier-b.tier||a.distance-b.distance||(a.c.seed||0)-(b.c.seed||0)).slice(0,Math.max(0,Math.floor(limit))).map(item=>item.c));
}
