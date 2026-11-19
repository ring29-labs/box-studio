import test from 'node:test';
import assert from 'node:assert/strict';
import {calculate} from '../server/quote.js';
import {bodySchema,createProposal} from '../server/assistant.js';
import handler from '../api/assistant.js';
const base={quantity:2000,length_mm:270,width_mm:190,base_height_mm:75,lid_height_mm:100,hourly_rate:22,margin_percent:25,production:'auto',include_shipping:false,compare_quantities:[500,1000,2000],box:{C7:'Multi-art 150',C8:'Multi-art 150'}};
test('proposal preserves unspecified settings and matches the Rust engine',async()=>{
 const proposal=await createProposal(base,{quantity:1000,length_mm:200,width_mm:150,base_height_mm:60,lid_height_mm:30});
 assert.equal(proposal.valid,true);assert.equal(proposal.configuration.margin_percent,25);assert.deepEqual(proposal.configuration.box,base.box);assert.equal(base.quantity,2000);
 assert.deepEqual(proposal.quote,await calculate(proposal.configuration));assert.equal(proposal.quote.rows[0].price_per_unit,1.84);
});
test('invalid catalogue value and impossible machine fit cannot become a priced proposal',async()=>{
 assert.equal((await createProposal(base,{box:{C7:'invented paper'}})).valid,false);
 assert.equal((await createProposal(base,{production:'automatic',length_mm:600,width_mm:500})).valid,false);
});
test('reject arbitrary fields, catalogue cells and oversized history',()=>{
 assert.equal(bodySchema.safeParse({message:'hello',configuration:{apiKey:'secret'}}).success,false);
 assert.equal(bodySchema.safeParse({message:'hello',configuration:{box:{C53:'0'}}}).success,false);
 assert.equal(bodySchema.safeParse({message:'hello',configuration:base,history:Array(7).fill({role:'user',content:'hello'})}).success,false);
});
test('API rejects cross-origin and invalid requests before invoking any model',async()=>{
 const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v},status(code){this.code=code;return this},json(body){this.body=body;return this}});
 const req={method:'POST',headers:{host:'box-studio.ring29.com',origin:'https://other.example','content-type':'application/json'},body:{message:'hi',configuration:base}};
 const res=response();await handler(req,res);assert.equal(res.code,403);
 const invalid=response();await handler({...req,headers:{...req.headers,origin:'https://box-studio.ring29.com'},body:{message:'hi',configuration:{quantity:-20}}},invalid);assert.equal(invalid.code,400);
 const get=response();await handler({method:'GET'},get);assert.equal(get.code,405);
});
