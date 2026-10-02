'use strict';
// Only raster bytes are accepted. SVG, HTML and arbitrary data URLs are rejected.
function readImage(value){
 if(!value)return null;
 if(typeof value!=='string'||value.length>800000)throw new Error('Choose a smaller inspiration image.');
 const match=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
 if(!match)throw new Error('Choose a JPEG, PNG or WebP inspiration image.');
 const bytes=Buffer.from(match[2],'base64');
 const valid=match[1]==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:match[1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
 if(!valid||bytes.length<12||bytes.length>600000)throw new Error('The inspiration image is invalid or too large.');
 return {b64:match[2],mime:'image/'+match[1],extension:match[1]==='jpeg'?'jpg':match[1]};
}
module.exports={readImage};
