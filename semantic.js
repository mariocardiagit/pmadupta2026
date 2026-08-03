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

// === FONCTION : CONSOLIDATION (DOUBLONS) ===
async function runSoumissionsAnalysis() {
    if(typeof allData === 'undefined' || allData.length === 0) { alert("Veuillez d'abord attendre le chargement des données."); return; }
    window.globalSoumissionsResults = {};
    $('#cons-progress-container').show(); $('#cons-status').text("Initialisation de l'IA de consolidation..."); $('#cons-progress-bar').css('width', '5%').text('5%');

    try {
        let extractor = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', {
            progress_callback: x => { if (x.status === 'progress') { let p = Math.round(x.progress); $('#cons-progress-bar').css('width', p + '%').text(p + '%'); } }
        });
        $('#cons-progress-bar').css('width', '100%').text('Modèle chargé !');

        const duplicateAnalysis = window.buildMissionnaireDuplicateAnalysis
            ? window.buildMissionnaireDuplicateAnalysis(allData)
            : { records: [], duplicateGroups: [], rowToIssues: {} };
        const recordsByRow = {};
        (duplicateAnalysis.records || []).forEach(record => {
            if (!recordsByRow[record.rowIndex]) recordsByRow[record.rowIndex] = [];
            recordsByRow[record.rowIndex].push(record);
        });
        const duplicateGroupsById = {};
        (duplicateAnalysis.duplicateGroups || []).forEach(group => { duplicateGroupsById[group.id] = group; });

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
                const map = {};
                allData.forEach((r, rowIndex) => {
                    const text = window.cleanSpaces ? window.cleanSpaces(window.getKoboValue(r, colText.matches, colText.ex, colText.mustMatch)) : '';
                    const entity = window.cleanSpaces ? window.cleanSpaces(window.getKoboValue(r, colEntity.matches, colEntity.ex, colEntity.mustMatch)) : '';
                    if (!text || text === 'Non renseigné') return;

                    const e = (entity && entity !== 'Non renseigné') ? entity : 'Inconnue';
                    const subDate = r['_submission_time'] ? r['_submission_time'] : 'Date inconnue';
                    let rowRecords = recordsByRow[rowIndex] || [];
                    if (!rowRecords.length) {
                        const matsRaw = window.extractMatricules ? window.extractMatricules(r) : '';
                        const mats = matsRaw ? matsRaw.split(';').map(v => v.trim()).filter(Boolean) : ['Non renseigné'];
                        rowRecords = mats.map(matricule => ({
                            rowIndex, matricule, signature: `${rowIndex}|${matricule}`,
                            start: null, end: null, duplicateGroupIds: [], missingFields: ['date de début', 'date de fin']
                        }));
                    }

                    rowRecords.forEach(record => {
                        const key = `${text}|||${e}|||${record.signature}`;
                        if (!map[key]) map[key] = {
                            text, entity: e, matricule: record.matricule || 'Non renseigné',
                            count: 0, dates: [], periods: [], duplicateIds: new Set(), issues: new Set()
                        };
                        const item = map[key];
                        item.count++;
                        item.dates.push(subDate);
                        const start = window.formatMissionnaireDate ? window.formatMissionnaireDate(record.start) : '';
                        const end = window.formatMissionnaireDate ? window.formatMissionnaireDate(record.end) : '';
                        item.periods.push(start || end ? `${start || '?'} → ${end || '?'}` : 'Période non renseignée');
                        (record.duplicateGroupIds || []).forEach(id => item.duplicateIds.add(id));
                        (record.missingFields || []).forEach(issue => item.issues.add(issue));
                    });
                });

                const items = Object.values(map).map(item => {
                    const duplicateIds = [...item.duplicateIds];
                    const overlapTexts = [];
                    duplicateIds.forEach(id => {
                        const group = duplicateGroupsById[id];
                        if (!group) return;
                        (group.pairOverlaps || []).forEach(pair => {
                            const start = window.formatMissionnaireDate ? window.formatMissionnaireDate(pair.start) : '';
                            const end = window.formatMissionnaireDate ? window.formatMissionnaireDate(pair.end) : '';
                            overlapTexts.push(start === end ? start : `${start} au ${end}`);
                        });
                    });
                    const isDoublon = duplicateIds.length > 0;
                    let status;
                    if (isDoublon) status = `DOUBLON — périodes chevauchantes (${[...new Set(overlapTexts)].join(' ; ') || 'chevauchement détecté'})`;
                    else if (item.issues.size) status = `VÉRIFICATION IMPOSSIBLE — ${[...item.issues].join(', ')}`;
                    else status = 'MISSION DISTINCTE — aucune période chevauchante';
                    return {
                        ...item,
                        dates: [...new Set(item.dates)],
                        periods: [...new Set(item.periods)],
                        duplicateIds,
                        isDoublon,
                        status
                    };
                });

                const uniqueTexts = [...new Set(items.map(i => i.text))];
                if (uniqueTexts.length > 0) {
                    const clusters = await clusterActivities(uniqueTexts, extractor);
                    const tableData = [];
                    clusters.forEach((c, index) => {
                        const themeName = "Thématique " + (index + 1);
                        c.items.forEach(txt => {
                            items.filter(i => i.text === txt).forEach(item => tableData.push({ theme: themeName, ...item }));
                        });
                    });
                    tableData.sort((a, b) => {
                        if (a.isDoublon !== b.isDoublon) return a.isDoublon ? -1 : 1;
                        if (a.theme !== b.theme) return a.theme.localeCompare(b.theme, undefined, {numeric: true});
                        return b.count - a.count;
                    });
                    window.globalSoumissionsResults[task.name] = tableData;
                    renderSoumissionsTable(tableData, task.resId, task.name);
                } else {
                    renderSoumissionsTable([], task.resId, task.name);
                }
            }
        }
        $('#cons-status').text("✅ Analyse des soumissions terminée selon la règle des périodes chevauchantes !");
        if (window.filterSoumissionsTables) window.filterSoumissionsTables();
        setTimeout(() => $('#cons-progress-container').hide(), 5000);
    } catch(e) { $('#cons-status').html(`<span class="text-danger"><i class="fas fa-exclamation-triangle"></i> Erreur lors de l'analyse : ${e.message}</span>`); }
}

