#!/usr/bin/env python3
"""Build the documentation site: docs-src/*.md  ->  docs/*.html (+ docs/search.json).
Same look as the WP12 SDR app docs. Run from the repository root:  python3 tools/build_docs.py
Needs:  pip install markdown
Edit the three addresses below once the GitHub Pages site exists."""
import re, glob, json, html, os, markdown

APP_URL  = 'https://cstwp12-admin.github.io/siteboard/'      # the dashboard
REPO_URL = 'https://github.com/cstwp12-admin/siteboard'
SDR_URL  = 'https://cstwp12-admin.github.io/wp12-sdr/'
VERSION  = 'v0.8.0'
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
CSS = open(os.path.join(HERE, 'docs.css'), encoding='utf-8').read()

def front(text):
    m = re.match(r'---\n(.*?)\n---\n', text, re.S); meta = {}
    if m:
        for l in m.group(1).splitlines():
            if ':' in l: k, v = l.split(':', 1); meta[k.strip()] = v.strip()
        text = text[m.end():]
    return meta, text

pages = []
for f in glob.glob(os.path.join(ROOT, 'docs-src', '*.md')):
    meta, body = front(open(f, encoding='utf-8').read())
    name = os.path.splitext(os.path.basename(f))[0]
    body = re.sub(r'\]\(((?!https?:|#|\.\./|mailto:)[A-Za-z0-9_\-]+)(#[^)]*)?\)', lambda m: '](%s.html%s)' % (m.group(1), m.group(2) or ''), body)
    body = body.replace('](../)', '](%s)' % APP_URL)
    pages.append(dict(name=name, file='index.html' if name == 'index' else name + '.html', title=meta.get('title', name), order=int(meta.get('nav_order', 50)), body=body))
pages.sort(key=lambda p: p['order'])

def render(p):
    md = markdown.Markdown(extensions=['tables', 'toc', 'fenced_code', 'sane_lists'], extension_configs={'toc': {'permalink': False}})
    h = md.convert(p['body'])
    h = re.sub(r'<table>', '<div class="tw"><table>', h); h = h.replace('</table>', '</table></div>')
    def walk(ts):
        for t in ts:
            yield t
            yield from walk(t.get('children', []))
    toc = [(t['id'], t['name']) for t in walk(md.toc_tokens) if t['level'] == 2]
    return h, toc

def strip(h): return html.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', h))).strip()

search = []
for i, p in enumerate(pages):
    body, toc = render(p)
    # heading-level search entries
    parts = re.split(r'(?=<h2 )', body)
    for part in parts:
        m = re.match(r'<h2 id="([^"]+)">(.*?)</h2>', part, re.S)
        search.append(dict(t=strip(m.group(2)) if m else p['title'], u=p['file'] + ('#' + m.group(1) if m else ''), p=p['title'], x=strip(part)[:700]))
    if p['name'] == 'index':
        hero = '''<div class="hero"><div><div class="k">Pan Borneo Sabah Phase 1B · WP12</div><h1>SiteBoard</h1>
<p>See every site report in one place: who reported, what was done, where, with photos. Then print the weekly and monthly report.</p>
<div class="row"><a class="btn acc" href="%s">Open the dashboard</a><a class="btn" href="team-guide.html">Team guide</a><a class="btn" href="ecosystem.html">With the SDR app</a></div></div></div>
<div class="cards">
<div class="card"><div class="n">01</div><b>Today</b><span>Who reported, what was done, the day's photos.</span></div>
<div class="card"><div class="n">02</div><b>Structures</b><span>Bridges, culverts and walls: last record and photos.</span></div>
<div class="card"><div class="n">03</div><b>Photos</b><span>Filter by date, chainage, structure, activity, reporter.</span></div>
<div class="card"><div class="n">04</div><b>Reports</b><span>Weekly and monthly PDF with photos, ready to sign.</span></div></div>''' % APP_URL
        body = hero + body.replace('<h1', '<h1 style="display:none"', 1) if False else hero + re.sub(r'<h1.*?</h1>\s*', '', body, count=1, flags=re.S)
    p['html'] = body; p['toc'] = toc

