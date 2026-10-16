import {atlasLayout} from './atlas.js';

const plain = value => !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const integer = (value, values) => Number.isInteger(value) && values.includes(value);

export class BatchPaused extends Error {
  constructor() { super('사용자가 배치 작업을 중단했습니다.'); this.name = 'BatchPaused'; }
}

export function normalizeJob(raw, index = 0) {
  if (!plain(raw)) throw new Error('작업은 JSON 객체여야 합니다.');
  const id = typeof raw.id === 'string' ? raw.id : `job-${index + 1}`;
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('id는 영문·숫자·밑줄·하이픈 1~80자여야 합니다.');
  if (typeof raw.model !== 'string' || !/^[^/\\\0]{1,128}\.glb$/i.test(raw.model)) throw new Error('models/의 실제 GLB 파일 이름이 필요합니다.');
  const job = {
    id, ready: raw.ready === true, model: raw.model, exportName: raw.exportName || id,
    directions: raw.directions ?? 16, samples: raw.samples ?? 1, frameSize: raw.frameSize ?? 256,
    subjectHeight: raw.subjectHeight ?? 44, padding: raw.padding ?? 24, outlinePx: raw.outlinePx ?? 1.2,
    shading: raw.shading ?? 'cel', clip: raw.clip ?? null, weaponReady: raw.weaponReady ?? false,
    gripHeight: raw.gripHeight ?? null, rootMotion: raw.rootMotion ?? true,
    frontYawDegrees: raw.frontYawDegrees ?? 0, coreRegion: raw.coreRegion ?? [.15, .18, .85, .72],
    uniformScale: raw.uniformScale ?? null, originPivot: raw.originPivot ?? null,
    weaponModel: raw.weaponModel ?? null, weaponConfig: raw.weaponConfig ?? null,
  };
  if (typeof job.exportName !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(job.exportName)) throw new Error('exportName은 영문·숫자·밑줄·하이픈 1~64자여야 합니다.');
  if (!integer(job.directions, [8, 16]) || !integer(job.samples, [1, 4, 8, 12, 32]) || !integer(job.frameSize, [128, 256, 512])) throw new Error('방향/프레임/해상도 값이 지원 범위를 벗어났습니다.');
  atlasLayout(job);
  if (!finite(job.subjectHeight, 8, 400) || !finite(job.padding, 4, job.frameSize / 3) || !finite(job.outlinePx, 0, 4) || !finite(job.frontYawDegrees, -180, 180)) throw new Error('높이·여백·외곽선·정면 각도 범위를 확인해주세요.');
  if (!['cel', 'unlit', 'matte'].includes(job.shading) || (job.clip !== null && (typeof job.clip !== 'string' || job.clip.length < 1 || job.clip.length > 200))) throw new Error('명암 또는 정확한 clip 이름을 확인해주세요.');
  if (typeof job.weaponReady !== 'boolean' || typeof job.rootMotion !== 'boolean' || (job.gripHeight !== null && !finite(job.gripHeight, 1, 400))) throw new Error('pose 또는 rootMotion 값이 올바르지 않습니다.');
  if (!Array.isArray(job.coreRegion) || job.coreRegion.length !== 4 || !job.coreRegion.every(value => finite(value, 0, 1)) || job.coreRegion[0] >= job.coreRegion[2] || job.coreRegion[1] >= job.coreRegion[3]) throw new Error('coreRegion은 [left,top,right,bottom] 비율이어야 합니다.');
  if (job.uniformScale !== null && !finite(job.uniformScale, .00001, 10000)) throw new Error('uniformScale 범위를 확인해주세요.');
  if (job.originPivot !== null && (!plain(job.originPivot) || !['x', 'y', 'z'].every(key => finite(job.originPivot[key], -1e6, 1e6)))) throw new Error('originPivot은 원본 GLB 좌표 {x,y,z}여야 합니다.');
  if (job.weaponModel !== null && (typeof job.weaponModel !== 'string' || !/^[^/\\\0]{1,128}\.glb$/i.test(job.weaponModel) || !plain(job.weaponConfig) || !job.weaponReady)) throw new Error('실제 weaponModel과 명시 weaponConfig, weaponReady:true가 필요합니다.');
  return job;
}

