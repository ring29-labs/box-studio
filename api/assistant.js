import {assist,bodySchema} from '../server/assistant.js';
const requests=new Map();
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Use POST to ask the assistant.'})}
 const origin=req.headers.origin;
 const hosts=new Set([req.headers.host,process.env.VERCEL_URL,'box-studio.ring29.com','ring29-box-studio.vercel.app']);
 try{if(!origin||!hosts.has(new URL(origin).host))return res.status(403).json({error:'Open Box Studio to use this assistant.'})}catch{return res.status(403).json({error:'Invalid origin.'})}
 if(!String(req.headers['content-type']||'').startsWith('application/json'))return res.status(415).json({error:'Send JSON.'});
 if(Number(req.headers['content-length']||0)>20000)return res.status(413).json({error:'Your message is too long.'});
 let raw=req.body;
 try{if(typeof raw==='string')raw=JSON.parse(raw);if(JSON.stringify(raw).length>20000)throw Error()}catch{return res.status(400).json({error:'Invalid request.'})}
 const parsed=bodySchema.safeParse(raw);
 if(!parsed.success)return res.status(400).json({error:'Check the message and configuration values.'});
 if(!process.env.AI_GATEWAY_API_KEY)return res.status(503).json({error:'The AI assistant is not configured yet. The guided form still works.'});
 const now=Date.now(),ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0];
 for(const[k,v]of requests)if(v.until<now)requests.delete(k);
 const count=requests.get(ip)||{n:0,until:now+600000};
 if(count.n>=10||requests.size>=5000){res.setHeader('Retry-After','600');return res.status(429).json({error:'Demo chat limit reached. Please try later; the form remains available.'})}
 count.n++;requests.set(ip,count);
 try{return res.status(200).json(await assist(parsed.data))}
 catch(error){console.error('Box assistant request failed',error.name);return res.status(502).json({error:'The AI service is temporarily unavailable or the demo allowance is used up. You can continue with the guided form.'})}
}
