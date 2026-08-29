import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.16.0';


// ================================================================
// API PARTAGÉE SENTENCE-BERT — CARTOGRAPHIE DES RÉALISATIONS PROCHES
// V7.7 : un seul modèle partagé, clustering par graphe de similarité,
// consolidation thématique française et secours local explicite.
// ================================================================
let sharedSentenceBertExtractorPromise = null;
const sharedSentenceBertClusterCache = new Map();

function normalizeFrenchSemanticText(value) {
    return String(value || '')
        .replace(/^\s*[A-ZÀ-ÖØ-Ý]{1,8}\s*\d+[A-Z]?\s*[:\-–—]\s*/iu, '')
        .replace(/[‐‑‒–—]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeFrenchSemanticKey(value) {
    return normalizeFrenchSemanticText(value)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const FRENCH_SEMANTIC_STOPWORDS = new Set([
    'a','au','aux','avec','ce','ces','dans','de','des','du','en','et','la','le','les','leur','leurs','niveau','par','pour','sur','un','une',
    'd','l','des','cisco','dren','zap','primaire','primaires','college','colleges','lycee','lycees','rapport','rapports'
]);

function semanticCanonicalTokens(value) {
    const key = normalizeFrenchSemanticKey(value);
    const raw = key.split(' ').filter(Boolean);
    const tokens = new Set();
    raw.forEach(token => {
        let t = token;
        if (/^(control|controle|controller|controler|verification|verifier|verifie)/.test(t)) t = 'controle_verification';
        else if (/^(suiv|suivi|suivre)/.test(t)) t = 'controle_verification';
        else if (/^(utilis|usage)/.test(t)) t = 'utilisation';
        else if (/^caiss/.test(t)) t = 'caisse';
        else if (/^ecol/.test(t)) t = 'ecole';
        else if (/^(encadr|pedagog)/.test(t)) t = t.startsWith('encadr') ? 'encadrement' : 'pedagogique';
        if (!FRENCH_SEMANTIC_STOPWORDS.has(t) && t.length > 2) tokens.add(t);
    });
    if (tokens.has('caisse') && tokens.has('ecole')) tokens.add('caisse_ecole');
    return tokens;
}

function semanticDomainBridge(textA, textB) {
    const a = semanticCanonicalTokens(textA), b = semanticCanonicalTokens(textB);
    // Cas métier important : « caisse(s)-école(s) » + contrôle/suivi/utilisation.
    if (a.has('caisse_ecole') && b.has('caisse_ecole')) {
        const actionA = a.has('controle_verification') || a.has('utilisation');
        const actionB = b.has('controle_verification') || b.has('utilisation');
        if (actionA && actionB) return { linked: true, reason: 'même noyau métier « contrôle/suivi de l’utilisation des caisses-écoles »' };
    }
    const inter = [...a].filter(x => b.has(x));
    const union = new Set([...a, ...b]);
    const jaccard = union.size ? inter.length / union.size : 0;
    if (inter.length >= 3 && jaccard >= 0.48) return { linked: true, reason: `fort recouvrement conceptuel (${Math.round(jaccard*100)} %)` };
    return { linked: false, reason: '' };
}

function inferFrenchSemanticTheme(items) {
    const values = (items || []).map(x => normalizeFrenchSemanticText(x)).filter(Boolean);
    const keys = values.map(normalizeFrenchSemanticKey);
    if (keys.length && keys.every(k => /caiss/.test(k) && /ecol/.test(k))) {
        return 'Contrôle, suivi et utilisation des caisses-écoles';
    }
    if (keys.length && keys.every(k => /encadr/.test(k) && /pedagog/.test(k))) {
        return 'Encadrement pédagogique';
    }
    const freq = new Map();
    values.forEach(value => {
        semanticCanonicalTokens(value).forEach(t => {
            if (t.includes('_')) return;
            freq.set(t, (freq.get(t) || 0) + 1);
        });
    });
    const top = [...freq.entries()]
        .sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0], 'fr'))
        .filter(([,count]) => count >= Math.max(1, Math.ceil(values.length * 0.35)))
        .slice(0, 5)
        .map(([token]) => token.replace(/_/g, ' '));
    if (top.length) return top.map((t,i) => i ? t : t.charAt(0).toUpperCase()+t.slice(1)).join(' · ');
    const representative = values.slice().sort((a,b) => a.length-b.length)[0] || 'Thématique sémantique';
    return representative.length > 84 ? representative.slice(0, 81) + '…' : representative;
}

function localTfidfEmbeddings(texts) {
    const docs = texts.map(text => [...semanticCanonicalTokens(text)]);
    const vocab = [...new Set(docs.flat())];
    const df = new Map(vocab.map(t => [t, docs.filter(d => d.includes(t)).length]));
    return docs.map(doc => {
        const counts = new Map(); doc.forEach(t => counts.set(t, (counts.get(t)||0)+1));
        const vec = vocab.map(t => {
            const tf = (counts.get(t)||0) / Math.max(1, doc.length);
            const idf = Math.log((texts.length + 1) / ((df.get(t)||0) + 1)) + 1;
            return tf * idf;
        });
        const norm = Math.sqrt(vec.reduce((s,x)=>s+x*x,0)) || 1;
        return vec.map(x => x/norm);
    });
}

