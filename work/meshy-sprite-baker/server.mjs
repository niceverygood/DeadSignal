import { MAX_ATLAS_FRAMES } from './src/atlas.js';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile, realpath } from 'node:fs/promises';

export const ROOT = path.dirname(fileURLToPath(import.meta.url));
const LIMIT = 48 * 1024 * 1024;
export const METADATA_LIMIT = 8 * 1024 * 1024;
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wasm': 'application/wasm' };

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function readJSON(req) {
  let length = 0;
  const chunks = [];
  for await (const chunk of req) {
    length += chunk.length;
    if (length > LIMIT) throw new Error('이미지 합계는 48MB 이하로 저장해주세요.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function decodePNG(raw) {
  if (typeof raw !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]*={0,2}$/.test(raw)) throw new Error('PNG 데이터가 아닙니다.');
  const buffer = Buffer.from(raw.slice('data:image/png;base64,'.length), 'base64');
  return { buffer, ...inspectPNG(buffer) };
}

function inspectPNG(buffer) {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(PNG) || buffer.toString('ascii', 12, 16) !== 'IHDR') throw new Error('PNG 헤더가 올바르지 않습니다.');
  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
  if (width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > 32 * 1024 * 1024) throw new Error('아틀라스 크기가 제한을 초과했습니다.');
  if (buffer[24] !== 8 || buffer[25] !== 6) throw new Error('8bit RGBA PNG가 필요합니다.');
  return { width, height };
}

export async function saveExport(raw, root = ROOT) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('내보내기 자료가 없습니다.');
  const atlas = decodePNG(raw.atlas), alpha = decodePNG(raw.alpha);
  const metadata = raw.metadata;
  if (!metadata || metadata.format !== 'meshy-iso-sprite-atlas' || metadata.version !== 1 || metadata.source?.format !== 'glb') throw new Error('아틀라스 메타데이터가 올바르지 않습니다.');
  if (atlas.width !== alpha.width || atlas.height !== alpha.height || atlas.width !== metadata.atlas?.width || atlas.height !== metadata.atlas?.height) throw new Error('아틀라스와 마스크 크기가 다릅니다.');
  if (!Array.isArray(metadata.frames) || metadata.frames.length < 1 || metadata.frames.length > MAX_ATLAS_FRAMES || Buffer.byteLength(JSON.stringify(metadata), 'utf8') > METADATA_LIMIT) throw new Error('프레임 메타데이터 크기가 올바르지 않습니다.');
  const name = String(raw.name || 'sprite').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 64) || 'sprite';
  const folder = `${name}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const directory = path.join(root, 'exports', folder);
  const saved = { ...metadata, files: { atlas: 'atlas.png', bodyAlpha: 'body-alpha.png', metadata: 'metadata.json' } };
  const savedMetadata = JSON.stringify(saved) + '\n';
  if (Buffer.byteLength(savedMetadata, 'utf8') > METADATA_LIMIT) throw new Error('프레임 메타데이터 크기가 8MiB 제한을 초과했습니다.');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'atlas.png'), atlas.buffer);
  await writeFile(path.join(directory, 'body-alpha.png'), alpha.buffer);
  await writeFile(path.join(directory, 'metadata.json'), savedMetadata);
  return { folder, directory, files: saved.files, urls: { atlas: `/exports/${folder}/atlas.png`, bodyAlpha: `/exports/${folder}/body-alpha.png`, metadata: `/exports/${folder}/metadata.json` } };
}

async function exportStatus(folder, root) {
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(folder || '')) throw new Error('올바른 export 폴더 이름이 필요합니다.');
  const directory = path.join(root, 'exports', folder);
  const canonical = await realpath(directory);
  if (!canonical.startsWith(await realpath(path.join(root, 'exports')) + path.sep)) throw new Error('허용하지 않는 export 폴더입니다.');
  const [raw, atlas, alpha] = await Promise.all([readFile(path.join(canonical, 'metadata.json'), 'utf8'), readFile(path.join(canonical, 'atlas.png')), readFile(path.join(canonical, 'body-alpha.png'))]);
  const metadata = JSON.parse(raw), atlasInfo = inspectPNG(atlas), alphaInfo = inspectPNG(alpha);
  if (metadata.format !== 'meshy-iso-sprite-atlas' || metadata.version !== 1 || atlasInfo.width !== metadata.atlas?.width || atlasInfo.height !== metadata.atlas?.height || atlasInfo.width !== alphaInfo.width || atlasInfo.height !== alphaInfo.height) throw new Error('저장된 PNG와 metadata가 일치하지 않습니다.');
  return { complete: true, folder, directory, sourceFile: metadata.source?.file, files: metadata.files, atlas: atlasInfo };
}

export function createBakerServer({ root = ROOT } = {}) {
  root = path.resolve(root);
  const canonicalRoot = realpath(root);
  return http.createServer(async (req, res) => {
    try {
      const host = req.headers.host || '';
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return json(res, 403, { error: '로컬 호스트만 허용됩니다.' });
      const url = new URL(req.url, `http://${host}`);
      if (url.pathname.startsWith('/api/') && req.method !== 'GET' && req.headers.origin !== `http://${host}`) return json(res, 403, { error: '같은 출처의 저장 버튼만 허용됩니다.' });
      if (url.pathname === '/api/models' && req.method === 'GET') {
        const entries = await readdir(path.join(root, 'models'), { withFileTypes: true });
        return json(res, 200, { models: entries.filter(entry => entry.isFile() && /\.glb$/i.test(entry.name)).map(entry => ({ name: entry.name, url: `/models/${encodeURIComponent(entry.name)}` })).sort((a, b) => a.name.localeCompare(b.name)) });
      }
      if (url.pathname === '/api/export' && req.method === 'POST') return json(res, 200, await saveExport(await readJSON(req), root));
      if (url.pathname === '/api/export-status' && req.method === 'GET') return json(res, 200, await exportStatus(url.searchParams.get('folder'), root));
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: '지원하지 않는 요청입니다.' });
      const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      if (relative.includes('\\') || relative.includes('\0') || relative.split('/').some(part => part === '.' || part === '..')) return json(res, 403, { error: '허용하지 않는 경로입니다.' });
      if (!/^\/(?:index\.html|style\.css|manifest\.json)$/.test(relative) && !/^\/(?:src\/|models\/|batches\/|exports\/|node_modules\/three\/)/.test(relative)) return json(res, 404, { error: '파일이 없습니다.' });
      const filename = path.resolve(root, `.${relative}`);
      if (!filename.startsWith(root + path.sep)) return json(res, 403, { error: '허용하지 않는 경로입니다.' });
      const real = await realpath(filename);
      if (!real.startsWith(await canonicalRoot + path.sep)) return json(res, 403, { error: '허용하지 않는 경로입니다.' });
      const info = await stat(real);
      if (!info.isFile()) return json(res, 404, { error: '파일이 없습니다.' });
      res.writeHead(200, { 'Content-Type': MIME[path.extname(real).toLowerCase()] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      if (req.method === 'HEAD') return res.end();
      createReadStream(real).pipe(res);
    } catch (error) {
      json(res, error.code === 'ENOENT' ? 404 : 400, { error: error.code === 'ENOENT' ? '파일이 없습니다.' : error.message });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.BAKER_PORT || 8804);
  const server = createBakerServer();
  server.listen(port, '127.0.0.1', () => process.stdout.write(`Meshy sprite baker: http://127.0.0.1:${port}\n`));
}
