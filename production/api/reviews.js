'use strict';

const SNAPSHOT = {"rating": 4.9, "count": 713, "mapsUrl": "https://g.page/r/CYE_GVC073x4EB0/review", "reviews": [{"author": "Analis Collado", "rating": 5, "text": "Hands of Gold truly lives up to its name. The service is kind and welcoming, and the jewelry quality is excellent.", "time": ""}, {"author": "Cynthia Amaya", "rating": 5, "text": "Family-owned service, honest guidance, and beautiful jewelry. They take care of customers and help even when something is not in stock.", "time": ""}, {"author": "Cristopher Murillo", "rating": 5, "text": "Helpful staff, fair pricing, and a strong selection. I would recommend this jewelry store to anyone looking for gold jewelry.", "time": ""}, {"author": "A Santos", "rating": 5, "text": "Professional, knowledgeable, and accommodating. The jewelry is beautiful and high quality, and the team makes customers feel like family.", "time": ""}, {"author": "Fezzie S", "rating": 5, "text": "Quick, friendly, and price-conscious service for watch batteries and jewelry needs.", "time": ""}, {"author": "Milton Romain II", "rating": 5, "text": "Same-day chain repair, great work, and knowledgeable staff.", "time": ""}, {"author": "Paige", "rating": 5, "text": "They turned a personal custom-jewelry idea into a beautiful piece and were trustworthy and accommodating throughout the process.", "time": ""}, {"author": "Ruairi", "rating": 5, "text": "The staff helped resize a wedding band and created a custom wedding band that came out beautifully.", "time": ""}, {"author": "Samantha Aponte", "rating": 5, "text": "Kind, patient service made the jewelry-shopping experience enjoyable and stress-free.", "time": "recent"}, {"author": "Carina Zambrano", "rating": 5, "text": "A chain repair visit turned into an easy, comfortable experience because of the welcoming customer service.", "time": "recent"}, {"author": "Marie Cataldo", "rating": 5, "text": "A custom nameplate necklace came out beautifully, and the process was quick and easy.", "time": "recent"}]};
const QUERY = 'Hands of Gold Jewelry and Repairs, 494 Oak St, Copiague, NY 11726';

function clean(v, max=1200) { return String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max); }

async function googleReviews(key) {
  const search = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method:'POST',
    headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress'},
    body: JSON.stringify({textQuery:QUERY,maxResultCount:1})
  });
  if (!search.ok) throw new Error(`Places search ${search.status}`);
  const s = await search.json();
  const place = s && s.places && s.places[0];
  if (!place || !place.id) throw new Error('Google place not found');

  const fields = 'id,displayName,rating,userRatingCount,reviews,googleMapsUri';
  const detail = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(place.id)}?fields=${encodeURIComponent(fields)}`, {
    headers:{'X-Goog-Api-Key':key}
  });
  if (!detail.ok) throw new Error(`Places details ${detail.status}`);
  const d = await detail.json();
  const live = Array.isArray(d.reviews) ? d.reviews.map(r => ({
    author: clean(r.authorAttribution && r.authorAttribution.displayName,120) || 'Google customer',
    rating: Number(r.rating) || 5,
    text: clean(r.text && r.text.text,1200),
    time: clean(r.relativePublishTimeDescription || r.publishTime,80)
  })).filter(r => r.text) : [];
  const seen = new Set(live.map(r => r.author.toLowerCase() + '|' + r.text.slice(0,40).toLowerCase()));
  const merged = live.concat(SNAPSHOT.reviews.filter(r => !seen.has((r.author+'|'+r.text.slice(0,40)).toLowerCase()))).slice(0,14);
  return {
    live:true,
    rating:Number(d.rating) || SNAPSHOT.rating,
    count:Number(d.userRatingCount) || SNAPSHOT.count,
    reviews:merged,
    mapsUrl:clean(d.googleMapsUri,600) || SNAPSHOT.mapsUrl,
    updatedAt:new Date().toISOString()
  };
}

module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','public, s-maxage=21600, stale-while-revalidate=86400');
  res.setHeader('X-Content-Type-Options','nosniff');
  if (req.method !== 'GET') { res.setHeader('Allow','GET'); return res.status(405).json({error:'Method not allowed.'}); }
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || '';
  if (key) {
    try { return res.status(200).json(await googleReviews(key)); }
    catch (e) { console.error('[hog-reviews]', e && e.message ? e.message : e); }
  }
  return res.status(200).json({...SNAPSHOT,live:false,updatedAt:new Date().toISOString()});
};