window.getSharedSentenceBertExtractor = function(progressCallback) {
    if (!sharedSentenceBertExtractorPromise) {
        sharedSentenceBertExtractorPromise = pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', {
            progress_callback: progressCallback || (() => {})
        }).catch(error => {
            sharedSentenceBertExtractorPromise = null;
            throw error;
        });
    }
    return sharedSentenceBertExtractorPromise;
};

window.clusterTextsWithSentenceBert = async function(rawTexts, options = {}) {
    const threshold = Math.max(0.30, Math.min(0.95, Number(options.threshold ?? 0.58)));
    const uniqueTexts = [...new Set((rawTexts || []).map(x => String(x || '').trim()).filter(Boolean))];
    const normalizedTexts = uniqueTexts.map(normalizeFrenchSemanticText);
    const cacheKey = `${threshold.toFixed(3)}::${uniqueTexts.slice().sort((a,b)=>a.localeCompare(b,'fr')).join('\u241E')}`;
    if (sharedSentenceBertClusterCache.has(cacheKey) && !options.force) return sharedSentenceBertClusterCache.get(cacheKey);
    if (!uniqueTexts.length) return { clusters: [], pairSimilarities: [], threshold, engine: 'Sentence-BERT', model: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2' };

    let embeddings, engine = 'Sentence-BERT', model = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', fallbackReason = '';
    try {
        const extractor = await window.getSharedSentenceBertExtractor(options.progressCallback);
        const output = await extractor(normalizedTexts, { pooling: 'mean', normalize: true });
        embeddings = output.tolist();
        if (normalizedTexts.length === 1 && !Array.isArray(embeddings[0])) embeddings = [embeddings];
    } catch (error) {
        if (options.allowFallback === false) throw error;
        embeddings = localTfidfEmbeddings(normalizedTexts);
        engine = 'Secours sémantique local TF-IDF + règles métier';
        model = 'local';
        fallbackReason = error?.message || String(error);
    }

    const n = uniqueTexts.length;
    const parent = Array.from({length:n}, (_,i)=>i);
    const find = i => { while(parent[i]!==i){ parent[i]=parent[parent[i]]; i=parent[i]; } return i; };
    const union = (a,b) => { a=find(a); b=find(b); if(a!==b) parent[b]=a; };
    const pairSimilarities = [];
    for (let i=0;i<n;i++) {
        for (let j=i+1;j<n;j++) {
            const cosine = cosineSimilarity(embeddings[i], embeddings[j]);
            const bridge = semanticDomainBridge(uniqueTexts[i], uniqueTexts[j]);
            const lexical = (() => {
                const a=semanticCanonicalTokens(uniqueTexts[i]), b=semanticCanonicalTokens(uniqueTexts[j]);
                const inter=[...a].filter(x=>b.has(x)).length, uni=new Set([...a,...b]).size;
                return uni ? inter/uni : 0;
            })();
            const linkedBySbert = cosine >= threshold;
            const linkedByBridge = bridge.linked && cosine >= Math.max(0.28, threshold - 0.28);
            const linkedByHybrid = !bridge.linked && lexical >= 0.62 && cosine >= Math.max(0.35, threshold - 0.18);
            const linked = linkedBySbert || linkedByBridge || linkedByHybrid;
            let reason = linkedBySbert ? 'Sentence-BERT' : (linkedByBridge ? `Sentence-BERT + consolidation métier : ${bridge.reason}` : (linkedByHybrid ? 'Sentence-BERT + recouvrement conceptuel' : ''));
            pairSimilarities.push({ a: uniqueTexts[i], b: uniqueTexts[j], similarity: cosine, lexicalSimilarity: lexical, linked, reason });
            if (linked) union(i,j);
        }
    }

    const groups = new Map();
    for (let i=0;i<n;i++) { const r=find(i); if(!groups.has(r)) groups.set(r,[]); groups.get(r).push(i); }
    const clusters = [...groups.values()].map((indices, idx) => {
        let representativeIndex = indices[0], bestMean = -Infinity;
        indices.forEach(i => {
            const sims = indices.filter(j=>j!==i).map(j=>cosineSimilarity(embeddings[i],embeddings[j]));
            const mean = sims.length ? sims.reduce((s,x)=>s+x,0)/sims.length : 1;
            if (mean > bestMean) { bestMean = mean; representativeIndex = i; }
        });
        const representative = uniqueTexts[representativeIndex];
        const members = indices.map(i => ({
            text: uniqueTexts[i],
            normalizedText: normalizedTexts[i],
            similarityToRepresentative: i===representativeIndex ? 1 : cosineSimilarity(embeddings[i], embeddings[representativeIndex])
        })).sort((a,b)=>b.similarityToRepresentative-a.similarityToRepresentative || a.text.localeCompare(b.text,'fr'));
        const cohesionValues = [];
        for(let a=0;a<indices.length;a++) for(let b=a+1;b<indices.length;b++) cohesionValues.push(cosineSimilarity(embeddings[indices[a]], embeddings[indices[b]]));
        return {
            id: `semantic-${idx+1}`,
            theme: inferFrenchSemanticTheme(indices.map(i=>uniqueTexts[i])),
            representative,
            items: members,
            cohesion: cohesionValues.length ? cohesionValues.reduce((s,x)=>s+x,0)/cohesionValues.length : 1,
            minSimilarity: cohesionValues.length ? Math.min(...cohesionValues) : 1,
            maxSimilarity: cohesionValues.length ? Math.max(...cohesionValues) : 1
        };
    }).sort((a,b)=>b.items.length-a.items.length || a.theme.localeCompare(b.theme,'fr'));
    clusters.forEach((cluster,index)=>cluster.id=`semantic-${index+1}`);

    const result = { clusters, pairSimilarities, threshold, engine, model, fallbackReason };
    sharedSentenceBertClusterCache.set(cacheKey, result);
    return result;
};

function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) { dotProduct += vecA[i] * vecB[i]; normA += vecA[i] * vecA[i]; normB += vecB[i] * vecB[i]; }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function clusterActivities(activities, extractor) {
    if(activities.length === 0) return [];
    let output = await extractor(activities, { pooling: 'mean', normalize: true });
    let embeddings = output.tolist();
    if (activities.length === 1 && !Array.isArray(embeddings[0])) embeddings = [embeddings];

    let clusters = [];
    let threshold = 0.75; 

    for(let i = 0; i < activities.length; i++) {
        let assigned = false;
        for(let c of clusters) {
            let sim = cosineSimilarity(embeddings[i], c.centroid);
            if(sim > threshold) {
                c.items.push(activities[i]);
                for(let d=0; d<c.centroid.length; d++) { c.centroid[d] = (c.centroid[d] * (c.items.length - 1) + embeddings[i][d]) / c.items.length; }
                assigned = true; break;
            }
        }
        if(!assigned) clusters.push({ centroid: [...embeddings[i]], items: [activities[i]] });
    }
    clusters.sort((a,b) => b.items.length - a.items.length);
    return clusters;
}

