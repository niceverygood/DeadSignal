# Meshy → DEAD SIGNAL sprite baker

Local prototype only. The game source is unchanged. No Meshy credential is read or used by this tool.

## Run

```sh
cd /Users/seungsoohan/Documents/Codex/2026-10-14/new-chat-3/work/meshy-sprite-baker
npm start
```

Open http://127.0.0.1:8804. Put the actual downloaded GLB under `models/`, refresh the model list, load the model, click **방향별 아틀라스 만들기**, inspect the result, then click **아틀라스 저장**. No placeholder/cube character is created if the GLB is missing. The button posts same-origin to `/api/export` and writes a timestamped directory under `exports/` with:

- `atlas.png`: transparent RGBA directional body sprites with a dark ink outline.
- `body-alpha.png`: corresponding white-alpha mask without the outline, floor, or generated ground shadow.
- `metadata.json`: source file, fixed foot pivot, density, directions, source animation/time, raw alpha bounds, torso-band core bounds, relative projected world bounds, material/light recipe, and frame rectangles.

The geometry and baseColor texture/color factor come from the actual GLB. The surface selector compares standardized matte Lambert diffuse, unlit original baseColor, and three-band toon shading with the same texture. This is a deliberate artistic rendering choice; the source PBR metallic/roughness response is not reproduced. No ground plane, model replacement, or shadow is generated. Any floor geometry already embedded in a GLB must be removed or rejected during asset review.

## Contract

`manifest.json` sets initial controls. `modelPath` may be `/models/<name>.glb`; default null. UI supports 8/16 directions, 128/256/512-pixel frames, up to 32 animation samples, asset height 8–400 world units, fixed padding, outline, and a front-facing correction. The reference forward direction is model +Z. Game angle zero points +X; direction `i` corresponds to `2π i / directions`. Direction and normalization transforms are outside the animation root.

Camera map: model `(X,Y,Z)` maps to simulation `(x=X,y=Z,height=Y)`. The camera looks from positive equal XYZ toward the origin: azimuth 45°, elevation 35.26438968°. Orthographic density is multiplied by `sqrt(3/2)` to match the existing projected ground axes:

```
screen.x = (x-y) * sqrt(3)/2
screen.y = (x+y) * .5 - height
```

The same conservative union of all directions/poses determines one density and one foot pivot for the entire atlas. Frustum culling and all shadows are disabled during baking. The camera, SRGB output, lighting and frame size are fixed. Animation samples are absolute times. Names containing attack/death/die/hit/damage/jump/leap use one-shot sampling including the final pose; other clips loop without a duplicated endpoint. The optional root-travel control removes significant net linear XZ travel only; it preserves closed-cycle pelvis sway and all vertical movement. The actual three Meshy v2 clips are already in place, with net travel below 0.000001 normalized world units, so their sway is preserved and `rootMotionRemoved:false` is reported truthfully. The imported root-track first/last sample times determine the compensation interval. GLBs without animation produce a static pose atlas. Separate rigs/clips are not retargeted automatically.

## Real rig / weapon-ready pilot

The supplied actual files are copied into the prototype, without editing the originals:

| Purpose | Model | Clip | Duration |
|---|---|---|---|
| Standing rig | `models/survivor-v2-rig.glb` | no selection / default pose | static; the included `Armature\|clip0\|baselayer` is a 0.033333s reference pose |
| Walking | `models/survivor-v2-walk.glb` | `Armature\|walking_man\|baselayer` | 1.066667s |
| Running | `models/survivor-v2-run.glb` | `Armature\|running\|baselayer` | 0.666667s |

All three contain one actual SkinnedMesh with 36,380 vertices and 24 bones. The actual rest-pose `headfront - Head` points +Z within 1e-7. Recommended pilot controls: model height 44 before loading, frame 256, 16 directions, walking/running 8 samples, front yaw 0, root-travel control on. For standing use the default pose (one sample). Change `표면 명암` between unlit/cel/matte during visual review.

`무기 준비 · 양손 IK` is optional and off by default. It uses the real `Arm → ForeArm → Hand` chains and their actual joint lengths, rotating bones with analytic two-bone IK rather than guessed Euler angles. Leave grip height blank for a reachable chest-relative pose, approximately 27.6–29.5 world units while walking/running at model height 44. This derives from the current shoulder height and arm reach, follows the natural upper-body gait bob, and preserves the original hips, legs, feet, joint translations and lengths. A requested height 22 is unreachable for these proportions; custom heights are clamped and the UI/metadata explicitly report the error. Skin transforms are refreshed before each actual alpha render. Original root/bone transforms are restored before every sample, so neutral-pose IK does not accumulate.

