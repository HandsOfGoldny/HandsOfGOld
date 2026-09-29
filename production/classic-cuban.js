
(() => {
"use strict";
const products = window.HOG_CLASSIC_CUBAN_PRODUCTS || [];
const pricing = window.HOG_CLASSIC_CUBAN_PRICING || {};
const purities={"10K":0.417,"14K":0.585,"18K":0.75,"21K":0.875,"22K":0.9167};
const money = new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0});
let goldSpot=null;
let state={type:"bracelet",width:8,length:8,karat:"14K"};

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const roundRetail=(v)=>{
  const r=Number(pricing.roundTo)||1;
  return Math.round(v/r)*r;
};
function currentProduct(){
  return products.find(p=>p.type===state.type && Number(p.widthMm)===Number(state.width) && Number(p.lengthIn)===Number(state.length));
}
function availableProducts(type=state.type){ return products.filter(p=>p.type===type); }
function widths(type=state.type){ return [...new Set(availableProducts(type).map(p=>p.widthMm))].sort((a,b)=>a-b); }
function lengths(type=state.type,width=state.width){ return [...new Set(products.filter(p=>p.type===type && Number(p.widthMm)===Number(width)).map(p=>p.lengthIn))].sort((a,b)=>a-b); }
function karats(prod=currentProduct()){ return prod ? Object.keys(prod.weights) : []; }

