/* ============================================================================
   EXECUTION_COMPTABLE — V7.1 — 2026-08-28
   Moteur générique d'analyse d'une source KoboToolbox dédiée.
   - Schéma dynamique + filtres texte/catégorie/nombre/date-heure
   - K-means, Jenks, DBSCAN, système expert, SBERT/TF-IDF
   - Statistiques, anomalies/risques, Benford, prévision
   - Exports XLSX/CSV/JSON/HTML/PNG + partage
   ============================================================================ */
(function () {
    'use strict';

    const byId = id => document.getElementById(id);
    const state = {
        raw: [], flat: [], filtered: [], fields: [], meta: new Map(), providers: [], pages: 0,
        charts: {}, expertAlerts: [], riskRows: [], sourceUrl: '', sbertExtractor: null,
        sbertModelName: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'
    };

    const STORAGE_KEY = 'PMA_PTA_EXECUTION_COMPTABLE_SOURCE_V7';
    const DEFAULT_KOBO_FORM_URL = 'https://kf.kobotoolbox.org/#/forms/aC5pu7oNANnbwEuv4mpeEo/landing';
    const DEFAULT_KOBO_ASSET_UID = 'aC5pu7oNANnbwEuv4mpeEo';
    const MAX_TABLE_ROWS = 250;
    const MAX_TABLE_FIELDS = 45;
    const MAX_DBSCAN_POINTS = 1500;
    const MAX_SBERT_DOCS = 120;

    function esc(value) {
        return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
    }
    function clean(value) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }
    function isEmpty(value) { return value === null || value === undefined || clean(value) === ''; }
    function fmtNumber(value, digits = 2) {
        const n = Number(value); return Number.isFinite(n) ? n.toLocaleString('fr-FR', { maximumFractionDigits: digits }) : '—';
    }
    function fmtPct(value, digits = 1) { return Number.isFinite(Number(value)) ? `${Number(value).toLocaleString('fr-FR',{maximumFractionDigits:digits})} %` : '—'; }
    function fmtDate(value, withTime = true) {
        const d = value instanceof Date ? value : toDate(value);
        if (!d) return '—';
        return d.toLocaleString('fr-FR', withTime ? {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'} : {day:'2-digit',month:'2-digit',year:'numeric'});
    }
    function toNum(value) {
        if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
        if (typeof value === 'boolean' || value === null || value === undefined) return NaN;
        let s = clean(value); if (!s) return NaN;
        if (/^\d{4}-\d{1,2}-\d{1,2}(?:[T\s]|$)/.test(s)) return NaN;
        s = s.replace(/\u00a0/g,' ').replace(/\s/g,'');
        if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s)) s = s.replace(/\./g,'').replace(',','.');
        else if (/^-?\d+(?:,\d+)?$/.test(s)) s = s.replace(',','.');
        else if (!/^-?\d+(?:\.\d+)?$/.test(s)) return NaN;
        const n = Number(s); return Number.isFinite(n) ? n : NaN;
    }
    function toDate(value) {
        if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
        if (typeof value === 'number' && value > 1000000000) { const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d; }
        const s = clean(value); if (!s) return null;
        if (!(/[T:\/-]/.test(s) || /\d{4}-\d{2}-\d{2}/.test(s))) return null;
        const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d;
    }
    function mean(arr) { const a=arr.map(Number).filter(Number.isFinite); return a.length ? a.reduce((s,v)=>s+v,0)/a.length : NaN; }
    function median(arr) { const a=arr.map(Number).filter(Number.isFinite).sort((a,b)=>a-b); if(!a.length)return NaN; const m=Math.floor(a.length/2); return a.length%2?a[m]:(a[m-1]+a[m])/2; }
    function std(arr) { const a=arr.map(Number).filter(Number.isFinite); if(a.length<2)return 0; const m=mean(a); return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/(a.length-1)); }
    function mad(arr) { const m=median(arr); return median(arr.map(v=>Math.abs(Number(v)-m)).filter(Number.isFinite)); }
    function quantile(arr, q) { const a=arr.map(Number).filter(Number.isFinite).sort((x,y)=>x-y); if(!a.length)return NaN; const p=(a.length-1)*q, b=Math.floor(p), r=p-b; return a[b]+(a[Math.min(b+1,a.length-1)]-a[b])*r; }
    function unique(arr) { return [...new Set(arr)]; }
    function seededRandom(seed) { let x = seed >>> 0; return () => ((x = (1664525*x + 1013904223) >>> 0) / 4294967296); }

    function flattenObject(obj, prefix = '', out = {}) {
        if (!obj || typeof obj !== 'object') return out;
        Object.entries(obj).forEach(([key, value]) => {
            const path = prefix ? `${prefix}/${key}` : key;
            if (value === null || value === undefined) { out[path] = ''; return; }
            if (Array.isArray(value)) {
                if (value.every(v => ['string','number','boolean'].includes(typeof v) || v == null)) out[path] = value.filter(v=>v!=null).join(' | ');
                else out[path] = JSON.stringify(value);
                return;
            }
            if (typeof value === 'object') flattenObject(value, path, out);
            else out[path] = value;
        });
        return out;
    }

    function fieldLabel(field) {
        return field.split('/').pop().replace(/_/g,' ').replace(/\s+/g,' ').trim() || field;
    }

    function inferSchema(rows) {
        const fields = unique(rows.flatMap(r => Object.keys(r))).sort((a,b)=>a.localeCompare(b,'fr'));
        const meta = new Map();
        fields.forEach(field => {
            const values = rows.map(r=>r[field]).filter(v=>!isEmpty(v)).slice(0,600);
            const n = values.length;
            const nums = values.map(toNum).filter(Number.isFinite);
            const dates = values.map(toDate).filter(Boolean);
            const uniq = unique(values.map(v=>clean(v))).length;
            const lower = field.toLowerCase();
            let type='text';
            if (n && nums.length/n >= .88) type='number';
            else if (n && dates.length/n >= .82) type = values.some(v=>String(v).includes('T') || /\d{1,2}:\d{2}/.test(String(v))) ? 'datetime' : 'date';
            else if (n && (uniq <= 50 || uniq/n <= .18 || /(type|categorie|catégorie|nature|statut|status|dren|cisco|zap|service|structure|compte|rubrique|mode|source)/i.test(lower))) type='category';
            meta.set(field,{ field, label:fieldLabel(field), type, nonEmpty:n, unique:uniq });
        });
        state.fields=fields; state.meta=meta;
    }

    function detectField(patterns, types = null) {
        const candidates = state.fields.map(field => ({field, meta:state.meta.get(field), lower:`${field} ${fieldLabel(field)}`.toLowerCase()}))
            .filter(x=>!types || types.includes(x.meta?.type));
        for (const pattern of patterns) { const found=candidates.find(x=>pattern.test(x.lower)); if(found)return found.field; }
        return candidates[0]?.field || '';
    }

    function currentMappings() {
        return {
            measure: byId('exec-measure-field')?.value || '', entity: byId('exec-entity-field')?.value || '',
            reference: byId('exec-reference-field')?.value || '', semantic: byId('exec-semantic-field')?.value || '',
            date: byId('exec-filter-date-field')?.value || ''
        };
    }

    function fillSelect(id, fields, emptyLabel, selected) {
        const el=byId(id); if(!el)return;
        el.innerHTML = `<option value="">${esc(emptyLabel)}</option>` + fields.map(f=>`<option value="${esc(f)}">${esc(state.meta.get(f)?.label || f)} <small>(${esc(f)})</small></option>`).join('');
        if (selected && fields.includes(selected)) el.value=selected;
    }
    function fillPureSelect(id, fields, selected) {
        const el=byId(id); if(!el)return;
        el.innerHTML = fields.map(f=>`<option value="${esc(f)}">${esc(state.meta.get(f)?.label || f)}</option>`).join('');
        if (selected && fields.includes(selected)) el.value=selected;
    }

    function populateFieldControls() {
        const numberFields=state.fields.filter(f=>state.meta.get(f)?.type==='number');
        const dateFields=state.fields.filter(f=>['date','datetime'].includes(state.meta.get(f)?.type));
        const categoryFields=state.fields.filter(f=>state.meta.get(f)?.type==='category');
        const textFields=state.fields.filter(f=>['text','category'].includes(state.meta.get(f)?.type));
        const autoMeasure=detectField([/(montant|amount|valeur|total|depense|dépense|paiement|engagement|liquidation|budget|credit|crédit|solde|realisation|réalisation)/i],['number']) || numberFields[0] || '';
        const autoDate=detectField([/_submission_time/i,/(date.*heure|datetime|timestamp|date.*operation|date.*opération|date.*paiement|date.*engagement|date)/i],['date','datetime']) || dateFields[0] || '';
        const autoEntity=detectField([/(dren|cisco|zap)/i,/(entite|entité|structure|service|unite|unité|direction)/i],['category','text']) || categoryFields[0] || '';
        const autoRef=detectField([/(reference|référence|numero.*piece|num.*piece|pi[eè]ce|facture|mandat|engagement|bon.*commande|n°)/i],['text','category','number']) || '';
        const autoSemantic=detectField([/(libelle|libellé|objet|description|justification|observation|commentaire|motif|intitule|intitulé|beneficiaire|bénéficiaire)/i],['text','category']) || textFields[0] || '';

        fillSelect('exec-filter-text-field', textFields, 'Tous les champs', '');
        fillSelect('exec-filter-category-field', categoryFields, 'Aucun champ', categoryFields[0] || '');
        fillSelect('exec-filter-date-field', dateFields, 'Aucun champ', autoDate);
        fillSelect('exec-filter-number-field', numberFields, 'Aucun champ', autoMeasure);
        fillSelect('exec-measure-field', numberFields, 'Comptage des écritures', autoMeasure);
        fillSelect('exec-entity-field', state.fields, 'Détection automatique', autoEntity);
        fillSelect('exec-reference-field', state.fields, 'Détection automatique', autoRef);
        fillSelect('exec-semantic-field', textFields, 'Détection automatique', autoSemantic);
        ['exec-kmeans-x','exec-kmeans-y','exec-dbscan-x','exec-dbscan-y','exec-jenks-field','exec-stats-x','exec-stats-y','exec-forecast-value'].forEach((id,i)=>fillPureSelect(id,numberFields,numberFields[Math.min(i%2,Math.max(0,numberFields.length-1))] || autoMeasure));
        fillPureSelect('exec-stats-group', categoryFields.length?categoryFields:state.fields, autoEntity || categoryFields[0]);
        fillPureSelect('exec-stats-group2', categoryFields.length?categoryFields:state.fields, categoryFields.find(f => f !== autoEntity) || categoryFields[0] || autoEntity);
        fillPureSelect('exec-forecast-date', dateFields, autoDate);
        updateCategoryValues();
    }

    function updateCategoryValues() {
        const field=byId('exec-filter-category-field')?.value || '', el=byId('exec-filter-category-value'); if(!el)return;
        if(!field){el.innerHTML='<option value="">Toutes</option>';return;}
        const values=[...new Set(state.flat.map(r=>clean(r[field])).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr')).slice(0,500);
        el.innerHTML='<option value="">Toutes</option>'+values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
    }

    function normalizeSourceInput(input) {
        let s=clean(input); if(!s) throw new Error('Renseignez l’UID de l’asset KoboToolbox ou son URL API data.json.');
        if (/^[A-Za-z0-9_-]{18,}$/.test(s)) return `https://kf.kobotoolbox.org/api/v2/assets/${s}/data.json?limit=1000`;
        let url; try { url=new URL(s); } catch(_) { throw new Error('Lien KoboToolbox invalide. Utilisez un UID d’asset ou une URL https://…'); }
        const hashPath = String(url.hash || '').replace(/^#/, '');
        const m=url.pathname.match(/\/api\/v2\/assets\/([^/]+)/)
            || url.pathname.match(/\/assets\/([^/]+)/)
            || url.pathname.match(/\/forms\/([^/?#]+)/)
            || hashPath.match(/\/forms\/([^/?#]+)/)
            || hashPath.match(/\/assets\/([^/?#]+)/);
        if (m && !/\/data(?:\.json)?\/?$/.test(url.pathname)) return `https://kf.kobotoolbox.org/api/v2/assets/${m[1]}/data.json?limit=1000`;
        if (/\/data(?:\.json)?\/?$/.test(url.pathname)) { url.searchParams.set('limit',url.searchParams.get('limit')||'1000'); return url.href; }
        if (/ee\.kobotoolbox\.org$/i.test(url.hostname)) throw new Error('Le lien public ee.kobotoolbox.org ne contient pas directement l’UID de l’asset. Utilisez l’UID de l’asset ou l’URL API /api/v2/assets/{UID}/data.json.');
        return url.href;
    }

    async function fetchFallback(url) {
        if (typeof fetchAllKoboPagesWithFallback === 'function') return fetchAllKoboPagesWithFallback(url,100);
        const providers=[
            ['Direct',u=>u],['CorsBridge',u=>'https://api.cors.syrins.tech/?url='+encodeURIComponent(u)],
            ['AllOrigins',u=>'https://api.allorigins.win/raw?url='+encodeURIComponent(u)],['CORS.lol',u=>'https://api.cors.lol/?url='+encodeURIComponent(u)]
        ];
        const errors=[];
        for(const [name,build] of providers){ try{ const r=await fetch(build(url),{cache:'no-store',headers:{Accept:'application/json'}}); if(!r.ok){errors.push(`${name}: HTTP ${r.status}`);continue;} const body=await r.json(); return {rows:Array.isArray(body)?body:(body.results||[]),providers:[name],pages:1}; }catch(e){errors.push(`${name}: ${e.message}`);} }
        throw new Error(errors.join(' | '));
    }

    function setStatus(text, cls='') {
        const el=byId('exec-source-status'); if(!el)return; el.className='exec-accounting-status mt-3'+(cls?` ${cls}`:''); el.innerHTML=text;
    }

    async function connectSource() {
        try {
            const input=byId('exec-kobo-source')?.value || '';
            const url=normalizeSourceInput(input); state.sourceUrl=url; localStorage.setItem(STORAGE_KEY,input);
            setStatus('<i class="fas fa-spinner fa-spin"></i> Connexion à la source EXECUTION_COMPTABLE et récupération des pages Kobo…','is-loading');
            const result=await fetchFallback(url); loadRows(result.rows || [],{providers:result.providers||[],pages:result.pages||1,source:'KoboToolbox'});
        } catch (error) { console.error('[EXECUTION_COMPTABLE]',error); setStatus(`<i class="fas fa-exclamation-triangle"></i> <strong>Connexion impossible :</strong> ${esc(error.message || error)}`,'is-error'); }
    }

    function loadRows(rows, info={}) {
        state.raw=Array.isArray(rows)?rows:[];
        state.flat=state.raw.map((r,i)=>({__row:i+1,...flattenObject(r)}));
        inferSchema(state.flat); state.providers=info.providers||[]; state.pages=info.pages||0;
        populateFieldControls(); applyFilters();
        setStatus(`<i class="fas fa-check-circle"></i> <strong>${state.raw.length.toLocaleString('fr-FR')} écriture(s)</strong> chargée(s) depuis ${esc(info.source||'JSON')} ${state.providers.length?`via ${esc(state.providers.join(', '))}`:''}${state.pages?` · ${state.pages} page(s)`:''}.`,'is-success');
    }

    function applyFilters() {
        const globalQ=clean(byId('exec-search-global')?.value).toLowerCase();
        const textField=byId('exec-filter-text-field')?.value || '', textQ=clean(byId('exec-filter-text-value')?.value).toLowerCase();
        const catField=byId('exec-filter-category-field')?.value || '', catValue=byId('exec-filter-category-value')?.value || '';
        const dateField=byId('exec-filter-date-field')?.value || '', from=toDate(byId('exec-filter-date-from')?.value), to=toDate(byId('exec-filter-date-to')?.value);
        const numField=byId('exec-filter-number-field')?.value || '', nmin=Number(byId('exec-filter-number-min')?.value), nmax=Number(byId('exec-filter-number-max')?.value), hasMin=byId('exec-filter-number-min')?.value!=='', hasMax=byId('exec-filter-number-max')?.value!=='';
        state.filtered=state.flat.filter(row=>{
            if(globalQ && !Object.values(row).some(v=>clean(v).toLowerCase().includes(globalQ))) return false;
            if(textQ){ if(textField){if(!clean(row[textField]).toLowerCase().includes(textQ))return false;} else if(!Object.values(row).some(v=>clean(v).toLowerCase().includes(textQ)))return false; }
            if(catField && catValue && clean(row[catField])!==catValue) return false;
            if(dateField && (from||to)){ const d=toDate(row[dateField]); if(!d)return false; if(from&&d<from)return false; if(to&&d>to)return false; }
            if(numField && (hasMin||hasMax)){ const n=toNum(row[numField]); if(!Number.isFinite(n))return false; if(hasMin&&n<nmin)return false; if(hasMax&&n>nmax)return false; }
            return true;
        });
        refreshAll();
    }

    function resetFilters() {
        ['exec-search-global','exec-filter-text-value','exec-filter-date-from','exec-filter-date-to','exec-filter-number-min','exec-filter-number-max'].forEach(id=>{const e=byId(id);if(e)e.value='';});
        const cv=byId('exec-filter-category-value'); if(cv)cv.value='';
        state.filtered=state.flat.slice(); refreshAll();
    }

    function measureValues(rows=state.filtered) { const f=byId('exec-measure-field')?.value || ''; return f?rows.map(r=>toNum(r[f])).filter(Number.isFinite):[]; }
    function entityValues(rows=state.filtered) { const f=byId('exec-entity-field')?.value || ''; return f?rows.map(r=>clean(r[f])).filter(Boolean):[]; }
    function qualityScore(rows=state.filtered) {
        if(!rows.length)return NaN; const maps=currentMappings(); const important=[maps.measure,maps.date,maps.entity,maps.reference].filter(Boolean); if(!important.length)return 100;
        let ok=0,total=rows.length*important.length; rows.forEach(r=>important.forEach(f=>{if(!isEmpty(r[f]))ok++;})); return total?ok/total*100:100;
    }
    function robustOutlierRows(rows=state.filtered) {
        const field=byId('exec-measure-field')?.value || ''; if(!field)return [];
        const pairs=rows.map((r,i)=>({r,i,v:toNum(r[field])})).filter(x=>Number.isFinite(x.v)); const vals=pairs.map(x=>x.v), med=median(vals), m=mad(vals); if(!Number.isFinite(m)||m===0)return [];
        return pairs.filter(x=>Math.abs(.6745*(x.v-med)/m)>3.5).map(x=>x.r);
    }

    function refreshKPIs() {
        const rows=state.filtered, vals=measureValues(rows), entities=entityValues(rows), q=qualityScore(rows), anomalies=robustOutlierRows(rows);
        byId('exec-kpi-count').textContent=rows.length.toLocaleString('fr-FR');
        byId('exec-kpi-coverage').textContent=state.flat.length?fmtPct(rows.length/state.flat.length*100)+' de la source':'0 % de la source';
        const measure=byId('exec-measure-field')?.value || '';
        byId('exec-kpi-total').textContent=measure?fmtNumber(vals.reduce((s,v)=>s+v,0)):rows.length.toLocaleString('fr-FR');
        byId('exec-kpi-measure').textContent=measure?(state.meta.get(measure)?.label||measure):'Comptage des écritures';
        byId('exec-kpi-center').textContent=vals.length?`${fmtNumber(mean(vals))} / ${fmtNumber(median(vals))}`:'—';
        byId('exec-kpi-entities').textContent=entities.length?unique(entities).length.toLocaleString('fr-FR'):'—';
        byId('exec-kpi-entity-label').textContent=byId('exec-entity-field')?.value?(state.meta.get(byId('exec-entity-field').value)?.label||'entité'):'champ non défini';
        byId('exec-kpi-anomalies').textContent=anomalies.length.toLocaleString('fr-FR');
        byId('exec-kpi-quality').textContent=Number.isFinite(q)?fmtPct(q):'—';
    }

    function chart(key, canvasId, config) {
        if(state.charts[key]){state.charts[key].destroy();state.charts[key]=null;}
        const canvas=byId(canvasId); if(!canvas || typeof Chart==='undefined')return null;
        state.charts[key]=new Chart(canvas.getContext('2d'),config); return state.charts[key];
    }
    function blankChart(key, canvasId, message) {
        return chart(key,canvasId,{type:'bar',data:{labels:[],datasets:[]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},title:{display:true,text:message}}}});
    }

    function renderOverview() {
        const rows=state.filtered, measure=byId('exec-measure-field')?.value || '', dateField=byId('exec-filter-date-field')?.value || '', entityField=byId('exec-entity-field')?.value || '';
        if(!rows.length){ ['time','entities','hist','quality'].forEach(k=>blankChart(`overview-${k}`,`exec-chart-${k}`,'Aucune donnée avec les filtres actifs')); byId('exec-narrative').innerHTML='<i class="fas fa-info-circle"></i> Aucune écriture ne correspond aux critères.'; return; }
        const vals=measureValues(rows), outliers=robustOutlierRows(rows), q=qualityScore(rows), cv=vals.length&&mean(vals)!==0?Math.abs(std(vals)/mean(vals)*100):NaN;
        let dateMin=null,dateMax=null; if(dateField){const ds=rows.map(r=>toDate(r[dateField])).filter(Boolean).sort((a,b)=>a-b);dateMin=ds[0]||null;dateMax=ds.at(-1)||null;}
        let topText=''; if(entityField){const map=new Map();rows.forEach(r=>{const e=clean(r[entityField])||'Non renseigné',v=measure?toNum(r[measure]):1;map.set(e,(map.get(e)||0)+(Number.isFinite(v)?v:0));});const top=[...map.entries()].sort((a,b)=>b[1]-a[1])[0];if(top)topText=` L'entité dominante est <strong>${esc(top[0])}</strong> (${fmtNumber(top[1])}).`;}
        byId('exec-narrative').innerHTML=`<strong>Lecture automatique :</strong> ${rows.length.toLocaleString('fr-FR')} écriture(s) sont retenues${measure?`, pour un total de <strong>${fmtNumber(vals.reduce((s,v)=>s+v,0))}</strong> sur « ${esc(state.meta.get(measure)?.label||measure)} »`:''}. ${vals.length?`La moyenne est ${fmtNumber(mean(vals))}, la médiane ${fmtNumber(median(vals))} et le coefficient de variation ${fmtPct(cv)}.`:''} ${dateMin?`La période observée va du <strong>${fmtDate(dateMin)}</strong> au <strong>${fmtDate(dateMax)}</strong>.`:''}${topText} <strong>${outliers.length}</strong> valeur(s) sont atypiques selon le MAD robuste. La complétude des champs critiques sélectionnés est estimée à <strong>${fmtPct(q)}</strong>.`;

        if(dateField){const buckets=new Map();rows.forEach(r=>{const d=toDate(r[dateField]);if(!d)return;const key=d.toISOString().slice(0,10),v=measure?toNum(r[measure]):1;buckets.set(key,(buckets.get(key)||0)+(Number.isFinite(v)?v:0));});const data=[...buckets.entries()].sort((a,b)=>a[0].localeCompare(b[0]));chart('overview-time','exec-chart-time',{type:'line',data:{labels:data.map(x=>x[0]),datasets:[{label:measure?'Mesure':'Écritures',data:data.map(x=>x[1]),tension:.2,pointRadius:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{maxRotation:60,minRotation:0}},y:{beginAtZero:true}}}});} else blankChart('overview-time','exec-chart-time','Sélectionnez un champ Date/Heure');
        if(entityField){const map=new Map();rows.forEach(r=>{const e=clean(r[entityField])||'Non renseigné',v=measure?toNum(r[measure]):1;map.set(e,(map.get(e)||0)+(Number.isFinite(v)?v:0));});const data=[...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20);chart('overview-entities','exec-chart-entities',{type:'bar',data:{labels:data.map(x=>x[0]),datasets:[{label:measure?'Total':'Écritures',data:data.map(x=>x[1])}]},options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{beginAtZero:true}}}});} else blankChart('overview-entities','exec-chart-entities','Sélectionnez un champ Entité / structure');
        if(vals.length){const min=Math.min(...vals),max=Math.max(...vals),bins=Math.min(20,Math.max(5,Math.round(Math.sqrt(vals.length)))),step=(max-min||1)/bins,counts=Array(bins).fill(0);vals.forEach(v=>counts[Math.min(bins-1,Math.floor((v-min)/step))]++);const labels=counts.map((_,i)=>`${fmtNumber(min+i*step,1)}–${fmtNumber(min+(i+1)*step,1)}`);chart('overview-hist','exec-chart-hist',{type:'bar',data:{labels,datasets:[{label:'Fréquence',data:counts}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{ticks:{autoSkip:true,maxRotation:60}},y:{beginAtZero:true}}}});} else blankChart('overview-hist','exec-chart-hist','Sélectionnez une mesure numérique');
        const critical=[currentMappings().measure,currentMappings().date,currentMappings().entity,currentMappings().reference].filter(Boolean);const labels=critical.map(f=>state.meta.get(f)?.label||f),rates=critical.map(f=>rows.filter(r=>!isEmpty(r[f])).length/rows.length*100);chart('overview-quality','exec-chart-quality',{type:'bar',data:{labels,datasets:[{label:'Complétude (%)',data:rates}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,max:100}}}});
    }

    function getNumericPoints(xField,yField,limit=Infinity) {
        const pts=state.filtered.map((r,index)=>({r,index,x:toNum(r[xField]),y:toNum(r[yField])})).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
        if(pts.length<=limit)return pts; const step=pts.length/limit; return Array.from({length:limit},(_,i)=>pts[Math.floor(i*step)]);
    }
    function normalizePoints(pts) {
        const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y),mx=mean(xs),my=mean(ys),sx=std(xs)||1,sy=std(ys)||1; return pts.map(p=>({...p,nx:(p.x-mx)/sx,ny:(p.y-my)/sy}));
    }

    function runKMeans() {
        const xf=byId('exec-kmeans-x')?.value,yf=byId('exec-kmeans-y')?.value,k=Math.max(2,Math.min(10,Number(byId('exec-kmeans-k')?.value)||3)); const target=byId('exec-kmeans-summary');
        let pts=getNumericPoints(xf,yf,3000); if(pts.length<k){target.className='exec-analysis-summary is-warning';target.textContent=`K-means nécessite au moins ${k} observations numériques complètes.`;return;}
        pts=normalizePoints(pts); const rand=seededRandom(20260828+k); const cent=[]; cent.push({...pts[Math.floor(rand()*pts.length)]}); while(cent.length<k){let best=pts[0],bestD=-1;pts.forEach(p=>{const d=Math.min(...cent.map(c=>(p.nx-c.nx)**2+(p.ny-c.ny)**2));if(d>bestD){bestD=d;best=p;}});cent.push({...best});}
        let assign=Array(pts.length).fill(0); for(let it=0;it<80;it++){let changed=false;pts.forEach((p,i)=>{let best=0,bd=Infinity;cent.forEach((c,j)=>{const d=(p.nx-c.nx)**2+(p.ny-c.ny)**2;if(d<bd){bd=d;best=j;}});if(assign[i]!==best){assign[i]=best;changed=true;}});for(let j=0;j<k;j++){const g=pts.filter((_,i)=>assign[i]===j);if(g.length){cent[j].nx=mean(g.map(p=>p.nx));cent[j].ny=mean(g.map(p=>p.ny));}}if(!changed)break;}
        const sizes=Array(k).fill(0);assign.forEach(a=>sizes[a]++);target.className='exec-analysis-summary is-success';target.innerHTML=`<strong>${pts.length.toLocaleString('fr-FR')} observations</strong> segmentées en ${k} cluster(s). Tailles : ${sizes.map((n,i)=>`C${i+1}=${n}`).join(' · ')}. Les variables sont standardisées avant calcul pour éviter qu'une échelle domine l'autre.`;
        chart('kmeans','exec-chart-kmeans',{type:'scatter',data:{datasets:Array.from({length:k},(_,j)=>({label:`Cluster ${j+1}`,data:pts.map((p,i)=>assign[i]===j?{x:p.x,y:p.y,row:p.r}:null).filter(Boolean),pointRadius:5}))},options:{responsive:true,maintainAspectRatio:false,plugins:{tooltip:{callbacks:{label:c=>`#${c.raw.row.__row} : ${fmtNumber(c.raw.x)} ; ${fmtNumber(c.raw.y)}`}}},scales:{x:{title:{display:true,text:state.meta.get(xf)?.label||xf}},y:{title:{display:true,text:state.meta.get(yf)?.label||yf}}}}});
        byId('exec-kmeans-table').innerHTML=tableHtml(['Cluster','N','Moyenne X','Moyenne Y'],Array.from({length:k},(_,j)=>{const g=pts.filter((_,i)=>assign[i]===j);return [`Cluster ${j+1}`,g.length,fmtNumber(mean(g.map(p=>p.x))),fmtNumber(mean(g.map(p=>p.y)))];}));
    }

    function jenksBreaks(data, nClasses) {
        const values=data.map(Number).filter(Number.isFinite).sort((a,b)=>a-b); if(!values.length)return [];
        nClasses=Math.max(2,Math.min(nClasses,values.length)); const lower=Array.from({length:values.length+1},()=>Array(nClasses+1).fill(0)),variance=Array.from({length:values.length+1},()=>Array(nClasses+1).fill(Infinity));
        for(let i=1;i<=nClasses;i++){lower[1][i]=1;variance[1][i]=0;}
        for(let l=2;l<=values.length;l++){let s1=0,s2=0,w=0,v=0;for(let m=1;m<=l;m++){const i3=l-m+1,val=values[i3-1];s2+=val*val;s1+=val;w++;v=s2-(s1*s1)/w;const i4=i3-1;if(i4!==0){for(let j=2;j<=nClasses;j++){if(variance[l][j]>=v+variance[i4][j-1]){lower[l][j]=i3;variance[l][j]=v+variance[i4][j-1];}}}}lower[l][1]=1;variance[l][1]=v;}
        const breaks=Array(nClasses+1).fill(0);breaks[nClasses]=values.at(-1);breaks[0]=values[0];let k=values.length;for(let j=nClasses;j>=2;j--){const idx=Math.max(1,lower[k][j])-2;breaks[j-1]=values[Math.max(0,idx)];k=Math.max(1,lower[k][j]-1);}return breaks;
    }
    function runJenks() {
        const f=byId('exec-jenks-field')?.value,k=Math.max(2,Math.min(8,Number(byId('exec-jenks-k')?.value)||4)),target=byId('exec-jenks-summary');const vals=state.filtered.map(r=>toNum(r[f])).filter(Number.isFinite);if(vals.length<k){target.className='exec-analysis-summary is-warning';target.textContent='Données numériques insuffisantes pour Jenks.';return;}
        const sample=vals.length>4000?Array.from({length:4000},(_,i)=>vals[Math.floor(i*vals.length/4000)]):vals;const br=jenksBreaks(sample,k);const cls=Array(k).fill(0);vals.forEach(v=>{let c=k-1;for(let i=0;i<k;i++){if(v<=br[i+1]){c=i;break;}}cls[c]++;});target.className='exec-analysis-summary is-success';target.innerHTML=`<strong>${vals.length.toLocaleString('fr-FR')} valeurs</strong> classées en ${k} classes naturelles. Seuils : ${br.map(v=>fmtNumber(v)).join(' → ')}.`;
        chart('jenks','exec-chart-jenks',{type:'bar',data:{labels:cls.map((_,i)=>`Classe ${i+1}\n${fmtNumber(br[i])}–${fmtNumber(br[i+1])}`),datasets:[{label:'Nombre d’écritures',data:cls}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true}}}});byId('exec-jenks-table').innerHTML=tableHtml(['Classe','Minimum','Maximum','N','Part'],cls.map((n,i)=>[`Classe ${i+1}`,fmtNumber(br[i]),fmtNumber(br[i+1]),n,fmtPct(n/vals.length*100)]));
    }

    function runDBSCAN() {
        const xf=byId('exec-dbscan-x')?.value,yf=byId('exec-dbscan-y')?.value,eps=Math.max(.01,Number(byId('exec-dbscan-eps')?.value)||.55),minPts=Math.max(2,Number(byId('exec-dbscan-minpts')?.value)||4),target=byId('exec-dbscan-summary');let pts=getNumericPoints(xf,yf,MAX_DBSCAN_POINTS);if(pts.length<minPts){target.className='exec-analysis-summary is-warning';target.textContent='Données insuffisantes pour DBSCAN.';return;}pts=normalizePoints(pts);const labels=Array(pts.length).fill(undefined),visited=Array(pts.length).fill(false);let cluster=0;const neigh=i=>{const a=[];for(let j=0;j<pts.length;j++)if((pts[i].nx-pts[j].nx)**2+(pts[i].ny-pts[j].ny)**2<=eps*eps)a.push(j);return a;};
        for(let i=0;i<pts.length;i++){if(visited[i])continue;visited[i]=true;let ns=neigh(i);if(ns.length<minPts){labels[i]=-1;continue;}const c=cluster++;labels[i]=c;const seeds=[...ns];for(let q=0;q<seeds.length;q++){const j=seeds[q];if(!visited[j]){visited[j]=true;const ns2=neigh(j);if(ns2.length>=minPts)ns2.forEach(t=>{if(!seeds.includes(t))seeds.push(t);});}if(labels[j]===undefined||labels[j]===-1)labels[j]=c;}}
        const noise=labels.filter(x=>x===-1).length,sizes=Array(cluster).fill(0);labels.forEach(x=>{if(x>=0)sizes[x]++;});target.className='exec-analysis-summary is-success';target.innerHTML=`DBSCAN a identifié <strong>${cluster} groupe(s)</strong> et <strong>${noise} point(s) bruit</strong> sur ${pts.length} observations analysées (ε=${eps}, MinPts=${minPts}). ${state.filtered.length>MAX_DBSCAN_POINTS?`Pour préserver la fluidité, un échantillon systématique de ${MAX_DBSCAN_POINTS} points est utilisé.`:''}`;
        const sets=Array.from({length:cluster},(_,c)=>({label:`Groupe ${c+1}`,data:pts.map((p,i)=>labels[i]===c?{x:p.x,y:p.y,row:p.r}:null).filter(Boolean),pointRadius:5}));sets.push({label:'Bruit / atypiques',data:pts.map((p,i)=>labels[i]===-1?{x:p.x,y:p.y,row:p.r}:null).filter(Boolean),pointRadius:7,pointStyle:'crossRot'});chart('dbscan','exec-chart-dbscan',{type:'scatter',data:{datasets:sets},options:{responsive:true,maintainAspectRatio:false,plugins:{tooltip:{callbacks:{label:c=>`#${c.raw.row.__row} : ${fmtNumber(c.raw.x)} ; ${fmtNumber(c.raw.y)}`}}},scales:{x:{title:{display:true,text:state.meta.get(xf)?.label||xf}},y:{title:{display:true,text:state.meta.get(yf)?.label||yf}}}}});byId('exec-dbscan-table').innerHTML=tableHtml(['Classe','N','Part'],[...sizes.map((n,i)=>[`Groupe ${i+1}`,n,fmtPct(n/pts.length*100)]),['Bruit / atypiques',noise,fmtPct(noise/pts.length*100)]]);
        state.dbscanNoiseRows=new Set(pts.map((p,i)=>labels[i]===-1?p.r:null).filter(Boolean)); renderRisk();
    }

    function buildExpertAlerts() {
        const rows=state.filtered,m=currentMappings(),measure=m.measure,dateField=m.date,refField=m.reference,entity=m.entity,vals=measure?rows.map(r=>toNum(r[measure])).filter(Number.isFinite):[],med=median(vals),madv=mad(vals),refCount=new Map(),amountCount=new Map();
        if(refField)rows.forEach(r=>{const v=clean(r[refField]);if(v)refCount.set(v,(refCount.get(v)||0)+1);});if(measure)rows.forEach(r=>{const v=toNum(r[measure]);if(Number.isFinite(v))amountCount.set(v,(amountCount.get(v)||0)+1);});
        const alerts=[];function add(row,sev,rule,detail){alerts.push({row,sev,rule,detail});}
        rows.forEach(r=>{
            [measure,dateField,refField,entity].filter(Boolean).forEach(f=>{if(isEmpty(r[f]))add(r,'medium','Champ critique manquant',`${state.meta.get(f)?.label||f} non renseigné.`);});
            if(measure){const v=toNum(r[measure]);if(Number.isFinite(v)){if(v<0)add(r,'high','Montant / valeur négative',`Valeur ${fmtNumber(v)}.`);else if(v===0)add(r,'low','Montant / valeur nul(le)','Valeur égale à zéro.');if(madv>0&&Math.abs(.6745*(v-med)/madv)>3.5)add(r,'high','Valeur atypique robuste',`Écart MAD robuste élevé : ${fmtNumber(v)}.`);if(amountCount.get(v)>=5&&amountCount.get(v)/Math.max(1,rows.length)>=.08)add(r,'low','Montant très répété',`${fmtNumber(v)} apparaît ${amountCount.get(v)} fois.`);}}
            if(refField){const ref=clean(r[refField]);if(ref&&refCount.get(ref)>1)add(r,'high','Référence dupliquée',`La référence « ${ref} » apparaît ${refCount.get(ref)} fois.`);}
            if(dateField){const d=toDate(r[dateField]);if(d){const h=d.getHours(),day=d.getDay();if(h<6||h>=22)add(r,'medium','Horaire inhabituel',`Date/heure : ${fmtDate(d)}.`);if(day===0||day===6)add(r,'low','Écriture de week-end',`Date/heure : ${fmtDate(d)}.`);}}
            const submitField=state.fields.find(f=>/_submission_time$/i.test(f));if(dateField&&submitField&&submitField!==dateField){const a=toDate(r[dateField]),b=toDate(r[submitField]);if(a&&b){const gap=Math.abs(b-a)/86400000;if(gap>30)add(r,'medium','Décalage temporel important',`${fmtNumber(gap,0)} jour(s) entre la date analysée et la soumission Kobo.`);}}
        });
        state.expertAlerts=alerts;return alerts;
    }
    function runExpert() {
        const alerts=buildExpertAlerts(), target=byId('exec-expert-summary'), high=alerts.filter(a=>a.sev==='high').length,med=alerts.filter(a=>a.sev==='medium').length,low=alerts.filter(a=>a.sev==='low').length;target.className='exec-analysis-summary '+(high?'is-warning':'is-success');target.innerHTML=`Le système expert a généré <strong>${alerts.length.toLocaleString('fr-FR')} alerte(s)</strong> : ${high} élevée(s), ${med} moyenne(s), ${low} faible(s). Une même écriture peut déclencher plusieurs règles. Ces alertes indiquent des <strong>priorités de vérification</strong>, pas des irrégularités établies.`;
        const counts=new Map();alerts.forEach(a=>counts.set(a.rule,(counts.get(a.rule)||0)+1));byId('exec-expert-rules').innerHTML=[...counts.entries()].sort((a,b)=>b[1]-a[1]).map(([rule,n])=>`<div class="col-xl-3 col-md-6"><div class="exec-expert-rule"><strong>${esc(rule)}</strong><span>${n.toLocaleString('fr-FR')} alerte(s)</span></div></div>`).join('') || '<div class="col-12 text-muted">Aucune règle déclenchée.</div>';
        const maps=currentMappings();byId('exec-expert-table').innerHTML=tableHtml(['Sévérité','#','Entité','Référence','Règle','Détail'],alerts.slice(0,500).map(a=>[severityBadge(a.sev),a.row.__row,esc(maps.entity?clean(a.row[maps.entity]):''),esc(maps.reference?clean(a.row[maps.reference]):''),esc(a.rule),esc(a.detail)]),true);renderRisk();
    }

    function severityBadge(sev){const map={high:['ÉLEVÉE','exec-risk-high'],medium:['MOYENNE','exec-risk-medium'],low:['FAIBLE','exec-risk-low']},x=map[sev]||[sev,''];return `<span class="exec-risk-badge ${x[1]}">${x[0]}</span>`;}

    function tokenize(text){return clean(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9à-ÿ]+/gi,' ').split(/\s+/).filter(t=>t.length>1);}
    function tfidfSearch(query, docs) {
        const qTokens=tokenize(query), docTokens=docs.map(d=>tokenize(d.text)), vocab=new Set(qTokens);docTokens.forEach(ts=>ts.forEach(t=>vocab.add(t)));const terms=[...vocab],df=new Map();terms.forEach(t=>df.set(t,docTokens.filter(ts=>ts.includes(t)).length));
        const vec=tokens=>{const c=new Map();tokens.forEach(t=>c.set(t,(c.get(t)||0)+1));const m=new Map();c.forEach((count,t)=>m.set(t,(count/tokens.length)*(Math.log((docs.length+1)/((df.get(t)||0)+1))+1)));return m;};const qv=vec(qTokens),qnorm=Math.sqrt([...qv.values()].reduce((s,v)=>s+v*v,0))||1;
        return docs.map((d,i)=>{const dv=vec(docTokens[i]),dot=[...qv.entries()].reduce((s,[t,v])=>s+v*(dv.get(t)||0),0),dn=Math.sqrt([...dv.values()].reduce((s,v)=>s+v*v,0))||1;return {...d,score:dot/(qnorm*dn)};}).sort((a,b)=>b.score-a.score);
    }
    function semanticDocs() {
        const f=byId('exec-semantic-field')?.value || '';if(!f)return [];return state.filtered.map(r=>({row:r,text:clean(r[f])})).filter(d=>d.text).slice(0,MAX_SBERT_DOCS);
    }
    async function loadSBERT() {
        if(state.sbertExtractor)return state.sbertExtractor;
        const mod=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0');
        if(mod.env){mod.env.allowLocalModels=false;mod.env.useBrowserCache=true;}
        try{state.sbertExtractor=await mod.pipeline('feature-extraction',state.sbertModelName,{dtype:'q8'});}catch(_){state.sbertExtractor=await mod.pipeline('feature-extraction',state.sbertModelName);}
        return state.sbertExtractor;
    }
    function cosine(a,b){let d=0,aa=0,bb=0;const n=Math.min(a.length,b.length);for(let i=0;i<n;i++){d+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}return d/(Math.sqrt(aa*bb)||1);}
    function outputVectors(output){const list=typeof output?.tolist==='function'?output.tolist():output;if(!Array.isArray(list))return[];if(Array.isArray(list[0])&&typeof list[0][0]==='number')return list;if(Array.isArray(list[0])&&Array.isArray(list[0][0]))return list.map(seq=>{const dim=seq[0]?.length||0,v=Array(dim).fill(0);seq.forEach(tok=>tok.forEach((x,i)=>v[i]+=x));return v.map(x=>x/seq.length);});return [];}
    function renderSemanticResults(results,mode) {
        const top=Math.max(3,Math.min(50,Number(byId('exec-semantic-top')?.value)||10)),maps=currentMappings();byId('exec-sbert-results').innerHTML=results.slice(0,top).map((x,i)=>`<div class="exec-semantic-result"><div class="d-flex justify-content-between gap-2"><strong>#${i+1} · écriture ${x.row.__row}</strong><span class="score">similarité ${fmtPct(x.score*100,1)}</span></div><div>${esc(x.text)}</div><div class="meta">${maps.entity?esc(clean(x.row[maps.entity])):''}${maps.reference?` · Réf. ${esc(clean(x.row[maps.reference]))}`:''} · mode ${esc(mode)}</div></div>`).join('') || '<div class="text-muted">Aucun résultat.</div>';
    }
    async function runSemantic(useSBERT=true) {
        const query=clean(byId('exec-semantic-query')?.value),docs=semanticDocs(),status=byId('exec-sbert-status');if(!query||!docs.length){status.className='exec-analysis-summary is-warning';status.textContent='Renseignez une requête et choisissez un champ texte contenant des valeurs.';return;}
        if(!useSBERT){const res=tfidfSearch(query,docs);status.className='exec-analysis-summary is-success';status.innerHTML=`Recherche locale <strong>TF-IDF / cosinus</strong> sur ${docs.length} document(s).`;renderSemanticResults(res,'TF-IDF');return;}
        try{status.className='exec-analysis-summary';status.innerHTML='<i class="fas fa-spinner fa-spin"></i> Chargement du modèle SBERT multilingue puis calcul des embeddings… Le premier chargement peut être volumineux.';const ext=await loadSBERT();const qOut=await ext(query,{pooling:'mean',normalize:true}),qVec=outputVectors(qOut)[0];let results=[];const batchSize=12;for(let i=0;i<docs.length;i+=batchSize){status.innerHTML=`<i class="fas fa-spinner fa-spin"></i> SBERT : embeddings ${Math.min(i+batchSize,docs.length)}/${docs.length}…`;const batch=docs.slice(i,i+batchSize),out=await ext(batch.map(d=>d.text),{pooling:'mean',normalize:true}),vecs=outputVectors(out);batch.forEach((d,j)=>results.push({...d,score:cosine(qVec,vecs[j]||[])}));}results.sort((a,b)=>b.score-a.score);status.className='exec-analysis-summary is-success';status.innerHTML=`Recherche <strong>SBERT multilingue</strong> avec ${esc(state.sbertModelName)} sur ${docs.length} document(s).`;renderSemanticResults(results,'SBERT');}catch(error){console.warn('[EXECUTION_COMPTABLE][SBERT]',error);const res=tfidfSearch(query,docs);status.className='exec-analysis-summary is-warning';status.innerHTML=`Le modèle SBERT n'a pas pu être chargé (${esc(error.message||error)}). <strong>Mode de secours TF-IDF/cosinus</strong> exécuté localement.`;renderSemanticResults(res,'TF-IDF secours');}
    }

    function localPearson(xs,ys){if(typeof realStatsPearson==='function')return realStatsPearson(xs,ys);const pairs=xs.map((x,i)=>[Number(x),Number(ys[i])]).filter(p=>p.every(Number.isFinite));if(pairs.length<3)return{n:pairs.length,r:NaN,p:NaN};const mx=mean(pairs.map(p=>p[0])),my=mean(pairs.map(p=>p[1]));let a=0,b=0,c=0;pairs.forEach(([x,y])=>{const dx=x-mx,dy=y-my;a+=dx*dy;b+=dx*dx;c+=dy*dy;});return{n:pairs.length,r:a/Math.sqrt(b*c),p:NaN};}
    function localRanks(values){const s=values.map((v,i)=>({v:Number(v),i})).sort((a,b)=>a.v-b.v),r=Array(values.length);let k=0;while(k<s.length){let j=k+1;while(j<s.length&&s[j].v===s[k].v)j++;const rank=(k+1+j)/2;for(let q=k;q<j;q++)r[s[q].i]=rank;k=j;}return r;}
    function localSpearman(xs,ys){if(typeof realStatsSpearman==='function')return realStatsSpearman(xs,ys);const p=xs.map((x,i)=>[Number(x),Number(ys[i])]).filter(a=>a.every(Number.isFinite)),rx=localRanks(p.map(x=>x[0])),ry=localRanks(p.map(x=>x[1])),z=localPearson(rx,ry);return{n:z.n,rho:z.r,p:z.p};}
    function formatP(p){if(typeof realStatsFormatP==='function')return realStatsFormatP(p);return Number.isFinite(p)?p.toLocaleString('fr-FR',{maximumFractionDigits:4}):'Non calculable';}
    function runStatistics() {
        const xf = byId('exec-stats-x')?.value;
        const yf = byId('exec-stats-y')?.value;
        const gf = byId('exec-stats-group')?.value;
        const g2f = byId('exec-stats-group2')?.value;
        const target = byId('exec-stats-summary');
        const pairs = getNumericPoints(xf, yf, 5000);
        const xs = pairs.map(p => p.x), ys = pairs.map(p => p.y);
        const pr = localPearson(xs, ys), sp = localSpearman(xs, ys);

        const groupMap = new Map();
        state.filtered.forEach(r => {
            const g = clean(r[gf]), v = toNum(r[yf]);
            if (g && Number.isFinite(v)) {
                if (!groupMap.has(g)) groupMap.set(g, []);
                groupMap.get(g).push(v);
            }
        });
        const groups = [...groupMap.entries()].filter(([, a]) => a.length >= 2)
            .sort((a, b) => b[1].length - a[1].length).slice(0, 40);

        let F = NaN, pF = NaN, df1 = NaN, df2 = NaN;
        if (groups.length >= 2) {
            const all = groups.flatMap(g => g[1]), grand = mean(all);
            let ssb = 0, ssw = 0;
            groups.forEach(([, a]) => {
                const m = mean(a);
                ssb += a.length * (m - grand) ** 2;
                ssw += a.reduce((sum, v) => sum + (v - m) ** 2, 0);
            });
            df1 = groups.length - 1; df2 = all.length - groups.length;
            F = (ssb / df1) / (ssw / df2);
            if (typeof realStatsFUpperP === 'function') pF = realStatsFUpperP(F, df1, df2);
        }

        // Kruskal-Wallis sur les mêmes groupes (alternative robuste à l'ANOVA).
        let H = NaN, pH = NaN, dfH = NaN;
        if (groups.length >= 2) {
            const observations = [];
            groups.forEach(([g, values]) => values.forEach(v => observations.push({ g, v })));
            const ranks = localRanks(observations.map(o => o.v));
            const rankSums = new Map(), counts = new Map();
            observations.forEach((o, i) => {
                rankSums.set(o.g, (rankSums.get(o.g) || 0) + ranks[i]);
                counts.set(o.g, (counts.get(o.g) || 0) + 1);
            });
            const N = observations.length;
            H = 12 / (N * (N + 1)) * [...rankSums.entries()].reduce((sum, [g, R]) => sum + R * R / counts.get(g), 0) - 3 * (N + 1);
            const tieCounts = new Map(); observations.forEach(o => tieCounts.set(o.v, (tieCounts.get(o.v) || 0) + 1));
            const tieCorrection = 1 - [...tieCounts.values()].reduce((sum, t) => sum + (t ** 3 - t), 0) / (N ** 3 - N || 1);
            if (tieCorrection > 0) H /= tieCorrection;
            dfH = groups.length - 1;
            if (typeof realStatsChiUpperP === 'function') pH = realStatsChiUpperP(H, dfH);
        }

        // Khi² d'indépendance entre deux variables catégorielles, avec regroupement des modalités rares.
        let chi2 = NaN, pChi = NaN, dfChi = NaN, cramer = NaN, chiN = 0;
        if (gf && g2f && gf !== g2f) {
            const rows = state.filtered.map(r => [clean(r[gf]), clean(r[g2f])]).filter(x => x[0] && x[1]);
            chiN = rows.length;
            const topCats = (idx, max = 12) => {
                const c = new Map(); rows.forEach(x => c.set(x[idx], (c.get(x[idx]) || 0) + 1));
                return new Set([...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(x => x[0]));
            };
            if (rows.length >= 5) {
                const A = topCats(0), B = topCats(1);
                const normA = v => A.has(v) ? v : 'Autres';
                const normB = v => B.has(v) ? v : 'Autres';
                const aLabels = unique(rows.map(x => normA(x[0]))), bLabels = unique(rows.map(x => normB(x[1])));
                if (aLabels.length >= 2 && bLabels.length >= 2) {
                    const ai = new Map(aLabels.map((x, i) => [x, i])), bi = new Map(bLabels.map((x, i) => [x, i]));
                    const table = Array.from({ length: aLabels.length }, () => Array(bLabels.length).fill(0));
                    rows.forEach(x => table[ai.get(normA(x[0]))][bi.get(normB(x[1]))]++);
                    const rt = table.map(r => r.reduce((a, b) => a + b, 0));
                    const ct = bLabels.map((_, j) => table.reduce((sum, r) => sum + r[j], 0));
                    chi2 = 0;
                    table.forEach((r, i) => r.forEach((obs, j) => {
                        const exp = rt[i] * ct[j] / rows.length;
                        if (exp > 0) chi2 += (obs - exp) ** 2 / exp;
                    }));
                    dfChi = (aLabels.length - 1) * (bLabels.length - 1);
                    if (typeof realStatsChiUpperP === 'function') pChi = realStatsChiUpperP(chi2, dfChi);
                    cramer = Math.sqrt(chi2 / (rows.length * Math.max(1, Math.min(aLabels.length - 1, bLabels.length - 1))));
                }
            }
        }

        target.className = 'exec-analysis-summary is-success';
        target.innerHTML = `<strong>Pearson :</strong> n=${pr.n}, r=${fmtNumber(pr.r, 3)}, p=${formatP(pr.p)} · <strong>Spearman :</strong> ρ=${fmtNumber(sp.rho, 3)}, p=${formatP(sp.p)}.<br>` +
            (groups.length >= 2 ? `<strong>ANOVA :</strong> F(${df1},${df2})=${fmtNumber(F, 3)}, p=${formatP(pF)} · <strong>Kruskal-Wallis :</strong> H(${dfH})=${fmtNumber(H, 3)}, p=${formatP(pH)}.<br>` : '') +
            (Number.isFinite(chi2) ? `<strong>Khi² :</strong> χ²(${dfChi})=${fmtNumber(chi2, 3)}, p=${formatP(pChi)}, V de Cramér=${fmtNumber(cramer, 3)}, n=${chiN}.` : '');

        chart('stats-corr', 'exec-chart-correlation', {
            type: 'scatter',
            data: { datasets: [{ label: 'Observations', data: pairs.slice(0, 1500).map(p => ({ x: p.x, y: p.y, row: p.r })), pointRadius: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: state.meta.get(xf)?.label || xf } }, y: { title: { display: true, text: state.meta.get(yf)?.label || yf } } } }
        });
        const shown = groups.slice(0, 25);
        chart('stats-anova', 'exec-chart-anova', {
            type: 'bar', data: { labels: shown.map(g => g[0]), datasets: [{ label: 'Moyenne', data: shown.map(g => mean(g[1])) }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { maxRotation: 70, minRotation: 30 } }, y: { beginAtZero: true } } }
        });
        byId('exec-stats-details').innerHTML = tableHtml(['Groupe', 'N', 'Moyenne', 'Médiane', 'Écart-type', 'CV', 'Q1', 'Q3'], shown.map(([g, a]) => [
            esc(g), a.length, fmtNumber(mean(a)), fmtNumber(median(a)), fmtNumber(std(a)),
            fmtPct(mean(a) ? Math.abs(std(a) / mean(a) * 100) : NaN), fmtNumber(quantile(a, .25)), fmtNumber(quantile(a, .75))
        ]), true);
    }

    function renderRisk() {
        if (!state.expertAlerts.length && state.filtered.length) buildExpertAlerts();
        const scoreMap = new Map();
        state.filtered.forEach(r => scoreMap.set(r, 0));
        state.expertAlerts.forEach(a => {
            const weight = a.sev === 'high' ? 40 : a.sev === 'medium' ? 20 : 8;
            scoreMap.set(a.row, (scoreMap.get(a.row) || 0) + weight);
        });
        if (state.dbscanNoiseRows) {
            state.dbscanNoiseRows.forEach(r => {
                if (scoreMap.has(r)) scoreMap.set(r, (scoreMap.get(r) || 0) + 25);
            });
        }
        const measure = byId('exec-measure-field')?.value || '';
        const vals = measure ? state.filtered.map(r => toNum(r[measure])).filter(Number.isFinite) : [];
        const med = median(vals), madv = mad(vals);
        if (measure && madv > 0) {
            state.filtered.forEach(r => {
                const v = toNum(r[measure]);
                if (!Number.isFinite(v)) return;
                const z = Math.abs(.6745 * (v - med) / madv);
                scoreMap.set(r, Math.min(100, (scoreMap.get(r) || 0) + Math.min(25, z * 4)));
            });
        }
        state.riskRows = [...scoreMap.entries()]
            .map(([row, score]) => ({ row, score: Math.min(100, score) }))
            .sort((a, b) => b.score - a.score);
        const high = state.riskRows.filter(x => x.score >= 60).length;
        const medium = state.riskRows.filter(x => x.score >= 30 && x.score < 60).length;
        const summary = byId('exec-risk-summary');
        summary.className = 'exec-analysis-summary ' + (high ? 'is-warning' : 'is-success');
        summary.innerHTML = `<strong>${high}</strong> écriture(s) à priorité élevée (score ≥ 60) et <strong>${medium}</strong> à priorité moyenne. Le score combine règles expertes, distance robuste et, lorsque DBSCAN a été exécuté, isolement par densité.`;
        chart('risk', 'exec-chart-risk', {
            type: 'bar',
            data: {
                labels: state.riskRows.slice(0, 30).map(x => `#${x.row.__row}`),
                datasets: [{ label: 'Score risque', data: state.riskRows.slice(0, 30).map(x => x.score) }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, max: 100 }, x: { ticks: { autoSkip: false, maxRotation: 60 } } }
            }
        });
        renderBenford();
        const maps = currentMappings();
        byId('exec-risk-table').innerHTML = tableHtml(
            ['#', 'Score', 'Niveau', 'Entité', 'Référence'],
            state.riskRows.slice(0, 200).map(x => [
                x.row.__row,
                fmtNumber(x.score, 0),
                x.score >= 60 ? severityBadge('high') : x.score >= 30 ? severityBadge('medium') : severityBadge('low'),
                esc(maps.entity ? clean(x.row[maps.entity]) : ''),
                esc(maps.reference ? clean(x.row[maps.reference]) : '')
            ]),
            true
        );
    }
    function renderBenford() {
        const f=byId('exec-measure-field')?.value||'',values=f?state.filtered.map(r=>Math.abs(toNum(r[f]))).filter(v=>Number.isFinite(v)&&v>0):[];const obs=Array(9).fill(0);values.forEach(v=>{const s=v.toExponential().replace('.','');const d=Number(String(v).replace(/^0\.?0*/, '').match(/[1-9]/)?.[0]||String(Math.floor(v))[0]);if(d>=1&&d<=9)obs[d-1]++;});const obsPct=obs.map(n=>values.length?n/values.length*100:0),exp=Array.from({length:9},(_,i)=>Math.log10(1+1/(i+1))*100);chart('benford','exec-chart-benford',{type:'bar',data:{labels:['1','2','3','4','5','6','7','8','9'],datasets:[{label:'Observé %',data:obsPct},{label:'Benford %',data:exp,type:'line',tension:.15}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:true,title:{display:true,text:'Pourcentage'}}}}});
    }

    function linearRegression(xs,ys){const mx=mean(xs),my=mean(ys);let num=0,den=0;xs.forEach((x,i)=>{num+=(x-mx)*(ys[i]-my);den+=(x-mx)**2;});const b=den?num/den:0,a=my-b*mx;return{a,b};}
    function runForecast() {
        const df=byId('exec-forecast-date')?.value,vf=byId('exec-forecast-value')?.value,days=Math.max(1,Math.min(365,Number(byId('exec-forecast-days')?.value)||30)),target=byId('exec-forecast-summary');if(!df||!vf){target.className='exec-analysis-summary is-warning';target.textContent='Sélectionnez un champ Date/Heure et une mesure numérique.';return;}const bucket=new Map();state.filtered.forEach(r=>{const d=toDate(r[df]),v=toNum(r[vf]);if(!d||!Number.isFinite(v))return;const key=d.toISOString().slice(0,10);bucket.set(key,(bucket.get(key)||0)+v);});const data=[...bucket.entries()].sort((a,b)=>a[0].localeCompare(b[0]));if(data.length<3){target.className='exec-analysis-summary is-warning';target.textContent='Au moins trois dates distinctes sont nécessaires pour la projection.';return;}const start=new Date(data[0][0]+'T00:00:00'),xs=data.map(x=>(new Date(x[0]+'T00:00:00')-start)/86400000),ys=data.map(x=>x[1]),reg=linearRegression(xs,ys),lastDate=new Date(data.at(-1)[0]+'T00:00:00'),forecast=Array.from({length:days},(_,i)=>{const d=new Date(lastDate.getTime()+(i+1)*86400000),x=(d-start)/86400000;return[d.toISOString().slice(0,10),Math.max(0,reg.a+reg.b*x)];});const trend=reg.b>0?'croissante':reg.b<0?'décroissante':'stable';target.className='exec-analysis-summary is-success';target.innerHTML=`Tendance linéaire journalière <strong>${trend}</strong> : pente ${fmtNumber(reg.b)} unité(s) par jour sur ${data.length} jours observés. Horizon projeté : ${days} jours. Cette extrapolation est exploratoire.`;chart('forecast','exec-chart-forecast',{type:'line',data:{labels:[...data.map(x=>x[0]),...forecast.map(x=>x[0])],datasets:[{label:'Observé',data:[...data.map(x=>x[1]),...forecast.map(()=>null)],spanGaps:false},{label:'Prévision',data:[...data.slice(0,-1).map(()=>null),data.at(-1)[1],...forecast.map(x=>x[1])],borderDash:[6,4],spanGaps:true}]},options:{responsive:true,maintainAspectRatio:false,scales:{x:{ticks:{autoSkip:true,maxTicksLimit:18,maxRotation:60}},y:{beginAtZero:true}}}});
    }

    function renderDataTable() {
        const rows=state.filtered.slice(0,MAX_TABLE_ROWS),fields=state.fields.slice(0,MAX_TABLE_FIELDS),head=byId('exec-data-head'),body=byId('exec-data-body');byId('exec-data-count').textContent=`${state.filtered.length.toLocaleString('fr-FR')} ligne(s)`;if(!state.filtered.length){head.innerHTML='';body.innerHTML='<tr><td class="text-muted">Aucune donnée.</td></tr>';return;}head.innerHTML='<tr>'+fields.map(f=>`<th title="${esc(f)}">${esc(state.meta.get(f)?.label||f)}</th>`).join('')+'</tr>';body.innerHTML=rows.map(r=>'<tr>'+fields.map(f=>`<td title="${esc(clean(r[f]))}">${esc(clean(r[f]))}</td>`).join('')+'</tr>').join('')+(state.filtered.length>MAX_TABLE_ROWS?`<tr><td colspan="${fields.length}" class="text-center text-muted">Affichage limité à ${MAX_TABLE_ROWS} lignes. Les exports contiennent toutes les lignes filtrées.</td></tr>`:'');
    }

    function refreshAll() { refreshKPIs(); renderOverview(); renderDataTable(); runStatistics(); runExpert(); runForecast(); }

    function tableHtml(headers, rows, raw=false) { return `<table class="table table-sm table-striped table-bordered align-middle"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${raw?String(c??''):esc(c)}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${headers.length}" class="text-muted">Aucune donnée.</td></tr>`}</tbody></table>`; }

    function csvEscape(v){const s=String(v??'');return /[;"\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
    function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);}
    function exportCSV(){const fields=state.fields,lines=[fields.map(csvEscape).join(';'),...state.filtered.map(r=>fields.map(f=>csvEscape(r[f])).join(';'))];downloadBlob(new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'}),`EXECUTION_COMPTABLE_${new Date().toISOString().slice(0,10)}.csv`);}
    function exportJSON(){downloadBlob(new Blob([JSON.stringify({exported_at:new Date().toISOString(),source:state.sourceUrl,filters:getFilterSnapshot(),count:state.filtered.length,results:state.filtered},null,2)],{type:'application/json'}),`EXECUTION_COMPTABLE_${new Date().toISOString().slice(0,10)}.json`);}
    function getFilterSnapshot(){return{global:byId('exec-search-global')?.value||'',text_field:byId('exec-filter-text-field')?.value||'',text_value:byId('exec-filter-text-value')?.value||'',category_field:byId('exec-filter-category-field')?.value||'',category_value:byId('exec-filter-category-value')?.value||'',date_field:byId('exec-filter-date-field')?.value||'',date_from:byId('exec-filter-date-from')?.value||'',date_to:byId('exec-filter-date-to')?.value||'',number_field:byId('exec-filter-number-field')?.value||'',number_min:byId('exec-filter-number-min')?.value||'',number_max:byId('exec-filter-number-max')?.value||'',measure:byId('exec-measure-field')?.value||'',entity:byId('exec-entity-field')?.value||'',reference:byId('exec-reference-field')?.value||''};}
    function exportXLSX(){if(typeof XLSX==='undefined'){alert('Bibliothèque XLSX indisponible.');return;}const wb=XLSX.utils.book_new(),criteria=Object.entries(getFilterSnapshot()).map(([k,v])=>({Critère:k,Valeur:v}));XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(criteria),'Critères');const summary=[{Indicateur:'Écritures retenues',Valeur:state.filtered.length},{Indicateur:'Source totale',Valeur:state.flat.length},{Indicateur:'Qualité (%)',Valeur:qualityScore(state.filtered)},{Indicateur:'Alertes système expert',Valeur:state.expertAlerts.length}];XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(summary),'Synthèse');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(state.filtered),'Données filtrées');if(state.expertAlerts.length)XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(state.expertAlerts.map(a=>({ligne:a.row.__row,severite:a.sev,regle:a.rule,detail:a.detail}))),'Alertes');XLSX.writeFile(wb,`EXECUTION_COMPTABLE_${new Date().toISOString().slice(0,10)}.xlsx`);}
    function reportHtml(){const rows=state.riskRows.slice(0,50),maps=currentMappings(),html=`<!doctype html><html lang="fr"><meta charset="utf-8"><title>EXECUTION_COMPTABLE</title><style>body{font-family:Arial,sans-serif;margin:30px;color:#243447}h1{color:#5b2ca0}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px;font-size:12px}th{background:#eee}.warn{color:#a8202d}</style><body><h1>EXECUTION_COMPTABLE — Rapport analytique</h1><p>Généré le ${esc(new Date().toLocaleString('fr-FR'))}</p><h2>Synthèse</h2>${byId('exec-narrative')?.innerHTML||''}<p><strong>Écritures filtrées :</strong> ${state.filtered.length}</p><p><strong>Alertes expertes :</strong> ${state.expertAlerts.length}</p><h2>Top risques</h2>${tableHtml(['Ligne','Score','Entité','Référence'],rows.map(x=>[x.row.__row,fmtNumber(x.score,0),maps.entity?clean(x.row[maps.entity]):'',maps.reference?clean(x.row[maps.reference]):'']))}<h2>Méthodologie</h2><p>K-means, Jenks, DBSCAN, règles expertes, statistiques robustes, SBERT/TF-IDF, Benford et prévision sont des outils d'aide à l'analyse. Une alerte ne constitue pas une preuve d'irrégularité.</p></body></html>`;downloadBlob(new Blob([html],{type:'text/html;charset=utf-8'}),`EXECUTION_COMPTABLE_RAPPORT_${new Date().toISOString().slice(0,10)}.html`);}
    function exportPNG(){const canvas=byId('exec-chart-time');if(!canvas){alert('Graphique indisponible.');return;}canvas.toBlob(blob=>blob&&downloadBlob(blob,`EXECUTION_COMPTABLE_evolution_${new Date().toISOString().slice(0,10)}.png`),'image/png');}
    async function shareSummary(){const text=`EXECUTION_COMPTABLE — ${state.filtered.length} écriture(s) retenue(s), ${state.expertAlerts.length} alerte(s) experte(s), qualité ${fmtPct(qualityScore(state.filtered))}.`;try{if(navigator.share)await navigator.share({title:'EXECUTION_COMPTABLE',text});else{await navigator.clipboard.writeText(text);alert('Synthèse copiée dans le presse-papiers.');}}catch(e){if(e?.name!=='AbortError')alert(`Partage impossible : ${e.message||e}`);}}

    async function importJSON(event){const file=event.target.files?.[0];if(!file)return;try{const obj=JSON.parse(await file.text()),rows=Array.isArray(obj)?obj:(Array.isArray(obj.results)?obj.results:(Array.isArray(obj.data)?obj.data:[]));if(!rows.length)throw new Error('Aucun tableau de données trouvé (array / results / data).');loadRows(rows,{source:`JSON ${file.name}`,providers:[],pages:1});}catch(e){setStatus(`<i class="fas fa-exclamation-triangle"></i> Import JSON impossible : ${esc(e.message||e)}`,'is-error');}finally{event.target.value='';}}

    function wireEvents(){
        byId('exec-connect')?.addEventListener('click',connectSource);byId('exec-import-json')?.addEventListener('change',importJSON);byId('exec-apply-filters')?.addEventListener('click',applyFilters);byId('exec-reset-filters')?.addEventListener('click',resetFilters);byId('exec-filter-category-field')?.addEventListener('change',updateCategoryValues);
        ['exec-measure-field','exec-entity-field','exec-reference-field','exec-filter-date-field'].forEach(id=>byId(id)?.addEventListener('change',refreshAll));
        byId('exec-run-kmeans')?.addEventListener('click',runKMeans);byId('exec-run-jenks')?.addEventListener('click',runJenks);byId('exec-run-dbscan')?.addEventListener('click',runDBSCAN);byId('exec-run-expert')?.addEventListener('click',runExpert);byId('exec-run-sbert')?.addEventListener('click',()=>runSemantic(true));byId('exec-run-tfidf')?.addEventListener('click',()=>runSemantic(false));byId('exec-run-forecast')?.addEventListener('click',runForecast);
        ['exec-stats-x','exec-stats-y','exec-stats-group','exec-stats-group2'].forEach(id=>byId(id)?.addEventListener('change',runStatistics));
        byId('exec-export-xlsx')?.addEventListener('click',exportXLSX);byId('exec-export-csv')?.addEventListener('click',exportCSV);byId('exec-export-json')?.addEventListener('click',exportJSON);byId('exec-export-report')?.addEventListener('click',reportHtml);byId('exec-export-png')?.addEventListener('click',exportPNG);byId('exec-share')?.addEventListener('click',shareSummary);
        document.querySelectorAll('#execAccountingTabs button[data-bs-toggle="pill"]').forEach(btn=>btn.addEventListener('shown.bs.tab',()=>Object.values(state.charts).forEach(c=>{try{c?.resize();}catch(_){}})));
        byId('execution-comptable-tab')?.addEventListener('shown.bs.tab',()=>{
            setTimeout(()=>Object.values(state.charts).forEach(c=>{try{c?.resize();}catch(_){}}),50);
            if(!state.raw.length && !state._autoConnectStarted){
                state._autoConnectStarted=true;
                connectSource();
            }
        });
    }

    function init(){
        if(!byId('execution-comptable'))return;
        const saved=localStorage.getItem(STORAGE_KEY)||'';
        const source=saved||DEFAULT_KOBO_FORM_URL;
        if(byId('exec-kobo-source'))byId('exec-kobo-source').value=source;
        wireEvents();state.filtered=[];refreshKPIs();renderDataTable();
        if(saved) setStatus('<i class="fas fa-info-circle"></i> Une source EXECUTION_COMPTABLE est enregistrée dans ce navigateur. Cliquez sur « Connecter / Actualiser ».');
        else setStatus(`<i class="fas fa-link"></i> Source KoboToolbox préconfigurée : <strong>${esc(DEFAULT_KOBO_ASSET_UID)}</strong>. Ouvrez cet onglet ou cliquez sur « Connecter / Actualiser » pour charger les données.`);
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();

    window.ExecutionComptable = { state, connect:connectSource, applyFilters, runKMeans, runJenks, runDBSCAN, runExpert, runSemantic, runStatistics, renderRisk, runForecast, exportXLSX, exportCSV, exportJSON };
})();
