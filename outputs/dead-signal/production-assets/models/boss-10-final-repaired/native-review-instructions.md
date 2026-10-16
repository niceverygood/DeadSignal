# Native repair candidate review

This is a real Meshy geometry repair candidate. It is not approved game art yet. The v1 texture JPEG, material and donor UVs are retained; no image pixels were edited.

Load `/batches/boss10-repaired-review.json` in the existing baker. Its one job uses `boss-10-final-repaired.glb`, 16 directions × 1 static sample, height 104, frame 256/padding 24, unlit original baseColor, outline 4, no clip and no weapon pose. Do not rerun completed boss/environment batches for this review.

Check the actual native model and actual exported frames against the original board 42 and the front/back character inputs:

1. Front: four separate hooked claw arms, the recognizable hinged metal crusher jaw and original broad low organic body remain. Two intact original front tracks must stay unchanged.
2. Rear: four track feet total are countable in the full model. The copied rear tracks should connect to the existing organic/mechanical collars and rest on the same floor level, without floating ends, open gaps, duplicate lower tread fragments or buried hubs.
3. Rear press: two diagonal actual steel donor beams form an X within the original rear press uprights. Check the crossings/end connections and avoid seeing cut edges as a thin floating sticker. Texture/weathering must read as the same original steel.
4. Left/right and all 16 atlas directions: check top donor cuts, inherited organic fragments, collar intersections, depth/foot pivot, arm/track separation, complete jaw/claws and no clipping. The fitting math has passed; visual seams and semantic counts still require this rendered check.
5. Compare baseColor/UV detail with v1. No generic box, painted raster X, added flat character image or new approximate vector art may substitute for actual geometry.
6. Approve/register only after this review. If a local adjustment is needed, retain this candidate and its provenance and produce a new reviewed revision. Other completed assets remain outside this candidate job.

`meshyrepair-provenance.json` records original hashes, measured donor boxes, rigid transforms, exact texture hash, UV hash proofs, four ground-track bounds, the static 16-direction fit and the reproducible work script. The high-poly original was measured earlier but was already absent when repair began; the script does not delete originals.
