'use strict';
const crypto = require('crypto');
const COOKIE = 'hog_staff_session';
const MAX_AGE = 60 * 60 * 10;
function secret(){ return process.env.STAFF_SESSION_SECRET || process.env.STAFF_ACCESS_CODE || ''; }
function sign(value){ return crypto.createHmac('sha256', secret()).update(value).digest('base64url'); }
function token(){ const payload = `${Date.now() + MAX_AGE*1000}`; return `${payload}.${sign(payload)}`; }
function verify(raw){
  if(!raw || !secret()) return false;
  const [exp,sig] = String(raw).split('.'); if(!exp || !sig) return false;
  const expected=sign(exp); if(expected.length!==sig.length) return false;
  if(!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(sig))) return false;
  return Number(exp) > Date.now();
}
function cookieFrom(req){
  const cookies=String(req.headers.cookie||'').split(';');
  for(const c of cookies){ const i=c.indexOf('='); if(i>0 && c.slice(0,i).trim()===COOKIE) return decodeURIComponent(c.slice(i+1).trim()); }
  return '';
}
function requireStaff(req,res){ if(!verify(cookieFrom(req))){res.status(401).json({success:false,error:'Sign in required'});return false;} return true; }
function setCookie(res,value){res.setHeader('Set-Cookie',`${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_AGE}`)}
function clearCookie(res){res.setHeader('Set-Cookie',`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`)}
module.exports={token,requireStaff,setCookie,clearCookie};