let engine;
const ready=fetch('engine.wasm').then(r=>{if(!r.ok)throw Error('Calculation model could not be loaded.');return r.arrayBuffer()}).then(b=>WebAssembly.instantiate(b,{})).then(x=>engine=x.instance.exports);
self.onmessage=async({data:{id,request}})=>{
 try{
  await ready;const bytes=new TextEncoder().encode(JSON.stringify(request)+'\0');const p=engine.box_alloc(bytes.length);let result;
  try{new Uint8Array(engine.memory.buffer,p,bytes.length).set(bytes);const out=engine.box_calculate(p);try{result=JSON.parse(new TextDecoder().decode(new Uint8Array(engine.memory.buffer,out,engine.box_result_len(out))))}finally{engine.box_free(out)}}finally{engine.box_dealloc(p,bytes.length)}
  self.postMessage({id,result});
 }catch(error){self.postMessage({id,result:{error:error.message}})}
};
