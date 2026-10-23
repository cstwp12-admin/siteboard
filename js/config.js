export const VERSION = '0.6.2';
export const CREDIT = '© 2026 WPN';
// Edit this file to tune categories and defaults. No build step needed.
export const PROJECT = {
  title: 'PROJEK LEBUHRAYA PAN BORNEO SABAH FASA 1B',
  subtitle: 'Membina Jalan Dari Sarang Ke Temuno (WP12)',
  chainage: 'CH 62+700 – CH 77+508 (14.81 km)',
  consultant: '',   // set in Settings (shared through siteboard-settings.json), not in public code
  contractor: '',
  team: ''
};

// First matching rule wins. Matching is on each individual activity (compound "A + B" entries are split).
export const IDLE = { id:'No site activity', re:/no (site )?activity|site idle|no work|idle/i };
export const CATS = [
  { id:'Ground treatment',     re:/pvd|prefab|surcharge|settlement|preload|geotextile|ground treatment|instrument|piezo|inclinometer|working platform|sand blanket|geogrid|stone column|vertical drain/i },
  { id:'Piling & structures',  re:/pile|piling|bored|sonic|approach slab|pier|abutment|bridge|girder|beam|deck|parapet|bearing|diaphragm|cofferdam|rs wall|rsw|mse|reinforced soil|headwall|wing ?wall/i },
  { id:'Drainage & culverts',  re:/culvert|drain|pipe|manhole|sump|outfall|catch ?pit|subsoil|cess|rcp|gabion|rip-?rap|apron|bedding/i },
  { id:'Survey & QA/QC',       re:/survey|setting out|test|inspection|sampling|calibrat|monitor|cube|density|laborator/i },
  { id:'Earthworks',           re:/excavat|embankment|fill|cutting|compaction|rock|blast|stripping|clearing|trimming|benching|grubbing|spoil|topsoil|subgrade|formation|cut to|removal|r&r|proof roll/i },
  { id:'Slope protection',     re:/turf|hydromulch|slope|berm|erosion|silt|shotcrete|soil nail|escp|mulch/i },
  { id:'Pavement & roadworks', re:/sub-?base|base ?course|asphalt|binder|wearing|premix|prime coat|tack|kerb|barrier|guardrail|road marking|signage|pavement|aggregate|crusher/i }
];
export const OTHER = 'Other';
// Validated categorical palette (light / dark). Order is fixed per category.
export const CAT_COLORS = {
  'Ground treatment':['#2a78d6','#3987e5'], 'Piling & structures':['#eb6834','#d95926'],
  'Drainage & culverts':['#1baf7a','#199e70'], 'Earthworks':['#eda100','#c98500'],
  'Slope protection':['#6250d6','#9085e9'], 'Pavement & roadworks':['#e87ba4','#d55181'],
  'Survey & QA/QC':['#e34948','#e66767'], 'No site activity':['#b9b8b3','#6b6a66'], 'Other':['#8a8985','#8a8985']
};
export const CAT_ORDER = [...CATS.map(c=>c.id), OTHER, IDLE.id];
export const RAIN_RE = /rain|shower|thunder|drizzle|storm/i;
export const DEFAULTS = {
  workDays:[1,2,3,4,5,6],          // Mon..Sat (0=Sun)
  expectedRoles:['IOW'],           // roles expected to submit every working day
  pollSeconds:20
};
