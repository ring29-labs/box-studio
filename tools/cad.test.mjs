import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import init from 'replicad-opencascadejs';
import {setOC,makeBox,exportSTEP} from 'replicad';
import {defaults,closedPanels,constructions} from '../web/designer/model.js';
setOC(await init({wasmBinary:fs.readFileSync(new URL('../node_modules/replicad-opencascadejs/dist/replicad_single.wasm',import.meta.url)),print:()=>{},printErr:()=>{}}));
test('OpenCascade produces named STEP assemblies for every construction at two sizes',async()=>{
 for(const construction of Object.keys(constructions))for(const length of [180,320]){
  const s={...defaults,construction,length};const parts=closedPanels(s);const shapes=parts.map(p=>{const a=p.center.map((v,i)=>v-p.size[i]/2),b=p.center.map((v,i)=>v+p.size[i]/2);return {shape:makeBox([a[0],-b[2],a[1]],[b[0],-a[2],b[1]]),name:p.name}});
  try{const text=await exportSTEP(shapes,{unit:'MM',modelUnit:'MM'}).text();assert(text.startsWith('ISO-10303-21;'));assert(text.includes('MANIFOLD_SOLID_BREP'));assert(text.includes(parts[0].name));assert(text.includes('END-ISO-10303-21;'));assert(text.length>50000)}finally{for(const{shape}of shapes)shape.delete()}
 }
});
