import {roofSupports,roofSegmentSupports} from './rooftop-world.js';
// Shared flow fields let a crowd follow the player or a lure around street
// corners. Coordinates stay on the engine's flat world plane.
const CELL = 56;
const BORDER = 35;
const UNREACHABLE = 65535;
const NEIGHBORS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ZERO = () => ({ x: 0, y: 0 });
const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const squared = (x, y) => x * x + y * y;

function pointRectDistanceSquared(x, y, rect) {
  return squared(x - clamp(x, rect.x, rect.x + rect.w), y - clamp(y, rect.y, rect.y + rect.h));
}
function pointSegmentDistanceSquared(x, y, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? clamp(((x - a.x) * dx + (y - a.y) * dy) / length, 0, 1) : 0;
  return squared(x - a.x - dx * t, y - a.y - dy * t);
}
function segmentIntersectsRect(a, b, rect) {
  let low = 0, high = 1;
  // Scalar slabs avoid allocating three arrays for every crowd sight test.
  for (let axis=0;axis<2;axis++) {
    const start=axis===0?a.x:a.y,delta=axis===0?b.x-a.x:b.y-a.y;
    const min=axis===0?rect.x:rect.y,max=min+(axis===0?rect.w:rect.h);
    if (Math.abs(delta) < 1e-12) {
      if (start < min || start > max) return false;
    } else {
      let first = (min - start) / delta, last = (max - start) / delta;
      if (first > last) { const swap = first; first = last; last = swap; }
      low = Math.max(low, first); high = Math.min(high, last);
      if (low > high) return false;
    }
  }
  return true;
}
function segmentRectDistanceSquared(a, b, rect) {
  if (segmentIntersectsRect(a, b, rect)) return 0;
  return Math.min(
    pointRectDistanceSquared(a.x, a.y, rect), pointRectDistanceSquared(b.x, b.y, rect),
    pointSegmentDistanceSquared(rect.x, rect.y, a, b),
    pointSegmentDistanceSquared(rect.x + rect.w, rect.y, a, b),
    pointSegmentDistanceSquared(rect.x, rect.y + rect.h, a, b),
    pointSegmentDistanceSquared(rect.x + rect.w, rect.y + rect.h, a, b),
  );
}
function toward(from, target) {
  const dx = target.x - from.x, dy = target.y - from.y, length = Math.hypot(dx, dy);
  return length > 1e-6 ? { x: dx / length, y: dy / length } : ZERO();
}

export class Navigation {
  constructor(world) {
    this.world = world;
    this.grids = new Map();
    this.active = [];
    this.revision = null;
    this._sync();
  }

  invalidate() {
    this.revision = null;
    this.grids.clear();
  }

  _sync() {
    const obstacles = this.world.obstacles || [];
    let hash = 2166136261, count = 0;
    for (let i = 0; i < obstacles.length; i++) if (obstacles[i].destroyed) {
      count++;
      hash = Math.imul(hash ^ (i + 1), 16777619);
    }
    const revision = `${this.world.width}:${this.world.height}:${obstacles.length}:${count}:${hash >>> 0}:${this.world.water?.length||0}`;
    if (revision !== this.revision) {
      this.revision = revision;
      this.active = obstacles.filter(rect => !rect.destroyed);if(this.world.water)this.active.push(...this.world.water);
      this.grids.clear();
    }
  }

  _radius(value) { return Number.isFinite(value) ? Math.max(0, value) : 18; }

  _clear(point, radius) {
    if(this.world.rooftop&&!roofSupports(this.world,point.x,point.y,radius))return false;
    if (point.x < BORDER + radius || point.y < BORDER + radius || point.x > this.world.width - BORDER - radius || point.y > this.world.height - BORDER - radius) return false;
    const r2 = radius * radius;
    for (const rect of this.active) {
      if (point.x < rect.x - radius || point.x > rect.x + rect.w + radius || point.y < rect.y - radius || point.y > rect.y + rect.h + radius) continue;
      if (radius === 0 || pointRectDistanceSquared(point.x, point.y, rect) < r2) return false;
    }
    return true;
  }

