var globalSemanticResults = {};
var globalSoumissionsResults = {};
var globalDBSCANAnomalies = { DREN: [], CISCO: [], ZAP: [] };
var semanticChartsRefs = {};
var chartRealisationTemporel = null;
var chartRealisationClusteringRefs = { dren: null, cisco: null, zap: null };

var allData = [];
var headerMap = {}; var questionListMap = {}; var valueMap = {}; var externalDict = {};    
var currentImageMode = 'url'; var isExcelLoaded = false;
var currentFreqData = null; 
var currentDateMap = { dren: {}, cisco: {}, zap: {} };

var charts = {
    kmeansDren: null, kmeansCisco: null, kmeansZap: null,
    jenksDren: null, jenksCisco: null, jenksZap: null,
    dbscanDren: null, dbscanCisco: null, dbscanZap: null,
    tab2kmeansdren: null, tab2kmeanscisco: null, tab2kmeanszap: null,
    tab2jenksdren: null, tab2jenkscisco: null, tab2jenkszap: null,
    tab2dbscandren: null, tab2dbscancisco: null, tab2dbscanzap: null
};

const metaKeywords = ['start', 'end', 'today', 'username', 'phonenumber', 'deviceid', 'simserial', 'subscriberid', '_id', '_uuid', '_submission_time', '_status', '_geolocation', '_submitted_by', '_xform_id_string', '__version__', 'instanceid', 'rootuuid', 'version'];

var baseColsInfo = [
    { key: 'dren', matches: ['dren'], mustMatch: [], ex: ['activite', 'produit', 'budget', 'cisco', 'zap', 'sous_activite', 'sous_produit', 'sous-activite', 'sous-produit'], label: 'DREN', xmlName: '' },
    { key: 'cisco', matches: ['cisco'], mustMatch: [], ex: ['activite', 'produit', 'budget', 'dren', 'zap', 'sous_activite', 'sous_produit', 'sous-activite', 'sous-produit'], label: 'CISCO', xmlName: '' },
    { key: 'zap', matches: ['zap'], mustMatch: [], ex: ['activite', 'produit', 'budget', 'dren', 'cisco', 'sous_activite', 'sous_produit', 'sous-activite', 'sous-produit'], label: 'ZAP', xmlName: '' },
    { key: 'activiteDren', matches: ['activite', 'activité'], mustMatch: ['dren'], ex: ['sous_activite', 'sous-activite'], label: 'I.1. Activité de la DREN', xmlName: '' },
    { key: 'produitDren', matches: ['produit'], mustMatch: ['dren'], ex: ['sous_produit', 'sous-produit'], label: 'I.4. Produit de la DREN', xmlName: '' },
    { key: 'sousActiviteDren', matches: ['sous_activite', 'sous-activite'], mustMatch: ['dren'], ex: [], label: 'Sous-activité de la DREN', xmlName: '' },
    { key: 'sousProduitDren', matches: ['sous_produit', 'sous-produit'], mustMatch: ['dren'], ex: [], label: 'Sous-produit de la DREN', xmlName: '' },
    { key: 'activiteCisco', matches: ['activite', 'activité'], mustMatch: ['cisco'], ex: ['sous_activite', 'sous-activite'], label: 'I.2. Activité de la CISCO', xmlName: '' },
    { key: 'produitCisco', matches: ['produit'], mustMatch: ['cisco'], ex: ['sous_produit', 'sous-produit'], label: 'I.5. Produit de la CISCO', xmlName: '' },
    { key: 'sousActiviteCisco', matches: ['sous_activite', 'sous-activite'], mustMatch: ['cisco'], ex: [], label: 'Sous-activité de la CISCO', xmlName: '' },
    { key: 'sousProduitCisco', matches: ['sous_produit', 'sous-produit'], mustMatch: ['cisco'], ex: [], label: 'Sous-produit de la CISCO', xmlName: '' },
    { key: 'activiteZap', matches: ['activite', 'activité'], mustMatch: ['zap'], ex: ['sous_activite', 'sous-activite'], label: 'I.3. Activité de la ZAP', xmlName: '' },
    { key: 'produitZap', matches: ['produit'], mustMatch: ['zap'], ex: ['sous_produit', 'sous-produit'], label: 'I.6. Produit de la ZAP', xmlName: '' },
    { key: 'sousActiviteZap', matches: ['sous_activite', 'sous-activite'], mustMatch: ['zap'], ex: [], label: 'Sous-activité de la ZAP', xmlName: '' },
    { key: 'sousProduitZap', matches: ['sous_produit', 'sous-produit'], mustMatch: ['zap'], ex: [], label: 'Sous-produit de la ZAP', xmlName: '' }
];

window.cleanSpaces = function(str) { return str === null || str === undefined ? '' : String(str).replace(/\s+/g, ' ').trim(); };

