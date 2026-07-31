// --- VARIABLES GLOBALES ---
let allData = [];
let filteredTabData = []; // Pour l'onglet 1
let activeCharts = {};

// Définition des colonnes de base recherchées dans Kobo
const colonnesCles = [
    { id: 'date', matches: ['_submission_time'], label: 'Date' },
    { id: 'dren', matches: ['dren'], label: 'DREN' },
    { id: 'cisco', matches: ['cisco'], label: 'CISCO' },
    { id: 'zap', matches: ['zap'], label: 'ZAP' },
    { id: 'activite', matches: ['activite', 'activité'], label: 'Activité' },
    { id: 'produit', matches: ['produit'], label: 'Produit' }
];

// Dictionnaire officiel des DREN
const DREN_DICT = {
    '11':'11 : ANALAMANGA', '12':'12 : VAKINANKARATRA', '13':'13 : ITASY', '14':'14 : BONGOLAVA',
    '21':'21 : HAUTE MATSIATRA', '22':"22 : AMORON'I MANIA", '23':'23 : VATOVAVY', '24':'24 : FITOVINANY',
    '25':'25 : ATSIMO ATSINANANA', '26':'26 : IHOROMBE', '31':'31 : ALAOTRA MANGORO', '32':'32 : ATSINANANA',
    '33':'33 : ANALANJIROFO', '41':'41 : BOENY', '42':'42 : SOFIA', '43':'43 : BETSIBOKA', '44':'44 : MELAKY',
    '51':'51 : ATSIMO ANDREFANA', '52':'52 : ANDROY', '53':'53 : ANOSY', '54':'54 : MENABE',
    '71':'71 : DIANA', '72':'72 : SAVA'
};

// --- EXTRACTION KOBO ---
function extractValue(row, keywordArray) {
    if (!row) return "";
    for (let key in row) {
        let vName = key.split('/').pop().toLowerCase();
        if (keywordArray.some(kw => vName.includes(kw))) {
            let val = row[key];
            if (val === null || val === undefined) return "";
            val = String(val).trim();
            // Appliquer le dico DREN si c'est une colonne DREN et que la valeur est un code numérique
            if (keywordArray.includes('dren') && DREN_DICT[val]) return DREN_DICT[val];
            return val;
        }
    }
    return "";
}

function processRawData(apiResults) {
    return apiResults.map(row => {
        let cleanRow = {};
        colonnesCles.forEach(col => {
            let val = extractValue(row, col.matches);
            // Formatage de la date si c'est _submission_time
            if (col.id === 'date' && val) val = val.split('T')[0]; 
            cleanRow[col.id] = val || "Non renseigné";
        });
        return cleanRow;
    });
}

// --- APPEL API (SANS EXCEL) ---
async function fetchData() {
    $('#loading-box').show();
    $('#sync-status').html('<span class="badge bg-warning text-dark fs-6"><i class="fas fa-spinner fa-spin"></i> Collecte KoboToolbox...</span>');
    try {
        const url = 'https://kf.kobotoolbox.org/api/v2/assets/ath6cv2NrXEUijffeKJqSf/data.json';
        // Utilisation d'un proxy pour éviter les erreurs CORS
        const response = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(url));
        if (!response.ok) throw new Error("Accès refusé");
        
        const json = await response.json();
        const rawResults = json.results || [];
        
        allData = processRawData(rawResults);
        filteredTabData = [...allData];
        
        // Initialisation de la vue
        renderTable1();
        renderTab2Analysis();
        
        $('#sync-status').html(`<span class="badge bg-success fs-6"><i class="fas fa-check-circle"></i> Connecté : ${allData.length} lignes</span>`);
    } catch (error) {
        $('#sync-status').html(`<span class="badge bg-danger fs-6"><i class="fas fa-wifi"></i> Échec réseau</span>`);
        $('#error-box').html(`<b>Erreur de connexion :</b> Impossible de joindre KoboToolbox.`).show();
    } finally {
        $('#loading-box').hide();
    }
}

