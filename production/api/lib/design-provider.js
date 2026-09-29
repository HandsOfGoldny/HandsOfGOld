'use strict';
const MODEL='gpt-6-astra';
const IMAGE_MODEL='gpt-image-2.5-sunburst';
async function generateImage(prompt, reference) {
  const content=[{type:'input_text',text:prompt}];
  if(reference)content.push({type:'input_image',image_url:'data:'+reference.mime+';base64,'+reference.b64,detail:'auto'});
  const response=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',signal:AbortSignal.timeout(240000),
    headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({model:MODEL,store:false,
      instructions:'Create exactly one jewelry concept image using the image generation tool. Follow the customer design specifications precisely. Do not substitute a different piece or add unwanted stones. When a reference image is provided, edit that image and preserve its composition and details except for requested changes. Do not claim a rendered design has been verified as manufacturable.',
      input:[{role:'user',content}],
      tools:[{type:'image_generation',model:IMAGE_MODEL,quality:'high',size:'1024x1024',output_format:'webp',output_compression:90}]
    })
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error('Image provider: '+(data.error?.code||response.status));
  const image=data.output?.find(item=>item.type==='image_generation_call'&&item.result);
  if(data.status!=='completed'||!image)throw new Error('Image generation did not complete.');
  return {b64:image.result,mime:'image/webp',model:MODEL,imageModel:IMAGE_MODEL};
}
module.exports={generateImage,MODEL,IMAGE_MODEL};