window.extractMatricules = function(row) {
    let mats = [];
    const validateID = (val) => {
        if (!val) return null; let cleanVal = String(val).replace(/[\s.-]/g, ''); 
        if (/^\d{6}$/.test(cleanVal) || /^\d{12}$/.test(cleanVal)) return cleanVal; return null;
    };
    for (let key in row) {
        if (key.startsWith('_')) continue;
        let val = row[key];
        if (Array.isArray(val)) {
            val.forEach(item => {
                if (typeof item === 'object' && item !== null) {
                    let foundMat = false;
                    for (let subKey in item) {
                        let lowSub = subKey.toLowerCase();
                        if (lowSub.includes('matricule') || lowSub.includes('cin')) {
                            let validId = validateID(item[subKey]);
                            if (validId) { mats.push(validId); foundMat = true; }
                        }
                    }
                    if (!foundMat) { Object.values(item).forEach(v => { let validId = validateID(v); if (validId) mats.push(validId); }); }
                }
            });
        } else if (typeof val === 'string' || typeof val === 'number') {
            let lowKey = key.toLowerCase();
            if (lowKey.endsWith('/matricule') || lowKey.endsWith('/cin') || lowKey.includes('numero_matricule_ou_cin')) {
                let validId = validateID(val);
                if (validId) mats.push(validId);
            }
        }
    }
    return [...new Set(mats)].filter(Boolean).join(' ; ');
};

// =================== MOTEUR IA (K-MEANS, JENKS, DBSCAN) ===================

function performKMeans1D(dataObj, k = 3) {
    let points = Object.keys(dataObj).map(key => ({ label: key, value: dataObj[key] }));
    if (points.length < k) return null;
    let values = points.map(p => p.value).sort((a,b) => a-b);
    let centroids = [ values[0], values[Math.floor(values.length / 2)], values[values.length - 1] ];
    let clusters = []; let oldCentroids = []; let iterations = 0; const MAX_ITER = 100;
    while (iterations < MAX_ITER) {
        clusters = Array.from({length: k}, () => []);
        points.forEach(point => {
            let minList = centroids.map(c => Math.abs(point.value - c));
            let clusterIndex = minList.indexOf(Math.min(...minList));
            clusters[clusterIndex].push(point);
        });
        oldCentroids = [...centroids];
        for (let i = 0; i < k; i++) {
            if (clusters[i].length > 0) centroids[i] = clusters[i].reduce((acc, curr) => acc + curr.value, 0) / clusters[i].length;
        }
        let hasConverged = true;
        for (let i = 0; i < k; i++) { if (Math.abs(oldCentroids[i] - centroids[i]) > 0.001) { hasConverged = false; break; } }
        if (hasConverged) break;
        iterations++;
    }
    return centroids.map((c, i) => ({ centroid: c, data: clusters[i] })).sort((a, b) => a.centroid - b.centroid);
}

function getJenksBreaks(data, numClasses) {
    if (data.length < numClasses) return null;
    data.sort(function (a, b) { return a - b; });
    var mat1 = []; for (var i = 0; i <= data.length; i++) { var temp = []; for (var j = 0; j <= numClasses; j++) temp.push(0); mat1.push(temp); }
    var mat2 = []; for (var i = 0; i <= data.length; i++) { var temp = []; for (var j = 0; j <= numClasses; j++) temp.push(0); mat2.push(temp); }
    for (var i = 1; i <= numClasses; i++) { mat1[1][i] = 1; mat2[1][i] = 0; for (var j = 2; j <= data.length; j++) mat2[j][i] = Infinity; }
    var v = 0;
    for (var l = 2; l <= data.length; l++) {
        var s1 = 0; var s2 = 0; var w = 0;
        for (var m = 1; m <= l; m++) {
            var i3 = l - m + 1; var val = parseFloat(data[i3 - 1]);
            s2 += val * val; s1 += val; w += 1;
            v = s2 - (s1 * s1) / w; var i4 = i3 - 1;
            if (i4 != 0) { for (var j = 2; j <= numClasses; j++) { if (mat2[l][j] >= (v + mat2[i4][j - 1])) { mat1[l][j] = i3; mat2[l][j] = v + mat2[i4][j - 1]; } } }
        }
        mat1[l][1] = 1; mat2[l][1] = v;
    }
    var k = data.length; var kclass = [];
    for (var i = 0; i <= numClasses; i++) { kclass.push(0); }
    kclass[numClasses] = parseFloat(data[data.length - 1]);
    var countNum = numClasses;
    while (countNum >= 2) {
        var id = parseInt((mat1[k][countNum]) - 2); kclass[countNum - 1] = data[id];
        k = parseInt((mat1[k][countNum] - 1)); countNum -= 1;
    }
    return kclass;
}