// =================== ONGLET 1 : TABLEAU ===================
function renderTable1() {
    const thead = $('#main-thead-tr').empty();
    const tbody = $('#main-tbody').empty();
    
    // Entêtes
    thead.append('<th>N°</th>');
    colonnesCles.forEach(c => thead.append(`<th>${c.label}</th>`));
    
    if (filteredTabData.length === 0) {
        tbody.append(`<tr><td colspan="${colonnesCles.length + 1}" class="text-center text-muted py-4">Aucune donnée trouvée.</td></tr>`);
        $('#record-count').text(0);
        return;
    }

    filteredTabData.forEach((row, i) => {
        let tr = $('<tr></tr>');
        tr.append(`<td class="fw-bold text-muted">${i + 1}</td>`);
        colonnesCles.forEach(c => {
            let val = row[c.id];
            tr.append(`<td>${val}</td>`);
        });
        tbody.append(tr);
    });
    $('#record-count').text(filteredTabData.length);
}

// Filtres Onglet 1
$('#f-dren, #f-cisco, #f-zap').on('keyup', function() {
    let fD = $('#f-dren').val().toLowerCase();
    let fC = $('#f-cisco').val().toLowerCase();
    let fZ = $('#f-zap').val().toLowerCase();
    
    filteredTabData = allData.filter(r => {
        return r.dren.toLowerCase().includes(fD) &&
               r.cisco.toLowerCase().includes(fC) &&
               r.zap.toLowerCase().includes(fZ);
    });
    renderTable1();
});

window.clearTab1Filters = function() {
    $('#f-dren, #f-cisco, #f-zap').val('');
    filteredTabData = [...allData];
    renderTable1();
};

// =================== ONGLET 2 : ANALYSE & DATES ===================

function aggregateDataWithDates(data, keyField) {
    let map = {};
    data.forEach(row => {
        let nom = row[keyField];
        if (nom === "Non renseigné") return;
        
        if (!map[nom]) map[nom] = { count: 0, dates: new Set() };
        map[nom].count++;
        if (row.date !== "Non renseigné") map[nom].dates.add(row.date);
    });

    let results = [];
    for (let nom in map) {
        let arrDates = Array.from(map[nom].dates).sort();
        let dateStr = "Aucune date";
        if (arrDates.length === 1) dateStr = arrDates[0];
        else if (arrDates.length > 1) dateStr = `Du ${arrDates[0]} au ${arrDates[arrDates.length-1]}`;
        
        results.push({ label: nom, value: map[nom].count, dates: dateStr });
    }
    return results;
}

$('#ia-date-start, #ia-date-end').on('change', renderTab2Analysis);

function renderTab2Analysis() {
    if (allData.length === 0) return;

    // Filtrage par date exclusif à l'onglet 2
    let dStart = $('#ia-date-start').val() ? new Date($('#ia-date-start').val()) : null;
    let dEnd = $('#ia-date-end').val() ? new Date($('#ia-date-end').val()) : null;

    let dataTab2 = allData.filter(r => {
        if (r.date === "Non renseigné") return false; // Exclure si pas de date et qu'on filtre
        let d = new Date(r.date);
        if (dStart && d < dStart) return false;
        if (dEnd && d > dEnd) return false;
        return true;
    });

    let aggDren = aggregateDataWithDates(dataTab2, 'dren');
    let aggCisco = aggregateDataWithDates(dataTab2, 'cisco');
    let aggZap = aggregateDataWithDates(dataTab2, 'zap');

    // Lancer les 3 algos
    let eps = parseInt($('#eps-range').val()) || 5;
    
    drawKMeans('dren', aggDren); drawKMeans('cisco', aggCisco); drawKMeans('zap', aggZap);
    drawJenks('dren', aggDren); drawJenks('cisco', aggCisco); drawJenks('zap', aggZap);
    drawDBSCAN('dren', aggDren, eps); drawDBSCAN('cisco', aggCisco, eps); drawDBSCAN('zap', aggZap, eps);
    
    // Système expert basé sur Jenks DREN
    updateExpertSystem(aggDren, 'DREN');
    updateExpertSystem(aggCisco, 'CISCO');
    updateExpertSystem(aggZap, 'ZAP');
}

