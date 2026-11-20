import {clean,studioLooks} from './model.js';
const encode=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const decode=text=>Uint8Array.from(atob(text.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
export async function designLink(configuration,base){
 const state=clean({...configuration,artwork:null});
 const bytes=new TextEncoder().encode(JSON.stringify(state));
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,12);
 let encoded=encode(bytes),tag='design';
 if(typeof CompressionStream!=='undefined'){const compressed=await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer();encoded=encode(new Uint8Array(compressed));tag='v1'}
 const url=new URL(base);url.search='';url.hash='';const slug=state.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,42)||state.construction;
 url.searchParams.set('design',slug+'-'+digest);url.hash=tag+'='+encoded;return url.href;
}
export async function readDesignLink(url){
 const u=new URL(url);let data;
 if(u.hash.length>16000)throw Error('The design link is too large.');
 if(u.hash.startsWith('#v1=')){const bytes=decode(u.hash.slice(4));const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));const text=await new Response(stream).text();if(text.length>12000)throw Error('The design link is too large.');data=JSON.parse(text)}
 else if(u.hash.startsWith('#design=')){const raw=decode(decodeURIComponent(u.hash.slice(8)));if(raw.length>12000)throw Error('The design link is too large.');data=JSON.parse(new TextDecoder().decode(raw))}
 else{const preset=u.searchParams.get('design');if(preset&&studioLooks[preset])return clean(studioLooks[preset]);return null}
 return clean(data);
}