function performJenks(dataObj, k = 3) {
    let points = Object.keys(dataObj).map(key => ({ label: key, value: dataObj[key] }));
    if (points.length < k) return null;
    let values = points.map(p => p.value);
    let breaks = getJenksBreaks(values, k);
    if(!breaks) return null;
    let clusters = [[], [], []];
    points.forEach(point => {
        if (point.value <= breaks[1]) clusters[0].push(point);
        else if (point.value <= breaks[2]) clusters[1].push(point);
        else clusters[2].push(point);
    });
    return [ { threshold: breaks[1], data: clusters[0] }, { threshold: breaks[2], data: clusters[1] }, { threshold: breaks[3], data: clusters[2] } ];
}

function performDBSCAN1D(dataObj, eps) {
    let points = Object.keys(dataObj).map(key => ({ label: key, value: dataObj[key], isNoise: false, visited: false }));
    let minPts = 1;
    points.forEach(p => {
        if(p.visited) return;
        p.visited = true;
        let neighbors = points.filter(other => Math.abs(p.value - other.value) <= eps && other.label !== p.label);
        if(neighbors.length < minPts) p.isNoise = true;
    });
    return points;
}

// =================== FONCTIONS DE RENDU (ONGLET 2 : AVEC DATES) ===================

function executeTab2KMeans(dataObj, level, dateMap) {
    let clusters = performKMeans1D(dataObj, 3);
    if (!clusters) { document.getElementById(`tab2-kmeans-${level}-table`).innerHTML = '<tr><td colspan="4">Données insuffisantes</td></tr>'; return; }
    
    let datasets = [];
    let colors = ['rgba(220, 53, 69, 0.7)', 'rgba(253, 126, 20, 0.7)', 'rgba(25, 135, 84, 0.7)'];
    let labels = ['Faible Volume', 'Volume Moyen', 'Haut Volume'];
    let tbodyHtml = '';

    clusters.forEach((clusterInfo, i) => {
        let pts = clusterInfo.data;
        pts.sort((a,b) => b.value - a.value).forEach(p => {
            let colorClass = ['text-danger', 'text-warning', 'text-success'][i];
            let dates = dateMap[p.label] || 'N/A';
            tbodyHtml += `<tr><td class="small text-start">${p.label}</td><td class="fw-bold">${p.value}</td><td class="small text-muted">${dates}</td><td class="${colorClass} fw-bold small">${labels[i]}</td></tr>`;
        });
        datasets.push({
            label: `${labels[i]} (Centre: ${Math.round(clusterInfo.centroid)})`,
            data: pts.map((p, index) => ({ x: index, y: p.value, label: p.label, dates: dateMap[p.label] || 'N/A' })),
            backgroundColor: colors[i], pointRadius: 6, pointHoverRadius: 8
        });
    });

    document.getElementById(`tab2-kmeans-${level}-table`).innerHTML = tbodyHtml;
    
    const ctxId = `tab2-kmeans-${level}-chart`;
    if (window.charts[`tab2kmeans${level}`]) window.charts[`tab2kmeans${level}`].destroy();
    window.charts[`tab2kmeans${level}`] = new Chart(document.getElementById(ctxId).getContext('2d'), {
        type: 'scatter', data: { datasets: datasets },
        options: { 
            responsive: true, maintainAspectRatio: false, 
            plugins: { tooltip: { callbacks: { label: function(ctx) { return `${ctx.raw.label} : ${ctx.raw.y} soumissions (Période : ${ctx.raw.dates})`; } } } }, 
            scales: { x: { display: false }, y: { beginAtZero: true } } 
        }
    });
}

function executeTab2Jenks(dataObj, level, dateMap) {
    let jenksResult = performJenks(dataObj, 3);
    if (!jenksResult) { document.getElementById(`tab2-jenks-${level}-table`).innerHTML = '<tr><td colspan="4">Données insuffisantes</td></tr>'; return; }
    
    let labelsHtml = [], dsData = [], bgColors = [], tbodyHtml = '';
    const catLabels = ['Faible', 'Moyen', 'Élevé'];
    const colors = ['rgba(220, 53, 69, 0.8)', 'rgba(253, 126, 20, 0.8)', 'rgba(25, 135, 84, 0.8)'];
    
    let flatData = [];
    jenksResult.forEach((cluster, idx) => { cluster.data.forEach(p => { flatData.push({ ...p, clusterIdx: idx, threshold: cluster.threshold, dates: dateMap[p.label] || 'N/A' }); }); });
    flatData.sort((a,b) => b.value - a.value);

    flatData.forEach(item => {
        labelsHtml.push(item.label); dsData.push(item); bgColors.push(colors[item.clusterIdx]);
        let cClass = ['text-danger', 'text-warning', 'text-success'][item.clusterIdx];
        tbodyHtml += `<tr><td class="small text-start">${item.label}</td><td class="fw-bold">${item.value}</td><td class="small text-muted">${item.dates}</td><td class="${cClass} fw-bold small">${catLabels[item.clusterIdx]}</td></tr>`;
    });

    document.getElementById(`tab2-jenks-${level}-table`).innerHTML = tbodyHtml;

    const ctxId = `tab2-jenks-${level}-chart`;
    if (window.charts[`tab2jenks${level}`]) window.charts[`tab2jenks${level}`].destroy();
    window.charts[`tab2jenks${level}`] = new Chart(document.getElementById(ctxId).getContext('2d'), {
        type: 'bar', data: { labels: labelsHtml, datasets: [{ label: 'Soumissions', data: dsData.map(d=>d.value), backgroundColor: bgColors, rawData: dsData }] },
        options: { 
            responsive: true, maintainAspectRatio: false, 
            plugins: { tooltip: { callbacks: { label: function(ctx) { let item = ctx.dataset.rawData[ctx.dataIndex]; return `${item.value} soumissions (Période : ${item.dates})`; } } }, legend: { display: false } } 
        }
    });
}

