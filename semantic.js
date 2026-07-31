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

window.runSoumissionsAnalysis = async function() {
    if(typeof allData === 'undefined' || allData.length === 0) { alert("Veuillez d'abord attendre le chargement des données."); return; }
    window.globalSoumissionsResults = {};
    $('#cons-progress-container').show(); $('#cons-status').text("Initialisation de l'IA de consolidation..."); $('#cons-progress-bar').css('width', '5%').text('5%');

    try {
        let extractor = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', {
            progress_callback: x => { if (x.status === 'progress') { let p = Math.round(x.progress); $('#cons-progress-bar').css('width', p + '%').text(p + '%'); } }
        });
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
            let colText = baseColsInfo.find(c => c.key === task.textKey);
            let colEntity = baseColsInfo.find(c => c.key === task.entityKey);
            
            if(colText && colEntity) {
                let map = {};
                allData.forEach(r => {
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
                            if (!map[key]) map[key] = { text: text, entity: e, matricule: singleMatricule, count: 0, dates: [] };
                            map[key].count++; map[key].dates.push(subDate);
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
                            matchingItems.forEach(mi => { tableData.push({ theme: themeName, text: mi.text, entity: mi.entity, matricule: mi.matricule, count: mi.count, dates: mi.dates }); });
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
        $('#cons-status').text("✅ Analyse des soumissions terminée avec succès !");
        if (window.filterSoumissionsTables) window.filterSoumissionsTables(); 
        setTimeout(() => $('#cons-progress-container').hide(), 5000);
    } catch(e) { $('#cons-status').html(`<span class="text-danger"><i class="fas fa-exclamation-triangle"></i> Erreur lors de l'analyse : ${e.message}</span>`); }
};

function renderSoumissionsTable(data, containerId, title) {
    let container = document.getElementById(containerId);
    if (data.length === 0) { container.innerHTML = `<div class="col-12 text-center text-muted py-5"><i class="fas fa-box-open fa-2x mb-3"></i><br>Aucune donnée pour ${title}</div>`; return; }
    let html = `<h4 class="mb-3 mt-4" style="color: #16a085;">${title}</h4><div class="table-responsive border"><table class="table table-bordered table-hover align-middle mb-0"><thead style="background-color: #16a085; color: white; position: sticky; top: 0; z-index: 5;"><tr><th>Thématique</th><th>Formulation (Texte)</th><th>Entité (DREN, CISCO, ZAP)</th><th>Matricule / CIN</th><th>Occurrences Formulation</th><th>Statut de la Soumission</th><th>DATE DE SOUMISSION dans Kobotoolbox</th></tr></thead><tbody>`;
    data.forEach(row => {
        let isDoublon = row.count > 1 && row.entity !== 'Inconnue';
        let trClass = isDoublon ? 'class="table-warning"' : '';
        let alertBadge = isDoublon ? `<span class="badge bg-danger shadow-sm"><i class="fas fa-exclamation-triangle"></i> DOUBLON (${row.count} envois)</span>` : `<span class="badge bg-success shadow-sm"><i class="fas fa-check"></i> CORRECT (1 envoi)</span>`;
        html += `<tr ${trClass}><td class="text-center"><span class="badge bg-secondary">${row.theme}</span></td><td class="text-start">${row.text}</td><td class="text-center fw-bold ${isDoublon ? 'text-danger' : 'text-secondary'}">${row.entity}</td><td class="text-center"><span class="badge bg-info text-dark">${row.matricule}</span></td><td class="text-center"><span class="badge bg-primary fs-6">${row.count}</span></td><td class="text-center">${alertBadge}</td><td class="text-center" style="font-size: 0.85rem;">${row.dates.join(' ; ')}</td></tr>`;
    });
    html += `</tbody></table></div>`;
    container.innerHTML = html;
}