Each frame includes `weaponPose` (actual rig-local grip positions/error/clamp) and `weaponAnchor` in game coordinates `{x, y, z:height, support:{x,y,z}}`, already rotated to that frame's heading. Preview-only cyan/orange circles show the real trigger/support hand positions; they are never painted into the export. Body alpha and outline come from the actual current-pose WebGL render, not a static base-geometry hull. `source.rig` contains the actual skin/bone counts and rest forward. No weapon mesh is inserted unless a separately generated actual weapon GLB is explicitly selected with its landmark configuration. This rig has no finger bones, so finger wrapping/grip geometry is not produced. Visual approval of palm orientation, sleeves and the eventual real weapon attachment remains necessary.

`alphaBounds` contains real body alpha ≥8. `coreBounds` is real occupied alpha ≥24 within a configurable torso band (`coreRegion` proportions relative to body bounds), intended as a starting point for overlap tests. It is not anatomical recognition. For unusual bosses the visual core must be reviewed and the proportions adjusted. `projectedBodyBounds`/`projectedCoreBounds` divide pixel offsets from the foot pivot by `pixelsPerWorld`, allowing use by the existing world-projected overlap logic. Runtime atlas draw scale should be `gameZoom / pixelsPerWorld`; one mesh height uses `subjectHeight` world units. Outline pixels consequently scale with the image and are not a constant CSS screen-width effect.

Only local model files are listed. The server listens on loopback, accepts export mutations only with the matching Origin, bounds request/image sizes, checks PNG RGBA dimensions, and writes into its own exports directory. No API secret is handled. Source `models/` and `exports/` are prototype artifacts; copying a reviewed atlas into game assets and a final deliverable into `outputs/` is a separate step owned by root.

## Validation

`npm test` checks actual Three camera math against the game projection, rotation/foot-pivot placement, mask/outline separation, alpha/core metadata, and local HTTP export round trips. It also parses the three real rig GLBs, skipping only JPEG decoding for CPU tests, and checks their unmodified bones/weights/animation geometry, current-pose bounds across 16×8 directions/poses, loop and one-shot reset, root travel handling, preservation of lower-body animation, reachable two-hand IK, and explicit unreachable-target reporting. Actual WebGL rendering and appearance require loading the real GLB in the UI; these tests do not substitute a fake model or claim visual approval.

