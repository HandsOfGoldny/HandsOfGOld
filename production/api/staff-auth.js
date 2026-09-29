'use strict';
const crypto=require('crypto');
const {token,setCookie,clearCookie}=require('./lib/staff-auth-lib');
function clean(v){return String(v||'').trim();}
function same(a,b){const A=Buffer.from(String(a)),B=Buffer.from(String(b));return A.length===B.length&&crypto.timingSafeEqual(A,B)}
module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
  if(req.method==='DELETE'){clearCookie(res);return res.status(200).json({success:true});}
  if(req.method!=='POST'){res.setHeader('Allow','POST, DELETE');return res.status(405).json({success:false,error:'Method not allowed'});}
  const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
  const expectedEmail=clean(process.env.STAFF_EMAIL||'HandsOfGold@handsofgold.org').toLowerCase();
  const expectedCode=clean(process.env.STAFF_ACCESS_CODE);
  const email=clean(body.email).toLowerCase(), code=clean(body.accessCode);
  if(!expectedCode) return res.status(503).json({success:false,error:'Staff access code is not configured.'});
  if(!same(email,expectedEmail)||!same(code,expectedCode)) return res.status(401).json({success:false,error:'Email or access code is incorrect.'});
  setCookie(res,token()); return res.status(200).json({success:true});
};