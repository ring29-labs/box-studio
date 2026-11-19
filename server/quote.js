import fs from 'node:fs/promises';
let ready;
export async function calculate(configuration) {
  ready ??= fs.readFile(new URL('../web/engine.wasm', import.meta.url)).then(bytes=>WebAssembly.instantiate(bytes,{}));
  const {instance:{exports:e}}=await ready;
  const bytes=new TextEncoder().encode(JSON.stringify({...configuration,guided:true})+'\0');
  const p=e.box_alloc(bytes.length);
  try {
    new Uint8Array(e.memory.buffer,p,bytes.length).set(bytes);
    const out=e.box_calculate(p);
    try {return JSON.parse(new TextDecoder().decode(new Uint8Array(e.memory.buffer,out,e.box_result_len(out))))}
    finally {e.box_free(out)}
  } finally {e.box_dealloc(p,bytes.length)}
}
