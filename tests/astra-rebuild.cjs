const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../production');
const {readImage}=require(path.join(root,'server/inspiration-image.cjs'));
const fixture='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10,1,2,3,4]).toString('base64');
assert.equal(readImage(fixture).mime,'image/png');assert.throws(()=>readImage('data:image/svg+xml;base64,PHN2Zz4='));assert.throws(()=>readImage('data:image/png;base64,ZmFrZQ=='));assert.throws(()=>readImage('x'.repeat(800001)));
const commands=[],outbound=[];let rateAllowed=true,failDelivery=false;
const redisPath=require.resolve(path.join(root,'api/lib/redis'));
require.cache[redisPath]={id:redisPath,filename:redisPath,loaded:true,exports:{configured:()=>true,command:async(...args)=>{commands.push(args);if(args[0]==='EVAL')return rateAllowed?1:100;return 'OK';}}};
process.env.NODE_ENV='test';process.env.RESEND_API_KEY='test-only';process.env.RESEND_FROM_EMAIL='test@example.com';
global.fetch=async(url,options)=>{outbound.push({url,body:JSON.parse(options.body)});return {ok:!failDelivery,status:failDelivery?502:200,json:async()=>({success:!failDelivery})};};
const leads=require(path.join(root,'api/leads'));
function res(){return {code:0,data:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.data=v;return this;},send(v){this.data=v;return this;}};}
function req(body){return {method:'POST',headers:{'content-type':'application/json',origin:'http://localhost:3000'},socket:{remoteAddress:'127.0.0.1'},body};}
const good={source:'astra_studio',leadType:'custom_jewelry',service:'custom',name:'Review Customer',email:'review@example.com',phone:'',consent:true,piece:'Pendant',metal:'14K Yellow Gold',stones:'No stones / gold only',budget:'$2500',size_dimensions:'2.5 inches',design_notes:'My initials',website:'',inspiration_image:fixture};
(async()=>{
 let response=res();await leads(req(good),response);assert.equal(response.code,200);assert.ok(response.data.leadId);const saved=JSON.parse(commands.find(c=>c[0]==='LPUSH')[2]);assert.equal(saved.payload.piece,'Pendant');assert.equal(saved.payload.budget,'$2500');assert.equal(saved.payload.request_status,'inquiry_only');assert.equal(saved.payload.approval_status,'staff_review_required');assert.ok(saved.payload.inspiration_staff_url);assert.ok(commands.find(c=>c[0]==='SET'&&c[1].startsWith('hog:inspiration:')));assert.equal(outbound.find(x=>x.url.includes('resend.com')).body.attachments[0].filename,'customer-inspiration.png');
 let count=outbound.length;response=res();await leads(req({...good,consent:false}),response);assert.equal(response.code,400);assert.equal(outbound.length,count);
 response=res();await leads(req({...good,website:'bot'}),response);assert.equal(response.code,400);assert.equal(outbound.length,count);
 response=res();await leads(req({...good,inspiration_image:'data:image/png;base64,ZmFrZQ=='}),response);assert.equal(response.code,400);
 rateAllowed=false;response=res();await leads(req(good),response);assert.equal(response.code,429);rateAllowed=true;
 response=res();await leads({...req(good),headers:{'content-type':'application/json',origin:'https://evil.example'}},response);assert.equal(response.code,400);
 const inspiration=require(path.join(root,'server/inspiration.cjs'));response=res();await inspiration({method:'GET',headers:{},url:'/api/inspiration?id='+saved.id},response);assert.equal(response.code,401);
 const chat=require(path.join(root,'api/chat'));for(const question of ['Confirm delivery by Friday','How much is my final price?','Diagnose my broken clasp','Am I approved for financing?']){response=res();await chat(req({messages:[{role:'user',content:question}]}),response);assert.equal(response.code,200);assert.match(response.data.reply,/must confirm/);}
 for(const name of ['index.html','astra-studio.html']){const html=fs.readFileSync(path.join(root,name),'utf8');for(const match of html.matchAll(/(?:href|src|poster)="([^"#]+)"/g)){const url=match[1];if(/^(https?:|tel:|mailto:|data:)/.test(url))continue;const file=url.split(/[?#]/)[0];if(!file)continue;const target=path.join(root,file==='/'?'index.html':file.replace(/^\//,''));assert.ok(fs.existsSync(target),`${name}: missing ${url}`);}}
 const all=fs.readFileSync(path.join(root,'index.html'),'utf8');assert.equal((all.match(/class="catalog-product-card"/g)||[]).length,39);const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));assert.ok(config.rewrites.some(x=>x.source==='/api/checkout'));assert.ok(fs.readFileSync(path.join(root,'classic-cuban.js'),'utf8').includes('/api/checkout'));
 console.log('PASS: uploads, structured staff lead, email attachment, consent, rate limits, origin checks, staff image access, commitment escalation, local links, 39 catalog pages, existing checkout routing. No external requests sent.');
})().catch(e=>{console.error(e);process.exitCode=1;});
