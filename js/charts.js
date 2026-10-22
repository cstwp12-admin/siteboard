import { CAT_COLORS, CAT_ORDER } from './config.js';
import { ALIGN, BIN, fmtShort } from './analysis.js';
const esc=(s)=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
export { esc };
let PRINT=false;
export const setPrint=(v)=>{PRINT=v;};
const slug=(c)=>c.replace(/[^a-z]/gi,'').toLowerCase();
export const catColor=(c)=> PRINT ? (CAT_COLORS[c]||CAT_COLORS.Other)[0] : `var(--c-${slug(c)})`;
export const cssCatVars=()=>{
  const l=CAT_ORDER.map(c=>`--c-${slug(c)}:${CAT_COLORS[c][0]};`).join('');
  const d=CAT_ORDER.map(c=>`--c-${slug(c)}:${CAT_COLORS[c][1]};`).join('');
  return `:root{${l}} @media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${d}}} :root[data-theme="dark"]{${d}}`;
};
const INK = ()=> PRINT ? '#222' : 'var(--ink)';
const MUTED = ()=> PRINT ? '#666' : 'var(--muted)';
const GRID = ()=> PRINT ? '#d9d9d6' : 'var(--line)';
const SURF = ()=> PRINT ? '#fff' : 'var(--surface)';

export function legend(cats){
  return `<div class="legend">${cats.map(c=>`<span class="lg"><i style="background:${catColor(c)}"></i>${esc(c)}</span>`).join('')}</div>`;
}

// Horizontal bars: items [{label,value,color,tip}]
export function hbar(items,{w=640,labelW=190,row=24,max}={}){
  if(!items.length) return '<p class="empty">No data in this period.</p>';
  const m=max||Math.max(...items.map(i=>i.value),1); const H=items.length*row+4; const bw=w-labelW-44;
  let s=`<svg viewBox="0 0 ${w} ${H}" width="100%" role="img" style="max-width:${w}px">`;
  items.forEach((it,i)=>{
    const y=i*row+2, len=Math.max(2,Math.round(bw*it.value/m));
    const lab=it.label.length>34? it.label.slice(0,33)+'…' : it.label;
    s+=`<g data-tip="${esc(it.tip||it.label+': '+it.value)}"><text x="${labelW-8}" y="${y+row/2+4}" text-anchor="end" font-size="12" fill="${INK()}">${esc(lab)}</text>`+
       `<path d="M${labelW},${y+3}h${len-4}a4 4 0 0 1 4 4v${row-14}a4 4 0 0 1 -4 4h-${len-4}z" fill="${it.color||catColor('Ground treatment')}"/>`+
       `<text x="${labelW+len+6}" y="${y+row/2+4}" font-size="12" fill="${MUTED()}">${it.value}</text></g>`;
  });
  return s+'</svg>';
}

// Stacked columns per day: days [..], data Map(day -> {cat:n}), cats order
export function dayColumns(days,data,cats,{w=720,h=200,label=true}={}){
  const mx=Math.max(1,...days.map(d=>Object.values(data.get(d)||{}).reduce((a,b)=>a+b,0)));
  const L=30,B=h-22,T=8, cw=(w-L-6)/days.length, bw=Math.max(4,Math.min(34,cw-6));
  const ticks=[0,Math.ceil(mx/2),mx].filter((v,i,a)=>a.indexOf(v)===i);
  let s=`<svg viewBox="0 0 ${w} ${h}" width="100%" role="img">`;
  for(const t of ticks){ const y=B-(B-T)*t/mx; s+=`<line x1="${L}" x2="${w}" y1="${y}" y2="${y}" stroke="${GRID()}"/><text x="${L-5}" y="${y+4}" text-anchor="end" font-size="10" fill="${MUTED()}">${t}</text>`; }
  const step=Math.ceil(days.length/(w/46));
  days.forEach((d,i)=>{
    const x=L+i*cw+(cw-bw)/2; let y=B; const d0=data.get(d)||{}; const tot=Object.values(d0).reduce((a,b)=>a+b,0);
    const tip=fmtShort(d)+' — '+tot+' works'+cats.filter(c=>d0[c]).map(c=>'\n'+c+': '+d0[c]).join('');
    s+=`<g data-tip="${esc(tip)}"><rect x="${L+i*cw}" y="${T}" width="${cw}" height="${B-T}" fill="transparent"/>`;
    for(const c of cats){ const v=d0[c]||0; if(!v) continue; const hh=(B-T)*v/mx; y-=hh;
      s+=`<rect x="${x}" y="${y+1}" width="${bw}" height="${Math.max(1,hh-2)}" rx="${hh>6?2:0}" fill="${catColor(c)}"/>`; }
    s+='</g>';
    if(i%step===0) s+=`<text x="${x+bw/2}" y="${h-6}" text-anchor="middle" font-size="10" fill="${MUTED()}">${fmtShort(d)}</text>`;
  });
  return s+'</svg>';
}