  _los(from, target, radius,allowVoid=false,fromClear=false,targetClear=false) {
    if ((!fromClear&&!this._clear(from, radius)) || (!targetClear&&!this._clear(target, radius))) return false;
    if(this.world.rooftop&&!allowVoid&&!roofSegmentSupports(this.world,from,target,radius))return false;
    const minX = Math.min(from.x, target.x) - radius, maxX = Math.max(from.x, target.x) + radius;
    const minY = Math.min(from.y, target.y) - radius, maxY = Math.max(from.y, target.y) + radius;
    const numericRadius = typeof radius === 'number', r2 = numericRadius ? radius * radius : null;
    for (const rect of this.active) {
      if (rect.x > maxX || rect.x + rect.w < minX || rect.y > maxY || rect.y + rect.h < minY) continue;
      if (radius === 0 ? segmentIntersectsRect(from, target, rect) : segmentRectDistanceSquared(from, target, rect) < (numericRadius ? r2 : radius * radius)) return false;
    }
    return true;
  }

  lineOfSight(from, target, radius = 18,{allowVoid=false}={}) {
    this._sync();
    return finitePoint(from) && finitePoint(target) && this._los(from, target, this._radius(radius),allowVoid);
  }

  _grid(radius) {
    if (this.grids.has(radius)) {
      const grid = this.grids.get(radius);
      this.grids.delete(radius); this.grids.set(radius, grid);
      return grid;
    }
    // Larger bodies leave less usable width in alleys and fence openings. A
    // finer shared lattice preserves those real passages without weakening
    // collision clearance or rebuilding a path for every enemy.
    const cell = radius >= 18 ? 48 : CELL;
    const cols = Math.ceil(this.world.width / cell), rows = Math.ceil(this.world.height / cell), size = cols * rows;
    const grid = { radius, cell, cols, rows, size, clear: new Uint8Array(size), edges: new Uint8Array(size), components: new Int32Array(size).fill(-1), fields: new Map() };
    for (let i = 0; i < size; i++) grid.clear[i] = this._clear(this._point(grid, i), radius) ? 1 : 0;
    for (let i = 0; i < size; i++) {
      if (!grid.clear[i]) continue;
      const a = this._point(grid, i), col = i % cols, row = Math.floor(i / cols);
      for (let n = 0; n < 4; n++) {
        const [dx, dy] = NEIGHBORS[n], x = col + dx, y = row + dy;
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        const next = y * cols + x;
        if (grid.clear[next] && this._los(a, this._point(grid, next), radius,false,true,true)) {
          grid.edges[i] |= 1 << n;
          grid.edges[next] |= 1 << ((n + 4) % 8);
        }
      }
    }
    const queue = new Int32Array(size);
    let component = 0;
    for (let start = 0; start < size; start++) {
      if (!grid.clear[start] || grid.components[start] >= 0) continue;
      let read = 0, write = 1; queue[0] = start; grid.components[start] = component;
      while (read < write) {
        const current = queue[read++];
        this._neighbors(grid, current, next => {
          if (grid.components[next] < 0) { grid.components[next] = component; queue[write++] = next; }
        });
      }
      component++;
    }
    this.grids.set(radius, grid);
    if (this.grids.size > 8) this.grids.delete(this.grids.keys().next().value);
    return grid;
  }

  _point(grid, i) { return { x: (i % grid.cols + .5) * grid.cell, y: (Math.floor(i / grid.cols) + .5) * grid.cell }; }

  _neighbors(grid, i, visit) {
    const mask = grid.edges[i];
    for (let n = 0; n < 8; n++) if (mask & (1 << n)) {
      const [dx, dy] = NEIGHBORS[n];
      visit(i + dx + dy * grid.cols);
    }
  }

