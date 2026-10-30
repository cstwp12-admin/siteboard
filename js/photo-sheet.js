import {T} from './theme.js';
import {wrapText} from './share-layout.js';
import {captionRows} from './focused-model.js';

// One photo per page keeps captions paired with evidence. Long tables continue
// on labelled pages instead of clipping text or shrinking it to unreadable sizes.
export async function photoSheet(record,image,index,{fields,table=true}={}){
  const W=1200,H=1650,pad=44,line=26,pages=[];let cv,g,y;
  function page(continued=false){cv=document.createElement('canvas');cv.width=W;cv.height=H;g=cv.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,W,H);g.fillStyle=T.navy;g.fillRect(0,0,W,96);g.fillStyle='#fff';g.font='bold 27px Arial';g.fillText(`Photo ${index+1}${continued?' · caption continued':''}`,pad,57);y=130;}
  async function finish(){g.fillStyle=T.muted;g.font='16px Arial';g.fillText('Source: '+record.report.ref+' #'+record.item.no,pad,H-35);const blob=await new Promise((res,rej)=>cv.toBlob(b=>b?res(b):rej(Error('Photo sheet could not be encoded.')),'image/png'));pages.push({blob,img:{url:cv.toDataURL('image/png'),w:W,h:H}});}
  page();const bitmap=await createImageBitmap(await (await fetch(image.url)).blob());
  try{const scale=Math.min((W-pad*2)/bitmap.width,690/bitmap.height),w=bitmap.width*scale,h=bitmap.height*scale;g.drawImage(bitmap,(W-w)/2,y,w,h);y+=h+30;}finally{bitmap.close();}
  const rows=captionRows(record,fields);
  for(const [label,value] of rows){
    const texts=wrapText(table?value:label+': '+value,table?W-pad*2-230:W-pad*2,20);
    const labels=table?wrapText(label,195,18,'bold'):[];
    for(let i=0;i<Math.max(texts.length,labels.length);i++){
      let continuation=false;if(y+line>H-78){await finish();page(true);continuation=true;}
      if(table){g.fillStyle='#eef1f3';g.fillRect(pad,y-20,220,line);g.strokeStyle=T.line;g.strokeRect(pad,y-20,W-pad*2,line);g.fillStyle=T.ink;g.font='bold 18px Arial';g.fillText(labels[i]||(continuation?labels[0]:''),pad+10,y);g.font='20px Arial';g.fillText(texts[i]||'',pad+235,y);}
      else{g.fillStyle=T.ink;g.font='20px Arial';g.fillText(texts[i]||'',pad,y);}
      y+=line;
    }
    y+=table?0:9;
  }
  g.fillStyle=T.muted;g.font='16px Arial';g.fillText('Source: '+record.report.ref+' #'+record.item.no,pad,H-35);await finish();return pages;
}
