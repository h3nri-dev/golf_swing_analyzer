export const BRAND='FreeGolfSwingAnalyzer.com';

// Paint in output coordinates, after video mirroring/cropping and drawings.
// Scale with the image so previews keep their proportions when enlarged.
export function drawWatermark(ctx,{x=0,y=0,width,height,edge='bottom'}) {
  if(width<=0||height<=0)return;
  ctx.save();
  const padding=Math.min(width*.025,height*.015);
  let size=Math.min(width/16,height*.045);
  ctx.font=`600 ${size}px sans-serif`;
  const available=width-padding*2;
  if(ctx.measureText(BRAND).width>available){size*=available/ctx.measureText(BRAND).width;ctx.font=`600 ${size}px sans-serif`;}
  const band=size*1.5+padding*2,top=edge==='top'?y:y+height-band;
  ctx.fillStyle='#17251fcc';ctx.fillRect(x,top,width,band);
  ctx.fillStyle='#ffffff';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(BRAND,x+width/2,top+band/2);
  ctx.restore();
}