// Mise à jour Epsilon en direct
$('#eps-range').on('input', function() {
    $('#eps-val').text($(this).val());
    renderTab2Analysis();
});

// =================== LOGIQUE MATHÉMATIQUE IA ===================

function calcKMeans(arr, k=3) {
    if (arr.length < k) return null;
    let vals = arr.map(a => a.value).sort((a,b)=>a-b);
    let centroids = [vals[0], vals[Math.floor(vals.length/2)], vals[vals.length-1]];
    let clusters = [];
    
    for (let iter = 0; iter < 50; iter++) {
        clusters = [[], [], []];
        arr.forEach(item => {
            let dists = centroids.map(c => Math.abs(item.value - c));
            clusters[dists.indexOf(Math.min(...dists))].push(item);
        });
        let newCentroids = clusters.map(c => c.length ? c.reduce((s, x) => s + x.value, 0) / c.length : 0);
        if (JSON.stringify(centroids) === JSON.stringify(newCentroids)) break;
        centroids = newCentroids;
    }
    return centroids.map((c, i) => ({ centroid: c, data: clusters[i] })).sort((a,b) => a.centroid - b.centroid);
}

function calcJenks(arr, k=3) {
    if (arr.length < k) return null;
    let vals = arr.map(a => a.value).sort((a,b)=>a-b);
    // Version simplifiée des ruptures pour assurer la fluidité du navigateur
    let step = Math.ceil(vals.length / k);
    let clusters = [[], [], []];
    arr.sort((a,b)=>a.value - b.value).forEach((item, i) => {
        if(i < step) clusters[0].push(item);
        else if (i < step*2) clusters[1].push(item);
        else clusters[2].push(item);
    });
    return clusters;
}

function calcDBSCAN(arr, eps) {
    let minPts = 1;
    arr.forEach(p => {
        let neighbors = arr.filter(o => Math.abs(p.value - o.value) <= eps);
        p.isNoise = neighbors.length <= minPts; 
    });
    return arr;
}

// =================== DESSIN DES GRAPHIQUES ET TABLEAUX ===================

function drawChart(canvasId, type, labels, datasets, options) {
    let ctx = document.getElementById(canvasId).getContext('2d');
    if (activeCharts[canvasId]) activeCharts[canvasId].destroy();
    activeCharts[canvasId] = new Chart(ctx, { type: type, data: { labels: labels, datasets: datasets }, options: options });
}

function buildTable(tbodyId, rowsHTML) {
    let tb = document.getElementById(tbodyId);
    if (!tb) return;
    tb.innerHTML = `<tr><th>Entité</th><th>Vol.</th><th>Période</th><th>Statut</th></tr>` + rowsHTML;
}

function drawKMeans(level, dataAgg) {
    let res = calcKMeans(dataAgg);
    let tbodyId = `table-kmeans-${level}`;
    let chartId = `chart-kmeans-${level}`;
    
    if(!res) { document.getElementById(tbodyId).innerHTML = '<tr><td>Données insuffisantes</td></tr>'; return; }
    
    let labels = ['Faible', 'Moyen', 'Haut'];
    let colors = ['#dc3545', '#ffc107', '#198754'];
    let txtColors = ['text-danger', 'text-warning', 'text-success'];
    
    let datasets = []; let html = '';
    res.forEach((cluster, i) => {
        let pts = cluster.data.sort((a,b)=>b.value-a.value);
        pts.forEach(p => {
            html += `<tr><td class="small">${p.label}</td><td class="fw-bold">${p.value}</td><td class="small text-muted">${p.dates}</td><td class="${txtColors[i]} fw-bold small">${labels[i]}</td></tr>`;
        });
        datasets.push({
            label: labels[i],
            data: pts.map((p, x) => ({x: x, y: p.value, raw: p})),
            backgroundColor: colors[i], pointRadius: 5
        });
    });

    buildTable(tbodyId, html);
    drawChart(chartId, 'scatter', null, datasets, {
        responsive: true, maintainAspectRatio: false,
        plugins: { tooltip: { callbacks: { label: c => `${c.raw.raw.label} : ${c.raw.y} (Dates: ${c.raw.raw.dates})` } } },
        scales: { x: { display: false }, y: { beginAtZero: true } }
    });
}

