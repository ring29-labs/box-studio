import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceDigest,wasmDigest} from './engine-manifest.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest=JSON.parse(await fs.readFile(path.join(root,'web/engine-manifest.json'),'utf8'));
if(manifest.source_sha256!==await sourceDigest()||manifest.wasm_sha256!==await wasmDigest())throw Error('The browser engine is stale. Run the Rust WebAssembly build before publishing.');
const books=JSON.parse(await fs.readFile(path.join(root,'evidence/workbooks.json'),'utf8'));
const cells=Object.fromEntries(books[1].sheets[0].cells.map(c=>[c.cell,c]));
const allowed=['C7','D7','C8','D8','J7','J9','F7','C15','D15','C16','D16','C25','D25','C26','D26','C27','D27','C31','D31','C32','D32','F43'];
const config=Object.fromEntries(allowed.map(a=>[a,{options:cells[a].options,value:cells[a].text}]));
await fs.writeFile(path.join(root,'web/catalog.js'),'window.BOX_CATALOG='+JSON.stringify(config)+';\n');
await fs.mkdir(path.join(root,'server'),{recursive:true});
await fs.writeFile(path.join(root,'server/catalog.json'),JSON.stringify(config));
const dist=path.join(root,'web/dist');await fs.mkdir(dist,{recursive:true});
for(const name of ['index.html','style.css','app.js','worker.js','icon.svg','catalog.js','engine.wasm','engine-manifest.json'])await fs.copyFile(path.join(root,'web',name),path.join(dist,name));
for(const name of ['demo.mp4','demo.vtt','demo-poster.png','demo.html']){try{await fs.copyFile(path.join(root,'web',name),path.join(dist,name))}catch(e){if(e.code!=='ENOENT')throw e}}
console.log('Built static guided form in web/dist');
