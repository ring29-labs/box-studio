import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,studioLooks} from '../web/designer/model.js';
import {designLink,readDesignLink} from '../web/designer/share.js';
test('all three named design links open their own state regardless of prior local state',async()=>{
 for(const[key,s]of Object.entries(studioLooks))assert.deepEqual(await readDesignLink('https://box-studio.ring29.com/designer/?design='+key),s);
});
test('custom links reproduce dimensions, materials and pose and identify different versions',async()=>{
 const a={...defaults,name:'Team review – dėžutė',length:310,material:'wibalin',colour:'#1f2829',opening:73,explode:20};
 const url=await designLink(a,'https://box-studio.ring29.com/designer/');assert.deepEqual(await readDesignLink(url),a);assert.match(url,/\?design=team-review/);
 const b=await designLink({...a,length:311},'https://box-studio.ring29.com/designer/');assert.notEqual(new URL(url).search,new URL(b).search);
});
test('share links exclude uploaded artwork and reject invalid or oversized input',async()=>{
 const state={...defaults,artwork:'data:image/png;base64,AAAA'};const shared=await readDesignLink(await designLink(state,'https://box-studio.ring29.com/designer/'));assert.equal(shared.artwork,null);assert.equal(shared.construction,state.construction);
 await assert.rejects(()=>readDesignLink('https://example.com/#v1='+'x'.repeat(17000)));
 await assert.rejects(()=>designLink({...defaults,length:0},'https://example.com/'));
});
