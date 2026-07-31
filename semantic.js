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
    let clusters = []; let threshold = 0.75; 
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
    if(!window.semanticChartsRefs) window.semanticChartsRefs = {};
    window.semanticChartsRefs[canvasId] = new Chart(ctx, {
        type: 'bar', data: { labels: labels, datasets: [{ label: 'Formulations uniques', data: data, backgroundColor: bgColors }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

function renderSemanticClusters(clusters, containerId, titlePrefix) {
    let container = document.getElementById(containerId);
    if(clusters.length === 0) { container.innerHTML = `<div class="col-12 text-center text-muted py-3">Aucune donnée trouvée.</div>`; return; }
    let html = '';
    clusters.forEach((c, index) => {
        let badgeClass = c.items.length > 5 ? 'bg-success' : (c.items.length > 2 ? 'bg-primary' : 'bg-secondary');
        html += `<div class="col-md-4 mb-4"><div class="card shadow-sm h-100 border" style="border-left: 4px solid #d35400;"><div class="card-header bg-light fw-bold text-semantic">Thématique ${index + 1} <span class="badge ${badgeClass} rounded-pill">${c.items.length}</span></div><ul class="list-group list-group-flush" style="max-height: 250px; overflow-y: auto; font-size: 0.9rem;">`;
        c.items.forEach(item => { html += `<li class="list-group-item"><i class="fas fa-angle-right text-muted me-2"></i> ${item}</li>`; });
        html += `</ul></div></div>`;
    });
    container.innerHTML = html;
}

async function runSemanticAnalysis() {
    if(typeof window.allData === 'undefined' || window.allData.length === 0) { alert("Attendez le chargement des données."); return; }
    window.globalSemanticResults = {};
    $('#semantic-progress-container').show(); $('#semantic-status').text("Initialisation du modèle SBERT...");
    try {
        let extractor = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2');
        $('#semantic-progress-bar').css('width', '100%').text('Modèle chargé !');
        const tasks = [ { textKey: 'activiteDren', resId: 'res-act-dren', chartId: 'semanticChart-act-dren', chartCont: 'chart-container-act-dren', name: 'Activités DREN' } ];
        for(let task of tasks) {
            let col = window.baseColsInfo.find(c => c.key === task.textKey);
            if(col) {
                let texts = window.allData.map(r => window.cleanSpaces ? window.cleanSpaces(window.getKoboValue(r, col.matches, col.ex, col.mustMatch)) : '').filter(t => t && t !== 'Non renseigné');
                let uniqueTexts = [...new Set(texts)];
                if(uniqueTexts.length > 0) {
                    let clusters = await clusterActivities(uniqueTexts, extractor);
                    window.globalSemanticResults[task.name] = clusters;
                    renderSemanticChart(clusters, task.chartId, task.chartCont);
                    renderSemanticClusters(clusters, task.resId, task.name);
                }
            }
        }
        $('#semantic-status').text("✅ Analyse sémantique terminée !");
    } catch(e) { $('#semantic-status').html(`<span class="text-danger">Erreur: ${e.message}</span>`); }
}

function attachListeners() {
    const btnSemantic = document.getElementById('btn-run-semantic');
    if (btnSemantic) btnSemantic.addEventListener('click', runSemanticAnalysis);
}
document.addEventListener('DOMContentLoaded', attachListeners);