def page_html(i, p):
    side = ''.join('<a class="p%s" href="%s">%s</a>' % (' on' if q is p else '', q['file'], html.escape(q['title'])) for q in pages)
    toc = ''.join('<a href="#%s">%s</a>' % (a, html.escape(b)) for a, b in p['toc'])
    ol = '<ol>' + ''.join('<li><a href="#%s">%s</a></li>' % (a, html.escape(b)) for a, b in p['toc']) + '</ol>' if p['toc'] else ''
    side = side.replace('class="p on" href="%s">%s</a>' % (p['file'], html.escape(p['title'])), 'class="p on" href="%s">%s</a>%s' % (p['file'], html.escape(p['title']), ol))
    prev = pages[i-1] if i > 0 else None; nxt = pages[i+1] if i < len(pages)-1 else None
    pn = '<div class="pn">%s%s</div>' % ('<a href="%s"><small>Previous</small><b>%s</b></a>' % (prev['file'], html.escape(prev['title'])) if prev else '<span></span>', '<a href="%s"><small>Next</small><b>%s</b></a>' % (nxt['file'], html.escape(nxt['title'])) if nxt else '<span></span>')
    title = '%s · SiteBoard' % p['title'] if p['name'] != 'index' else 'Home · SiteBoard'
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="SiteBoard: site reporting dashboard for Pan Borneo Sabah Phase 1B, Work Package 12.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23D9480F'/%3E%3Cpath d='M6 22h20M9 22V14m7 8V9m7 13v-6' stroke='white' stroke-width='3' stroke-linecap='round' fill='none'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Mono:wght@500;600&display=swap">
<style>{CSS}</style></head><body>
<header class="top"><button class="btn menu" id="menu" type="button" aria-label="Menu">☰</button>
<a class="brand" href="index.html"><span class="plate">WP12</span><span class="bt">SiteBoard</span></a><span class="ver">{VERSION}</span><span class="sp"></span>
<input type="search" id="q" style="flex:0 1 auto" placeholder="Search  ( / )" aria-label="Search the documentation" autocomplete="off"><div id="res"></div>
<button class="btn" id="theme" type="button" aria-label="Light or dark">◐</button><a class="btn acc hide-s" href="{APP_URL}">Open the dashboard</a></header>
<div class="layout"><nav class="side" aria-label="Pages"><div class="grp">Documentation</div>{side}</nav>
<main><article>{p['html']}{pn}
<footer><span>SiteBoard {VERSION} · © 2026 WPN · <a href="{REPO_URL}/blob/main/LICENSE">MIT licence</a> · <a href="{REPO_URL}/blob/main/THIRD_PARTY_NOTICES.md">Third-party notices</a></span><span><a href="{REPO_URL}">Repository</a> · <a href="{APP_URL}">Open the dashboard</a> · <a href="{SDR_URL}">SDR report app</a></span></footer></article></main>
<aside class="toc"><b>On this page</b>{toc}</aside></div>
<script>{JS}</script></body></html>'''

JS = r'''(function(){
var d=document,b=d.body,r=d.documentElement;
try{var t=localStorage.getItem('sb-doc-theme');if(t)r.setAttribute('data-theme',t)}catch(e){}
d.getElementById('theme').addEventListener('click',function(){var c=r.getAttribute('data-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'),n=c==='dark'?'light':'dark';r.setAttribute('data-theme',n);try{localStorage.setItem('sb-doc-theme',n)}catch(e){}});
d.getElementById('menu').addEventListener('click',function(){b.classList.toggle('nav')});
d.addEventListener('click',function(e){if(b.classList.contains('nav')&&!e.target.closest('nav.side,#menu'))b.classList.remove('nav');if(!e.target.closest('#res,#q'))d.getElementById('res').style.display='none'});
var hs=[].slice.call(d.querySelectorAll('article h2[id],article h3[id]')),links=[].slice.call(d.querySelectorAll('aside.toc a,nav.side ol a'));
function spy(){var y=scrollY+90,cur=null;hs.forEach(function(h){if(h.offsetTop<=y)cur=h.id});links.forEach(function(a){a.classList.toggle('on',cur&&a.getAttribute('href')==='#'+cur)})}
addEventListener('scroll',spy,{passive:true});spy();
var idx=null,q=d.getElementById('q'),res=d.getElementById('res');
function load(c){if(idx)return c();fetch('search.json').then(function(r){return r.json()}).then(function(j){idx=j;c()}).catch(function(){})}
function esc(s){return s.replace(/[&<>]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;'}[c]})}
q.addEventListener('input',function(){var v=q.value.trim().toLowerCase();if(v.length<2){res.style.display='none';return}
 load(function(){var w=v.split(/\s+/),hits=[];idx.forEach(function(s){var h=(s.t+' '+s.x).toLowerCase(),ok=w.every(function(k){return h.indexOf(k)>=0});if(ok){var sc=(s.t.toLowerCase().indexOf(v)>=0?10:0)+(s.t.toLowerCase().indexOf(w[0])>=0?5:0);hits.push([sc,s])}});
 hits.sort(function(a,b){return b[0]-a[0]});
 res.innerHTML=hits.length?hits.slice(0,10).map(function(h){var s=h[1],i=s.x.toLowerCase().indexOf(w[0]),sn=s.x.slice(Math.max(0,i-40),i+90);return '<a href="'+s.u+'"><b>'+esc(s.t)+'</b><small>'+esc(s.p)+' · '+esc(sn)+'</small></a>'}).join(''):'<a><small>Nothing found for "'+esc(v)+'".</small></a>';res.style.display='block'})});
q.addEventListener('keydown',function(e){if(e.key==='Escape'){res.style.display='none';q.blur()}});
addEventListener('keydown',function(e){if(e.key==='/'&&!/INPUT|TEXTAREA/.test((d.activeElement||{}).tagName||'')){e.preventDefault();q.focus()}});
})();'''

out = os.path.join(ROOT, 'docs'); os.makedirs(out, exist_ok=True)
for f in glob.glob(os.path.join(out, '*.html')): os.remove(f)
for i, p in enumerate(pages):
    open(os.path.join(out, p['file']), 'w', encoding='utf-8').write(page_html(i, p))
json.dump(search, open(os.path.join(out, 'search.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print('built', len(pages), 'pages,', len(search), 'search entries')