function renderSemanticChart(clusters, canvasId, containerId) {
    if (clusters.length === 0) return;
    document.getElementById(containerId).style.display = 'block';
    let ctx = document.getElementById(canvasId).getContext('2d');
    if (window.semanticChartsRefs && window.semanticChartsRefs[canvasId]) window.semanticChartsRefs[canvasId].destroy();

    let labels = clusters.map((_, i) => 'Thématique ' + (i + 1));
    let data = clusters.map(c => c.items.length);
    let bgColors = clusters.map(c => c.items.length > 5 ? 'rgba(25, 135, 84, 0.7)' : (c.items.length > 2 ? 'rgba(13, 110, 253, 0.7)' : 'rgba(108, 117, 125, 0.7)'));
    let bdColors = clusters.map(c => c.items.length > 5 ? 'rgba(25, 135, 84, 1)' : (c.items.length > 2 ? 'rgba(13, 110, 253, 1)' : 'rgba(108, 117, 125, 1)'));

    if(!window.semanticChartsRefs) window.semanticChartsRefs = {};
    window.semanticChartsRefs[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: [{ label: 'Formulations uniques par thématique', data: data, backgroundColor: bgColors, borderColor: bdColors, borderWidth: 1, borderRadius: 5 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }, plugins: { legend: { display: false } } }
    });
}

function renderSemanticClusters(clusters, containerId, titlePrefix) {
    let container = document.getElementById(containerId);
    if(clusters.length === 0) { container.innerHTML = `<div class="col-12 text-center text-muted py-3">Aucune donnée trouvée pour ${titlePrefix}.</div>`; return; }

    let html = '';
    clusters.forEach((c, index) => {
        let badgeClass = c.items.length > 5 ? 'bg-success' : (c.items.length > 2 ? 'bg-primary' : 'bg-secondary');
        html += `
            <div class="col-md-4 mb-4">
                <div class="card shadow-sm h-100 border" style="border-left: 4px solid #d35400;">
                    <div class="card-header bg-light fw-bold text-semantic d-flex justify-content-between align-items-center">
                        Thématique ${index + 1} <span class="badge ${badgeClass} rounded-pill">${c.items.length}</span>
                    </div>
                    <ul class="list-group list-group-flush" style="max-height: 250px; overflow-y: auto; font-size: 0.9rem;">
        `;
        c.items.forEach(item => { html += `<li class="list-group-item"><i class="fas fa-angle-right text-muted me-2"></i> ${item}</li>`; });
        html += `</ul></div></div>`;
    });
    container.innerHTML = html;
}

