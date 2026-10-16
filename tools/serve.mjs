import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {realpath,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,sep,extname} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2),review=args.includes('--review'),portArg=args.lastIndexOf('--port');
const port=portArg>=0?Number(args[portArg+1]):8806;
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Choose a port between1024 and65535.');
const directory=await realpath(resolve(root,review?'outputs/dead-signal':'work/dead-signal-game/dist'));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.glb':'model/gltf-binary','.txt':'text/plain; charset=utf-8','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);return res.end();}
  try{
    const url=new URL(req.url,'http://127.0.0.1');
    let path=decodeURIComponent(url.pathname);
    if(path.includes('\\')||path.includes('\0')){res.writeHead(400);return res.end();}
    if(path.endsWith('/'))path+='index.html';
    const file=await realpath(resolve(directory,'.'+path));
    if(!file.startsWith(directory+sep)){res.writeHead(403);return res.end();}
    const info=await stat(file);
    if(!info.isFile()){res.writeHead(404);return res.end();}
    res.writeHead(200,{'Content-Type':types[extname(file).toLowerCase()]||'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    if(req.method==='HEAD')return res.end();
    const stream=createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res);
  }catch{res.writeHead(404);res.end('File not found');}
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'That port is already used. Choose another with --port.':error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`DEAD SIGNAL ${review?'gallery':'game'}: http://127.0.0.1:${port}/${review?'production-assets/review.html':'index.html?qa=1'}`));