function drawJenks(level, dataAgg) {
    let res = calcJenks(dataAgg);
    let tbodyId = `table-jenks-${level}`;
    let chartId = `chart-jenks-${level}`;
    
    if(!res) { document.getElementById(tbodyId).innerHTML = '<tr><td>Données insuffisantes</td></tr>'; return; }
    
    let labels = ['Rupture Basse', 'Rupture Médiane', 'Rupture Haute'];
    let colors = ['#dc3545', '#fd7e14', '#198754'];
    let txtColors = ['text-danger', 'text-warning', 'text-success'];
    
    let chartLabels = []; let chartData = []; let chartColors = []; let html = '';
    
    res.forEach((cluster, i) => {
        let pts = cluster.sort((a,b)=>b.value-a.value);
        pts.forEach(p => {
            html += `<tr><td class="small">${p.label}</td><td class="fw-bold">${p.value}</td><td class="small text-muted">${p.dates}</td><td class="${txtColors[i]} fw-bold small">${labels[i]}</td></tr>`;
            chartLabels.push(p.label); chartData.push(p.value); chartColors.push(colors[i]);
        });
    });

    buildTable(tbodyId, html);
    drawChart(chartId, 'bar', chartLabels, [{ label: 'Soumissions', data: chartData, backgroundColor: chartColors }], {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } }
    });
}

function drawDBSCAN(level, dataAgg, eps) {
    let res = calcDBSCAN(dataAgg, eps);
    let tbodyId = `table-dbscan-${level}`;
    let chartId = `chart-dbscan-${level}`;
    
    if(!res || res.length===0) { document.getElementById(tbodyId).innerHTML = '<tr><td>Données insuffisantes</td></tr>'; return; }
    
    let chartLabels = []; let chartData = []; let chartColors = []; let html = '';
    res.sort((a,b)=>b.value - a.value).forEach(p => {
        chartLabels.push(p.label); chartData.push(p.value);
        if(p.isNoise) {
            chartColors.push('#dc3545');
            html += `<tr class="table-danger"><td class="small">${p.label}</td><td class="fw-bold">${p.value}</td><td class="small text-muted">${p.dates}</td><td class="text-danger fw-bold small">Isolé</td></tr>`;
        } else {
            chartColors.push('#adb5bd');
            html += `<tr><td class="small">${p.label}</td><td class="fw-bold">${p.value}</td><td class="small text-muted">${p.dates}</td><td class="text-secondary small">Normal</td></tr>`;
        }
    });

    buildTable(tbodyId, html);
    drawChart(chartId, 'bar', chartLabels, [{ label: `Soumissions (Rouge=Anomalie ε=${eps})`, data: chartData, backgroundColor: chartColors }], {
        responsive: true, maintainAspectRatio: false
    });
}

// =================== ONGLET 3 : SYSTEME EXPERT ===================

let expertRows = "";
function updateExpertSystem(dataAgg, niveauNom) {
    let res = calcJenks(dataAgg);
    if (!res) return;
    
    res.forEach((cluster, i) => {
        cluster.forEach(p => {
            let status = i === 0 ? "CRITIQUE" : (i === 1 ? "ATTENTION" : "OPTIMAL");
            let badge = i === 0 ? "bg-danger" : (i === 1 ? "bg-warning text-dark" : "bg-success");
            let rec = i === 0 ? "Relance immédiate requise sur le terrain." : (i === 1 ? "Suivi nécessaire par email." : "Féliciter l'équipe !");
            expertRows += `<tr><td class="fw-bold">${p.label}</td><td><span class="badge bg-secondary">${niveauNom}</span></td><td class="fw-bold">${p.value}</td><td><span class="badge ${badge}">${status}</span></td><td><em class="text-muted">${rec}</em></td></tr>`;
        });
    });
    document.getElementById('expert-table-body').innerHTML = expertRows;
}

$(document).ready(function() { 
    expertRows = ""; // Reset au chargement
    fetchData(); 
});