// === FONCTION : ANALYSE SÉMANTIQUE ===
async function runSemanticAnalysis() {
    if(typeof allData === 'undefined' || allData.length === 0) { alert("Veuillez d'abord attendre le chargement des données KoboToolbox."); return; }
    window.globalSemanticResults = {};
    $('#semantic-progress-container').show(); $('#semantic-status').text("Initialisation du modèle NLP d'analyse sémantique..."); $('#semantic-progress-bar').css('width', '5%').text('5%');

    try {
        let extractor = await window.getSharedSentenceBertExtractor(x => { if (x.status === 'progress') { let p = Math.round(x.progress); $('#semantic-progress-bar').css('width', p + '%').text(p + '%'); } });
        $('#semantic-progress-bar').css('width', '100%').text('Modèle chargé ! Traitement en cours...');

        const tasks = [
            { textKey: 'activiteDren', resId: 'res-act-dren', chartId: 'semanticChart-act-dren', chartCont: 'chart-container-act-dren', name: 'Activités DREN' },
            { textKey: 'activiteCisco', resId: 'res-act-cisco', chartId: 'semanticChart-act-cisco', chartCont: 'chart-container-act-cisco', name: 'Activités CISCO' },
            { textKey: 'activiteZap', resId: 'res-act-zap', chartId: 'semanticChart-act-zap', chartCont: 'chart-container-act-zap', name: 'Activités ZAP' },
            { textKey: 'produitDren', resId: 'res-prod-dren', chartId: 'semanticChart-prod-dren', chartCont: 'chart-container-prod-dren', name: 'Produits DREN' },
            { textKey: 'produitCisco', resId: 'res-prod-cisco', chartId: 'semanticChart-prod-cisco', chartCont: 'chart-container-prod-cisco', name: 'Produits CISCO' },
            { textKey: 'produitZap', resId: 'res-prod-zap', chartId: 'semanticChart-prod-zap', chartCont: 'chart-container-prod-zap', name: 'Produits ZAP' },
            { textKey: 'sousActiviteDren', resId: 'res-sact-dren', chartId: 'semanticChart-sact-dren', chartCont: 'chart-container-sact-dren', name: 'Sous-activités DREN' },
            { textKey: 'sousActiviteCisco', resId: 'res-sact-cisco', chartId: 'semanticChart-sact-cisco', chartCont: 'chart-container-sact-cisco', name: 'Sous-activités CISCO' },
            { textKey: 'sousActiviteZap', resId: 'res-sact-zap', chartId: 'semanticChart-sact-zap', chartCont: 'chart-container-sact-zap', name: 'Sous-activités ZAP' },
            { textKey: 'sousProduitDren', resId: 'res-sprod-dren', chartId: 'semanticChart-sprod-dren', chartCont: 'chart-container-sprod-dren', name: 'Sous-produits DREN' },
            { textKey: 'sousProduitCisco', resId: 'res-sprod-cisco', chartId: 'semanticChart-sprod-cisco', chartCont: 'chart-container-sprod-cisco', name: 'Sous-produits CISCO' },
            { textKey: 'sousProduitZap', resId: 'res-sprod-zap', chartId: 'semanticChart-sprod-zap', chartCont: 'chart-container-sprod-zap', name: 'Sous-produits ZAP' }
        ];

        for(let task of tasks) {
            $('#semantic-status').text(`Analyse Sémantique : ${task.name}...`);
            let col = window.baseColsInfo.find(c => c.key === task.textKey);
            if(col) {
                let texts = allData.map(r => window.cleanSpaces ? window.cleanSpaces(window.getKoboValue(r, col.matches, col.ex, col.mustMatch)) : '').filter(t => t && t !== 'Non renseigné');
                let uniqueTexts = [...new Set(texts)];
                if(uniqueTexts.length > 0) {
                    let clusters = await clusterActivities(uniqueTexts, extractor);
                    window.globalSemanticResults[task.name] = clusters;
                    renderSemanticChart(clusters, task.chartId, task.chartCont);
                    renderSemanticClusters(clusters, task.resId, task.name);
                } else {
                    document.getElementById(task.resId).innerHTML = `<div class="col-12 text-center text-muted py-3">Aucune donnée pour ${task.name}</div>`;
                }
            }
        }
        $('#semantic-status').text("✅ Analyse sémantique terminée avec succès !");
        setTimeout(() => $('#semantic-progress-container').hide(), 5000);
    } catch(e) { $('#semantic-status').html(`<span class="text-danger"><i class="fas fa-exclamation-triangle"></i> Erreur lors de l'analyse : ${e.message}</span>`); }
}

// === FILTRES DES DATES DE REALISATION OM POUR LA CONSOLIDATION ===
function getSoumissionsOmFilterCriteria() {
    return {
        start: document.getElementById('soumissions-date-debut-om-missionnaire')?.value || '',
        end: document.getElementById('soumissions-date-fin-om-missionnaire')?.value || ''
    };
}

function getSoumissionsFilteredSourceData() {
    const criteria = getSoumissionsOmFilterCriteria();
    if (criteria.start && criteria.end && criteria.start > criteria.end) {
        throw new Error('La date de début OM doit être antérieure ou égale à la date de fin OM.');
    }
    const source = Array.isArray(allData) ? allData : [];
    const filtered = source.filter(row => {
        if (typeof window.rowMatchesOmMissionDateRange === 'function') {
            return window.rowMatchesOmMissionDateRange(row, criteria.start, criteria.end);
        }
        return true;
    });
    return { criteria, filtered, total: source.length };
}

