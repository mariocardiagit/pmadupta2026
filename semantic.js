import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.16.0';

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
        let extractor = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', {
            progress_callback: x => { if (x.status === 'progress') { let p = Math.round(x.progress); $('#semantic-progress-bar').css('width', p + '%').text(p + '%'); } }
        });
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


function getConsolidationDuplicateStatus(rowIndexes, duplicateAnalysis, matricule) {
    const details = [];
    const issues = [];
    (rowIndexes || []).forEach(rowIndex => {
        (duplicateAnalysis?.rowToDuplicateDetails?.[rowIndex] || []).forEach(detail => details.push(detail));
        (duplicateAnalysis?.rowToIssues?.[rowIndex] || []).forEach(issue => issues.push(issue));
    });

    const targetMatricule = String(matricule || '').replace(/[\s.-]/g, '');
    const relevantDetails = targetMatricule
        ? details.filter(detail => String(detail.matricule || '').replace(/[\s.-]/g, '') === targetMatricule)
        : details;
    const uniqueDetails = [];
    const detailKeys = new Set();
    relevantDetails.forEach(detail => {
        const key = `${detail.id}|${detail.matricule}|${detail.overlapText}`;
        if (!detailKeys.has(key)) { detailKeys.add(key); uniqueDetails.push(detail); }
    });
    const uniqueIssues = [...new Set(issues)];

    if (uniqueDetails.length) {
        return {
            code: 'duplicate',
            label: 'DOUBLON — périodes chevauchantes',
            overlapText: uniqueDetails.map(detail => `${detail.id} : ${detail.overlapText}`).join(' ; '),
            details: uniqueDetails,
            issues: uniqueIssues
        };
    }
    if (uniqueIssues.some(issue => issue.startsWith('ANOMALIE DE DATE'))) {
        return { code: 'date-anomaly', label: 'ANOMALIE DE DATE', overlapText: '', details: [], issues: uniqueIssues };
    }
    if (uniqueIssues.length) {
        return { code: 'unverifiable', label: 'VÉRIFICATION IMPOSSIBLE', overlapText: '', details: [], issues: uniqueIssues };
    }
    return { code: 'distinct', label: 'MISSION DISTINCTE', overlapText: 'Aucun chevauchement inclusif détecté', details: [], issues: [] };
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
        let extractor = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', {
            progress_callback: x => { if (x.status === 'progress') { let p = Math.round(x.progress); $('#cons-progress-bar').css('width', p + '%').text(p + '%'); } }
        });
        $('#cons-progress-bar').css('width', '100%').text('Modèle chargé !');

        if (typeof window.buildMissionnaireDuplicateAnalysis !== 'function') {
            throw new Error('Le moteur de détection des doublons par chevauchement OM missionnaire est indisponible.');
        }
        const duplicateAnalysis = window.buildMissionnaireDuplicateAnalysis(sourceContext.filtered);
        window.globalMissionnaireDuplicateAnalysis = duplicateAnalysis;

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

                sourceContext.filtered.forEach((r, rowIndex) => {
                    let text = window.cleanSpaces ? window.cleanSpaces(window.getKoboValue(r, colText.matches, colText.ex, colText.mustMatch)) : '';
                    let entity = window.cleanSpaces ? window.cleanSpaces(window.getKoboValue(r, colEntity.matches, colEntity.ex, colEntity.mustMatch)) : '';
                    if (!text || text === 'Non renseigné') return;

                    let e = (entity && entity !== 'Non renseigné') ? entity : 'Inconnue';
                    let subDate = r['_submission_time'] ? r['_submission_time'] : 'Date inconnue';
                    let valDren = window.cleanSpaces(window.getKoboValue(r, ['dren'], ['activite', 'produit', 'budget', 'cisco', 'zap', 'sous'], []));
                    let valCisco = window.cleanSpaces(window.getKoboValue(r, ['cisco'], ['activite', 'produit', 'budget', 'dren', 'zap', 'sous'], []));
                    let valZap = window.cleanSpaces(window.getKoboValue(r, ['zap'], ['activite', 'produit', 'budget', 'dren', 'cisco', 'sous'], []));
                    let valAct = window.cleanSpaces(window.getKoboValue(r, ['activite', 'activité'], ['sous_activite', 'sous-activite'], []));
                    let valProd = window.cleanSpaces(window.getKoboValue(r, ['produit'], ['sous_produit', 'sous-produit'], []));
                    let valSAct = window.cleanSpaces(window.getKoboValue(r, ['sous_activite', 'sous-activite'], [], []));

                    let assignments = typeof window.extractOmMissionnaireAssignments === 'function'
                        ? window.extractOmMissionnaireAssignments(r)
                        : [];
                    if (!assignments.length) {
                        let matsRaw = window.extractMatricules(r);
                        let matsArray = matsRaw ? matsRaw.split(';').map(m => m.trim()).filter(Boolean) : [''];
                        const omRange = typeof window.getOmMissionDateRange === 'function' ? window.getOmMissionDateRange(r) : { start: null, end: null };
                        assignments = matsArray.map(matricule => ({ matricule, start: omRange.start, end: omRange.end }));
                    }

                    assignments.forEach(assignment => {
                        const singleMatricule = assignment.matricule || 'Non renseigné';
                        let rowSignature = [valDren, valCisco, valZap, valAct, valProd, valSAct, singleMatricule].join('|||');
                        let key = text + '|||' + e + '|||' + rowSignature;
                        if (!map[key]) map[key] = {
                            text,
                            entity: e,
                            matricule: singleMatricule,
                            count: 0,
                            dates: [],
                            omStarts: [],
                            omEnds: [],
                            rowIndexes: []
                        };
                        map[key].count++;
                        map[key].dates.push(subDate);
                        if (!map[key].rowIndexes.includes(rowIndex)) map[key].rowIndexes.push(rowIndex);
                        const omStartText = formatOmDateForConsolidation(assignment.start);
                        const omEndText = formatOmDateForConsolidation(assignment.end);
                        if (omStartText && !map[key].omStarts.includes(omStartText)) map[key].omStarts.push(omStartText);
                        if (omEndText && !map[key].omEnds.includes(omEndText)) map[key].omEnds.push(omEndText);
                    });
                });

                let items = Object.values(map).map(item => {
                    const duplicateStatus = getConsolidationDuplicateStatus(item.rowIndexes, duplicateAnalysis, item.matricule);
                    return { ...item, ...duplicateStatus };
                });
                let uniqueTexts = [...new Set(items.map(i => i.text))];
                
                if (uniqueTexts.length > 0) {
                    let clusters = await clusterActivities(uniqueTexts, extractor);
                    let tableData = [];
                    clusters.forEach((c, index) => {
                        let themeName = "Thématique " + (index + 1);
                        c.items.forEach(txt => {
                            let matchingItems = items.filter(i => i.text === txt);
                            matchingItems.forEach(mi => { tableData.push({ theme: themeName, text: mi.text, entity: mi.entity, matricule: mi.matricule, count: mi.count, dates: mi.dates, omStarts: mi.omStarts || [], omEnds: mi.omEnds || [], statusCode: mi.code, statusLabel: mi.label, overlapText: mi.overlapText || '', issues: mi.issues || [] }); });
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
    let html = `<h4 class="mb-3 mt-4" style="color: #16a085;">${title}</h4><div class="table-responsive border"><table class="table table-bordered table-hover align-middle mb-0"><thead style="background-color: #16a085; color: white; position: sticky; top: 0; z-index: 5;"><tr><th>Thématique</th><th>Formulation (Texte)</th><th>Entité (DREN, CISCO, ZAP)</th><th>Matricule / CIN</th><th>Occurrences</th><th>Statut temporel</th><th>Chevauchement détecté / Motif</th><th>Date debut realisation dans om missionnaire</th><th>Date fin realisation dans om missionnaire</th><th>DATE DE SOUMISSION dans Kobotoolbox</th></tr></thead><tbody class="soumission-tbody">`;
    data.forEach(row => {
        const statusCode = row.statusCode || 'distinct';
        const isDoublon = statusCode === 'duplicate';
        const trClass = isDoublon ? 'table-warning' : (statusCode === 'date-anomaly' ? 'table-danger' : (statusCode === 'unverifiable' ? 'table-secondary' : 'tr-correct'));
        let alertBadge;
        if (isDoublon) alertBadge = `<span class="badge bg-danger shadow-sm"><i class="fas fa-exclamation-triangle"></i> DOUBLON — périodes chevauchantes</span>`;
        else if (statusCode === 'date-anomaly') alertBadge = `<span class="badge bg-danger shadow-sm"><i class="fas fa-calendar-times"></i> ANOMALIE DE DATE</span>`;
        else if (statusCode === 'unverifiable') alertBadge = `<span class="badge bg-warning text-dark shadow-sm"><i class="fas fa-question-circle"></i> VÉRIFICATION IMPOSSIBLE</span>`;
        else alertBadge = `<span class="badge bg-success shadow-sm"><i class="fas fa-check"></i> MISSION DISTINCTE</span>`;

        const motive = isDoublon
            ? (row.overlapText || 'Périodes chevauchantes')
            : ((row.issues || []).join(' ; ') || row.overlapText || 'Aucun chevauchement inclusif détecté');
        const searchText = window.cleanSpaces
            ? window.cleanSpaces([row.text, row.entity, row.matricule, row.statusLabel, motive, ...(row.omStarts || []), ...(row.omEnds || [])].join(' ')).toLowerCase()
            : '';
        html += `<tr class="${trClass}" data-status="${statusCode}" data-search="${searchText}"><td class="text-center"><span class="badge bg-secondary">${row.theme}</span></td><td class="text-start">${row.text}</td><td class="text-center fw-bold ${isDoublon ? 'text-danger' : 'text-secondary'}">${row.entity}</td><td class="text-center"><span class="badge bg-info text-dark">${row.matricule}</span></td><td class="text-center"><span class="badge bg-primary fs-6">${row.count}</span></td><td class="text-center">${alertBadge}</td><td class="text-start" style="font-size:0.82rem; min-width:220px;">${motive}</td><td class="text-center" style="font-size:0.85rem;">${(row.omStarts || []).join(' ; ') || '<span class="text-muted">Non renseignée</span>'}</td><td class="text-center" style="font-size:0.85rem;">${(row.omEnds || []).join(' ; ') || '<span class="text-muted">Non renseignée</span>'}</td><td class="text-center" style="font-size: 0.85rem;">${row.dates.join(' ; ')}</td></tr>`;
    });
    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

window.filterSoumissionsTables = function() {
    const query = (document.getElementById('search-soumissions-table')?.value || '').trim().toLowerCase();
    const selected = document.querySelector('input[name="soumissionStatus"]:checked')?.value || 'all';
    document.querySelectorAll('.soumission-tbody tr').forEach(row => {
        const textMatch = !query || (row.dataset.search || '').includes(query);
        const statusMatch = selected === 'all' || (selected === 'doublon' && row.dataset.status === 'duplicate');
        row.style.display = textMatch && statusMatch ? '' : 'none';
    });
};

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
        tableData.forEach(row => { flatData.push({ "Catégorie": title, "Thématique": row.theme, "Formulation": row.text, "Entité": row.entity, "Matricule": row.matricule, "Occurrences": row.count, "Statut temporel": row.statusLabel || '', "Chevauchement / Motif": row.overlapText || (row.issues || []).join(' ; '), "Date debut realisation dans om missionnaire": (row.omStarts || []).join(', '), "Date fin realisation dans om missionnaire": (row.omEnds || []).join(', '), "Dates de soumission": row.dates.join(', ') }); });
    }
    return flatData;
}

window.exportSoumissionsToCSV = function(pfx) {
    let data = window.getSoumissionsExportData(); if (data.length === 0) return alert("Lancez d'abord la consolidation.");
    let fn = window.generateFilename ? window.generateFilename(pfx, 'csv') : 'export.csv', csv = [`"Catégorie";"Thématique";"Formulation";"Entité";"Matricule";"Occurrences";"Statut temporel";"Chevauchement / Motif";"Date debut realisation dans om missionnaire";"Date fin realisation dans om missionnaire";"Dates de soumission"`];
    data.forEach(row => { csv.push(`"${row['Catégorie']}";"${row['Thématique']}";"${row['Formulation'].replace(/"/g, '""')}";"${row['Entité']}";"${row['Matricule']}";"${row['Occurrences']}";"${row['Statut temporel']}";"${row['Chevauchement / Motif']}";"${row['Date debut realisation dans om missionnaire']}";"${row['Date fin realisation dans om missionnaire']}";"${row['Dates de soumission']}"`); });
    if(window.downloadFile) window.downloadFile(new Blob(["\uFEFF" + csv.join("\n")], {type: "text/csv;charset=utf-8;"}), fn);
}

window.exportSoumissionsToExcel = function(pfx) {
    let data = window.getSoumissionsExportData(); if (data.length === 0) return alert("Lancez d'abord la consolidation.");
    let fn = window.generateFilename ? window.generateFilename(pfx, 'xlsx') : 'export.xlsx', wsD = [["Catégorie", "Thématique", "Formulation", "Entité", "Matricule", "Occurrences", "Statut temporel", "Chevauchement / Motif", "Date debut realisation dans om missionnaire", "Date fin realisation dans om missionnaire", "Dates de soumission"]];
    data.forEach(row => { wsD.push([row['Catégorie'], row['Thématique'], row['Formulation'], row['Entité'], row['Matricule'], row['Occurrences'], row['Statut temporel'], row['Chevauchement / Motif'], row['Date debut realisation dans om missionnaire'], row['Date fin realisation dans om missionnaire'], row['Dates de soumission']]); });
    let wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(wsD); XLSX.utils.book_append_sheet(wb, ws, "Consolidation"); XLSX.writeFile(wb, fn);
}

window.exportSoumissionsToJSONFile = function(pfx) {
    let data = window.getSoumissionsExportData(); if (data.length === 0) return alert("Lancez d'abord la consolidation.");
    let j = JSON.stringify({ "titre": "Consolidation Soumissions", "criteres": window.globalSoumissionsFilterCriteria || {}, "resultats": data }, null, 2);
    if(window.downloadFile) window.downloadFile(new Blob([j], { type: 'application/json;charset=utf-8;' }), window.generateFilename ? window.generateFilename(pfx, 'json') : 'export.json'); 
}

window.exportSoumissionsToHTML = function(pfx) {
    let data = window.getSoumissionsExportData(); if (data.length === 0) return alert("Lancez d'abord la consolidation.");
    let h = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px}th{background:#16a085;color:white}</style></head><body><h2>Consolidation Soumissions</h2><table><tr><th>Catégorie</th><th>Thématique</th><th>Formulation</th><th>Entité</th><th>Matricule</th><th>Occurrences</th><th>Statut temporel</th><th>Chevauchement / Motif</th><th>Date début OM</th><th>Date fin OM</th><th>Dates de soumission</th></tr>`;
    data.forEach(r => h += `<tr><td>${r['Catégorie']}</td><td>${r['Thématique']}</td><td>${r['Formulation']}</td><td>${r['Entité']}</td><td>${r['Matricule']}</td><td>${r['Occurrences']}</td><td>${r['Statut temporel']}</td><td>${r['Chevauchement / Motif']}</td><td>${r['Date debut realisation dans om missionnaire']}</td><td>${r['Date fin realisation dans om missionnaire']}</td><td>${r['Dates de soumission']}</td></tr>`); h += `</table></body></html>`;
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