function executeTab2DBSCAN(dataObj, level, eps, dateMap) {
    let dbscanResult = performDBSCAN1D(dataObj, eps);
    if (!dbscanResult) { document.getElementById(`tab2-dbscan-${level}-table`).innerHTML = '<tr><td colspan="4">Données insuffisantes</td></tr>'; return; }
    
    let labelsHtml = [], dsData = [], bgColors = [], tbodyHtml = '';
    dbscanResult.sort((a, b) => { if(a.isNoise && !b.isNoise) return -1; if(!a.isNoise && b.isNoise) return 1; return b.value - a.value; });

    dbscanResult.forEach(item => {
        item.dates = dateMap[item.label] || 'N/A';
        labelsHtml.push(item.label); dsData.push(item);
        if (item.isNoise) {
            bgColors.push('rgba(220, 53, 69, 1)');
            tbodyHtml += `<tr class="table-danger"><td class="small text-start">${item.label} <span class="badge bg-danger ms-1"><i class="fas fa-exclamation-triangle"></i> Isolé</span></td><td class="fw-bold">${item.value}</td><td class="small text-muted">${item.dates}</td><td class="text-danger fw-bold small">Anomalie</td></tr>`;
        } else {
            bgColors.push('rgba(108, 117, 125, 0.4)');
            tbodyHtml += `<tr><td class="small text-start">${item.label}</td><td class="fw-bold">${item.value}</td><td class="small text-muted">${item.dates}</td><td class="text-secondary small">Normal</td></tr>`;
        }
    });

    document.getElementById(`tab2-dbscan-${level}-table`).innerHTML = tbodyHtml;

    const ctxId = `tab2-dbscan-${level}-chart`;
    if (window.charts[`tab2dbscan${level}`]) window.charts[`tab2dbscan${level}`].destroy();
    window.charts[`tab2dbscan${level}`] = new Chart(document.getElementById(ctxId).getContext('2d'), {
        type: 'bar', data: { labels: labelsHtml, datasets: [{ label: `Volume (Rouge = Anomalie avec ε=${eps})`, data: dsData.map(d=>d.value), backgroundColor: bgColors, rawData: dsData }] },
        options: { 
            responsive: true, maintainAspectRatio: false, 
            plugins: { tooltip: { callbacks: { label: function(ctx) { let item = ctx.dataset.rawData[ctx.dataIndex]; return `${item.value} soumissions (Période : ${item.dates})`; } } }, legend: { position: 'bottom' } } 
        }
    });
}





// =================== FONCTIONS DE RENDU ORIGINALE (ONGLETS 3, 4, 5) ===================
function executeKMeansAnalysis(dataObj, level) {
    let clusters = performKMeans1D(dataObj, 3);
    if (!clusters) { document.getElementById(`kmeans-${level}-table`).innerHTML = '<tr><td colspan="3">Données insuffisantes</td></tr>'; return; }
    let datasets = []; let colors = ['rgba(220, 53, 69, 0.7)', 'rgba(253, 126, 20, 0.7)', 'rgba(25, 135, 84, 0.7)']; let labels = ['Faible Volume', 'Volume Moyen', 'Haut Volume']; let tbodyHtml = '';
    clusters.forEach((clusterInfo, i) => {
        let pts = clusterInfo.data;
        pts.sort((a,b) => b.value - a.value).forEach(p => { let colorClass = ['text-danger', 'text-warning', 'text-success'][i]; tbodyHtml += `<tr><td>${p.label}</td><td class="fw-bold">${p.value}</td><td class="${colorClass} fw-bold">${labels[i]}</td></tr>`; });
        datasets.push({ label: `${labels[i]} (Centre: ${Math.round(clusterInfo.centroid)})`, data: pts.map((p, index) => ({ x: index, y: p.value, label: p.label })), backgroundColor: colors[i], pointRadius: 6, pointHoverRadius: 8 });
    });
    document.getElementById(`kmeans-${level}-table`).innerHTML = tbodyHtml;
    const ctxId = `kmeans-${level}-chart`;
    if (window.charts[`kmeans${level}`]) window.charts[`kmeans${level}`].destroy();
    window.charts[`kmeans${level}`] = new Chart(document.getElementById(ctxId).getContext('2d'), { type: 'scatter', data: { datasets: datasets }, options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: function(ctx) { return `${ctx.raw.label} : ${ctx.raw.y} soumissions`; } } } }, scales: { x: { display: false }, y: { beginAtZero: true } } } });
}

