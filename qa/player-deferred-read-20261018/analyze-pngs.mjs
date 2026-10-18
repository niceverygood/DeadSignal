import {open, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

// Offline evidence reader only. No Canvas, image library, colour conversion,
// resampling, tolerance, browser request, source edit or benchmark is involved.
// Usage: node analyze-pngs.mjs quality|cost|both [--out NEW-PATH.json]
const HERE = new URL('./', import.meta.url);
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_PIXELS = 4 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS = ['r', 'g', 'b', 'a'];
const PAIRS = [
  ['candidateVsFirst', 0, 1, 'A1 -> B'],
  ['originalRepeat', 0, 2, 'A1 -> A2'],
  ['candidateVsRepeat', 1, 2, 'B -> A2'],
];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const crcTable = Uint32Array.from({length: 256}, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function decodePNG(bytes) {
  if (!Buffer.isBuffer(bytes)) throw Error('png-buffer-required');
  if (bytes.length > MAX_FILE_BYTES || bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw Error('png-size-or-signature');
  let offset = 8, header = null, ended = false, idatEnded = false, transparency = null;
  const compressed = [], chunks = [], colourChunks = [];
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length || chunks.length >= 4096) throw Error('png-truncated-or-too-many-chunks');
    const length = bytes.readUInt32BE(offset), end = offset + 12 + length;
    if (end > bytes.length) throw Error('png-truncated-chunk');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) throw Error('png-invalid-chunk-type');
    const data = bytes.subarray(offset + 8, end - 4);
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) throw Error(`png-crc-${type}`);
    chunks.push({type, bytes: length});
    if (!header && type !== 'IHDR') throw Error('png-ihdr-not-first');
    if (type === 'IHDR') {
      if (header || length !== 13) throw Error('png-invalid-ihdr');
      const width = data.readUInt32BE(0), height = data.readUInt32BE(4);
      const bitDepth = data[8], colourType = data[9];
      if (!width || !height || width * height > MAX_PIXELS || bitDepth !== 8 || ![2, 6].includes(colourType)) throw Error('png-only-bounded-8bit-rgb-rgba-supported');
      if (data[10] !== 0 || data[11] !== 0 || data[12] !== 0) throw Error('png-compression-filter-or-interlace-unsupported');
      header = {width, height, bitDepth, colourType, channels: colourType === 6 ? 4 : 3, interlaced: false};
    } else if (type === 'IDAT') {
      if (idatEnded) throw Error('png-noncontiguous-idat');
      compressed.push(data);
    } else if (type === 'IEND') {
      if (length !== 0 || !compressed.length || end !== bytes.length) throw Error('png-invalid-iend-or-trailing-bytes');
      ended = true;
      offset = end;
      break;
    } else {
      if (compressed.length) idatEnded = true;
      if (type === 'tRNS') {
        if (transparency || compressed.length || header.colourType !== 2 || length !== 6) throw Error('png-invalid-transparency');
        transparency = [data.readUInt16BE(0), data.readUInt16BE(2), data.readUInt16BE(4)];
        if (transparency.some(value => value > 255)) throw Error('png-rgb8-transparency-out-of-range');
      } else if (type === 'PLTE') {
        if (compressed.length || length === 0 || length > 768 || length % 3) throw Error('png-invalid-optional-palette');
      } else if (type[0] === type[0].toUpperCase()) {
        throw Error(`png-unsupported-critical-chunk-${type}`);
      }
      if (['sRGB', 'gAMA', 'cHRM', 'iCCP', 'cICP'].includes(type)) colourChunks.push({type, bytes: length, sha256: sha256(data)});
    }
    offset = end;
  }
  if (!ended || offset !== bytes.length || !header) throw Error('png-incomplete');
  const stride = header.width * header.channels, expectedBytes = (stride + 1) * header.height;
  const filtered = inflateSync(Buffer.concat(compressed), {maxOutputLength: expectedBytes});
  if (filtered.length !== expectedBytes) throw Error('png-inflated-length-mismatch');
  const scanlines = Buffer.allocUnsafe(stride * header.height), filters = [0, 0, 0, 0, 0];
  for (let y = 0; y < header.height; y++) {
    const input = y * (stride + 1), output = y * stride, filter = filtered[input];
    if (filter > 4) throw Error('png-invalid-filter');
    filters[filter]++;
    for (let x = 0; x < stride; x++) {
      const a = x >= header.channels ? scanlines[output + x - header.channels] : 0;
      const b = y ? scanlines[output + x - stride] : 0;
      const c = y && x >= header.channels ? scanlines[output + x - stride - header.channels] : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : paeth(a, b, c);
      scanlines[output + x] = (filtered[input + 1 + x] + predictor) & 255;
    }
  }
  let rgba = scanlines;
  if (header.channels === 3) {
    rgba = Buffer.allocUnsafe(header.width * header.height * 4);
    for (let src = 0, dst = 0; src < scanlines.length; src += 3, dst += 4) {
      rgba[dst] = scanlines[src]; rgba[dst + 1] = scanlines[src + 1]; rgba[dst + 2] = scanlines[src + 2];
      rgba[dst + 3] = transparency && transparency.every((value, channel) => value === scanlines[src + channel]) ? 0 : 255;
    }
  }
  return {rgba, metadata: {...header, encodedBytes: bytes.length, rgbaBytes: rgba.length, pngSha256: sha256(bytes), rgbaSha256: sha256(rgba), crcChecked: true, filters, chunks, colourChunks, rgbTransparency: transparency}};
}