function renderSoumissionsTable(data, containerId, title) {
    let container = document.getElementById(containerId);
    if (data.length === 0) { container.innerHTML = `<div class="col-12 text-center text-muted py-5"><i class="fas fa-box-open fa-2x mb-3"></i><br>Aucune donnée pour ${title}</div>`; return; }
    let html = `<h4 class="mb-3 mt-4" style="color: #16a085;">${title}</h4><div class="table-responsive border"><table class="table table-bordered table-hover align-middle mb-0"><thead style="background-color: #16a085; color: white; position: sticky; top: 0; z-index: 5;"><tr><th>Thématique</th><th>Formulation (Texte)</th><th>Entité (DREN, CISCO, ZAP)</th><th>Matricule / CIN</th><th>Missions examinées</th><th>Périodes de réalisation dans om_missionnaire</th><th>Statut de la Soumission</th><th>DATE DE SOUMISSION dans Kobotoolbox</th></tr></thead><tbody class="soumission-tbody">`;
    data.forEach(row => {
        const isDoublon = !!row.isDoublon;
        const hasIssue = !isDoublon && String(row.status || '').startsWith('VÉRIFICATION IMPOSSIBLE');
        const trClass = isDoublon ? 'table-warning' : (hasIssue ? 'table-secondary' : 'tr-correct');
        const alertBadge = isDoublon
            ? `<span class="badge bg-danger shadow-sm text-wrap" style="white-space:normal;line-height:1.3;"><i class="fas fa-calendar-times"></i> ${row.status}</span>`
            : (hasIssue
                ? `<span class="badge bg-warning text-dark shadow-sm text-wrap" style="white-space:normal;line-height:1.3;"><i class="fas fa-question-circle"></i> ${row.status}</span>`
                : `<span class="badge bg-success shadow-sm text-wrap" style="white-space:normal;line-height:1.3;"><i class="fas fa-check"></i> ${row.status}</span>`);
        const periods = (row.periods || []).join(' ; ');
        html += `<tr class="${trClass}" data-search="${window.cleanSpaces ? window.cleanSpaces(row.text + ' ' + row.entity + ' ' + row.matricule + ' ' + periods + ' ' + row.status).toLowerCase() : ''}"><td class="text-center"><span class="badge bg-secondary">${row.theme}</span></td><td class="text-start">${row.text}</td><td class="text-center fw-bold ${isDoublon ? 'text-danger' : 'text-secondary'}">${row.entity}</td><td class="text-center"><span class="badge bg-info text-dark">${row.matricule}</span></td><td class="text-center"><span class="badge bg-primary fs-6">${row.count}</span></td><td class="text-center" style="font-size:0.85rem;">${periods}</td><td class="text-center">${alertBadge}</td><td class="text-center" style="font-size: 0.85rem;">${(row.dates || []).join(' ; ')}</td></tr>`;
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
        tableData.forEach(row => {
            flatData.push({
                "Catégorie": title,
                "Thématique": row.theme,
                "Formulation": row.text,
                "Entité": row.entity,
                "Matricule": row.matricule,
                "Missions examinées": row.count,
                "Périodes de réalisation": (row.periods || []).join(' ; '),
                "Statut doublon": row.status,
                "Identifiants doublon": (row.duplicateIds || []).join(' ; '),
                "Dates de soumission": (row.dates || []).join(' ; ')
            });
        });
    }
    return flatData;
}

window.exportSoumissionsToCSV = function(pfx) {
    let data = window.getSoumissionsExportData(); if (data.length === 0) return alert("Lancez d'abord la consolidation.");
    const headers = ["Catégorie","Thématique","Formulation","Entité","Matricule","Missions examinées","Périodes de réalisation","Statut doublon","Identifiants doublon","Dates de soumission"];
    const cell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    let fn = window.generateFilename ? window.generateFilename(pfx, 'csv') : 'export.csv';
    const csv = [headers.map(cell).join(';'), ...data.map(row => headers.map(h => cell(row[h])).join(';'))];
    if(window.downloadFile) window.downloadFile(new Blob(["\uFEFF" + csv.join("\n")], {type: "text/csv;charset=utf-8;"}), fn);
}

window.exportSoumissionsToExcel = function(pfx) {
    let data = window.getSoumissionsExportData(); if (data.length === 0) return alert("Lancez d'abord la consolidation.");
    const headers = ["Catégorie","Thématique","Formulation","Entité","Matricule","Missions examinées","Périodes de réalisation","Statut doublon","Identifiants doublon","Dates de soumission"];
    let fn = window.generateFilename ? window.generateFilename(pfx, 'xlsx') : 'export.xlsx';
    const wsD = [headers, ...data.map(row => headers.map(h => row[h]))];
    let wb = XLSX.utils.book_new(), ws = XLSX.utils.aoa_to_sheet(wsD); XLSX.utils.book_append_sheet(wb, ws, "Consolidation"); XLSX.writeFile(wb, fn);
}

window.exportSoumissionsToJSONFile = function(pfx) {
    let data = window.getSoumissionsExportData(); if (data.length === 0) return alert("Lancez d'abord la consolidation.");
    let j = JSON.stringify({
        "titre": "Consolidation Soumissions — doublons par chevauchement de périodes",
        "règle": "Signature DREN+CISCO+ZAP+Activité+Produit+Sous-activité+Matricule/CIN identique ET périodes inclusives de réalisation qui se chevauchent",
        "resultats": data
    }, null, 2);
    if(window.downloadFile) window.downloadFile(new Blob([j], { type: 'application/json;charset=utf-8;' }), window.generateFilename ? window.generateFilename(pfx, 'json') : 'export.json');
}

window.exportSoumissionsToHTML = function(pfx) {
    let data = window.getSoumissionsExportData(); if (data.length === 0) return alert("Lancez d'abord la consolidation.");
    const headers = ["Catégorie","Thématique","Formulation","Entité","Matricule","Missions examinées","Périodes de réalisation","Statut doublon","Identifiants doublon","Dates de soumission"];
    let h = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px}th{background:#16a085;color:white}.dup{background:#fff3cd}</style></head><body><h2>Consolidation Soumissions — doublons par chevauchement de périodes</h2><p><strong>Règle :</strong> signature administrative identique et périodes inclusives de réalisation qui se chevauchent.</p><table><tr>${headers.map(hd => `<th>${hd}</th>`).join('')}</tr>`;
    data.forEach(row => h += `<tr class="${String(row['Statut doublon']).startsWith('DOUBLON') ? 'dup' : ''}">${headers.map(hd => `<td>${row[hd] ?? ''}</td>`).join('')}</tr>`);
    h += `</table></body></html>`;
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