function executeJenksAnalysis(dataObj, level) {
    let jenksResult = performJenks(dataObj, 3);
    if (!jenksResult) { document.getElementById(`jenks-${level}-table`).innerHTML = '<tr><td colspan="3">Données insuffisantes</td></tr>'; return; }
    let labelsHtml = [], dsData = [], bgColors = [], tbodyHtml = ''; const catLabels = ['Faible', 'Moyen', 'Élevé']; const colors = ['rgba(220, 53, 69, 0.8)', 'rgba(253, 126, 20, 0.8)', 'rgba(25, 135, 84, 0.8)'];
    let flatData = []; jenksResult.forEach((cluster, idx) => { cluster.data.forEach(p => { flatData.push({ ...p, clusterIdx: idx, threshold: cluster.threshold }); }); }); flatData.sort((a,b) => b.value - a.value);
    flatData.forEach(item => {
        labelsHtml.push(item.label); dsData.push(item.value); bgColors.push(colors[item.clusterIdx]);
        let cClass = ['text-danger', 'text-warning', 'text-success'][item.clusterIdx]; tbodyHtml += `<tr><td>${item.label}</td><td class="fw-bold">${item.value}</td><td class="${cClass} fw-bold">${catLabels[item.clusterIdx]} (Max: ${item.threshold || '∞'})</td></tr>`;
    });
    document.getElementById(`jenks-${level}-table`).innerHTML = tbodyHtml;
    const ctxId = `jenks-${level}-chart`;
    if (window.charts[`jenks${level}`]) window.charts[`jenks${level}`].destroy();
    window.charts[`jenks${level}`] = new Chart(document.getElementById(ctxId).getContext('2d'), { type: 'bar', data: { labels: labelsHtml, datasets: [{ label: 'Soumissions (Jenks)', data: dsData, backgroundColor: bgColors }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
}

function executeDBSCANAnalysis(dataObj, level, eps) {
    let dbscanResult = performDBSCAN1D(dataObj, eps);
    if (!dbscanResult) { document.getElementById(`dbscan-${level}-table`).innerHTML = '<tr><td colspan="2">Données insuffisantes</td></tr>'; return; }
    let labelsHtml = [], dsData = [], bgColors = [], tbodyHtml = '';
    dbscanResult.sort((a, b) => { if(a.isNoise && !b.isNoise) return -1; if(!a.isNoise && b.isNoise) return 1; return b.value - a.value; });
    let upperLvl = level.toUpperCase(); window.globalDBSCANAnomalies[upperLvl] = [];
    dbscanResult.forEach(item => {
        labelsHtml.push(item.label); dsData.push(item.value);
        if (item.isNoise) { bgColors.push('rgba(220, 53, 69, 1)'); tbodyHtml += `<tr class="table-danger"><td>${item.label} <span class="badge bg-danger ms-2"><i class="fas fa-exclamation-triangle"></i> Isolé</span></td><td class="fw-bold">${item.value}</td></tr>`; window.globalDBSCANAnomalies[upperLvl].push({name: item.label, count: item.value, level: upperLvl}); } 
        else { bgColors.push('rgba(108, 117, 125, 0.4)'); tbodyHtml += `<tr><td>${item.label}</td><td class="text-muted">${item.value}</td></tr>`; }
    });
    document.getElementById(`dbscan-${level}-table`).innerHTML = tbodyHtml;
    const ctxId = `dbscan-${level}-chart`;
    if (window.charts[`dbscan${level}`]) window.charts[`dbscan${level}`].destroy();
    window.charts[`dbscan${level}`] = new Chart(document.getElementById(ctxId).getContext('2d'), { type: 'bar', data: { labels: labelsHtml, datasets: [{ label: `Volume (Rouge = Anomalie avec ε=${eps})`, data: dsData, backgroundColor: bgColors }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } } });
}

// Sliders Epsilon synchronisés
$('#eps-range').on('input', function() {
    let eps = parseInt($(this).val()); $('#eps-value').text(eps);
    if (window.currentFreqData) { executeDBSCANAnalysis(window.currentFreqData.dren, 'dren', eps); executeDBSCANAnalysis(window.currentFreqData.cisco, 'cisco', eps); executeDBSCANAnalysis(window.currentFreqData.zap, 'zap', eps); }
});
$('#tab2-eps-range').on('input', function() {
    let eps = parseInt($(this).val()); $('#tab2-eps-value').text(eps);
    if (window.currentFreqData) { executeTab2DBSCAN(window.currentFreqData.dren, 'dren', eps, window.currentDateMap.dren); executeTab2DBSCAN(window.currentFreqData.cisco, 'cisco', eps, window.currentDateMap.cisco); executeTab2DBSCAN(window.currentFreqData.zap, 'zap', eps, window.currentDateMap.zap); }
});

// =================== EXTRACTION DES DONNEES KOBO ===================

window.getTranslatedValue = function(val, xmlName) {
    if (val === null || val === undefined || val === '') return '';
    let pClean = window.cleanSpaces(val);
    let xmlNameLower = String(xmlName).toLowerCase();
    let isCodeLabelColumn = ['dren', 'cisco', 'zap', 'activite'].some(kw => xmlNameLower.includes(kw));
    if (xmlNameLower.includes('dren')) {
        const df = {'11':'ANALAMANGA', '12':'VAKINANKARATRA', '13':'ITASY', '14':'BONGOLAVA', '21':'HAUTE MATSIATRA', '22':"AMORON'I MANIA", '23':'VATOVAVY', '24':'FITOVINANY', '25':'ATSIMO ATSINANANA', '26':'IHOROMBE', '31':'ALAOTRA MANGORO', '32':'ATSINANANA', '33':'ANALANJIROFO', '41':'BOENY', '42':'SOFIA', '43':'BETSIBOKA', '44':'MELAKY', '51':'ATSIMO ANDREFANA', '52':'ANDROY', '53':'ANOSY', '54':'MENABE', '71':'DIANA', '72':'SAVA'};
        let t = df[pClean]; return t ? (pClean + ' : ' + t) : pClean;
    }
    if (window.externalDict && window.externalDict[pClean.toLowerCase()]) {
        let t = window.externalDict[pClean.toLowerCase()]; return isCodeLabelColumn ? pClean + ' : ' + t : t;
    }
    return pClean;
};

window.getKoboValue = function(row, pk, ex = [], mk = []) {
    let ox = null;
    if (row && typeof row === 'object') {
        for (let key of Object.keys(row)) {
            let parts = key.split('/'), vName = parts[parts.length - 1].toLowerCase();
            if (ex && ex.some(e => vName.includes(e))) continue;
            if (mk && mk.length > 0 && !mk.every(req => vName.includes(req))) continue;
            for (let p of pk) if (vName.includes(p)) ox = parts[parts.length - 1];
        }
    }
    if (ox) {
        for (let key of Object.keys(row)) if (key.endsWith('/' + ox) || key === ox) return window.getTranslatedValue(row[key], ox);
    }
    return '';
};

// FILTRES DE DATES SPECIFIQUES A L'ONGLET 2
$('#tab2-date-start, #tab2-date-end').on('change', function() {
    let start = $('#tab2-date-start').val();
    let end = $('#tab2-date-end').val();
    let filtered = window.allData;

    if (start) {
        let dStart = new Date(start); dStart.setHours(0,0,0,0);
        filtered = filtered.filter(row => {
            let d = row['_submission_time'] ? new Date(row['_submission_time'].split('T')[0]) : null;
            return d && d >= dStart;
        });
    }
    if (end) {
        let dEnd = new Date(end); dEnd.setHours(23,59,59,999);
        filtered = filtered.filter(row => {
            let d = row['_submission_time'] ? new Date(row['_submission_time'].split('T')[0]) : null;
            return d && d <= dEnd;
        });
    }
    renderAnalysis(filtered);
});

function renderAnalysis(data) {
    let totalRows = data.length;
    let freqDren = {}; let freqCisco = {}; let freqZap = {};
    let dateDren = {}; let dateCisco = {}; let dateZap = {};

    data.forEach(row => {
        let vD = window.getKoboValue(row, ['dren'], ['activite', 'produit', 'budget', 'cisco', 'zap', 'sous']) || "Non renseigné";
        let vC = window.getKoboValue(row, ['cisco'], ['activite', 'produit', 'budget', 'dren', 'zap', 'sous']) || "Non renseigné";
        let vZ = window.getKoboValue(row, ['zap'], ['activite', 'produit', 'budget', 'dren', 'cisco', 'sous']) || "Non renseigné";
        
        freqDren[vD] = (freqDren[vD] || 0) + 1;
        freqCisco[vC] = (freqCisco[vC] || 0) + 1;
        freqZap[vZ] = (freqZap[vZ] || 0) + 1;

        let dateStr = row['_submission_time'] ? row['_submission_time'].split('T')[0] : 'N/A';
        if(dateStr !== 'N/A') {
            let formatDate = dateStr.split('-').reverse().join('/'); // Format JJ/MM/AAAA
            if(!dateDren[vD]) dateDren[vD] = new Set(); dateDren[vD].add(formatDate);
            if(!dateCisco[vC]) dateCisco[vC] = new Set(); dateCisco[vC].add(formatDate);
            if(!dateZap[vZ]) dateZap[vZ] = new Set(); dateZap[vZ].add(formatDate);
        }
    });

    const formatDates = (dateSetObj) => {
        let res = {};
        for(let k in dateSetObj) {
            let arr = Array.from(dateSetObj[k]).sort((a,b) => new Date(a.split('/').reverse().join('-')) - new Date(b.split('/').reverse().join('-')));
            if(arr.length > 1) res[k] = `${arr[0]} au ${arr[arr.length-1]}`;
            else res[k] = arr[0] || 'N/A';
        }
        return res;
    };

    window.currentDateMap.dren = formatDates(dateDren);
    window.currentDateMap.cisco = formatDates(dateCisco);
    window.currentDateMap.zap = formatDates(dateZap);

    if (totalRows === 0) $('#ai-report-content').html("<p>Aucune donnée pour cette période.</p>");
    else {
        let maxDren = Object.entries(freqDren).filter(([k,v]) => k !== "Non renseigné").sort((a,b) => b[1] - a[1])[0];
        $('#ai-report-content').html(`<p>L'analyse intelligente révèle que <span class="highlight-val">${totalRows}</span> formulaires ont été soumis sur la période sélectionnée. La couverture s'étend sur <span class="highlight-val">${Object.keys(freqDren).length-(freqDren["Non renseigné"]?1:0)}</span> DREN(s) et <span class="highlight-val">${Object.keys(freqCisco).length-(freqCisco["Non renseigné"]?1:0)}</span> CISCO(s). ${maxDren ? `La zone dominante est la DREN <span class="highlight-val">${maxDren[0]}</span> (${Math.round((maxDren[1]/totalRows)*100)}%).` : ''}</p>`);
    }

    const popTab = (id, fd) => {
        let tb = $('#'+id).empty(), s = Object.entries(fd).sort((a,b)=>b[1]-a[1]);
        if(s.length===0) tb.append('<tr><td colspan="3" class="text-muted">Vide</td></tr>');
        else s.forEach(([n,c]) => { let p=(c/totalRows*100).toFixed(1)+'%'; tb.append(`<tr><td><strong>${n}</strong></td><td><span class="badge bg-primary fs-6">${c}</span></td><td class="align-middle"><div class="d-flex align-items-center justify-content-center"><span class="me-2" style="width: 45px; font-weight: bold;">${p}</span><div class="progress" style="width: 80px; height: 10px;"><div class="progress-bar bg-info" style="width: ${p};"></div></div></div></td></tr>`); });
    };
    popTab('dren-summary-table', freqDren); popTab('cisco-summary-table', freqCisco); popTab('zap-summary-table', freqZap);

    window.currentFreqData = { dren: freqDren, cisco: freqCisco, zap: freqZap };
    let epsTab2 = parseInt($('#tab2-eps-range').val()) || 5;
    let epsTab5 = parseInt($('#eps-range').val()) || 5;

    // Rendu pour l'Onglet 2 (Avec Dates)
    executeTab2KMeans(freqDren, 'dren', window.currentDateMap.dren); executeTab2KMeans(freqCisco, 'cisco', window.currentDateMap.cisco); executeTab2KMeans(freqZap, 'zap', window.currentDateMap.zap);
    executeTab2Jenks(freqDren, 'dren', window.currentDateMap.dren); executeTab2Jenks(freqCisco, 'cisco', window.currentDateMap.cisco); executeTab2Jenks(freqZap, 'zap', window.currentDateMap.zap);
    executeTab2DBSCAN(freqDren, 'dren', epsTab2, window.currentDateMap.dren); executeTab2DBSCAN(freqCisco, 'cisco', epsTab2, window.currentDateMap.cisco); executeTab2DBSCAN(freqZap, 'zap', epsTab2, window.currentDateMap.zap);

    // Rendu pour les Onglets 3, 4, 5 (Originaux)
    executeKMeansAnalysis(freqDren, 'dren'); executeKMeansAnalysis(freqCisco, 'cisco'); executeKMeansAnalysis(freqZap, 'zap');
    executeJenksAnalysis(freqDren, 'dren'); executeJenksAnalysis(freqCisco, 'cisco'); executeJenksAnalysis(freqZap, 'zap');
    executeDBSCANAnalysis(freqDren, 'dren', epsTab5); executeDBSCANAnalysis(freqCisco, 'cisco', epsTab5); executeDBSCANAnalysis(freqZap, 'zap', epsTab5);
    
    // Système Expert
    runExpertSystem(freqDren, freqCisco, freqZap);
}

function runExpertSystem(freqDren, freqCisco, freqZap) {
    let drensMap = performJenks(freqDren, 3);
    let expertResults = [];
    if(drensMap) {
        drensMap.forEach((cluster, clusterIndex) => {
            cluster.data.forEach(item => {
                let status = clusterIndex === 0 ? "CRITIQUE" : (clusterIndex === 1 ? "ATTENTION" : "OPTIMAL");
                let badgeClass = clusterIndex === 0 ? "bg-danger" : (clusterIndex === 1 ? "bg-warning text-dark" : "bg-success");
                let rec = clusterIndex === 0 ? "Faible soumission. Relance immédiate requise." : (clusterIndex === 1 ? "Soumission Moyenne. Soutenir avec des Emails !" : "Forte soumission. Féliciter les Responsables !");
                expertResults.push({ name: item.label, type: 'DREN', count: item.value, status, rec, badgeClass });
            });
        });
    }
    let tbody = $('#expert-table-body').empty();
    if (expertResults.length === 0) tbody.append('<tr><td colspan="5" class="text-center text-muted">Aucune donnée à analyser.</td></tr>');
    else expertResults.forEach(res => tbody.append(`<tr><td><strong>${res.name}</strong></td><td class="text-center"><span class="badge bg-secondary">${res.type}</span></td><td class="text-center"><span class="badge bg-light text-dark border">${res.count}</span></td><td class="text-center"><span class="badge ${res.badgeClass} p-2">${res.status}</span></td><td><em style="font-size: 0.95rem;">${res.rec}</em></td></tr>`));
}

async function loadDictionaryAutomatically() {
    try {
        $('#sync-status').append('<span class="badge bg-info text-dark ms-2" id="dict-status"><i class="fas fa-spinner fa-spin"></i> Dico...</span>');
        const response = await fetch("dictionnaire.xlsx");
        if (response.ok) {
            const data = new Uint8Array(await response.arrayBuffer());
            const workbook = XLSX.read(data, {type: 'array'});
            if(workbook.SheetNames.includes('choices')) {
                XLSX.utils.sheet_to_json(workbook.Sheets['choices']).forEach(row => {
                    if(row.name !== undefined && row.label !== undefined) window.externalDict[String(row.name).trim().toLowerCase()] = String(row.label).trim();
                });
                window.isExcelLoaded = true;
            }
        }
        if (window.isExcelLoaded) $('#dict-status').replaceWith('<span class="badge bg-success ms-2"><i class="fas fa-check-circle"></i> Traduit</span>');
    } catch (e) { $('#dict-status').replaceWith('<span class="badge bg-danger ms-2"><i class="fas fa-exclamation-triangle"></i> Pas de Dico</span>'); }
}

async function fetchData() {
    $('#loading-box').show(); $('#error-box').hide();
    $('#sync-status').html('<span class="badge bg-warning text-dark sync-badge"><i class="fas fa-spinner fa-spin"></i> Collecte en cours...</span>');
    await loadDictionaryAutomatically();

    try {
        const koboUrl = 'https://kf.kobotoolbox.org/api/v2/assets/ath6cv2NrXEUijffeKJqSf/data.json?_t=' + new Date().getTime();
        const fetchUrls = [
            koboUrl, 
            'https://api.allorigins.win/raw?url=' + encodeURIComponent(koboUrl),
            'https://corsproxy.io/?' + encodeURIComponent(koboUrl)
        ];

        let response = null; let fetchSuccess = false;
        for (let url of fetchUrls) {
            try { response = await fetch(url, { cache: 'no-store' }); if (response.ok) { fetchSuccess = true; break; } } catch (e) {}
        }
        if (!fetchSuccess) throw new Error("Bloqué par le navigateur (uBlock/CORS). Importez le fichier Excel manuellement.");
        
        window.allData = (await response.json()).results || [];
        window.allData = window.allData.filter(row => row !== null && typeof row === 'object');
        
        // Logique pour l'Onglet 1 (Simplifié ici, conservé dans la vue)
        $('#record-count').text(window.allData.length);
        
        renderAnalysis(window.allData);
        $('#sync-status').html(`<span class="badge bg-success sync-badge"><i class="fas fa-check-double"></i> Ok : ${window.allData.length} Lignes</span>`);

    } catch (error) {
        $('#error-box').html('<strong>Erreur réseau :</strong> ' + error.message).show();
        $('#sync-status').html('<span class="badge bg-danger sync-badge">Échec</span>');
    } finally { $('#loading-box').hide(); }
}

$(document).ready(function() { fetchData(); });