Official references: [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html), [OrthographicCamera](https://threejs.org/docs/pages/OrthographicCamera.html), [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html), [AnimationMixer](https://threejs.org/docs/pages/AnimationMixer.html). Dependency pinned by package-lock.json.

## Explicit local batch queue

Enter `/batches/production-jobs.json` (the default), click **작업 목록 읽기**, review statuses and checkboxes, then click **선택한 작업 실행**. Loading/reloading never starts rendering. The production plan is supplied by root; an absent file shows “준비 중” and runs nothing. `batches/example-jobs.json` demonstrates the schema with both jobs explicitly `ready:false`; it generates no replacement models or exports.

Plan schema is `{version:1,jobs:[...]}`, maximum 256 jobs and unique ASCII IDs. Every job requires `model`, the exact actual filename under `models/`. Fields/defaults:

```
id, ready:false, model:'actual-file.glb', exportName:id,
directions:16, samples:1, frameSize:256, subjectHeight:44,
padding:24, outlinePx:1.2, shading:'cel', clip:null,
weaponReady:false, gripHeight:null, rootMotion:true,
frontYawDegrees:0, coreRegion:[.15,.18,.85,.72],
uniformScale:null, originPivot:null, weaponModel:null, weaponConfig:null
```

Use exact `clip` names; a missing named clip is a failure rather than a substituted pose. `ready:false` jobs and missing actual files are **skipped**, invalid/load/render/save jobs are **failed**, and only a successful actual same-origin PNG/metadata export is **complete**. Failed jobs are retried only by the explicit retry button. Job progress reflects actual rendered frames. Selected jobs run sequentially. Stop is checked between actual frames/directions; the current unfinished render remains pending and is restarted on resume. If an export POST has already begun it completes and is counted once before stopping. Completed predecessors are never re-exported by resume.

Queue checkpoints store settings fingerprints/results in localStorage only. On explicit reload the server verifies that the real `atlas.png`, `body-alpha.png` and `metadata.json` still exist, share valid dimensions, and reference the same source file before restoring a completed status. A changed job configuration, missing files or corrupt checkpoint cannot restore success. The queue's visible completed count and result links therefore distinguish actual saved artifacts from pending/skipped jobs. The tool does not copy any batch output into the game or user-facing outputs directory.

Rigid props can specify a positive `uniformScale` (world units per native GLB unit) instead of matching height. `originPivot:{x,y,z}` is expressed in original scene/world GLB coordinates; null uses center-XZ and minimum-Y. The source metadata records exact original bounds, scale, origin pivot and normalization mode. `projection.subjectHeight` records the resulting actual height, and `projection.frontYawRadians` records the custom yaw. Every frame contains actual transformed `groundBounds:{minX,minY,maxX,maxY}`, with `minY/maxY` denoting game ground Y (Three Z). This permits one uniform footprint scale rather than deforming an image to an unrelated collider rectangle. Custom prop dimensions/anchors still require preview approval.

## Explicit native weapon attachment

The actual `models/weapon-shotgun.glb` can be selected using **실제 산탄총 landmark 후보 읽기**. It fills a manual candidate derived from that real file's measured vertex sections. The candidate has native forward -X, up +Y, grip `[.47,-.03,0]`, support `[-.33,-.03,0]`, muzzle `[-.94,.131,0]`, aim alignment, fixed world length22, and `confidence:'candidate'`. It is not visual approval. The original charcoal/wood texture is loaded normally. No box, procedural weapon, or substitute model is used. Other real weapons require their own explicit landmark JSON; the shotgun preset is not inferred for a nailgun.

Selecting a weapon requires **무기 준비 · 양손 IK** and reloading the body model. The actual native grip-to-support offset is passed to coupled arm IK. A feasible shared trigger position is found by intersecting both imported arm-reach spheres at a chest-relative height; no joint is stretched to meet a foreend. This retains the desired barrel forward vector and the weapon's uniform scale. All errors/clamps remain visible. CPU verification on the real shotgun and real walk/run rigs across16×8 poses found maximum grip/support error below0.000004world units, muzzle heights31.256–33.157 at body height44, unchanged lower-body poses, world length22, and correct16-direction forward. Texture/hand orientation/quality still require the actual UI render review.

The body-only GPU pass hides the weapon root and produces `body-alpha.png`, `alphaBounds`, `coreBounds` and projected body/core bounds. The combined GPU pass then renders the real body plus real weapon with ordinary depth, texture and lighting and produces `atlas.png`, `combinedAlphaBounds`, and the combined ink outline. `atlas.includesWeapon` and `nativeWeapon.bodyAlphaIncludesWeapon:false` make this distinction explicit. Foot pivot and fit are computed over the full combined geometry. Per-frame `weaponAttachment.game` includes actual rotated grip/support/muzzle/forward; `weaponMuzzle` directly provides `{x,y,z:height}` and `weaponAnchor.forward` uses the actual parent yaw. Full landmark/config/geometry evidence is stored once under `nativeWeapon`; per-frame metadata retains transforms/errors without repeating the same evidence128times.

For batch jobs add `weaponModel:'weapon-shotgun.glb'` and the full explicit `weaponConfig`, with `weaponReady:true`. Missing weapon files are skipped, and absent/invalid configuration fails clearly. The queue never supplies a default weapon for an unready job. Existing body-only jobs remain supported by null weapon fields.

HQ32 hero jobs: `batches/hero-hq32-jobs.json` preserves the existing two weapon GLBs, actual rig clips and weapon-ready configurations, changing only new IDs/export names and 32 samples. Each 16×32×256 export packs into16columns×32rows=4096×8192 (exact32MP); existing valid atlas layouts remain unchanged. No resizing or camera/pixel-density change is introduced. 512px HQ32 is rejected by the32MP guard. Metadata is capped at8MiB for512 enriched frames; the48MiB whole-request cap,8192px axes and32MP PNG cap remain. The batch must be visually baked/reviewed before game registration.
