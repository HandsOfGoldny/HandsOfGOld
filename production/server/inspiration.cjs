'use strict';
const {requireStaff}=require('../api/lib/staff-auth-lib');
const {command}=require('../api/lib/redis');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed.'});}
 if(!requireStaff(req,res))return;
 const id=new URL(req.url,'https://local').searchParams.get('id')||'';
 if(!/^HOG-[A-Z0-9]+-[A-Z0-9]{5}$/.test(id))return res.status(400).json({error:'Invalid request.'});
 try{const raw=await command('GET','hog:inspiration:'+id);if(!raw)return res.status(404).json({error:'Inspiration is unavailable.'});const image=JSON.parse(raw);res.setHeader('Content-Type',image.mime);return res.status(200).send(Buffer.from(image.b64,'base64'));}catch(_){return res.status(503).json({error:'Inspiration is unavailable.'});}
};
