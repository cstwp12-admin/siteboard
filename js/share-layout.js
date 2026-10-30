// Measured text and image pagination shared by generated statistics.
export const svgEscape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function wrapText(value,width,size=13,weight='normal'){
  const ctx=document.createElement('canvas').getContext('2d'); ctx.font=`${weight} ${size}px Arial`;
  const lines=[]; let line='';
  for(const word of String(value??'').split(/\s+/).filter(Boolean)){
    if(line&&ctx.measureText(line+' '+word).width>width){lines.push(line);line='';}
    // Split an individual overlong token too, so references cannot escape the card.
    for(const ch of word){if(ctx.measureText(line+ch).width>width){lines.push(line);line='';}line+=ch;}
    line+=' ';
  }
  if(line.trim()) lines.push(line.trim());
  return lines.length?lines.map(s=>s.trim()):[''];
}
export function textBlock(value,{x,y,width,size=13,lineHeight=18,color='#14212B',weight='normal',anchor='start'}={}){
  const lines=wrapText(value,width,size,weight);
  return {height:lines.length*lineHeight,svg:lines.map((s,i)=>`<text x="${x}" y="${y+i*lineHeight}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${color}">${svgEscape(s)}</text>`).join('')};
}

// Preserve aspect ratio; paginate tall images at a readable minimum width.
export async function addImagePages(doc,img,{margin=8,minWidth=240}={}){
  const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight(),width=W-2*margin,height=H-2*margin;
  const naturalHeight=width*img.h/img.w;
  if(naturalHeight<=height){doc.addImage(img.url,'PNG',margin,margin,width,naturalHeight,undefined,'FAST');return;}
  const fitWidth=height*img.w/img.h;
  if(fitWidth>=Math.min(minWidth,width)){doc.addImage(img.url,'PNG',(W-fitWidth)/2,margin,fitWidth,height,undefined,'FAST');return;}
  const bitmap=await createImageBitmap(await (await fetch(img.url)).blob());
  const pxHeight=Math.max(1,Math.floor(height/width*bitmap.width));
  try{for(let top=0;top<bitmap.height;top+=pxHeight){
    if(top)doc.addPage(); const h=Math.min(pxHeight,bitmap.height-top), cv=document.createElement('canvas'); cv.width=bitmap.width;cv.height=h;
    cv.getContext('2d').drawImage(bitmap,0,top,bitmap.width,h,0,0,bitmap.width,h);
    doc.addImage(cv.toDataURL('image/png'),'PNG',margin,margin,width,h/bitmap.width*width,undefined,'FAST');
  }}finally{bitmap.close();}
}
