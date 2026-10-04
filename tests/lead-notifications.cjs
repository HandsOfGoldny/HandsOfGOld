const assert=require('node:assert/strict');
const redis=require('../production/api/lib/redis');let saved=[];redis.configured=()=>true;redis.command=async(op,...args)=>{if(op==='LPUSH')saved.push(JSON.parse(args[1]));return 1};
process.env.LEAD_EMAIL='store@example.com';process.env.LEAD_CC_EMAIL='owner@example.com,store@example.com';process.env.RESEND_API_KEY='test';process.env.RESEND_FROM_EMAIL='Store <notifications@example.com>';delete process.env.LEAD_WEBHOOK_URL;delete process.env.VERCEL;
const handler=require('../production/api/leads');let requests=[];
async function run(extra={}){const res={code:200,setHeader(){},status(n){this.code=n;return this},json(v){this.data=v;return this}};await handler({method:'POST',headers:{'content-type':'application/json'},socket:{remoteAddress:'127.0.0.1'},body:{name:'Notification Test',email:'customer@example.com',message:'Test request',...extra}},res);return res;}
(async()=>{
 global.fetch=async(url,args)=>{requests.push({url,body:JSON.parse(args.body)});return {ok:true,json:async()=>({id:'test-receipt'})}};
 for(const leadType of ['custom_jewelry','product_inquiry','service','welcome_offer']){requests=[];let r=await run({leadType,source:'astra_chat',consent:true});assert.equal(r.code,200);assert.equal(requests.length,1);assert.deepEqual(requests[0].body.to,['store@example.com','owner@example.com']);assert.equal(requests[0].body.reply_to,'customer@example.com');assert.ok(saved.at(-1).id);}
 requests=[];global.fetch=async(url,args)=>{requests.push({url,body:JSON.parse(args.body)});return url.includes('resend.com')?{ok:false,status:503}:{ok:true,json:async()=>({success:'true'})}};
 assert.equal((await run()).code,200);assert.equal(requests.length,3);assert.ok(requests[1].url.includes('store%40example.com'));assert.ok(requests[2].url.includes('owner%40example.com'));
 redis.configured=()=>true;redis.command=async(op)=>{if(op==='LPUSH')throw Error('test storage failure');return 1};requests=[];
 // Reload so storage destructured references use the failing stub.
 delete require.cache[require.resolve('../production/api/leads')];const failedHandler=require('../production/api/leads');global.fetch=async()=>({ok:true,json:async()=>({success:'false'})});
 const res={setHeader(){},status(n){this.code=n;return this},json(v){this.data=v}};await failedHandler({method:'POST',headers:{'content-type':'application/json'},socket:{remoteAddress:'127.0.0.1'},body:{name:'Test',email:'customer@example.com'}},res);assert.equal(res.code,502);
 console.log('PASS: all lead types reach both inboxes, recipients deduplicated, no duplicate fallback on success, fallback covers both, false provider success rejected.');
})().catch(e=>{console.error(e);process.exitCode=1});