function basicDifference(a, b) {
  const dimensionsEqual = a.metadata.width === b.metadata.width && a.metadata.height === b.metadata.height;
  if (!dimensionsEqual || a.rgba.length !== b.rgba.length) return {differentComponents: Math.max(a.rgba.length, b.rgba.length), maxDelta: 255, dimensionsEqual: false};
  let differentComponents = 0, maxDelta = 0;
  for (let index = 0; index < a.rgba.length; index++) {
    const delta = Math.abs(a.rgba[index] - b.rgba[index]);
    if (delta) differentComponents++;
    if (delta > maxDelta) maxDelta = delta;
  }
  return {differentComponents, maxDelta, dimensionsEqual: true};
}
function bbox(minX, minY, maxX, maxY) {
  return maxX < minX ? null : {x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, maxXInclusive: maxX, maxYInclusive: maxY};
}
function detailedDifference(a, b) {
  const {width, height} = a.metadata, mask = new Uint8Array(width * height);
  const channels = CHANNELS.map(name => ({name, changed: 0, negative: 0, positive: 0, signedSum: 0, absoluteSum: 0, minSignedDelta: 0, maxSignedDelta: 0, histogram: new Uint32Array(511)}));
  const regions = Array.from({length: 64}, (_, index) => ({column: index % 8, row: Math.floor(index / 8), differentPixels: 0, differentComponents: 0, maxDelta: 0}));
  let differentPixels = 0, minX = width, minY = height, maxX = -1, maxY = -1;
  for (let pixel = 0; pixel < mask.length; pixel++) {
    const x = pixel % width, y = Math.floor(pixel / width), region = regions[Math.floor(y * 8 / height) * 8 + Math.floor(x * 8 / width)];
    let changed = false;
    for (let channel = 0; channel < 4; channel++) {
      const delta = b.rgba[pixel * 4 + channel] - a.rgba[pixel * 4 + channel];
      if (!delta) continue;
      changed = true;
      const item = channels[channel], absolute = Math.abs(delta);
      item.changed++; item[delta < 0 ? 'negative' : 'positive']++; item.signedSum += delta; item.absoluteSum += absolute;
      item.minSignedDelta = Math.min(item.minSignedDelta, delta); item.maxSignedDelta = Math.max(item.maxSignedDelta, delta); item.histogram[delta + 255]++;
      region.differentComponents++; region.maxDelta = Math.max(region.maxDelta, absolute);
    }
    if (changed) {
      mask[pixel] = 1; differentPixels++; region.differentPixels++;
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  const channelDistribution = channels.map(({histogram, ...item}) => ({...item, meanAbsoluteDeltaWhenChanged: item.changed ? item.absoluteSum / item.changed : 0, signedDeltaDistribution: Array.from(histogram, (count, index) => ({delta: index - 255, count})).filter(entry => entry.count)}));
  const regionDistribution = regions.filter(region => region.differentPixels).map(region => {
    const x = Math.ceil(region.column * width / 8), y = Math.ceil(region.row * height / 8);
    return {...region, x, y, width: Math.ceil((region.column + 1) * width / 8) - x, height: Math.ceil((region.row + 1) * height / 8) - y};
  }).sort((left, right) => right.differentPixels - left.differentPixels || left.row - right.row || left.column - right.column);
  return {mask, summary: {differentPixels, fractionOfPixels: differentPixels / mask.length, bbox: bbox(minX, minY, maxX, maxY), channelDistribution, regionDistribution, regionGrid: {columns: 8, rows: 8, note: 'Coordinate bins only; no scene-object attribution.'}}};
}
function intersections(masks, width, height) {
  const combinations = new Uint32Array(8);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let index = 0; index < masks[0].length; index++) {
    const bits = masks[0][index] | (masks[1][index] << 1) | (masks[2][index] << 2);
    combinations[bits]++;
    if (bits) {
      const x = index % width, y = Math.floor(index / width);
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  return {
    unit: 'pixels having at least one changed RGBA component',
    bitOrder: ['candidateVsFirst', 'originalRepeat', 'candidateVsRepeat'],
    exactMembershipCounts: Array.from(combinations, (count, bits) => ({candidateVsFirst: !!(bits & 1), originalRepeat: !!(bits & 2), candidateVsRepeat: !!(bits & 4), count})),
    originalRepeatAndCandidateVsRepeat: combinations[6] + combinations[7],
    allThree: combinations[7],
    a1EqualsBButBothDifferFromA2: combinations[6],
    unionBBox: bbox(minX, minY, maxX, maxY),
    note: 'Shared difference coordinates do not identify a rendering cause or excuse a strict pixel failure.',
  };
}
function expectedDifference(value) {
  if (!value || !Number.isSafeInteger(value.differentComponents) || value.differentComponents < 0 || !Number.isInteger(value.maxDelta) || value.maxDelta < 0 || value.maxDelta > 255 || typeof value.dimensionsEqual !== 'boolean') throw Error('browser-pixel-count-contract-missing');
  return {differentComponents: value.differentComponents, maxDelta: value.maxDelta, dimensionsEqual: value.dimensionsEqual};
}

async function analyzeMode(mode, result) {
  const rawURL = new URL(`browser-${mode}.json`, HERE), raw = await readFile(rawURL);
  result.browser = {file: fileURLToPath(rawURL), bytes: raw.length, sha256: sha256(raw)};
  const wrapper = JSON.parse(raw.toString('utf8')), report = wrapper.passes ? wrapper : wrapper.report;
  if (!report || !report.pixels) throw Error('browser-report-pixels-required');
  result.browser.complete = report.complete ?? null;
  result.browser.error = report.error ?? wrapper.error ?? null;
  result.browser.expectedComparisons = Object.fromEntries(PAIRS.map(([name]) => [name, expectedDifference(report.pixels[name])]));
  const decoded = [];
  for (const arm of ['a1', 'b', 'a2']) {
    const url = new URL(`${mode}-${arm}.png`, HERE), bytes = await readFile(url);
    const evidence = {arm: arm.toUpperCase(), file: fileURLToPath(url), bytes: bytes.length, pngSha256: sha256(bytes)};
    result.inputs.push(evidence);
    const image = decodePNG(bytes);
    evidence.decoded = image.metadata;
    decoded.push(image);
  }
  for (const [name, from, to, direction] of PAIRS) {
    const expected = result.browser.expectedComparisons[name], actual = basicDifference(decoded[from], decoded[to]);
    const mismatchedFields = ['differentComponents', 'maxDelta', 'dimensionsEqual'].filter(key => actual[key] !== expected[key]);
    result.comparisons[name] = {direction, browser: expected, decodedPNG: actual, reproduced: mismatchedFields.length === 0, mismatchedFields};
  }
  result.reproductionComplete = Object.values(result.comparisons).every(pair => pair.reproduced);
  if (!result.reproductionComplete) {
    result.status = 'failed-reproduction';
    result.failure = 'Decoded PNG component counts/max deltas/dimensions do not reproduce the browser raw getImageData comparison. ROI/cause interpretation withheld.';
    return false;
  }
  result.status = 'browser-counts-reproduced';
  const masks = [];
  for (const [name, from, to] of PAIRS) {
    const detail = detailedDifference(decoded[from], decoded[to]);
    result.comparisons[name].reproducedDetail = detail.summary;
    masks.push(detail.mask);
  }
  result.intersections = intersections(masks, decoded[0].metadata.width, decoded[0].metadata.height);
  result.strictPixelEquality = Object.values(result.comparisons).every(pair => pair.decodedPNG.differentComponents === 0 && pair.decodedPNG.maxDelta === 0 && pair.decodedPNG.dimensionsEqual);
  result.note = 'Reproduction confirms arithmetic on these saved PNGs only. Reproduced nonzero differences remain a strict quality failure; this decoder does not resolve scene/rendering causation or certify candidate performance.';
  return true;
}

async function main() {
  const args = process.argv.slice(2), mode = args.shift();
  if (!['quality', 'cost', 'both'].includes(mode)) throw Error('usage: analyze-pngs.mjs quality|cost|both [--out NEW-PATH.json]');
  let output = new URL(`${mode}-png-analysis.json`, HERE);
  if (args.length) {
    if (args.length !== 2 || args[0] !== '--out' || !args[1]) throw Error('invalid-cli-options');
    output = pathToFileURL(resolve(args[1]));
  }
  // Exclusive creation happens before evidence reads. Existing reports are never
  // overwritten, including prior failed-reproduction evidence.
  const handle = await open(output, 'wx');
  const analysis = {
    tool: 'raw PNG zlib/unfilter comparison',
    scriptSha256: sha256(await readFile(fileURLToPath(import.meta.url))),
    createdUTC: new Date().toISOString(),
    requestedMode: mode,
    reproductionComplete: false,
    status: 'pending',
    pixelChangesMade: false,
    colourTransformsApplied: false,
    tolerance: 0,
    bounds: {maxEncodedFileBytes: MAX_FILE_BYTES, maxPixelsPerImage: MAX_PIXELS, retainedDecodedImagesPerMode: 3},
    results: [],
    note: 'Offline saved-artifact arithmetic, not a render, test, benchmark, FPS, GPU-duration, cold-cache, memory-peak or adoption result. PNG colour ancillary chunks are reported but not applied. RGB is expanded to RGBA with opaque alpha (or exact tRNS); encoded RGBA bytes are otherwise unchanged. PNG export and original Canvas readback equivalence must be reproduced, never presumed. ROI/distribution/intersection details are withheld for any unreproduced dataset.',
  };
  let failure = null;
  try {
    for (const requested of mode === 'both' ? ['quality', 'cost'] : [mode]) {
      const result = {mode: requested, status: 'pending', reproductionComplete: false, inputs: [], comparisons: {}};
      analysis.results.push(result);
      try {
        if (!await analyzeMode(requested, result)) failure ??= Error(`png-browser-count-reproduction-failed:${requested}`);
      } catch (error) {
        result.status = 'failed-reproduction';
        result.failure = error instanceof Error ? error.message : String(error);
        failure ??= error;
      }
    }
    analysis.reproductionComplete = analysis.results.length > 0 && analysis.results.every(result => result.reproductionComplete);
    analysis.status = analysis.reproductionComplete ? 'browser-counts-reproduced' : 'failed-reproduction';
    analysis.strictPixelEquality = analysis.reproductionComplete ? analysis.results.every(result => result.strictPixelEquality) : null;
  } catch (error) {
    analysis.status = 'failed-reproduction';
    analysis.failure = error instanceof Error ? error.message : String(error);
    failure ??= error;
  } finally {
    try { await handle.writeFile(JSON.stringify(analysis, null, 2) + '\n'); }
    finally { await handle.close(); }
  }
  console.log(JSON.stringify({output: fileURLToPath(output), status: analysis.status, reproductionComplete: analysis.reproductionComplete, strictPixelEquality: analysis.strictPixelEquality, results: analysis.results.map(result => ({mode: result.mode, status: result.status, failure: result.failure ?? null, comparisons: result.comparisons && Object.fromEntries(Object.entries(result.comparisons).map(([name, value]) => [name, {browser: value.browser, decodedPNG: value.decodedPNG, reproduced: value.reproduced}]))}))}));
  if (failure || !analysis.reproductionComplete) throw failure ?? Error('png-browser-count-reproduction-failed');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
