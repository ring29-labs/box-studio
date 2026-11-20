import initOpenCascade from './opencascade.js';
import {setOC,makeBox,exportSTEP} from 'replicad';
import {clean,closedPanels,constructions} from './model.js';
let ready;
self.onmessage=async({data})=>{
 try{
  const s=clean(data.configuration);
  ready??=initOpenCascade({locateFile:name=>new URL(name.endsWith('.wasm')?'opencascade.wasm':name,self.location.href).href,print:()=>{},printErr:()=>{}});
  setOC(await ready);
  const shapes=[];
  try{
   for(const p of closedPanels(s)){
    const a=p.center.map((v,i)=>v-p.size[i]/2),b=p.center.map((v,i)=>v+p.size[i]/2);
    // Three.js Y-up millimetres -> CAD Z-up millimetres.
    const shape=makeBox([a[0],-b[2],a[1]],[b[0],-a[2],b[1]]);
    shapes.push({shape,name:p.name,color:p.surface==='foam'?'#27272a':p.surface==='inside'?s.inside:s.colour});
   }
   const blob=exportSTEP(shapes,{unit:'MM',modelUnit:'MM'});const buffer=await blob.arrayBuffer();
   self.postMessage({id:data.id,buffer,name:`VIA ${constructions[s.construction].name} ${s.length}x${s.width}x${s.height}.step`},[buffer]);
  }finally{for(const{shape}of shapes)shape.delete()}
 }catch(error){self.postMessage({id:data.id,error:'CAD export could not finish. '+error.message})}
};