async function loadGold(){
  try{
    const r=await fetch("https://api.gold-api.com/price/XAU",{cache:"no-store"});
    if(!r.ok) throw new Error("gold feed");
    const d=await r.json();
    goldSpot=Number(d.price);
    if(!Number.isFinite(goldSpot)) throw new Error("gold value");
  }catch(e){ goldSpot=null; }
  renderResult();
}
function metalValue(weight,karat){
  const spg=spotPerGram();
  if(spg===null || !weight || !purities[karat]) return null;
  return spg*weight*purities[karat];
}
const TROY_OZ_GRAMS=31.1034768;
function spotPerGram(){
  if(!goldSpot || !Number.isFinite(goldSpot) || goldSpot<=0) return null;
  return goldSpot/TROY_OZ_GRAMS;
}
function retailPrice(weight,karat){
  if(!pricing.retailEnabled) return null;
  const w=Number(weight);
  if(!Number.isFinite(w) || w<=0) return null;

  // Hands of Gold rule: (live gold spot per gram + set amount) x weight.
  // Spot-based, NOT melt: karat purity is not applied to the rate.
  if(pricing.mode==="spotPlus"){
    const allowed=pricing.spotPlusKarats;
    if(Array.isArray(allowed) && !allowed.includes(karat)) return null;
    const spg=spotPerGram();
    if(spg===null) return null;
    const rate=spg+(Number(pricing.spotPlusPerGram)||0);
    const total=roundRetail(w*rate + (Number(pricing.flatFee)||0));
    const cap=Number(pricing.maxAutoPrice);
    if(Number.isFinite(cap) && cap>0 && total>cap) return null;
    return total;
  }

  if(pricing.mode==="perGram"){
    const rate=Number(pricing.retailPerGram?.[karat]);
    if(!Number.isFinite(rate) || rate<=0) return null;
    return roundRetail(weight*rate + (Number(pricing.flatFee)||0));
  }
  const mv=metalValue(weight,karat);
  if(!mv) return null;
  const markup=1+(Number(pricing.markupPercent)||0)/100;
  return roundRetail(mv*markup + weight*(Number(pricing.laborPerGram)||0) + (Number(pricing.flatFee)||0));
}
function syncQuery(){
  const u=new URL(location.href);
  u.searchParams.set("type",state.type);
  u.searchParams.set("width",state.width);
  u.searchParams.set("length",state.length);
  u.searchParams.set("karat",state.karat);
  history.replaceState(null,"",u);
}
function loadQuery(){
  const q=new URLSearchParams(location.search);
  const t=q.get("type");
  if(["bracelet","necklace"].includes(t)) state.type=t;
  const w=Number(q.get("width")), l=Number(q.get("length")), k=q.get("karat");
  if(Number.isFinite(w)) state.width=w;
  if(Number.isFinite(l)) state.length=l;
  if(k) state.karat=k;
}
function normalize(){
  const ws=widths();
  if(!ws.includes(Number(state.width))) state.width=ws[0];
  const ls=lengths();
  if(!ls.includes(Number(state.length))) state.length=ls[0];
  const ks=karats();
  if(!ks.includes(state.karat)) state.karat=ks.includes("14K")?"14K":ks[0];
}
function renderControls(){
  $$(".cc-type-btn").forEach(b=>b.classList.toggle("is-active",b.dataset.type===state.type));
  const widthBox=$("#cc-widths"); widthBox.innerHTML="";
  widths().forEach(w=>{
    const b=document.createElement("button"); b.type="button"; b.textContent=w+" mm"; b.classList.toggle("is-active",Number(w)===Number(state.width));
    b.onclick=()=>{state.width=w; state.length=lengths()[0]; normalize(); renderAll();};
    widthBox.appendChild(b);
  });
  const length=$("#cc-length"); length.innerHTML="";
  lengths().forEach(l=>{const o=document.createElement("option");o.value=l;o.textContent=l+'"';o.selected=Number(l)===Number(state.length);length.appendChild(o);});
  const karatBox=$("#cc-karats");karatBox.innerHTML="";
  ["10K","14K","18K","21K","22K"].forEach(k=>{
    const b=document.createElement("button");b.type="button";b.textContent=k;
    const ok=karats().includes(k);b.disabled=!ok;b.classList.toggle("is-active",state.karat===k);
    b.title=ok?"Catalog weight available":"This catalog does not provide a weight for this karat/size";
    b.onclick=()=>{state.karat=k;renderAll();};karatBox.appendChild(b);
  });
}
function renderResult(){
  const p=currentProduct(); if(!p)return;
  const weight=Number(p.weights[state.karat]);
  $("#cc-product-image").src=p.image;
  $("#cc-product-image").alt=`Monaci Cuban ${state.type} ${p.widthMm} mm ${p.lengthIn} inch in 14K gold`;
  $("#cc-product-title").textContent=`Monaci Cuban ${state.type==="bracelet"?"Bracelet":"Necklace"}`;
  $("#cc-sku").textContent=p.sku;
  $("#cc-width").textContent=p.widthMm+" mm";
  $("#cc-length-result").textContent=p.lengthIn+'"';
  $("#cc-karat").textContent=state.karat;
  $("#cc-weight").textContent=weight.toFixed(2)+" g";
  $("#cc-page-ref").textContent="Catalog page "+p.sourcePage;
  const rp=retailPrice(weight,state.karat);
  const main=$("#cc-retail-price"), sub=$("#cc-price-sub");
  if(rp){
    main.textContent=money.format(rp);
    sub.textContent="Current online Hands of Gold price. Final availability is confirmed by the store.";
  }else{
    main.textContent="Call for pricing";
    sub.textContent="Call or text us for current pricing on this exact configuration. Prices move with the gold market.";
  }
  const sms=`Hi Hands of Gold, I'm interested in the Monaci Cuban ${state.type}, ${p.widthMm}mm x ${p.lengthIn}in, ${state.karat}, SKU ${p.sku}.`;
  $("#cc-text").href=`sms:6312646610?body=${encodeURIComponent(sms)}`;
  $("#cc-call").href="tel:6312646610";
  syncQuery();
}
function renderCatalog(){
  const grid=$("#cc-catalog-grid");
  if(!grid) return;
  grid.innerHTML="";
  products.filter(p=>p.type===state.type).forEach(p=>{
    const ks=Object.keys(p.weights);
    const preferred=ks.includes("14K")?"14K":ks[0];
    const wt=p.weights[preferred];
    const card=document.createElement("article");card.className="cc-card";
    card.innerHTML=`<img loading="lazy" src="${p.image}" alt="Monaci Cuban ${p.type} ${p.widthMm}mm ${p.lengthIn} inch">
      <div class="cc-card-body"><div class="cc-card-title">${p.widthMm}mm × ${p.lengthIn}" ${p.type}</div>
      <div class="cc-card-meta">${p.sku}</div><div class="cc-card-price">${preferred} · ${Number(wt).toFixed(2)}g</div></div>`;
    card.onclick=()=>{state.width=p.widthMm;state.length=p.lengthIn;state.karat=preferred;normalize();renderAll();$("#cc-builder").scrollIntoView({behavior:"smooth",block:"start"});};
    grid.appendChild(card);
  });
}
function renderAll(){ normalize(); renderControls(); renderResult(); renderCatalog(); }
function share(){
  const p=currentProduct();
  if(!p) return;
  const text=`Monaci Cuban ${state.type}: ${p.widthMm}mm × ${p.lengthIn}", ${state.karat} — ${location.href}`;
  if(navigator.share){navigator.share({title:"Hands of Gold Monaci Cuban",text,url:location.href}).catch(()=>{});}
  else{
    const btn=$("#cc-share");
    const flash=(msg)=>{btn.textContent=msg;setTimeout(()=>btn.textContent="Share This Piece",1800);};
    try{
      navigator.clipboard.writeText(location.href)
        .then(()=>flash("Link Copied ✓"))
        .catch(()=>flash("Copy the link from your address bar"));
    }catch(e){ flash("Copy the link from your address bar"); }
  }
}
document.addEventListener("DOMContentLoaded",()=>{
  loadQuery();normalize();
  $$(".cc-type-btn").forEach(b=>b.onclick=()=>{state.type=b.dataset.type;state.width=widths(state.type)[0];state.length=lengths(state.type,state.width)[0];state.karat="14K";normalize();renderAll();});
  $("#cc-length").onchange=e=>{state.length=Number(e.target.value);normalize();renderAll();};
  $("#cc-share").onclick=share;
  renderAll();loadGold();
});
})();