export function parsePlan(raw) {
  if (!plain(raw) || raw.version !== 1 || !Array.isArray(raw.jobs) || raw.jobs.length > 256) throw new Error('version:1과 최대 256개의 jobs 배열이 필요합니다.');
  const ids = new Set();
  return raw.jobs.map((rawJob, index) => {
    let job, error = null;
    try { job = normalizeJob(rawJob, index); } catch (failure) { error = failure.message; }
    const id = job?.id || `invalid-${index + 1}`;
    if (ids.has(id)) throw new Error(`중복 작업 id: ${id}`);
    ids.add(id);
    return { id, job, status: error ? 'failed' : job.ready ? 'pending' : 'skipped', message: error || (job.ready ? '대기 중' : 'ready:false · 준비되지 않아 건너뜀'), progress: 0, result: null };
  });
}

export function fingerprint(job) {
  if (!job) return '';
  const { ready, ...settings } = job;
  return JSON.stringify(settings);
}

export class BatchQueue {
  constructor(items, { runJob, isAvailable = () => true, onChange = () => {} }) {
    this.items = items;
    this.runJob = runJob;
    this.isAvailable = isAvailable;
    this.onChange = onChange;
    this.state = 'ready';
    this.stopRequested = false;
    this.lastSelection = null;
  }

  summary() {
    const counts = { total: this.items.length, completed: 0, failed: 0, skipped: 0, pending: 0, running: 0 };
    for (const item of this.items) counts[item.status === 'complete' ? 'completed' : item.status]++;
    return counts;
  }

  changed() { this.onChange(this); }

  stop() {
    if (this.state !== 'running') return;
    this.stopRequested = true;
    this.state = 'stopping';
    this.changed();
  }

  checkpoint() {
    return { version: 1, state: this.state, lastSelection: this.lastSelection, items: this.items.map(item => ({ id: item.id, fingerprint: fingerprint(item.job), status: item.status, result: item.result, message: item.message })) };
  }

  async restore(raw, verifyResult) {
    if (!plain(raw) || raw.version !== 1 || !Array.isArray(raw.items)) return;
    for (const item of this.items) {
      const saved = raw.items.find(saved => saved?.id === item.id && saved.fingerprint === fingerprint(item.job));
      if (saved?.status !== 'complete' || !plain(saved.result)) continue;
      let verified = false;
      try { verified = await verifyResult(saved.result, item.job); } catch { /* missing/unavailable files remain pending */ }
      if (verified) {
        item.status = 'complete'; item.result = saved.result; item.progress = 1;
        item.message = '저장된 실제 파일 확인 완료';
      }
    }
    if (['paused', 'running', 'stopping'].includes(raw.state)) this.state = 'paused';
    if (Array.isArray(raw.lastSelection) && raw.lastSelection.every(id => typeof id === 'string' && this.items.some(item => item.id === id))) this.lastSelection = raw.lastSelection;
    this.changed();
  }

  async start(selection = null, { retryFailed = false } = {}) {
    if (this.state === 'running' || this.state === 'stopping') return;
    const selected = selection ? new Set(selection) : null;
    this.lastSelection = selection ? [...selection] : null;
    if (retryFailed) for (const item of this.items) {
      if (item.status === 'failed' && item.job?.ready && (!selected || selected.has(item.id))) {
        item.status = 'pending'; item.message = '재시도 대기';
      }
    }
    this.stopRequested = false;
    this.state = 'running'; this.changed();
    for (const item of this.items) {
      if (this.stopRequested) break;
      if (item.status !== 'pending' || (selected && !selected.has(item.id))) continue;
      if (!this.isAvailable(item.job)) {
        item.status = 'skipped'; item.message = `실제 models/${item.job.model} 파일이 없어 건너뜀`;
        this.changed(); continue;
      }
      item.status = 'running'; item.message = '실제 GLB 불러오기'; item.progress = 0;
      this.changed();
      try {
        const result = await this.runJob(item.job, {
          shouldStop: () => this.stopRequested,
          report: (message, progress = item.progress) => {
            item.message = message; item.progress = Math.min(1, Math.max(0, progress)); this.changed();
          },
        });
        if (!plain(result) || typeof result.directory !== 'string' || !plain(result.files) || !result.files.atlas || !result.files.metadata) throw new Error('실제 PNG와 metadata 저장 경로가 확인되지 않았습니다.');
        item.result = result; item.status = 'complete'; item.progress = 1;
        item.message = '실제 PNG·metadata 저장 완료';
      } catch (error) {
        if (error instanceof BatchPaused) {
          item.status = 'pending'; item.message = '중단됨 · 재개하면 이 작업부터 다시 제작';
          this.stopRequested = true;
        } else { item.status = 'failed'; item.message = error.message || String(error); }
      }
      this.changed();
    }
    this.state = this.stopRequested ? 'paused' : 'ready';
    this.changed();
  }

  resume() { return this.start(this.lastSelection); }
}
