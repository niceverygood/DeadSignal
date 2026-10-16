# Native X repair revision 2: review required

This is an actual native geometry candidate, not approved game art. Only the two X beam meshes changed. The original body and the two repaired track meshes have byte-identical position, normal, UV and index buffers compared with the first repair candidate. The original JPEG/material bytes and actual donor UVs remain exact; no raster pixels were edited.

Load only /batches/boss10-repaired-v2-review.json in the existing baker. It uses boss-10-final-repaired-v2.glb and a separate exportName boss-10-final-repaired-v2, so the completed first export is preserved. Settings: 16 directions × 1 static sample, height104, frame256/padding24, unlit original baseColor, outline4, frontYaw0, no clip and no weapon.

The actual jaw-facing front is native +Z; the repaired rear press is native -Z. With this baker's camera at +X/+Y/+Z and rotation=PI/2-directionAngle, frontYaw0 gives direction02 as the straight front azimuth and direction10 as the straight rear azimuth. Directions08 and12 show the two rear three-quarter views already used to diagnose the first candidate. Confirm these using the jaw and rear frame, rather than trusting labels alone.

1. Inspect direction10 first. Two continuous original-steel bars must visibly cross into a complete X outside the rear press. Each actual diagonal now has native triangle coverage at all nine sampled centerline locations, including x=0. The previous donor had no central beam geometry.
2. Inspect directions08,10,12 together. The steel faces are outside actual rear body surface by at least .030/.040 native units across the sampled diagonals. Check that the X does not sink into the horizontal press bands or look like a detached decal. No visual approval follows from the ray tests.
3. Inspect both end collars and crossing in side views06/14 as well. The reselected actual source band includes one continuous main plate (182 triangles) and two original clipped corner pieces (57/43 triangles); native ray evidence confirms both end collars overlap body depth, but this is not a watertightness claim. Reject visible floating fragments, organic contamination or exposed open cut seams.
4. Front02 and all16: four hooked claws, recognizable crusher jaw, original steel/weathering, four separately legible track feet, full silhouette and ground alignment must remain. Body and track geometry are unchanged from the first candidate.
5. Compare original board42 and production input boss-10-final-back.png. This candidate uses original Meshy triangle surfaces and texture; no invented box, vector X or painted raster detail was substituted.
6. Preserve this candidate/provenance and approve/register only after actual native GPU pixel review. The general completed boss batch, first repaired export, game manifest and renderer were not modified.

meshyrepair-provenance.json records exact source/candidate/previous-candidate hashes, donor box, positive uniform rigid transforms, UV hash proofs, unchanged mesh buffer hashes, static16 fit and reproducible work script. rear-brace-geometry-evidence.json records every actual triangle ray and collar overlap sample.
