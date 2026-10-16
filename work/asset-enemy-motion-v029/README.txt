DEAD SIGNAL v0.29 NPC locomotion asset preparation

Scope: 12 final bosses + 12 middle bosses + 7 ordinary enemy roles.
Each actual weighted 3D body is GPU-rendered at 16 directions x 32 samples.
Original GLB meshes, UVs, skin bindings, native textures and all prior action
clips remain unchanged. New humanoid foot corrections are appended leg-only
animation clips. Final bosses retain their existing custom DS_walk rigs.

Baker: work/asset-enemy-motion-baker-v029
Local URL: http://127.0.0.1:8840/
Separate batches: finals-hq32.json / characters-hq32.json.
Complete combined batch: locomotion-hq32.json.
Baked color and body-alpha are losslessly cropped; no pixel resizing.
All native shader/material profiles and fixed source scale/origin are preserved.
No remote API, credit consumption, payments, secrets or player saves are used.

After each complete batch, run pack_completed.py --batch <batch name> using
bundled Python with Pillow. Then verify_locomotion_pixels.py --batch <name>
independently reloads saved color and mask PNGs and verifies every frame.

After all 31 assets have completed, integrate_locomotion.py registers 31 new
records only in work/dead-signal-enemy-motion-v029-draft. Original126 asset
records, survivor mappings, portraits and environment records remain identical.
NPC mappings intentionally use {idle:new HQ32, walk:new HQ32, actions:old reel}
so stationary actors do not return to the uncorrected retargeted idle foot pose.

calculate_residency.mjs computes actual launch-plan RGBA dimensional budgets.
This is NOT a measurement of browser, process or GPU memory. NPC masks are not
decoded because native body contours are already available in the metadata.