function formatOmDateForConsolidation(date) {
    if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

// === FONCTION : CONSOLIDATION (DOUBLONS) ===
async function runSoumissionsAnalysis() {
    if(typeof allData === 'undefined' || allData.length === 0) { alert("Veuillez d'abord attendre le chargement des données."); return; }
    let sourceContext;
    try {
        sourceContext = getSoumissionsFilteredSourceData();
    } catch (filterError) {
        alert(filterError.message);
        return;
    }
    if (!sourceContext.filtered.length) {
        alert("Aucune soumission ne correspond aux dates de réalisation OM sélectionnées.");
        return;
    }
    window.globalSoumissionsResults = {};
    window.globalSoumissionsFilterCriteria = {
        "Date debut realisation dans om missionnaire": sourceContext.criteria.start || "Toutes",
        "Date fin realisation dans om missionnaire": sourceContext.criteria.end || "Toutes",
        "Soumissions retenues": sourceContext.filtered.length,
        "Soumissions disponibles": sourceContext.total
    };
    $('#cons-progress-container').show();
    $('#cons-status').text("Initialisation de l'IA de consolidation — " + sourceContext.filtered.length + " soumission(s) retenue(s) sur " + sourceContext.total + "...");
    $('#cons-progress-bar').css('width', '5%').text('5%');

    try {
        let extractor = await window.getSharedSentenceBertExtractor(x => { if (x.status === 'progress') { let p = Math.round(x.progress); $('#cons-progress-bar').css('width', p + '%').text(p + '%'); } });
        $('#cons-progress-bar').css('width', '100%').text('Modèle chargé !');

        const consTasks = [
            { textKey: 'sousActiviteDren', entityKey: 'dren', resId: 'res-cons-act-dren', name: 'Activités DREN' },
            { textKey: 'sousActiviteCisco', entityKey: 'cisco', resId: 'res-cons-act-cisco', name: 'Activités CISCO' },
            { textKey: 'sousActiviteZap', entityKey: 'zap', resId: 'res-cons-act-zap', name: 'Activités ZAP' },
            { textKey: 'produitDren', entityKey: 'dren', resId: 'res-cons-prod-dren', name: 'Produits DREN' },
            { textKey: 'produitCisco', entityKey: 'cisco', resId: 'res-cons-prod-cisco', name: 'Produits CISCO' },
            { textKey: 'produitZap', entityKey: 'zap', resId: 'res-cons-prod-zap', name: 'Produits ZAP' },
            { textKey: 'sousActiviteDren', entityKey: 'dren', resId: 'res-cons-sact-dren', name: 'Sous-activités DREN' },
            { textKey: 'sousActiviteCisco', entityKey: 'cisco', resId: 'res-cons-sact-cisco', name: 'Sous-activités CISCO' },
            { textKey: 'sousActiviteZap', entityKey: 'zap', resId: 'res-cons-sact-zap', name: 'Sous-activités ZAP' },
            { textKey: 'sousProduitDren', entityKey: 'dren', resId: 'res-cons-sprod-dren', name: 'Sous-produits DREN' },
            { textKey: 'sousProduitCisco', entityKey: 'cisco', resId: 'res-cons-sprod-cisco', name: 'Sous-produits CISCO' },
            { textKey: 'sousProduitZap', entityKey: 'zap', resId: 'res-cons-sprod-zap', name: 'Sous-produits ZAP' }
        ];

        for(let task of consTasks) {
            $('#cons-status').text(`Analyse des soumissions en cours : ${task.name}...`);
            let colText = window.baseColsInfo.find(c => c.key === task.textKey);
            let colEntity = window.baseColsInfo.find(c => c.key === task.entityKey);
            
            if(colText && colEntity) {
                let map = {};
                sourceContext.filtered.forEach(r => {
                    let text = window.cleanSpaces ? window.cleanSpaces(window.getKoboValue(r, colText.matches, colText.ex, colText.mustMatch)) : '';
                    let entity = window.cleanSpaces ? window.cleanSpaces(window.getKoboValue(r, colEntity.matches, colEntity.ex, colEntity.mustMatch)) : '';
                    
                    if (text && text !== 'Non renseigné') {
                        let e = (entity && entity !== 'Non renseigné') ? entity : 'Inconnue';
                        let subDate = r['_submission_time'] ? r['_submission_time'] : 'Date inconnue';
                        
                        let valDren = window.cleanSpaces(window.getKoboValue(r, ['dren'], ['activite', 'produit', 'budget', 'cisco', 'zap', 'sous'], []));
                        let valCisco = window.cleanSpaces(window.getKoboValue(r, ['cisco'], ['activite', 'produit', 'budget', 'dren', 'zap', 'sous'], []));
                        let valZap = window.cleanSpaces(window.getKoboValue(r, ['zap'], ['activite', 'produit', 'budget', 'dren', 'cisco', 'sous'], []));
                        let valAct = window.cleanSpaces(window.getKoboValue(r, ['activite', 'activité'], ['sous_activite', 'sous-activite'], []));
                        let valProd = window.cleanSpaces(window.getKoboValue(r, ['produit'], ['sous_produit', 'sous-produit'], []));
                        let valSAct = window.cleanSpaces(window.getKoboValue(r, ['sous_activite', 'sous-activite'], [], []));
                        
                        let valMatriculesRaw = window.extractMatricules(r);
                        let matsArray = valMatriculesRaw ? valMatriculesRaw.split(';').map(m => m.trim()).filter(Boolean) : ["Non renseigné"];

                        matsArray.forEach(singleMatricule => {
                            let rowSignature = [valDren, valCisco, valZap, valAct, valProd, valSAct, singleMatricule].join("|||");
                            let key = text + "|||" + e + "|||" + rowSignature;
                            if (!map[key]) map[key] = { text: text, entity: e, matricule: singleMatricule, count: 0, dates: [], omStarts: [], omEnds: [] };
                            map[key].count++;
                            map[key].dates.push(subDate);
                            const omRange = typeof window.getOmMissionDateRange === 'function' ? window.getOmMissionDateRange(r) : { start: null, end: null };
                            const omStartText = formatOmDateForConsolidation(omRange.start);
                            const omEndText = formatOmDateForConsolidation(omRange.end);
                            if (omStartText && !map[key].omStarts.includes(omStartText)) map[key].omStarts.push(omStartText);
                            if (omEndText && !map[key].omEnds.includes(omEndText)) map[key].omEnds.push(omEndText);
                        });
                    }
                });
                
                let items = Object.values(map);
                let uniqueTexts = [...new Set(items.map(i => i.text))];
                
                if (uniqueTexts.length > 0) {
                    let clusters = await clusterActivities(uniqueTexts, extractor);
                    let tableData = [];
                    clusters.forEach((c, index) => {
                        let themeName = "Thématique " + (index + 1);
                        c.items.forEach(txt => {
                            let matchingItems = items.filter(i => i.text === txt);
                            matchingItems.forEach(mi => { tableData.push({ theme: themeName, text: mi.text, entity: mi.entity, matricule: mi.matricule, count: mi.count, dates: mi.dates, omStarts: mi.omStarts || [], omEnds: mi.omEnds || [] }); });
                        });
                    });
                    tableData.sort((a, b) => { if (a.theme !== b.theme) return a.theme.localeCompare(b.theme, undefined, {numeric: true}); return b.count - a.count; });
                    window.globalSoumissionsResults[task.name] = tableData;
                    renderSoumissionsTable(tableData, task.resId, task.name);
                } else {
                    renderSoumissionsTable([], task.resId, task.name);
                }
            }
        }
        $('#cons-status').text("✅ Analyse terminée : " + sourceContext.filtered.length + " soumission(s) analysée(s) sur " + sourceContext.total + ", selon les dates OM sélectionnées.");
        if (window.filterSoumissionsTables) window.filterSoumissionsTables(); 
        setTimeout(() => $('#cons-progress-container').hide(), 5000);
    } catch(e) { $('#cons-status').html(`<span class="text-danger"><i class="fas fa-exclamation-triangle"></i> Erreur lors de l'analyse : ${e.message}</span>`); }
}

function renderSoumissionsTable(data, containerId, title) {
    let container = document.getElementById(containerId);
    if (data.length === 0) { container.innerHTML = `<div class="col-12 text-center text-muted py-5"><i class="fas fa-box-open fa-2x mb-3"></i><br>Aucune donnée pour ${title}</div>`; return; }
    let html = `<h4 class="mb-3 mt-4" style="color: #16a085;">${title}</h4><div class="table-responsive border"><table class="table table-bordered table-hover align-middle mb-0"><thead style="background-color: #16a085; color: white; position: sticky; top: 0; z-index: 5;"><tr><th>Thématique</th><th>Formulation (Texte)</th><th>Entité (DREN, CISCO, ZAP)</th><th>Matricule / CIN</th><th>Occurrences Formulation</th><th>Statut de la Soumission</th><th>Date debut realisation dans om missionnaire</th><th>Date fin realisation dans om missionnaire</th><th>DATE DE SOUMISSION dans Kobotoolbox</th></tr></thead><tbody class="soumission-tbody">`;
    data.forEach(row => {
        let isDoublon = row.count > 1 && row.entity !== 'Inconnue';
        let trClass = isDoublon ? 'table-warning' : 'tr-correct';
        let alertBadge = isDoublon ? `<span class="badge bg-danger shadow-sm"><i class="fas fa-exclamation-triangle"></i> DOUBLON (${row.count} envois)</span>` : `<span class="badge bg-success shadow-sm"><i class="fas fa-check"></i> CORRECT (1 envoi)</span>`;
        html += `<tr class="${trClass}" data-search="${window.cleanSpaces ? window.cleanSpaces(row.text + ' ' + row.entity + ' ' + (row.omStarts || []).join(' ') + ' ' + (row.omEnds || []).join(' ')).toLowerCase() : ''}"><td class="text-center"><span class="badge bg-secondary">${row.theme}</span></td><td class="text-start">${row.text}</td><td class="text-center fw-bold ${isDoublon ? 'text-danger' : 'text-secondary'}">${row.entity}</td><td class="text-center"><span class="badge bg-info text-dark">${row.matricule}</span></td><td class="text-center"><span class="badge bg-primary fs-6">${row.count}</span></td><td class="text-center">${alertBadge}</td><td class="text-center" style="font-size:0.85rem;">${(row.omStarts || []).join(' ; ') || '<span class="text-muted">Non renseignée</span>'}</td><td class="text-center" style="font-size:0.85rem;">${(row.omEnds || []).join(' ; ') || '<span class="text-muted">Non renseignée</span>'}</td><td class="text-center" style="font-size: 0.85rem;">${row.dates.join(' ; ')}</td></tr>`;
    });
    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

// ---------------- FONCTIONS EXPORTATIONS SÉMANTIQUE ET CONSOLIDATION ----------------
window.getSemanticExportData = function() {
    let flatData = [];
    for (const [title, clusters] of Object.entries(window.globalSemanticResults)) {
        clusters.forEach((c, idx) => {
            let themeName = `Thématique ${idx + 1}`;
            c.items.forEach(item => { flatData.push({ "Catégorie": title, "Thématique": themeName, "Formulation Unique": item }); });
        });
    }
    return flatData;
}

window.exportSemanticToCSV = function(pfx) {
    let data = window.getSemanticExportData(); if (data.length === 0) return alert("Veuillez d'abord lancer l'analyse sémantique.");
    let fn = window.generateFilename ? window.generateFilename(pfx, 'csv') : 'export.csv', csv = [];
    csv.push(`"Catégorie";"Thématique";"Formulation Unique"`);
    data.forEach(row => { csv.push(`"${row['Catégorie']}";"${row['Thématique']}";"${(window.cleanSpaces ? window.cleanSpaces(row['Formulation Unique']) : row['Formulation Unique']).replace(/"/g, '""')}"`); });
    if(window.downloadFile) window.downloadFile(new Blob(["\uFEFF" + csv.join("\n")], {type: "text/csv;charset=utf-8;"}), fn);
}

window.exportSemanticToExcel = function(pfx) {
    let data = window.getSemanticExportData(); if (data.length === 0) return alert("Veuillez d'abord lancer l'analyse sémantique.");
    let fn = window.generateFilename ? window.generateFilename(pfx, 'xlsx') : 'export.xlsx', wsD = [["Catégorie", "Thématique", "Formulation Unique"]];
    data.forEach(row => { wsD.push([row['Catégorie'], row['Thématique'], row['Formulation Unique']]); });
    let wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(wsD); XLSX.utils.book_append_sheet(wb, ws, "Sémantique"); XLSX.writeFile(wb, fn);
}

window.exportSemanticToJSONFile = function(pfx) {
    let data = window.getSemanticExportData(); if (data.length === 0) return alert("Veuillez d'abord lancer l'analyse sémantique.");
    let j = JSON.stringify({ "titre": "Analyse Sémantique", "resultats": data }, null, 2);
    if(window.downloadFile) window.downloadFile(new Blob([j], { type: 'application/json;charset=utf-8;' }), window.generateFilename ? window.generateFilename(pfx, 'json') : 'export.json'); 
}

window.exportSemanticToHTML = function(pfx) {
    let data = window.getSemanticExportData(); if (data.length === 0) return alert("Veuillez d'abord lancer l'analyse sémantique.");
    let h = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px}th{background:#d35400;color:white}</style></head><body><h2>Analyse Sémantique</h2><table><tr><th>Catégorie</th><th>Thématique</th><th>Formulation Unique</th></tr>`;
    data.forEach(r => h += `<tr><td>${r['Catégorie']}</td><td>${r['Thématique']}</td><td>${r['Formulation Unique']}</td></tr>`); h += `</table></body></html>`;
    if(window.downloadFile) window.downloadFile(new Blob([h], { type: 'text/html' }), window.generateFilename ? window.generateFilename(pfx, 'html') : 'export.html');
}

window.sendSemanticToGmail = function() { let d = window.getSemanticExportData(); if (d.length === 0) return alert("Lancez d'abord l'analyse."); navigator.clipboard.writeText(JSON.stringify(d, null, 2)).then(() => { window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=Analyse Sémantique&body=[ COLLER LE JSON ]`, '_blank'); }); }
window.sendSemanticToWhatsApp = function() { let d = window.getSemanticExportData(); if (d.length === 0) return alert("Lancez d'abord l'analyse."); navigator.clipboard.writeText(JSON.stringify(d, null, 2)).then(() => { window.open(`https://wa.me/?text=Analyse Sémantique : [ COLLER LE JSON ]`, '_blank'); }); }

// -- CONSOLIDATION EXPORTS --
window.getSoumissionsExportData = function() {
    let flatData = [];
    for (const [title, tableData] of Object.entries(window.globalSoumissionsResults)) {
        tableData.forEach(row => { flatData.push({ "Catégorie": title, "Thématique": row.theme, "Formulation": row.text, "Entité": row.entity, "Matricule": row.matricule, "Occurrences": row.count, "Date debut realisation dans om missionnaire": (row.omStarts || []).join(', '), "Date fin realisation dans om missionnaire": (row.omEnds || []).join(', '), "Dates de soumission": row.dates.join(', ') }); });
    }
    return flatData;
}

window.exportSoumissionsToCSV = function(pfx) {
    let data = window.getSoumissionsExportData(); if (data.length === 0) return alert("Lancez d'abord la consolidation.");
    let fn = window.generateFilename ? window.generateFilename(pfx, 'csv') : 'export.csv', csv = [`"Catégorie";"Thématique";"Formulation";"Entité";"Matricule";"Occurrences";"Date debut realisation dans om missionnaire";"Date fin realisation dans om missionnaire";"Dates de soumission"`];
    data.forEach(row => { csv.push(`"${row['Catégorie']}";"${row['Thématique']}";"${row['Formulation'].replace(/"/g, '""')}";"${row['Entité']}";"${row['Matricule']}";"${row['Occurrences']}";"${row['Date debut realisation dans om missionnaire']}";"${row['Date fin realisation dans om missionnaire']}";"${row['Dates de soumission']}"`); });
    if(window.downloadFile) window.downloadFile(new Blob(["\uFEFF" + csv.join("\n")], {type: "text/csv;charset=utf-8;"}), fn);
}

window.exportSoumissionsToExcel = function(pfx) {
    let data = window.getSoumissionsExportData(); if (data.length === 0) return alert("Lancez d'abord la consolidation.");
    let fn = window.generateFilename ? window.generateFilename(pfx, 'xlsx') : 'export.xlsx', wsD = [["Catégorie", "Thématique", "Formulation", "Entité", "Matricule", "Occurrences", "Date debut realisation dans om missionnaire", "Date fin realisation dans om missionnaire", "Dates de soumission"]];
    data.forEach(row => { wsD.push([row['Catégorie'], row['Thématique'], row['Formulation'], row['Entité'], row['Matricule'], row['Occurrences'], row['Date debut realisation dans om missionnaire'], row['Date fin realisation dans om missionnaire'], row['Dates de soumission']]); });
    let wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(wsD); XLSX.utils.book_append_sheet(wb, ws, "Consolidation"); XLSX.writeFile(wb, fn);
}

window.exportSoumissionsToJSONFile = function(pfx) {
    let data = window.getSoumissionsExportData(); if (data.length === 0) return alert("Lancez d'abord la consolidation.");
    let j = JSON.stringify({ "titre": "Consolidation Soumissions", "criteres": window.globalSoumissionsFilterCriteria || {}, "resultats": data }, null, 2);
    if(window.downloadFile) window.downloadFile(new Blob([j], { type: 'application/json;charset=utf-8;' }), window.generateFilename ? window.generateFilename(pfx, 'json') : 'export.json'); 
}

window.exportSoumissionsToHTML = function(pfx) {
    let data = window.getSoumissionsExportData(); if (data.length === 0) return alert("Lancez d'abord la consolidation.");
    let h = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px}th{background:#16a085;color:white}</style></head><body><h2>Consolidation Soumissions</h2><table><tr><th>Catégorie</th><th>Thématique</th><th>Formulation</th><th>Entité</th><th>Matricule</th><th>Occurrences</th><th>Date début OM</th><th>Date fin OM</th><th>Dates de soumission</th></tr>`;
    data.forEach(r => h += `<tr><td>${r['Catégorie']}</td><td>${r['Thématique']}</td><td>${r['Formulation']}</td><td>${r['Entité']}</td><td>${r['Matricule']}</td><td>${r['Occurrences']}</td><td>${r['Date debut realisation dans om missionnaire']}</td><td>${r['Date fin realisation dans om missionnaire']}</td><td>${r['Dates de soumission']}</td></tr>`); h += `</table></body></html>`;
    if(window.downloadFile) window.downloadFile(new Blob([h], { type: 'text/html' }), window.generateFilename ? window.generateFilename(pfx, 'html') : 'export.html');
}

window.sendSoumissionsToGmail = function() { let d = window.getSoumissionsExportData(); if (d.length === 0) return alert("Lancez l'analyse."); navigator.clipboard.writeText(JSON.stringify(d, null, 2)).then(() => { window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=Consolidation&body=[ COLLER LE JSON ]`, '_blank'); }); }
window.sendSoumissionsToWhatsApp = function() { let d = window.getSoumissionsExportData(); if (d.length === 0) return alert("Lancez l'analyse."); navigator.clipboard.writeText(JSON.stringify(d, null, 2)).then(() => { window.open(`https://wa.me/?text=Consolidation : [ COLLER LE JSON ]`, '_blank'); }); }

// ---------------- ATTACHEMENT SÉCURISÉ DES ÉVÉNEMENTS ----------------
function attachListeners() {
    const btnSemantic = document.getElementById('btn-run-semantic');
    if (btnSemantic) {
        btnSemantic.addEventListener('click', runSemanticAnalysis);
    }

    const btnSoumissions = document.getElementById('btn-run-soumissions');
    if (btnSoumissions) {
        btnSoumissions.addEventListener('click', runSoumissionsAnalysis);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachListeners);
} else {
    attachListeners();
}
