import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export async function sourceDigest(){
 const files=['Cargo.toml','Cargo.lock','evidence/workbooks.json',...(await fs.readdir(path.join(root,'src'))).filter(f=>f.endsWith('.rs')).map(f=>'src/'+f)].sort();
 const hash=createHash('sha256');for(const file of files){hash.update(file+'\0');hash.update(await fs.readFile(path.join(root,file)));hash.update('\0')}return hash.digest('hex');
}
export async function wasmDigest(){return createHash('sha256').update(await fs.readFile(path.join(root,'web/engine.wasm'))).digest('hex')}
if(process.argv.includes('--write')){const manifest={schema:'ring29-box-engine/1',source_sha256:await sourceDigest(),wasm_sha256:await wasmDigest()};await fs.writeFile(path.join(root,'web/engine-manifest.json'),JSON.stringify(manifest,null,2)+'\n');}
