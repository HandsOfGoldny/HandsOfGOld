'use strict';
const {command,configured}=require('./lib/redis'); const {requireStaff}=require('./lib/staff-auth-lib');
const STATUSES=new Set(['new','contacted','qualified','appointment','won','lost','spam']);
function clean(v,max=2000){return String(v==null?'':v).trim().slice(0,max)}
async function allLeads(){if(!configured())throw new Error('Lead database is not configured. Add an Upstash/Vercel KV database to this project.');const raw=await command('LRANGE','hog:leads','0','1999');return (raw||[]).map(x=>{try{return JSON.parse(x)}catch(_){return null}}).filter(Boolean)}
async function saveAll(leads){const tx=[['DEL','hog:leads']];for(let i=leads.length-1;i>=0;i--)tx.push(['LPUSH','hog:leads',JSON.stringify(leads[i])]);for(const cmd of tx)await command(...cmd)}
module.exports=async function(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex,nofollow,noarchive');if(!requireStaff(req,res))return;
 try{
  if(req.method==='GET'){let leads=await allLeads();const status=clean(req.query&&req.query.status,40),q=clean(req.query&&req.query.q,200).toLowerCase();if(status)leads=leads.filter(x=>x.status===status);if(q)leads=leads.filter(x=>JSON.stringify(x).toLowerCase().includes(q));const counts={};for(const l of await allLeads())counts[l.status]=(counts[l.status]||0)+1;return res.status(200).json({success:true,leads,counts:Object.entries(counts).map(([status,count])=>({status,count}))});}
  if(req.method==='PATCH'){const b=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});const id=clean(b.id,120);let leads=await allLeads(),found=false;for(const l of leads){if(l.id===id){found=true;if(STATUSES.has(clean(b.status,40)))l.status=clean(b.status,40);l.assigned_to=clean(b.assignedTo,160);l.next_follow_up=clean(b.nextFollowUp,120);l.notes=clean(b.notes,4000);l.updated_at=new Date().toISOString();break}}if(!found)return res.status(404).json({success:false,error:'Lead not found'});await saveAll(leads);return res.status(200).json({success:true});}
  res.setHeader('Allow','GET, PATCH');return res.status(405).json({success:false,error:'Method not allowed'});
 }catch(e){console.error('[hog-leads-admin]',e);return res.status(500).json({success:false,error:e.message||'Dashboard error'});}
};