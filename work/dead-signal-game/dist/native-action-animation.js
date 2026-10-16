const finite = Number.isFinite;
const clamp01 = value => Math.max(0, Math.min(1, value));
const plain = value => value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));

// Spans contain actual separately sampled native clips inside one direction row.
// An invalid span must never draw a neighbouring action or another direction.
export function validAnimationClips(clips, samples) {
  if (!plain(clips) || !Number.isInteger(samples) || samples < 1) return false;
  const entries = Object.entries(clips), used = new Set();
  if (!entries.length || entries.length > 16 || !Object.hasOwn(clips, 'idle')) return false;
  for (const [name, clip] of entries) {
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(name) || ['__proto__', 'constructor', 'prototype'].includes(name)
      || !plain(clip) || !Number.isInteger(clip.start) || clip.start < 0
      || !Number.isInteger(clip.count) || clip.count < 1 || clip.start + clip.count > samples
      || !finite(clip.duration) || clip.duration <= 0 || clip.duration > 30 || typeof clip.loop !== 'boolean') return false;
    for (let index = clip.start; index < clip.start + clip.count; index++) {
      if (used.has(index)) return false;
      used.add(index);
    }
  }
  return true;
}

export function animationClip(metadata, name) {
  const clips = metadata?.animation?.clips;
  return clips && typeof name === 'string' && Object.hasOwn(clips, name) ? clips[name] : null;
}

// Attack clocks come from the simulation's saved countdowns, so rendering an
// attack after pause/restore does not restart it or create another gameplay tick.
export function nativeActionSelection(metadata, actor, {
  pose = 'idle', phase, simulationTime = 0, animationTime = 0, actionDurations = {},
} = {}) {
  const clips = metadata?.animation?.clips;
  if (!clips || !actor) return null;
  const has = name => !!animationClip(metadata, name);
  const action = (name, remaining, duration) => {
    const clip = animationClip(metadata, name);
    if (!clip) return null;
    const time = finite(remaining) && finite(duration) && duration > 0
      ? clamp01(1 - remaining / duration) * clip.duration
      : Math.max(0, finite(animationTime) ? animationTime : 0);
    return { clip: name, timeSeconds: time, phase: undefined, stationary: false };
  };
  if (pose === 'death' || actor.dead === true || finite(actor.hp) && actor.hp <= 0) {
    if (has('death')) return action('death');
  }
  if (['windup', 'attack', 'hit'].includes(pose) && has(pose)) return action(pose);
  if (actor.attackState === 'windup' && has('windup'))
    return action('windup', actor.attackTime, actionDurations.windup);
  if (actor.attackState === 'charge' && has('attack'))
    return action('attack', actor.attackTime, actionDurations.charge);
  if (actor.attackState === 'recover' && actionDurations.recoveryIsAttack && has('attack'))
    return action('attack', actor.attackTime, actionDurations.recover);
  // Damage never hides a boss's warning/active attack pose. Its existing flash
  // remains visible throughout; this reaction is used in ordinary locomotion.
  if (finite(actor.hitFlash) && actor.hitFlash > 0 && has('hit'))
    return action('hit', actor.hitFlash, .12);
  // The screamer already resets its saved skill cooldown to nine seconds when
  // the real summon occurs. Its last warning fraction and first release fraction
  // provide body motion without introducing another skill or gameplay clock.
  if (actor.type === 'screamer' && finite(actor.skillCd)) {
    if (actor.skillCd > 0 && actor.skillCd <= .3 && has('windup'))
      return action('windup', actor.skillCd, .3);
    if (actor.skillCd > 8.55 && actor.skillCd <= 9 && has('attack'))
      return action('attack', actor.skillCd - 8.55, .45);
  }
  // Contact damage resets the existing attackCd to .9. Only its initial .25s
  // represents the strike; the remaining cooldown returns to walk/idle.
  if (finite(actor.attackCd) && actor.attackCd > .65 && actor.attackCd <= .9 && has('attack'))
    return action('attack', actor.attackCd - .65, .25);
  const requested = pose === 'dash' || pose === 'run' ? 'walk' : pose;
  const name = [requested, pose === 'idle' ? 'idle' : 'walk', 'idle', 'walk'].find(has);
  if (!name) return null;
  return { clip: name, phase: name === 'walk' ? phase : undefined,
    timeSeconds: Math.max(0, finite(simulationTime) ? simulationTime : 0), stationary: false };
}

export function namedAnimationSample(metadata, { clip, phase, timeSeconds = 0, stationary = false } = {}) {
  const clips = metadata?.animation?.clips;
  if (!clips) return null;
  const selected = animationClip(metadata, clip)
    || animationClip(metadata, stationary ? 'idle' : 'walk')
    || animationClip(metadata, 'idle')
    || Object.values(clips)[0];
  if (!selected) return 0;
  let sample = 0;
  if (!stationary && selected.count > 1) {
    if (selected.loop && finite(phase)) {
      const tau = Math.PI * 2, wrapped = ((phase % tau) + tau) % tau;
      sample = Math.min(selected.count - 1, Math.floor(wrapped / tau * selected.count + 1e-10));
    } else {
      const time = finite(timeSeconds) ? Math.max(0, timeSeconds) : 0;
      sample = selected.loop
        ? Math.min(selected.count - 1, Math.floor((time % selected.duration) / selected.duration * selected.count))
        : Math.round(Math.min(1, time / selected.duration) * (selected.count - 1));
    }
  }
  return selected.start + sample;
}
