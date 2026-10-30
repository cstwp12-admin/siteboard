import {CAT_ORDER} from './config.js';
import {ALIGN} from './analysis.js';
import {structuresList} from './structures.js';
import {esc} from './charts.js';
import {normalizeScope} from './scope.js';

export function scopeControls(reports,settings,s={},id='scope'){
  const multi=(key,label,options)=>`<label class="fld">${label}<select id="${id}-${key}" multiple size="4" aria-label="${label}">${options.map(v=>{const [value,name]=Array.isArray(v)?v:[v,v];return `<option value="${esc(value)}" ${(s[key]||[]).includes(value)?'selected':''}>${esc(name)}</option>`;}).join('')}</select><small>None selected = all. Ctrl/Cmd-click for several.</small></label>`;
  const people=[...new Map(reports.map(r=>[r.code,r.reporter||r.code])).entries()].sort((a,b)=>a[0].localeCompare(b[0]));
  return `<div class="frm scope-controls"><label class="fld">From date<input id="${id}-from" type="date" value="${esc(s.from||'')}"></label><label class="fld">To date<input id="${id}-to" type="date" value="${esc(s.to||'')}"></label>
  ${multi('teams','Teams',[...new Set(reports.map(r=>r.team).filter(Boolean))])}${multi('reporters','Reporters',people)}${multi('categories','Work categories',CAT_ORDER)}${multi('zones','Zones',ALIGN.zones.map(z=>z.id))}${multi('structures','Structures',structuresList(settings).map(s=>[s.id,s.id+' · '+s.name]))}
  <label class="fld">From CH<input id="${id}-chFrom" value="${esc(s.chFrom??'')}" placeholder="68+500 or metres"></label><label class="fld">To CH<input id="${id}-chTo" value="${esc(s.chTo??'')}" placeholder="69+000 or metres"></label>
  <label class="fld">Side<select id="${id}-side">${[['','All sides'],['LHS','LHS'],['RHS','RHS'],['CL','CL'],['BOTH','Both']].map(([k,v])=>`<option value="${k}" ${s.side===k?'selected':''}>${v}</option>`).join('')}</select></label>
  <label class="fld">Observation / remarks<select id="${id}-observation">${[['','All items'],['status','SDR Observation status'],['remarks','Has remarks'],['any','Observation or remarks'],['open','Open follow-up'],['monitor','Monitoring follow-up'],['closed','Closed follow-up']].map(([k,v])=>`<option value="${k}" ${s.observation===k?'selected':''}>${v}</option>`).join('')}</select></label>
  <label class="fld">Activity / location / reference text<input id="${id}-text" value="${esc(s.text||'')}" placeholder="e.g. abutment, river name, RFI"></label></div>`;
}
export function readScope(root,s={},id='scope'){
  const raw={...s};for(const key of ['from','to','chFrom','chTo','side','text','observation'])raw[key]=root.querySelector(`#${id}-${key}`).value;
  for(const key of ['teams','reporters','categories','zones','structures'])raw[key]=[...root.querySelector(`#${id}-${key}`).selectedOptions].map(o=>o.value);
  return normalizeScope(raw);
}
