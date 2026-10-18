const owners=new WeakMap(),MAX_RETAINED_BUCKETS=256,mapSize=Object.getOwnPropertyDescriptor(Map.prototype,'size').get;
function stateFor(owner){
  if(!owner||(typeof owner!=='object'&&typeof owner!=='function'))throw TypeError('enemy-grid-owner-required');
  let state=owners.get(owner);
  if(!state){state={grid:null,primaryBuckets:null,pool:[],active:new Set(),mapsCreated:0,bucketsCreated:0,bucketReuses:0,acquisitions:0,leasesCreated:0,trackingArraysCreated:0};owners.set(owner,state);}
  return state;
}
function clearRemainingBucket(bucket){try{if(bucket.length)bucket.length=0;}catch{}}
class EnemyGridLease{
  #state;#buckets;#pooled;#released=false;
  constructor(state,grid,buckets,pooled){this.#state=state;this.grid=grid;this.#buckets=buckets;this.#pooled=pooled;state.leasesCreated++;}
  get retainedActors(){let count=0;if(!this.#released)for(const bucket of this.#buckets)count+=bucket.length;return count;}
  release(){
    if(this.#released)return;this.#released=true;const state=this.#state,grid=this.grid,buckets=this.#buckets,pooled=this.#pooled;
    for(const bucket of buckets){
      let cleared=false;try{bucket.length=0;cleared=bucket.length===0;}catch{}
      if(cleared&&pooled&&state.pool.length<MAX_RETAINED_BUCKETS)state.pool.push(bucket);
    }
    // Existing tracked arrays are already empty. Clear any externally added
    // value too, without another per-release array/Set or duplicate length write.
    grid.forEach(clearRemainingBucket);grid.clear();buckets.length=0;state.active.delete(this);
  }
}

// Fixed tick-start membership, original actor insertion order and live actor
// references. Earlier actors can move/die while a later actor still sees them
// in their original bucket; never rebuild the grid during the enemy update.
export function acquireEnemyGrid(owner,enemies,compact,{reuse=true}={}){
  const state=stateFor(owner),pooled=reuse===true&&state.active.size===0;
  let grid,buckets;
  if(pooled){if(!state.grid){state.grid=new Map();state.primaryBuckets=[];state.mapsCreated++;state.trackingArraysCreated++;}grid=state.grid;buckets=state.primaryBuckets;}
  else{grid=new Map();buckets=[];state.mapsCreated++;state.trackingArraysCreated++;}
  const lease=new EnemyGridLease(state,grid,buckets,pooled);state.active.add(lease);state.acquisitions++;
  try{
    for(const e of enemies){
      if(e.dead)continue;
      const cx=Math.floor(e.x/55),cy=Math.floor(e.y/55),key=compact?cx*65536+cy:cx+','+cy;
      let bucket=grid.get(key);
      if(!bucket){
        if(pooled&&state.pool.length){bucket=state.pool.pop();state.bucketReuses++;}
        else{bucket=[];state.bucketsCreated++;}
        grid.set(key,bucket);buckets.push(bucket);
      }
      bucket.push(e);
    }
  }catch(error){lease.release();throw error;}
  return lease;
}

// Lifetime allocation counters are observations of this helper, not heap/RAM
// measurements. retainedActors counts references in currently open leases;
// retainedBuckets counts empty idle pool arrays, bounded independently at 256.
export function enemyGridAllocationStats(owner){
  const state=owners.get(owner);let retainedActors=0;
  if(state)for(const lease of state.active)retainedActors+=lease.retainedActors;
  return Object.freeze({mapsCreated:state?.mapsCreated??0,bucketsCreated:state?.bucketsCreated??0,bucketReuses:state?.bucketReuses??0,acquisitions:state?.acquisitions??0,leasesCreated:state?.leasesCreated??0,trackingArraysCreated:state?.trackingArraysCreated??0,retainedActors,retainedBuckets:state?.pool.length??0});
}

// QA counts the original inline construction without adding leases, tracking
// arrays, retaining its actors, or changing the production fresh-grid loop.
export function recordFreshEnemyGrid(owner,grid){
  const count=mapSize.call(grid),state=stateFor(owner);
  state.mapsCreated++;state.bucketsCreated+=count;state.acquisitions++;
}
