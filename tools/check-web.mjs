import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const {instance}=await WebAssembly.instantiate(await fs.readFile('web/engine.wasm'),{});
const wasm=instance.exports;
function calculate(request){
 const input=new TextEncoder().encode(JSON.stringify(request)+'\0');const p=wasm.box_alloc(input.length);
 try{new Uint8Array(wasm.memory.buffer,p,input.length).set(input);const out=wasm.box_calculate(p);try{return JSON.parse(new TextDecoder().decode(new Uint8Array(wasm.memory.buffer,out,wasm.box_result_len(out))))}finally{wasm.box_free(out)}}finally{wasm.box_dealloc(p,input.length)}
}
const cases=[
 {guided:true},
 {guided:true,quantity:500,length_mm:200,width_mm:150,base_height_mm:60,lid_height_mm:30,compare_quantities:[100,1000,2000]},
 {guided:true,hourly_rate:44,margin_percent:35,box:{C27:'< 100cm2'}},
 {guided:true,quantity:0},
 {guided:true,quantity:12.5},
 {guided:true,margin_percent:100},
 {guided:true,length_mm:1400,width_mm:1200},
 {guided:true,box:{C7:'unknown material'}},
 {guided:true,production:'automatic',length_mm:600,width_mm:500},
 {guided:true,include_shipping:true},
];
for(const request of cases){
 const expected=JSON.parse(execFileSync('target/debug/verify',[JSON.stringify(request)],{encoding:'utf8'}));
 assert.deepEqual(calculate(request),expected,'Native / WebAssembly mismatch: '+JSON.stringify(request));
}
const before=calculate({guided:true}),after=calculate({guided:true,hourly_rate:44});
assert(after.rows[0].price_per_unit>before.rows[0].price_per_unit);
assert.equal(before.rows[0].cost_total,before.rows[0].material_total+before.rows[0].labour_total);
assert(calculate({guided:true,quantity:0}).error);
console.log(`Passed ${cases.length} native/WebAssembly parity cases, linked labour pricing and invalid-input checks.`);