// Chainage heat strip. bins from analysis.binsFor
export function strip(bins,{w=900,h=70,dominant=true}={}){
  const L=8,R=8,top=18,bh=30, W=w-L-R, span=ALIGN.end-ALIGN.start, mx=Math.max(1,...bins.map(b=>b.n));
  let s=`<svg viewBox="0 0 ${w} ${top+bh+24}" width="100%" role="img">`;
  const x=(ch)=>L+W*(ch-ALIGN.start)/span;
  s+=`<rect x="${L}" y="${top}" width="${W}" height="${bh}" rx="3" fill="${PRINT?'#f1f0ed':'var(--panel2)'}"/>`;
  bins.forEach((b,i)=>{
    if(!b.n) return; const ch=ALIGN.start+i*BIN; const dom=Object.entries(b.cats).sort((a,c)=>c[1]-a[1])[0][0];
    const op=0.35+0.65*Math.min(1,b.n/Math.max(3,mx));
    s+=`<rect x="${x(ch)}" y="${top}" width="${Math.max(1.5,W*BIN/span-0.4)}" height="${bh}" fill="${catColor(dom)}" opacity="${op.toFixed(2)}" data-tip="${esc('CH '+fmtCh2(ch)+' – '+fmtCh2(ch+BIN)+'\n'+b.n+' works\n'+Object.entries(b.cats).map(([c,n])=>c+': '+n).join('\n'))}"/>`;
  });
  for(const z of ALIGN.zones){
    s+=`<line x1="${x(z.from)}" x2="${x(z.from)}" y1="${top-4}" y2="${top+bh+4}" stroke="${MUTED()}" stroke-width="1"/>`+
       `<text x="${(x(z.from)+x(z.to))/2}" y="${top-6}" text-anchor="middle" font-size="11" font-weight="600" fill="${INK()}">${z.id}</text>`+
       `<text x="${x(z.from)}" y="${top+bh+16}" text-anchor="${z.from===ALIGN.start?'start':'middle'}" font-size="10" fill="${MUTED()}">${fmtCh2(z.from)}</text>`;
  }
  s+=`<line x1="${x(ALIGN.end)}" x2="${x(ALIGN.end)}" y1="${top-4}" y2="${top+bh+4}" stroke="${MUTED()}"/><text x="${x(ALIGN.end)}" y="${top+bh+16}" text-anchor="end" font-size="10" fill="${MUTED()}">${fmtCh2(ALIGN.end)}</text>`;
  return s+'</svg>';
}
const fmtCh2=(n)=>Math.floor(n/1000)+'+'+String(Math.round(n%1000)).padStart(3,'0');

export function weekBars(items,{w=640,h=170}={}){ // [{label,value}]
  const mx=Math.max(1,...items.map(i=>i.value)); const L=30,B=h-24,T=10,cw=(w-L)/items.length,bw=Math.min(46,cw-10);
  let s=`<svg viewBox="0 0 ${w} ${h}" width="100%" role="img">`;
  s+=`<line x1="${L}" x2="${w}" y1="${B}" y2="${B}" stroke="${GRID()}"/>`;
  items.forEach((it,i)=>{ const hh=(B-T)*it.value/mx; const x=L+i*cw+(cw-bw)/2;
    s+=`<g data-tip="${esc(it.label+': '+it.value)}"><path d="M${x},${B}v-${Math.max(0,hh-4)}a4 4 0 0 1 4 -4h${bw-8}a4 4 0 0 1 4 4v${Math.max(0,hh-4)}z" fill="${catColor('Ground treatment')}"/>`+
       `<text x="${x+bw/2}" y="${B-hh-4}" text-anchor="middle" font-size="11" fill="${INK()}">${it.value}</text>`+
       `<text x="${x+bw/2}" y="${h-8}" text-anchor="middle" font-size="10" fill="${MUTED()}">${esc(it.label)}</text></g>`; });
  return s+'</svg>';
}