  _nearest(point, grid, component = null, sight = true) {
    // The caller's point is constant throughout this search; lattice nodes have
    // exact clearance already proved in this obstacle revision's grid.clear.
    if(sight&&!this._clear(point,grid.radius))return -1;
    const col = Math.floor(point.x / grid.cell), row = Math.floor(point.y / grid.cell);
    if (sight && col >= 0 && row >= 0 && col < grid.cols && row < grid.rows) {
      const own = row * grid.cols + col;
      if (grid.clear[own] && (component === null || grid.components[own] === component) && this._los(point, this._point(grid, own), grid.radius,false,true,true)) return own;
    }
    let best = -1, bestDistance = Infinity;
    const scan = index => {
      if (!grid.clear[index] || (component !== null && grid.components[index] !== component)) return;
      const node = this._point(grid, index), distance = squared(node.x - point.x, node.y - point.y);
      if (distance >= bestDistance || (sight && !this._los(point, node, grid.radius,false,true,true))) return;
      best = index; bestDistance = distance;
    };
    // Valid actors and targets need a nearby visible node. A blocked target can
    // instead approach the closest point in the actor's connected street area.
    if (sight) {
      for (let y = Math.max(0, row - 3); y <= Math.min(grid.rows - 1, row + 3); y++) for (let x = Math.max(0, col - 3); x <= Math.min(grid.cols - 1, col + 3); x++) scan(y * grid.cols + x);
    } else for (let index = 0; index < grid.size; index++) scan(index);
    return best;
  }

  _field(grid, target, component) {
    const blocked = !this._clear(target, grid.radius);
    const key = `${Math.floor(target.x / grid.cell)},${Math.floor(target.y / grid.cell)}:${component}:${blocked ? 1 : 0}`;
    if (grid.fields.has(key)) {
      const field = grid.fields.get(key);
      if (field.goal < 0 || blocked || this._los(this._point(grid, field.goal), target, grid.radius,false,true,true)) {
        grid.fields.delete(key); grid.fields.set(key, field);
        return field.goal < 0 ? null : field;
      }
      grid.fields.delete(key);
    }
    const goal = this._nearest(target, grid, component, !blocked);
    if (goal < 0) {
      // Sealed rooms are common near street boundaries. Cache failed fields
      // too, so a trapped crowd does not repeat the same goal search per actor.
      grid.fields.set(key, { goal: -1 });
      if (grid.fields.size > 4) grid.fields.delete(grid.fields.keys().next().value);
      return null;
    }
    const distances = new Uint16Array(grid.size).fill(UNREACHABLE), next = new Int32Array(grid.size).fill(-1), queue = new Int32Array(grid.size);
    let read = 0, write = 1; queue[0] = goal; distances[goal] = 0;
    while (read < write) {
      const current = queue[read++];
      this._neighbors(grid, current, neighbor => {
        if (distances[neighbor] === UNREACHABLE) {
          distances[neighbor] = distances[current] + 1;
          next[neighbor] = current;
          queue[write++] = neighbor;
        }
      });
    }
    const field = { goal, distances, next };
    grid.fields.set(key, field);
    if (grid.fields.size > 4) grid.fields.delete(grid.fields.keys().next().value);
    return field;
  }

  _approachBlocked(from, target, radius) {
    // A player or lure can fit closer to a wall than a larger enemy. Once the
    // flow reaches that target's nearest street cell, approach the safe edge of
    // the target rather than stopping an entire cell away from it.
    let low = 0, high = 1;
    for (let i = 0; i < 24; i++) {
      const t = (low + high) / 2;
      const point = { x: from.x + (target.x - from.x) * t, y: from.y + (target.y - from.y) * t };
      if (this._los(from, point, radius,false,true)) low = t; else high = t;
    }
    return Math.hypot(target.x - from.x, target.y - from.y) * low > 3.5 ? toward(from, target) : ZERO();
  }

  direction(from, target, radius = 18) {
    this._sync();
    if (!finitePoint(from) || !finitePoint(target)) return ZERO();
    radius = this._radius(radius);
    if (!this._clear(from, radius)) return ZERO();
    if (this._los(from, target, radius,false,true)) return toward(from, target);
    const grid = this._grid(radius), start = this._nearest(from, grid);
    if (start < 0) return ZERO();
    const field = this._field(grid, target, grid.components[start]);
    if (!field || field.distances[start] === UNREACHABLE) return ZERO();
    if (field.distances[start] === 0 && !this._clear(target, radius)) return this._approachBlocked(from, target, radius);
    let node = start, waypoint = this._point(grid, start);
    // Skip visible intermediate grid points so crowds turn smoothly rather than
    // walking in a stair pattern. Every skipped segment still respects radius.
    for (let i = 0; i < 12 && field.next[node] >= 0; i++) {
      const next = field.next[node], candidate = this._point(grid, next);
      if (!this._los(from, candidate, radius,false,true,true)) break;
      waypoint = candidate; node = next;
    }
    return toward(from, waypoint);
  }
}
