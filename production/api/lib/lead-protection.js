'use strict';
const {createHash}=require('node:crypto');
const {isIP}=require('node:net');
const MAX_BYTES=48*1024;
const LIMIT_SCRIPT=`
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count`;

function parseBody(req){
  const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);
  if(!raw||Buffer.byteLength(raw,'utf8')>MAX_BYTES)throw new Error('Invalid body');
  const body=JSON.parse(raw);
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Invalid body');
  return body;
}
function validate(req,body){
  const headers=req.headers||{};
  if(!/^application\/json(?:\s*;|$)/i.test(headers['content-type']||''))return 'Please submit using the website form.';
  if(headers['sec-fetch-site']==='cross-site')return 'Please submit using the website form.';
  if(headers.origin){
    try{
      const origin=new URL(headers.origin);
      const allowed=new Set(['https://www.handsofgoldny.com','https://handsofgoldny.com']);
      if(process.env.VERCEL_URL)allowed.add('https://'+process.env.VERCEL_URL);
      if(process.env.NODE_ENV!=='production')allowed.add('http://localhost:3000');
      if(!allowed.has(origin.origin))return 'Please submit using the website form.';
    }catch(_){return 'Invalid request.';}
  }
  for(const key of Object.keys(body)){
    if(!['string','number','boolean'].includes(typeof body[key])&&body[key]!==null)return 'Invalid request.';
  }
  if(String(body.website||'').trim())return 'We could not accept this request. Please call (631) 264-6610.';
  if(body.leadType==='giveaway_202609'){
    if(Date.now()>=Date.parse('2026-10-01T00:00:00-04:00'))return 'This giveaway closed September 30, 2026.';
    if(body.consent!==true)return 'Please confirm your eligibility and agreement to the giveaway rules.';
    if(!String(body.email||'').trim())return 'Please include your email address.';
  }
  const name=String(body.name||'').trim(),email=String(body.email||'').trim(),phone=String(body.phone||'').trim();
  if(!name||name.length>160||!/[\p{L}]/u.test(name))return 'Please include your name.';
  if(!email&&!phone)return 'Please include an email or phone number.';
  if(email&&(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))return 'Please check your email address.';
  const digits=phone.replace(/\D/g,'');
  if(phone&&(!/^[+\d\s().-]+$/.test(phone)||digits.length<10||digits.length>15||/^(\d)\1+$/.test(digits)))return 'Please check your phone number.';
  return null;
}
function clientIP(req){
  const h=req.headers||{};
  // Trust only Vercel's platform header in production, never a body-supplied IP.
  const value=process.env.VERCEL?h['x-vercel-forwarded-for']:req.socket?.remoteAddress;
  const ip=typeof value==='string'?value.split(',')[0].trim():'';
  return isIP(ip)?ip:null;
}
async function checkRate(req,body,redis){
  const ip=clientIP(req);
  if(!ip||!redis.configured())throw new Error('Lead protection unavailable');
  const hash=v=>createHash('sha256').update(v).digest('hex');
  const buckets=[['ip',ip,10,600],['ip-hour',ip,30,3600]];
  if(body.email)buckets.push(['email',String(body.email).trim().toLowerCase(),5,3600]);
  if(body.phone)buckets.push(['phone',String(body.phone).replace(/\D/g,''),5,3600]);
  for(const [kind,value,limit,ttl] of buckets){
    const count=await redis.command('EVAL',LIMIT_SCRIPT,1,'hog:lead-rate:v1:'+kind+':'+hash(value),ttl);
    if(!Number.isSafeInteger(Number(count))||Number(count)<1)throw new Error('Invalid rate counter');
    if(Number(count)>limit)return false;
  }
  return true;
}
module.exports={parseBody,validate,checkRate,LIMIT_SCRIPT};
