// Measured from the actual normalized survivor-v2-walk GLB, after skinning
// and weapon IK: 44 world units tall, eight and thirty-two original animation samples.
// Provenance: production-assets/qa/native-ground-contact-v025.json and native-ground-contact-v026.json.
const WALK_SOLE_HEIGHT = Object.freeze({
  8: Object.freeze([0.24733204769058512,0.37830619071155475,0.23409187291842343,0.23350846788432034,0.5029796704684946,0.6851023519477502,0.21312051133376025,0.22200465821291404]),
  32: Object.freeze([
    0.24733204769058512, 0.24733204769058512, 0.25149155638381077, 0.2886389992741455,
    0.37830619071155475, 0.41868929734255544, 0.43204490745340307, 0.4690845535680804,
    0.23409187291842343, -0.17141619995357366, -0.12985291215567354, 0.08065500636914949,
    0.23350846788432034, 0.3457477291305308, 0.417557036811046, 0.46126981522386007,
    0.5029796704684946, 0.5370367226517025, 0.5674221649157425, 0.6033179793329266,
    0.6851023519477502, 0.789988706306929, 0.863273829330725, 0.574013621912868,
    0.21312051133376025, 0.18188353477128236, 0.19482915748189328, 0.20767617035785002,
    0.22200465821291404, 0.2347169607787561, 0.24356754543039294, 0.2479063923695965,
  ]),
});

export function playerGroundingHeight(selected) {
  const m = selected?.metadata, f = selected?.frame;
  if (!m?.atlas?.includesWeapon || ![8, 32].includes(m.atlas.samples) || m.projection?.subjectHeight !== 44) return 0;
  if (m.source?.file === 'survivor-v2-walk.glb' && m.animation?.name === 'Armature|walking_man|baselayer')
    return WALK_SOLE_HEIGHT[m.atlas.samples][f?.sample] ?? 0;
  // Preserve the running clip's natural flight. Pulling every running sole
  // to the floor would increase head/hip bounce instead of reducing it.
  if (m.source?.file === 'survivor-v2-run.glb' && m.animation?.name === 'Armature|running|baselayer') return m.atlas.samples === 32 ? .1 : .2;
  return 0;
}
