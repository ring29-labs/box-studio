import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaults,clean,validate,constructions,closedPanels,panels,lidTransform,innerDimensions,quoteRequest} from '../web/designer/model.js';
import {calculate} from '../server/quote.js';
const catalog=JSON.parse(fs.readFileSync(new URL('../server/catalog.json',import.meta.url)));
test('all three constructions produce positive finite panel geometry across supported sizes',()=>{
 for(const construction of Object.keys(constructions))for(const [length,width,height,lidHeight]of [[80,60,40,30],[240,170,70,35],[500,400,200,100]])for(const board of [1.5,2,2.4,3]){
  const state={...defaults,construction,length,width,height,lidHeight,board};assert.deepEqual(validate(state),[]);
  const geometry=closedPanels(state);assert(geometry.length>=9);for(const p of geometry){assert(p.size.every(n=>Number.isFinite(n)&&n>0));assert(p.center.every(Number.isFinite))}
 }
});
test('lid and neck clearances match the requested geometry, including foam insert fit',()=>{
 const s={...defaults,construction:'lid-base'};const geometry=panels(s);const front=geometry.find(p=>p.name==='Lid front');assert(Math.abs(front.size[0]-2*s.board-s.length-2*s.clearance)<1e-9);
 const shoulder={...s,construction:'shoulder',insert:'frame'};const inner=innerDimensions(shoulder),foam=panels(shoulder).find(p=>p.name==='Insert front');assert.equal(foam.size[0],inner[0]-2);
 assert(validate({...shoulder,lidHeight:10,neck:30}).length>0);
});
test('magnetic hinge has a stable origin and the lid rotates upward',()=>{
 const closed=lidTransform(defaults,0),open=lidTransform(defaults,1);assert.deepEqual(closed.position,open.position);assert(Math.abs(closed.angle)<1e-9);assert(open.angle<0);assert.equal(open.position[1],defaults.height+2*defaults.board);
});
test('unsupported construction or board cannot silently use lid-base pricing',async()=>{
 assert.equal(quoteRequest(defaults,catalog).supported,false);
 assert.equal(quoteRequest({...defaults,construction:'shoulder'},catalog).supported,false);
 assert.equal(quoteRequest({...defaults,construction:'lid-base',board:2.4},catalog).supported,false);
 const source=quoteRequest({...defaults,construction:'lid-base',material:'coated',foil:'none'},catalog);assert(source.supported);const result=await calculate(source.request);assert(!result.error);assert(result.rows[0].price_per_unit>0);assert.equal(result.rows[0].cost_total,result.rows[0].material_total+result.rows[0].labour_total);
});
test('foil coverage and lamination select exact workbook options',()=>{
 const s={...defaults,construction:'lid-base',length:500,width:400,logoScale:1.6,finish:'soft-touch'};const request=quoteRequest(s,catalog).request;assert.equal(request.box.C27,'> 300cm2');assert(catalog.C26.options.includes(request.box.C26));assert.match(request.box.C26,/soft/);
});
test('import rejects invalid geometry and executable artwork URLs',()=>{
 assert.throws(()=>clean({...defaults,length:0}));assert.throws(()=>clean({...defaults,artwork:'javascript:alert(1)'}));assert.throws(()=>clean({...defaults,artwork:'data:image/svg+xml,<svg/>'}));assert.throws(()=>clean({...defaults,colour:'red;expression(...)'}));
});
