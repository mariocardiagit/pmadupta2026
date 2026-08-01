var globalSemanticResults = {};
var globalSoumissionsResults = {};
var globalDBSCANAnomalies = { DREN: [], CISCO: [], ZAP: [] };
var semanticChartsRefs = {};
var chartRealisationTemporel = null;
var chartRealisationClusteringRefs = { dren: null, cisco: null, zap: null };

const EXPLICATION_SEMANTIQUE = [
    "NOTE SUR LES RÉSULTATS (FORMULATIONS UNIQUES VS VOLUMES) :",
    "Le nombre d'éléments dans chaque thématique indique le nombre de Formulations Uniques, pas le nombre total de soumissions. L'objectif est de créer un dictionnaire thématique.",
    "Pour optimiser l'IA, le système effectue un dédoublonnage strict avant l'analyse :",
    "  Étape A : Liste de toutes les soumissions.",
    "  Étape B : Retrait des doublons parfaits (conservation d'une seule copie modèle si les phrases sont identiques à la virgule près).",
    "  Étape C : L'IA SBERT analyse ces phrases uniques et les place dans des dossiers thématiques.",
    "EXEMPLE : Si 10 ZAP saisissent des activités de nettoyage (5 écrivent 'Nettoyer le bus', 3 'Laver le bus', 2 'Récurer l'autobus'),",
    "le système ne garde que 3 phrases (Nettoyer, Laver, Récurer). L'IA constate qu'elles ont le même sens et les regroupe dans la même thématique.",
    "La thématique contiendra alors 3 éléments (pour 3 formulations uniques), même s'il y a eu en réalité 10 formulaires soumis."
];

const EXPLICATION_SOUMISSION = [
    "NOTE SUR LE RAPPORT DE VERIFICATION DES SOUMISSIONS KOBO :",
    "Ce rapport a pour but d'identifier les DOUBLONS d'enregistrements : c'est-à-dire lorsqu'une même Entité soumet plusieurs fois exactement la même tâche, avec le même numéro matricule.",
    "1. L'IA regroupe d'abord les formulations dans des 'Thématiques'.",
    "2. Le système calcule une 'Signature Complète' stricte : DREN + CISCO + ZAP + Activité + Produit + Sous-activité + Matricule.",
    "LECTURE DU TABLEAU :",
    "- 'Thématique' : Le groupe sémantique créé par l'IA.",
    "- 'Formulation (Texte)' : La phrase exacte saisie dans KoboToolbox.",
    "- 'Entité' : La structure administrative responsable.",
    "- 'Matricule / CIN' : L'identifiant de l'agent qui a soumis le formulaire.",
    "- 'Occurrences Formulation' : Nombre de fois où cette signature stricte a été envoyée.",
    "- 'Statut / Alerte' : Si Occurrences = 1, la saisie est CORRECTE. Si > 1, il y a un DOUBLON d'enregistrement."
];

const TITRE_PLATEFORME = "Plateforme de Suivi du Paquet Minimum d'Activités (PMA) du Plan de Travail Annuel (PTA) de l'Année 2026 des Services Techniques Déconcentrés (STD)";
const SOUS_TITRE_PLATEFORME = "Tableau de Bord : Données & Analytics KoboToolbox";

var allData = [], headerMap = {}, questionListMap = {}, valueMap = {}, externalDict = {};    
var currentImageMode = 'url', isExcelLoaded = false;

var chartsRefs = {
    kmeans: { DREN: null, CISCO: null, ZAP: null },
    jenks: { DREN: null, CISCO: null, ZAP: null },
    dbscan: { DREN: null, CISCO: null, ZAP: null }
};

var submissionTimelineChartsRefs = { DREN: null, CISCO: null, ZAP: null };
var submissionTimelineIndividualChartsRefs = { DREN: [], CISCO: [], ZAP: [] };
var submissionTimelineIndividualState = {
    DREN: { page: 1, search: '' },
    CISCO: { page: 1, search: '' },
    ZAP: { page: 1, search: '' }
};
var submissionTimelineSourceData = [];
var submissionTimelineRenderContext = null;

const SUBMISSION_TIMELINE_GRANULARITIES = ['day', 'week', 'month', 'quarter', 'semester', 'year'];
const SUBMISSION_TIMELINE_LABELS = {
    day: 'Jour', week: 'Semaine', month: 'Mois', quarter: 'Trimestre', semester: 'Semestre', year: 'Année'
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

function extractMatricules(row) {
    let mats = [];
    const validateID = (val) => {
        if (!val) return null;
        let cleanVal = String(val).replace(/[\s.-]/g, ''); 
        if (/^\d{6}$/.test(cleanVal) || /^\d{12}$/.test(cleanVal)) return cleanVal;
        return null;
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
                    if (!foundMat) {
                        Object.values(item).forEach(v => {
                            let validId = validateID(v);
                            if (validId) mats.push(validId);
                        });
                    }
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
}

function showImagePreview(event, url) {
    const tooltip = document.getElementById('image-preview-tooltip');
    const img = document.getElementById('preview-img');
    img.src = url;
    tooltip.style.display = 'block';
    moveImagePreview(event);
}

function hideImagePreview() {
    document.getElementById('image-preview-tooltip').style.display = 'none';
    document.getElementById('preview-img').src = '';
}

function moveImagePreview(event) {
    const tooltip = document.getElementById('image-preview-tooltip');
    if (tooltip.style.display === 'block') {
        let x = event.clientX + 15;
        let y = event.clientY + 15;
        if (x + tooltip.offsetWidth > window.innerWidth) { x = event.clientX - tooltip.offsetWidth - 15; }
        if (y + tooltip.offsetHeight > window.innerHeight) { y = event.clientY - tooltip.offsetHeight - 15; }
        tooltip.style.left = x + 'px';
        tooltip.style.top = y + 'px';
    }
}

function cleanSpaces(str) { return str === null || str === undefined ? '' : String(str).replace(/\s+/g, ' ').trim(); }

function wrapLabel(text, maxChars) {
    let words = text.split(' '), lines = [], line = '';
    for (let i = 0; i < words.length; i++) {
        if (line.length + words[i].length > maxChars) {
            if (line.trim() !== '') lines.push(line.trim());
            line = words[i] + ' ';
        } else { line += words[i] + ' '; }
    }
    if (line.trim() !== '') lines.push(line.trim());
    return lines;
}

function getFormattedDateTime() {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} à ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function generateFilename(prefix, extension) {
    const d = new Date();
    const ts = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
    return `${prefix}_${ts}_kobo.${extension}`;
}

function perform1DKMeans(data, k) {
    if (data.length === 0) return [];
    let uniqueData = [...new Set(data)].sort((a,b)=>a-b);
    let actualK = Math.min(k, uniqueData.length);
    if (actualK <= 1) return data.map(() => 0);

    let centroids = [];
    for (let i = 0; i < actualK; i++) centroids.push(uniqueData[Math.floor(i * uniqueData.length / actualK)]);

    let assignments = new Array(data.length).fill(-1);
    let changed = true, iter = 0;
    while (changed && iter < 100) {
        changed = false;
        let sums = new Array(actualK).fill(0), counts = new Array(actualK).fill(0);
        for (let i = 0; i < data.length; i++) {
            let minD = Infinity, cIdx = 0;
            for (let c = 0; c < actualK; c++) {
                let d = Math.abs(data[i] - centroids[c]);
                if (d < minD) { minD = d; cIdx = c; }
            }
            if (assignments[i] !== cIdx) { assignments[i] = cIdx; changed = true; }
            sums[cIdx] += data[i]; counts[cIdx]++;
        }
        for (let c = 0; c < actualK; c++) { if (counts[c] > 0) centroids[c] = sums[c] / counts[c]; }
        iter++;
    }
    let sortedCentroids = centroids.map((val, idx) => ({val, idx})).sort((a,b) => a.val - b.val);
    let rankMap = {};
    sortedCentroids.forEach((c, rank) => { rankMap[c.idx] = rank; });
    return assignments.map(a => rankMap[a]);
}

function getJenksBreaks(data, numclass) {
    data = data.slice().sort((a, b) => a - b);
    if (data.length <= numclass) return data;
    let mat1 = [], mat2 = [];
    for (let i = 0; i <= data.length; i++) { mat1[i] = Array(numclass + 1).fill(0); mat2[i] = Array(numclass + 1).fill(0); }
    for (let i = 1; i <= numclass; i++) { mat1[1][i] = 1; mat2[1][i] = 0; for (let j = 2; j <= data.length; j++) mat2[j][i] = Infinity; }
    for (let l = 2; l <= data.length; l++) {
        let s1 = 0, s2 = 0, w = 0;
        for (let m = 1; m <= l; m++) {
            let i3 = l - m + 1; let val = data[i3 - 1];
            s2 += val * val; s1 += val; w++;
            let v = s2 - (s1 * s1) / w;
            let i4 = i3 - 1;
            if (i4 !== 0) {
                for (let j = 2; j <= numclass; j++) {
                    if (mat2[l][j] >= (v + mat2[i4][j - 1])) { mat1[l][j] = i3; mat2[l][j] = v + mat2[i4][j - 1]; }
                }
            }
        }
        mat1[l][1] = 1; mat2[l][1] = v;
    }
    let k = data.length, kclass = [];
    kclass[numclass] = data[data.length - 1]; kclass[0] = data[0];
    for (let countNum = numclass; countNum >= 2; countNum--) {
        let id = parseInt((mat1[k][countNum]) - 2);
        kclass[countNum - 1] = data[id];
        k = parseInt((mat1[k][countNum] - 1));
    }
    return kclass;
}

function performJenks(data, k) {
    if(data.length === 0) return [];
    let uniqueData = [...new Set(data)].sort((a,b)=>a-b);
    if (uniqueData.length <= k) return data.map(v => uniqueData.indexOf(v));
    let breaks = getJenksBreaks(data, k);
    return data.map(val => { for(let i=1; i<breaks.length; i++) { if(val <= breaks[i]) return i-1; } return k-1; });
}

function performDBSCAN(data) {
    if (data.length === 0) return { assignments: [], numClusters: 0, eps: 0 };
    let max = Math.max(...data), min = Math.min(...data);
    let eps = Math.max(1, (max - min) * 0.15); 
    let minPts = 2;
    let labels = new Array(data.length).fill(undefined);
    let clusterId = 0;
    
    for (let i = 0; i < data.length; i++) {
        if (labels[i] !== undefined) continue;
        let neighbors = [];
        for (let j = 0; j < data.length; j++) { if (Math.abs(data[i] - data[j]) <= eps) neighbors.push(j); }
        if (neighbors.length < minPts) {
            labels[i] = -1;
        } else {
            labels[i] = clusterId;
            let seedSet = neighbors.filter(n => n !== i);
            while (seedSet.length > 0) {
                let q = seedSet.pop();
                if (labels[q] === -1) labels[q] = clusterId;
                if (labels[q] !== undefined) continue;
                labels[q] = clusterId;
                let qNeighbors = [];
                for (let j = 0; j < data.length; j++) { if (Math.abs(data[q] - data[j]) <= eps) qNeighbors.push(j); }
                if (qNeighbors.length >= minPts) { for(let n of qNeighbors) { if(labels[n] === undefined && !seedSet.includes(n)) seedSet.push(n); } }
            }
            clusterId++;
        }
    }
    return { assignments: labels, numClusters: clusterId, eps: eps };
}

function getClusterMap(freqData, k) {
    let entries = Object.entries(freqData).filter(([key,v]) => key !== "Non renseigné");
    entries.sort((a,b) => a[1] - b[1]);
    let counts = entries.map(e => e[1]);
    let labels = entries.map(e => e[0]);
    let assignments = performJenks(counts, k);
    let map = {};
    for(let i=0; i<labels.length; i++) { map[labels[i]] = assignments[i]; }
    return map;
}

function renderExpertThresholds(freqDren, freqCisco, freqZap) {
    const getBreaksInfo = (freqData) => {
        let counts = Object.entries(freqData).filter(([k,v]) => k !== "Non renseigné").map(e => e[1]);
        if(counts.length === 0) return null;
        let uniqueData = [...new Set(counts)].sort((a,b)=>a-b);
        if(uniqueData.length <= 3) return { type: 'unique' };
        return { type: 'breaks', vals: getJenksBreaks(counts, 3) };
    };

    const formatHtml = (info, name) => {
        if(!info) return `<li class="mb-3"><strong>${name} :</strong> <span class="text-muted">Données insuffisantes</span></li>`;
        if(info.type === 'unique') return `<li class="mb-3"><strong><i class="fas fa-sitemap"></i> ${name} :</strong> <span class="text-muted">Volumes trop homogènes.</span></li>`;
        let br = info.vals;
        return `<li class="mb-3 pb-2 border-bottom">
            <h6 class="fw-bold text-secondary mb-2"><i class="fas fa-sitemap"></i> Seuils pour ${name} :</h6>
            <div class="d-flex flex-wrap gap-2">
                <span class="badge bg-danger fs-6 fw-normal text-start">Faible<br><strong>${br[0]} à ${br[1]}</strong></span> 
                <span class="badge bg-warning text-dark fs-6 fw-normal text-start">Moyenne<br><strong>${br[1]+1} à ${br[2]}</strong></span> 
                <span class="badge bg-success fs-6 fw-normal text-start">Forte<br><strong>${br[2]+1} à ${br[3]}</strong></span>
            </div>
        </li>`;
    };
    $('#expert-thresholds-content').html(formatHtml(getBreaksInfo(freqDren), 'DREN') + formatHtml(getBreaksInfo(freqCisco), 'CISCO') + formatHtml(getBreaksInfo(freqZap), 'ZAP'));
}

function runExpertSystem(freqDren, freqCisco, freqZap) {
    renderExpertThresholds(freqDren, freqCisco, freqZap);
    let drensMap = getClusterMap(freqDren, 3), ciscosMap = getClusterMap(freqCisco, 3), zapsMap = getClusterMap(freqZap, 3);
    let expertResults = [];
    const applyRules = (map, type) => {
        for (let [name, cluster] of Object.entries(map)) {
            let count = type === 'DREN' ? freqDren[name] : (type === 'CISCO' ? freqCisco[name] : freqZap[name]);
            let status = "", rec = "", badgeClass = "";
            if (cluster === 0) {
                status = "CRITIQUE"; badgeClass = "bg-danger";
                rec = `Faible soumission des Formulaires KOBOTOOLBOX. Relance immédiate avec des Emails auprès des Responsables Locaux requise ou Appels Téléphoniques d'urgence ! Les descentes sur terrain auprès des Responsables Locaux doivent immédiatement être envisagées de toute urgence afin d'augmenter le nombre de soumissions des Formulaires KOBOTOOLBOX. De plus des Actions de Sensibilisation auprès des Responsables Locaux expliquant l'intérêt de la manipulation de KOBOTOOLBOX doivent être entreprises de toute urgence !`;
            } else if (cluster === 1) {
                status = "ATTENTION"; badgeClass = "bg-warning text-dark";
                rec = `Soumission Moyenne des Formulaires KOBOTOOLBOX. Soutenir les Responsables avec des Emails d'encouragement ! Les descentes sur terrain auprès des Responsables Locaux doivent être envisagées afin d'augmenter le nombre de soumissions des Formulaires KOBOTOOLBOX`;
            } else if (cluster === 2) {
                status = "OPTIMAL"; badgeClass = "bg-success";
                rec = `Forte soumission des Formulaires KOBOTOOLBOX. Féliciter et encourager les Responsables ! Les descentes sur terrain auprès des Responsables Locaux peuvent être maintenues afin de garder constant le nombre de soumissions des Formulaires KOBOTOOLBOX`;
            }
            expertResults.push({ name, type, count, cluster, status, rec, badgeClass });
        }
    };
    applyRules(drensMap, 'DREN'); applyRules(ciscosMap, 'CISCO'); applyRules(zapsMap, 'ZAP');
    expertResults.sort((a, b) => {
        if (a.cluster !== b.cluster) return a.cluster - b.cluster;
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        return a.name.localeCompare(b.name);
    });
    let tbody = $('#expert-table-body').empty();
    if (expertResults.length === 0) {
        tbody.append('<tr><td colspan="5" class="text-center text-muted">Aucune donnée à analyser.</td></tr>');
    } else {
        expertResults.forEach(res => {
            let tr = $('<tr></tr>');
            tr.append(`<td><strong>${res.name}</strong></td><td class="text-center"><span class="badge bg-secondary">${res.type}</span></td><td class="text-center"><span class="badge bg-light text-dark border">${res.count}</span></td><td class="text-center"><span class="badge ${res.badgeClass} p-2">${res.status}</span></td><td><em style="font-size: 0.95rem;">${res.rec}</em></td>`);
            tr.data('search', cleanSpaces(`${res.name} ${res.type} ${res.status} ${res.rec}`).toLowerCase());
            tbody.append(tr);
        });
    }
}

$('#search-expert-table').on('keyup', function() {
    let val = cleanSpaces($(this).val()).toLowerCase();
    $('#expert-table-body tr').filter(function() { let s = $(this).data('search'); if(!s) return; $(this).toggle(s.includes(val) || fuzzyMatch(val, s)); });
});

async function loadDictionaryAutomatically() {
    try {
        $('#sync-status').append('<span class="badge bg-info text-dark ms-2" id="dict-status"><i class="fas fa-spinner fa-spin"></i> Récupération du dictionnaire...</span>');
        const excelUrl = "dictionnaire.xlsx"; 
        const response = await fetch(excelUrl);
        if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const data = new Uint8Array(arrayBuffer);
            const workbook = XLSX.read(data, {type: 'array'});
            
            if(workbook.SheetNames.includes('survey')) {
                XLSX.utils.sheet_to_json(workbook.Sheets['survey']).forEach(row => {
                    if(row.name && row.type && (String(row.type).includes('select_one') || String(row.type).includes('select_multiple'))) {
                        let parts = String(row.type).trim().split(/\s+/);
                        if (parts.length > 1) questionListMap[String(row.name).trim().toLowerCase()] = parts[1].toLowerCase();
                    }
                });
            }
            if(workbook.SheetNames.includes('choices')) {
                XLSX.utils.sheet_to_json(workbook.Sheets['choices']).forEach(row => {
                    if(row.name !== undefined && row.label !== undefined) {
                        let code = String(row.name).trim().toLowerCase(), label = String(row.label).trim();
                        if (row.list_name) valueMap[String(row.list_name).trim().toLowerCase() + '::' + code] = label;
                        externalDict[code] = label;
                    }
                });
                isExcelLoaded = true;
            }
        }
        if (isExcelLoaded) $('#dict-status').replaceWith('<span class="badge bg-success ms-2"><i class="fas fa-check-circle"></i> Base Excel Synchronisée</span>');
        else throw new Error("Fichier Excel introuvable");
    } catch (e) {
        isExcelLoaded = false;
        $('#dict-status').replaceWith('<span class="badge bg-danger ms-2"><i class="fas fa-exclamation-triangle"></i> Dictionnaire Introuvable</span>');
    }
}

function toggleImageMode() { currentImageMode = $('input[name="imageDisplayMode"]:checked').val(); renderTable(allData); applyFilters(); }
function scrollTableLeft() { document.getElementById('table-scroll-container').scrollBy({ left: -400, behavior: 'smooth' }); }
function scrollTableRight() { document.getElementById('table-scroll-container').scrollBy({ left: 400, behavior: 'smooth' }); }
function scrollTableUp() { document.getElementById('table-scroll-container').scrollBy({ top: -400, behavior: 'smooth' }); }
function scrollTableDown() { document.getElementById('table-scroll-container').scrollBy({ top: 400, behavior: 'smooth' }); }
function scrollExpertLeft() { document.getElementById('expert-table-scroll-container').scrollBy({ left: -400, behavior: 'smooth' }); }
function scrollExpertRight() { document.getElementById('expert-table-scroll-container').scrollBy({ left: 400, behavior: 'smooth' }); }
function scrollExpertUp() { document.getElementById('expert-table-scroll-container').scrollBy({ top: -400, behavior: 'smooth' }); }
function scrollExpertDown() { document.getElementById('expert-table-scroll-container').scrollBy({ top: 400, behavior: 'smooth' }); }

function smartKoboAutoCorrect(text) {
    if (!text) return '';
    let t = cleanSpaces(text).toLowerCase();
    const corrections = { 'b_n_ficiaire': 'bénéficiaire', 'r_f_rentiel': 'référentiel', 'd_margement': "d'émargement", 'activit_': 'activité', 'num_ro': 'numéro', 'p_dagogique': 'pédagogique', 'g_n_ral': 'général', 'pr_sence': 'présence', 'dipl_me': 'diplôme', 't_l_phone': 'téléphone', 'cr_ation': 'création', 'r_union': 'réunion', 'd_tail': 'détail', 'fr_quence': 'fréquence', 'p_riode': 'période', 'd_but': 'début', 'cl_ture': 'clôture', 'mat_riel': 'matériel', 'r_ponse': 'réponse', 'identit_': 'identité', 'r_gion': 'région', 'd_partement': 'département', '_tablissement': 'établissement', '_cole': 'école', '_l_ve': 'élève', 's_curit_': 'sécurité' };
    for (const [bad, good] of Object.entries(corrections)) t = t.replace(new RegExp(bad, 'g'), good); 
    t = t.replace(/ (d|l|qu|s|m|t|n)_/g, "$1'").replace(/_/g, ' ');
    return t.charAt(0).toUpperCase() + t.slice(1);
}

function levenshtein(a, b) {
    if (a.length === 0) return b.length; if (b.length === 0) return a.length;
    let matrix = [];
    for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
    for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) { matrix[i][j] = matrix[i - 1][j - 1]; } 
            else { matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)); }
        }
    }
    return matrix[b.length][a.length];
}

function fuzzyMatch(query, target) {
    if (!query) return true; if (!target) return false;
    query = cleanSpaces(query).toLowerCase(); target = cleanSpaces(target).toLowerCase();
    if (target.includes(query)) return true;
    const qwList = query.split(/[\s,;.-]+/).filter(Boolean), twList = target.split(/[\s,;.-]+/).filter(Boolean);
    for (let qw of qwList) {
        let wordMatch = false;
        for (let tw of twList) {
            if (tw.includes(qw)) { wordMatch = true; break; }
            let minLen = Math.max(1, qw.length - 1), maxLen = Math.min(tw.length, qw.length + 1);
            for (let len = minLen; len <= maxLen; len++) {
                for (let i = 0; i <= tw.length - len; i++) {
                    if (levenshtein(qw, tw.substring(i, i + len)) <= 1) { wordMatch = true; break; }
                }
                if (wordMatch) break;
            }
            if (wordMatch) break;
        }
        if (!wordMatch) return false; 
    }
    return true;
}

function getTranslatedHeader(xmlName) {
    let key = String(xmlName).toLowerCase();
    const exactMatches = { 'vi_r_f_rentiel_standard_des_pr': "VI. Référentiel standard des preuves par type d'activité", 'date_enq': "Date de suivi", 'nombre_personnes': "Combien de personnes souhaitez-vous enregistrer ?", 'personnes': "Personne (Matricule, Nom et Prénom puis ORDRE DE MISSION)", 'liste_b_n_ficiaires': "Liste des bénéficiaires", 'liste_d_margement': "Liste d'émargement" };
    if (exactMatches[key]) return exactMatches[key];
    return smartKoboAutoCorrect(xmlName);
}

function getTranslatedValue(val, xmlName) {
    if (val === null || val === undefined || val === '') return '';
    if (Array.isArray(val)) return val; 
    let xmlNameLower = String(xmlName).toLowerCase();
    if (['realisation', 'nombre', 'montant', 'quantit', 'effectif'].some(kw => xmlNameLower.includes(kw)) || (xmlNameLower.includes('budget') && !xmlNameLower.includes('budgetiser'))) return cleanSpaces(val); 

    let isCodeLabelColumn = ['dren', 'cisco', 'zap', 'activite', 'produit', 'sous', 'vi_'].some(kw => xmlNameLower.includes(kw));
    let listName = questionListMap[xmlNameLower] || questionListMap[Object.keys(questionListMap).find(k => xmlNameLower.includes(k))];

    let translatedParts = String(val).split(' ').map(p => {
        let pClean = cleanSpaces(p), pLower = pClean.toLowerCase(), t = null;
        if (listName && valueMap[listName + '::' + pLower]) t = valueMap[listName + '::' + pLower];
        if (!t && externalDict[pLower] && (isCodeLabelColumn || pLower.length > 1 || isNaN(pLower))) t = externalDict[pLower];
        if (!t && xmlNameLower.includes('dren')) {
            const df = {'11':'ANALAMANGA', '12':'VAKINANKARATRA', '13':'ITASY', '14':'BONGOLAVA', '21':'HAUTE MATSIATRA', '22':"AMORON'I MANIA", '23':'VATOVAVY', '24':'FITOVINANY', '25':'ATSIMO ATSINANANA', '26':'IHOROMBE', '31':'ALAOTRA MANGORO', '32':'ATSINANANA', '33':'ANALANJIROFO', '41':'BOENY', '42':'SOFIA', '43':'BETSIBOKA', '44':'MELAKY', '51':'ATSIMO ANDREFANA', '52':'ANDROY', '53':'ANOSY', '54':'MENABE', '71':'DIANA', '72':'SAVA'};
            t = df[pClean];
        }
        return t ? (isCodeLabelColumn ? pClean + ' : ' + t : t) : pClean;
    });
    return cleanSpaces(translatedParts.join(' ; '));
}

function findXmlName(row, pk, ex, mk) {
    if (!row || typeof row !== 'object') return null;
    for (let key of Object.keys(row)) {
        let parts = key.split('/'), vName = parts[parts.length - 1].toLowerCase();
        if (ex && ex.some(e => vName.includes(e))) continue;
        if (mk && mk.length > 0 && !mk.every(req => vName.includes(req))) continue;
        for (let p of pk) if (vName.includes(p)) return parts[parts.length - 1];
    }
    return null;
}

function getKoboValue(row, pk, ex = [], mk = []) {
    let ox = findXmlName(row, pk, ex, mk);
    if (ox) {
        for (let key of Object.keys(row)) if (key.endsWith('/' + ox) || key === ox) return getTranslatedValue(row[key], ox);
    }
    return '';
}

function isBaseColumn(key) {
    let vName = key.split('/').pop().toLowerCase();
    for (let col of baseColsInfo) {
        if (!(col.ex && col.ex.some(e => vName.includes(e))) && (col.mustMatch.length === 0 || col.mustMatch.every(m => vName.includes(m))) && col.matches.some(m => vName.includes(m))) return true;
    }
    return false;
}

async function fetchData() {
    $('#loading-box').show(); $('#error-box').hide();
    $('#table-body').empty(); $('#table-group-header-row').empty(); $('#table-sub-header-row').empty();
    $('#sync-status').html('<span class="badge bg-warning text-dark sync-badge"><i class="fas fa-spinner fa-spin"></i> Collecte en cours...</span>');
    
    await loadDictionaryAutomatically();

    try {
        const koboUrl = 'https://kf.kobotoolbox.org/api/v2/assets/ath6cv2NrXEUijffeKJqSf/data.json?_t=' + new Date().getTime();
        
        // Liste des 4 solutions de secours (Proxys multiples + Tentative directe)
        const fetchUrls = [
            koboUrl, // 1. On tente d'abord la connexion directe propre !
            'https://api.allorigins.win/raw?url=' + encodeURIComponent(koboUrl), // 2. Proxy de secours 1
            'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(koboUrl), // 3. Proxy de secours 2
            'https://corsproxy.io/?' + encodeURIComponent(koboUrl) // 4. Proxy de secours 3
        ];

        let response = null;
        let fetchSuccess = false;

        // Boucle Anti-Blocage : on teste chaque URL une par une
        for (let url of fetchUrls) {
            try {
                console.log("Tentative de connexion via :", url);
                response = await fetch(url, { cache: 'no-store' });
                if (response.ok) {
                    fetchSuccess = true;
                    break; // Succès ! On arrête de chercher et on sort de la boucle.
                }
            } catch (e) {
                console.warn("Le navigateur a bloqué l'accès via :", url);
            }
        }

        if (!fetchSuccess) {
            throw new Error("La sécurité de Firefox (ou AdBlock) bloque toutes les connexions. Veuillez importer votre fichier JSON manuellement via le bouton en haut.");
        }
        
        const payload = await response.json();
        allData = extractKoboRecordsFromPayload(payload).filter(row => row !== null && typeof row === 'object' && !Array.isArray(row));
        
        renderTable(allData);
        renderAnalysis(allData);
        if (typeof window.refreshAdvancedAnalysisFromMainData === 'function') window.refreshAdvancedAnalysisFromMainData(allData);
        
        let bEx = isExcelLoaded ? '<span class="badge bg-success ms-2"><i class="fas fa-check-circle"></i> Traduit</span>' : '<span class="badge bg-warning text-dark ms-2"><i class="fas fa-info-circle"></i> Brut</span>';
        $('#sync-status').html(`<span class="badge bg-success sync-badge"><i class="fas fa-check-double"></i> Ok : ${allData.length} Lignes</span>`).append(bEx);

    } catch (error) {
        $('#error-box').html('<strong>Erreur de sécurité réseau :</strong> ' + error.message).show();
        $('#sync-status').html('<span class="badge bg-danger sync-badge">Échec Kobo</span>');
    } finally { 
        $('#loading-box').hide(); 
    }
}

function renderTable(data) {
    const tbody = $('#table-body').empty(), gHeaderTr = $('#table-group-header-row').empty(), sHeaderTr = $('#table-sub-header-row').empty();
    if (data.length === 0) {
        gHeaderTr.append('<th class="group-header-survey">Données</th>'); sHeaderTr.append('<th class="sub-header-survey">Vide</th>');
        tbody.append('<tr><td class="text-center py-4 text-muted">Base de données vide.</td></tr>'); $('#record-count').text(0); return;
    }

    for(let r of data) baseColsInfo.forEach(col => { if (!col.xmlName) { let f = findXmlName(r, col.matches, col.ex, col.mustMatch); if (f) col.xmlName = f; }});

    let exSet = new Set(), mtSet = new Set();
    data.forEach(row => {
        Object.keys(row).forEach(key => {
            if (key === '_attachments' || key === '_validation_status' || isBaseColumn(key)) return; 
            let vName = key.split('/').pop().toLowerCase();
            if (metaKeywords.some(kw => vName.includes(kw.replace(/_/g, ''))) || vName.startsWith('_')) mtSet.add(key); else exSet.add(key);
        });
    });

    let exKeys = Array.from(exSet), mtKeys = Array.from(mtSet);

    exKeys.sort((a, b) => {
        let nameA = a.split('/').pop().toLowerCase();
        let nameB = b.split('/').pop().toLowerCase();
        let rank = (name) => {
            if (name.includes('date_enq') || name.includes('date de suivi')) return -10;
            if (name.includes('realisation') || name.includes('quantit') || name.includes('effectif') || name.includes('montant')) return -9;
            if (name.includes('sous_activite_finale') || name === 'sous_activite_finale') return 100;
            if (name.startsWith('sa_part')) return 101;
            return 0; 
        };
        let rA = rank(nameA), rB = rank(nameB);
        if (rA === 101 && rB === 101) {
            let numA = parseInt(nameA.replace(/\D/g, '')) || 0;
            let numB = parseInt(nameB.replace(/\D/g, '')) || 0;
            return numA - numB;
        }
        if (rA !== rB) return rA - rB;
        return nameA.localeCompare(nameB);
    });

    mtKeys.sort((a, b) => {
        let nameA = a.split('/').pop().toLowerCase();
        let nameB = b.split('/').pop().toLowerCase();
        let rank = (name) => {
            if (name === '_id' || name === 'id') return 1;
            if (name === '_uuid' || name === 'uuid') return 2;
            return 3;
        };
        let rA = rank(nameA), rB = rank(nameB);
        if (rA !== rB) return rA - rB;
        return nameA.localeCompare(nameB);
    });

    let signatureMap = {};
    data.forEach((r, idx) => {
        let valDren = cleanSpaces(getKoboValue(r, ['dren'], ['activite', 'produit', 'budget', 'cisco', 'zap', 'sous'], []));
        let valCisco = cleanSpaces(getKoboValue(r, ['cisco'], ['activite', 'produit', 'budget', 'dren', 'zap', 'sous'], []));
        let valZap = cleanSpaces(getKoboValue(r, ['zap'], ['activite', 'produit', 'budget', 'dren', 'cisco', 'sous'], []));
        let valAct = cleanSpaces(getKoboValue(r, ['activite', 'activité'], ['sous_activite', 'sous-activite'], []));
        let valProd = cleanSpaces(getKoboValue(r, ['produit'], ['sous_produit', 'sous-produit'], []));
        let valSAct = cleanSpaces(getKoboValue(r, ['sous_activite', 'sous-activite'], [], []));
        
        let matsRaw = extractMatricules(r);
        let matsArray = matsRaw ? matsRaw.split(';').map(m => m.trim()).filter(Boolean) : ["Non renseigné"];
        
        matsArray.forEach(mat => {
            let sig = [valDren, valCisco, valZap, valAct, valProd, valSAct, mat].join("|||");
            if (!signatureMap[sig]) signatureMap[sig] = [];
            signatureMap[sig].push(idx);
        });
    });
    
    let doublonCounter = 1;
    let rowToDoublonIds = {};
    for (let sig in signatureMap) {
        if (signatureMap[sig].length > 1) {
            let dName = "Doublon " + doublonCounter;
            doublonCounter++;
            signatureMap[sig].forEach(rowIdx => {
                if (!rowToDoublonIds[rowIdx]) rowToDoublonIds[rowIdx] = [];
                if (!rowToDoublonIds[rowIdx].includes(dName)) rowToDoublonIds[rowIdx].push(dName);
            });
        }
    }

    gHeaderTr.append(`<th class="group-header-survey" colspan="3" style="background-color: #f39c12 !important;"><i class="fas fa-bolt"></i> Statut & Action</th>`);
    if (baseColsInfo.length + exKeys.length > 0) gHeaderTr.append(`<th colspan="${baseColsInfo.length + exKeys.length}" class="group-header-survey"><i class="fas fa-edit"></i> Matrice Complète</th>`);
    if (mtKeys.length > 0) gHeaderTr.append(`<th colspan="${mtKeys.length}" class="group-header-meta"><i class="fas fa-cogs"></i> Métadonnées</th>`);

    sHeaderTr.append(`<th class="sub-header-survey" style="background-color: #8e44ad !important; color: white; width: 150px;">Anomalie Colonne Sous activite finale</th>`);
    sHeaderTr.append(`<th class="sub-header-survey" style="background-color: #c0392b !important; color: white; width: 100px;">DOUBLON</th>`);
    sHeaderTr.append(`<th class="sub-header-survey" style="background-color: #e67e22 !important; width: 100px;">Éditer (Kobo)</th>`);
    
    baseColsInfo.forEach(col => sHeaderTr.append(`<th class="sub-header-survey">${col.label}</th>`));
    
    exKeys.forEach(key => {
        let xmlName = key.split('/').pop();
        let translatedHeader = getTranslatedHeader(xmlName);
        let isHL = translatedHeader.toLowerCase().includes('date de suivi') || translatedHeader.toLowerCase().includes('réalisation') || translatedHeader.toLowerCase().includes('realisation') || xmlName.toLowerCase().includes('date_enq');
        let style = isHL ? 'background-color: #2ecc71 !important; color: white !important; font-size: 1.05rem; border: 2px solid #27ae60 !important; font-weight: 800;' : '';
        sHeaderTr.append(`<th class="sub-header-survey" style="${style}">${translatedHeader}</th>`);
    });
    
    mtKeys.forEach(key => sHeaderTr.append(`<th class="sub-header-meta">${getTranslatedHeader(key.split('/').pop())}</th>`));

    function formatExtra(val, rowData, xmlName, isRaw) {
        if (val === null || val === undefined) return '';
        let tVal = getTranslatedValue(val, xmlName);
        let parts = Array.isArray(tVal) ? tVal.map(i => (typeof i === 'object' && i !== null) ? Object.values(i).join(' | ') : String(i)) : [String(tVal)];
        if(xmlName.includes('ENTITE') || xmlName.includes('OBSERVATIONS')) parts = [...new Set(parts.flatMap(p => p.split(/\s*;\s*/)).filter(Boolean))];

        return cleanSpaces(parts.map(p => {
            if (!rowData || !rowData._attachments) return p;
            let processed = p.split(' | ').map(subStr => {
                let att = rowData._attachments.find(a => a.media_file_basename === subStr);
                if (att && att.download_url) {
                    if (isRaw) return att.download_url;
                    let isImage = ((att.mimetype && att.mimetype.startsWith('image/')) || (att.filename && att.filename.match(/\.(jpeg|jpg|png|gif)$/i)));
                    if (currentImageMode === 'image' && isImage) {
                        return `<a href="${att.download_url}" target="_blank"><img src="${att.download_url}" class="table-img"></a>`;
                    }
                    let hoverAttrs = isImage ? `onmouseover="showImagePreview(event, '${att.download_url}')" onmouseout="hideImagePreview()" onmousemove="moveImagePreview(event)"` : '';
                    return `<a href="${att.download_url}" target="_blank" class="text-primary text-decoration-underline" ${hoverAttrs}><i class="fas fa-link"></i> Lien</a>`;
                }
                return subStr;
            });
            return processed.join(' | ');
        }).join(' ; '));
    }

    data.forEach((row, idx) => {
        const tr = $('<tr></tr>'); let sData = {};
        
        let colZap = baseColsInfo.find(c => c.key === 'zap');
        let colCisco = baseColsInfo.find(c => c.key === 'cisco');
        let colDren = baseColsInfo.find(c => c.key === 'dren');
        let vZap = cleanSpaces(getKoboValue(row, colZap.matches, colZap.ex, colZap.mustMatch));
        let vCisco = cleanSpaces(getKoboValue(row, colCisco.matches, colCisco.ex, colCisco.mustMatch));
        let vDren = cleanSpaces(getKoboValue(row, colDren.matches, colDren.ex, colDren.mustMatch));
        let entityName = vZap || vCisco || vDren || "cette soumission";
        
        let valSAct = cleanSpaces(getKoboValue(row, ['sous_activite', 'sous-activite'], [], []));
        
        let isAnomaly = (!valSAct || valSAct.toLowerCase() === 'non renseigné');
        sData.isAnomaly = isAnomaly; 
        let anomalyText = isAnomaly ? "Anomalie de Liaison entre ACTIVITE et PRODUIT et SOUS ACTIVITE dans le Fichier xlsform PARENT" : "Valide";
        let anomalyHtml = isAnomaly 
            ? `<span class="badge bg-danger shadow-sm text-wrap" style="font-size: 0.8rem; line-height: 1.2; width: 140px; white-space: normal;"><i class="fas fa-exclamation-triangle"></i> Anomalie de Liaison entre ACTIVITE et PRODUIT et SOUS ACTIVITE dans le Fichier xlsform PARENT</span>`
            : `<span class="badge bg-success shadow-sm" style="font-size: 0.85rem;"><i class="fas fa-check"></i> Valide</span>`;
        tr.append($('<td></td>').attr('data-csv', anomalyText).html(anomalyHtml));

        let doublonsForRow = rowToDoublonIds[idx] || [];
        sData.isDoublon = doublonsForRow.length > 0;
        let doublonHtml = doublonsForRow.length > 0 
            ? doublonsForRow.map(d => `<span class="badge bg-danger shadow-sm mb-1" style="font-size: 0.85rem;"><i class="fas fa-exclamation-triangle"></i> ${d}</span>`).join('<br>')
            : `<span class="badge bg-success shadow-sm" style="font-size: 0.85rem;"><i class="fas fa-check"></i> Unique</span>`;
        let doublonText = doublonsForRow.length > 0 ? doublonsForRow.join(', ') : 'Unique';
        tr.append($('<td></td>').attr('data-csv', doublonText).html(doublonHtml));
        
        let editUrl = row['_id'] ? `https://kf.kobotoolbox.org/api/v2/assets/ath6cv2NrXEUijffeKJqSf/data/${row['_id']}/edit/` : '#';
        let editBtnHtml = row['_id'] 
            ? `<a href="${editUrl}" target="_blank" class="btn btn-warning btn-sm shadow-sm text-dark fw-bold" data-bs-toggle="tooltip" data-bs-placement="top" title="Modifier ${entityName.replace(/"/g, '&quot;')}"><i class="fas fa-pencil-alt"></i> Éditer</a>`
            : `<button class="btn btn-secondary btn-sm" disabled>Non dispo.</button>`;
        tr.append($('<td></td>').attr('data-csv', editUrl).html(editBtnHtml));
        
        baseColsInfo.forEach(col => {
            let val = getKoboValue(row, col.matches, col.ex, col.mustMatch);
            tr.append($('<td></td>').attr('data-csv', val).text(val)); sData[col.key] = cleanSpaces(String(val)).toLowerCase();
            sData.subDateObj = row['_submission_time'] ? new Date(row['_submission_time']) : null;
        });
        
        exKeys.concat(mtKeys).forEach(key => {
            let xmlName = key.split('/').pop();
            let translatedHeader = getTranslatedHeader(xmlName);
            let isHL = translatedHeader.toLowerCase().includes('date de suivi') || translatedHeader.toLowerCase().includes('réalisation') || translatedHeader.toLowerCase().includes('realisation') || xmlName.toLowerCase().includes('date_enq');
            let style = isHL ? 'background-color: #eafaf1 !important; color: #1e8449 !important; font-weight: 900; font-size: 1.1rem; border-left: 2px solid #2ecc71 !important; border-right: 2px solid #2ecc71 !important;' : '';

            let td = $(`<td style="${style}"></td>`).attr('data-csv', formatExtra(row[key], row, xmlName, true)).html(formatExtra(row[key], row, xmlName, false));
            tr.append(td);
            
            let xmlNameLow = xmlName.toLowerCase();
            if(xmlNameLow.includes('date') && (xmlNameLow.includes('realisation') || xmlNameLow.includes('enq'))) {
                let parsedD = new Date(row[key]);
                if(!isNaN(parsedD)) sData.realDateObj = parsedD;
            }
            if(xmlNameLow.includes('realisation') || xmlNameLow.includes('quantit') || xmlNameLow.includes('effectif') || xmlNameLow.includes('montant')) {
                let parsedVal = parseFloat(row[key]);
                if(!isNaN(parsedVal)) sData.realValue = parsedVal;
            }
        });
        tr.data('search', sData); tbody.append(tr);
    });
    $('#record-count').text(data.length);
    $('[data-bs-toggle="tooltip"]').tooltip();
}

function renderAlgorithmChart(algo, canvasId, listContainerId, rulesContainerId, freqData, existingChart, setChartRef) {
    if (existingChart) existingChart.destroy();
    
    let entries = Object.entries(freqData).filter(([k,v]) => k !== "Non renseigné");
    if (entries.length === 0) { 
        document.getElementById(listContainerId).innerHTML = ''; 
        document.getElementById(rulesContainerId).innerHTML = '';
        return; 
    }
    
    entries.sort((a,b) => a[1] - b[1]); 
    let counts = entries.map(e => e[1]);
    let labels = entries.map(e => e[0]);
    let formattedLabels = labels.map(l => wrapLabel(l, 25)); 
    
    let assignments = [], clusterDefs = {};
    let rulesHtml = '';

    if (algo === 'kmeans') {
        assignments = perform1DKMeans(counts, 3);
        clusterDefs = {
            0: { title: "Activité Faible", bg: 'rgba(52, 152, 219, 0.7)', border: 'rgba(41, 128, 185, 1)', cardBg: 'bg-primary text-white', badge: 'bg-primary' },
            1: { title: "Activité Moyenne", bg: 'rgba(243, 156, 18, 0.7)', border: 'rgba(211, 84, 0, 1)', cardBg: 'bg-warning text-dark', badge: 'bg-warning text-dark' },
            2: { title: "Forte Activité", bg: 'rgba(39, 174, 96, 0.7)', border: 'rgba(46, 204, 113, 1)', cardBg: 'bg-success text-white', badge: 'bg-success' }
        };
        
        let c0 = counts.filter((_, i) => assignments[i] === 0);
        let c1 = counts.filter((_, i) => assignments[i] === 1);
        let c2 = counts.filter((_, i) => assignments[i] === 2);
        
        let min0 = c0.length ? Math.min(...c0) : 0, max0 = c0.length ? Math.max(...c0) : 0;
        let min1 = c1.length ? Math.min(...c1) : 0, max1 = c1.length ? Math.max(...c1) : 0;
        let min2 = c2.length ? Math.min(...c2) : 0, max2 = c2.length ? Math.max(...c2) : 0;

        rulesHtml = `<div class="alert alert-info py-2 mb-3 shadow-sm border-info" style="font-size: 0.95rem;">
            <strong><i class="fas fa-search"></i> Seuils stricts calculés et appliqués par le K-Means :</strong><br>
            <div class="mt-2 d-flex flex-wrap gap-2">
                <span class="badge bg-primary fs-6 fw-normal">Faible : de ${min0} à ${max0} soum.</span>
                <span class="badge bg-warning text-dark fs-6 fw-normal">Moyenne : de ${min1} à ${max1} soum.</span>
                <span class="badge bg-success fs-6 fw-normal">Forte : de ${min2} à ${max2} soum.</span>
            </div>
        </div>`;

    } else if (algo === 'jenks') {
        assignments = performJenks(counts, 3);
        clusterDefs = {
            0: { title: "Activité Faible", bg: 'rgba(52, 152, 219, 0.7)', border: 'rgba(41, 128, 185, 1)', cardBg: 'bg-primary text-white', badge: 'bg-primary' },
            1: { title: "Activité Moyenne", bg: 'rgba(243, 156, 18, 0.7)', border: 'rgba(211, 84, 0, 1)', cardBg: 'bg-warning text-dark', badge: 'bg-warning text-dark' },
            2: { title: "Forte Activité", bg: 'rgba(39, 174, 96, 0.7)', border: 'rgba(46, 204, 113, 1)', cardBg: 'bg-success text-white', badge: 'bg-success' }
        };

        let uniqueCounts = [...new Set(counts)];
        if(uniqueCounts.length > 3) {
            let br = getJenksBreaks(counts, 3);
            rulesHtml = `<div class="alert alert-success py-2 mb-3 shadow-sm border-success" style="font-size: 0.95rem;">
                <strong><i class="fas fa-search"></i> Ruptures naturelles calculées et appliquées par Jenks :</strong><br>
                <div class="mt-2 d-flex flex-wrap gap-2">
                    <span class="badge bg-primary fs-6 fw-normal">Faible : de ${br[0]} à ${br[1]} soum.</span>
                    <span class="badge bg-warning text-dark fs-6 fw-normal">Moyenne : de ${br[1]+1} à ${br[2]} soum.</span>
                    <span class="badge bg-success fs-6 fw-normal">Forte : de ${br[2]+1} à ${br[3]} soum.</span>
                </div>
            </div>`;
        } else {
            rulesHtml = `<div class="alert alert-secondary py-2 mb-3 shadow-sm" style="font-size: 0.95rem;">Données trop homogènes pour définir des ruptures claires.</div>`;
        }

    } else if (algo === 'dbscan') {
        let res = performDBSCAN(counts);
        assignments = res.assignments;
        
        const cp = [
            {bg: 'rgba(52, 152, 219, 0.7)', b:'rgba(41, 128, 185, 1)', c:'bg-primary text-white', lb:'bg-primary'},
            {bg: 'rgba(39, 174, 96, 0.7)', b:'rgba(46, 204, 113, 1)', c:'bg-success text-white', lb:'bg-success'},
            {bg: 'rgba(243, 156, 18, 0.7)', b:'rgba(211, 84, 0, 1)', c:'bg-warning text-dark', lb:'bg-warning text-dark'},
            {bg: 'rgba(155, 89, 182, 0.7)', b:'rgba(142, 68, 173, 1)', c:'bg-secondary text-white', lb:'bg-secondary'},
            {bg: 'rgba(52, 73, 94, 0.7)', b:'rgba(44, 62, 80, 1)', c:'bg-dark text-white', lb:'bg-dark'}
        ];
        
        clusterDefs[-1] = { title: "Bruit / Anomalies", bg: 'rgba(231, 76, 60, 0.7)', border: 'rgba(192, 57, 43, 1)', cardBg: 'bg-danger text-white', badge: 'bg-danger' };
        for(let i=0; i<res.numClusters; i++) {
            let p = cp[i % cp.length];
            clusterDefs[i] = { title: "Groupe " + (i+1), bg: p.bg, border: p.b, cardBg: p.c, badge: p.lb };
        }

        rulesHtml = `<div class="alert alert-danger py-2 mb-3 shadow-sm border-danger" style="font-size: 0.95rem;">
            <strong><i class="fas fa-search"></i> Règles de Densité appliquées par DBSCAN :</strong><br>
            <ul class="mb-0 mt-1">
                <li>Rayon de recherche (&epsilon;) calculé : <strong>&plusmn; ${res.eps.toFixed(1)} soumissions</strong></li>
                <li>Seuil de validation (MinPts) : <strong>Au moins 2 entités</strong> requises pour forming un groupe valide.</li>
            </ul>
            <em class="mt-1 d-block">Toute entité isolée au-delà de ce rayon est classée en <span class="badge bg-danger">Anomalie (Bruit)</span>.</em>
        </div>`;
    }

    document.getElementById(rulesContainerId).innerHTML = rulesHtml;

    let bgColors = assignments.map(a => clusterDefs[a].bg);
    let bdColors = assignments.map(a => clusterDefs[a].border);
    
    let ctx = document.getElementById(canvasId).getContext('2d');
    let newChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: formattedLabels,
            datasets: [{
                label: 'Soumissions (' + algo.toUpperCase() + ')',
                data: counts,
                backgroundColor: bgColors, borderColor: bdColors, borderWidth: 1, borderRadius: 5
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            layout: { padding: { left: 30, bottom: 30, right: 30, top: 20 } },
            plugins: {
                tooltip: {
                    callbacks: {
                        title: function(context) { return labels[context[0].dataIndex]; },
                        afterLabel: function(context) { return `Catégorie : ${clusterDefs[assignments[context.dataIndex]].title}`; }
                    }
                }
            },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Soumissions' } },
                x: { display: true, ticks: { maxRotation: 45, minRotation: 45, autoSkip: false, font: { size: 11 } } }
            }
        }
    });
    setChartRef(newChart);

    let clusterGroups = {};
    for(let key in clusterDefs) clusterGroups[key] = [];
    for (let i = 0; i < entries.length; i++) clusterGroups[assignments[i]].push({ name: labels[i], count: counts[i] });

    let htmlLists = `<div class="row mt-4">`;
    let keys = Object.keys(clusterDefs).map(Number);
    
    if(algo === 'kmeans' || algo === 'jenks') keys.sort((a,b)=>b-a);
    else { 
        keys.sort((a,b)=>b-a);
        let nIdx = keys.indexOf(-1);
        if(nIdx > -1) { keys.splice(nIdx, 1); keys.push(-1); }
    }

    keys.forEach(k => {
        clusterGroups[k].sort((a, b) => b.count - a.count);
        if(algo === 'dbscan' && k === -1) {
            let lvl = canvasId.includes('DREN') ? 'DREN' : (canvasId.includes('CISCO') ? 'CISCO' : 'ZAP');
            globalDBSCANAnomalies[lvl] = clusterGroups[k].map(item => ({name: item.name, count: item.count, level: lvl}));
        }
        if(algo === 'dbscan' && k === -1 && clusterGroups[k].length === 0) return;
        
        let def = clusterDefs[k];
        let icon = k === -1 ? 'fa-exclamation-triangle' : (k === 2 ? 'fa-arrow-up' : (k === 0 ? 'fa-arrow-down' : 'fa-check'));
        
        htmlLists += `
            <div class="col-md-4">
                <div class="card mb-3 shadow-sm border" style="border-color: ${def.border}; border-width: 2px;">
                    <div class="card-header ${def.cardBg} fw-bold"><i class="fas ${icon}"></i> ${def.title}</div>
                    <ul class="list-group list-group-flush" style="max-height: 300px; overflow-y: auto;">
        `;
        clusterGroups[k].forEach(item => {
            htmlLists += `<li class="list-group-item d-flex justify-content-between align-items-center">${item.name} <span class="badge ${def.badge} rounded-pill fs-6">${item.count}</span></li>`;
        });
        if(clusterGroups[k].length === 0) htmlLists += `<li class="list-group-item text-muted">Aucune entité</li>`;
        htmlLists += `</ul></div></div>`;
    });
    
    htmlLists += `</div>`;
    document.getElementById(listContainerId).innerHTML = htmlLists;
}

function parseSubmissionDate(value) {
    if (value === null || value === undefined || value === '') return null;

    if (value instanceof Date && !isNaN(value.getTime())) {
        return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
    }

    if (typeof value === 'number' && isFinite(value)) {
        if (typeof XLSX !== 'undefined' && XLSX.SSF && XLSX.SSF.parse_date_code) {
            let parts = XLSX.SSF.parse_date_code(value);
            if (parts) return new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
        }
        let excelDate = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
        return isNaN(excelDate.getTime()) ? null : excelDate;
    }

    let text = cleanSpaces(value);
    let isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        return new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])));
    }

    let frMatch = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
    if (frMatch) {
        return new Date(Date.UTC(Number(frMatch[3]), Number(frMatch[2]) - 1, Number(frMatch[1])));
    }

    let parsed = new Date(text);
    if (isNaN(parsed.getTime())) return null;
    return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function formatISODateUTC(date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function getSubmissionTimelineBucketDate(date, granularity) {
    let bucketDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

    if (granularity === 'week') {
        let day = bucketDate.getUTCDay();
        let daysFromMonday = day === 0 ? 6 : day - 1;
        bucketDate.setUTCDate(bucketDate.getUTCDate() - daysFromMonday);
    } else if (granularity === 'month') {
        bucketDate = new Date(Date.UTC(bucketDate.getUTCFullYear(), bucketDate.getUTCMonth(), 1));
    } else if (granularity === 'quarter') {
        let quarterMonth = Math.floor(bucketDate.getUTCMonth() / 3) * 3;
        bucketDate = new Date(Date.UTC(bucketDate.getUTCFullYear(), quarterMonth, 1));
    } else if (granularity === 'semester') {
        let semesterMonth = bucketDate.getUTCMonth() < 6 ? 0 : 6;
        bucketDate = new Date(Date.UTC(bucketDate.getUTCFullYear(), semesterMonth, 1));
    } else if (granularity === 'year') {
        bucketDate = new Date(Date.UTC(bucketDate.getUTCFullYear(), 0, 1));
    }

    return bucketDate;
}

function getSubmissionTimelineBucket(date, granularity) {
    return formatISODateUTC(getSubmissionTimelineBucketDate(date, granularity));
}

function addSubmissionTimelineBucket(date, granularity) {
    let next = new Date(date.getTime());
    if (granularity === 'day') next.setUTCDate(next.getUTCDate() + 1);
    else if (granularity === 'week') next.setUTCDate(next.getUTCDate() + 7);
    else if (granularity === 'month') next.setUTCMonth(next.getUTCMonth() + 1);
    else if (granularity === 'quarter') next.setUTCMonth(next.getUTCMonth() + 3);
    else if (granularity === 'semester') next.setUTCMonth(next.getUTCMonth() + 6);
    else next.setUTCFullYear(next.getUTCFullYear() + 1);
    return next;
}

function generateSubmissionTimelineBuckets(startDate, endDate, granularity) {
    if (!startDate || !endDate) return [];
    let first = getSubmissionTimelineBucketDate(startDate, granularity);
    let last = getSubmissionTimelineBucketDate(endDate, granularity);
    if (first > last) [first, last] = [last, first];

    let buckets = [];
    let cursor = new Date(first.getTime());
    let safety = 0;
    while (cursor <= last && safety < 5000) {
        buckets.push(formatISODateUTC(cursor));
        cursor = addSubmissionTimelineBucket(cursor, granularity);
        safety++;
    }
    return buckets;
}

function formatSubmissionTimelineLabel(bucketKey, granularity) {
    let date = parseSubmissionDate(bucketKey);
    if (!date) return bucketKey;
    let year = date.getUTCFullYear();
    let month = date.getUTCMonth();

    if (granularity === 'year') return String(year);
    if (granularity === 'semester') return `S${month < 6 ? 1 : 2} ${year}`;
    if (granularity === 'quarter') return `T${Math.floor(month / 3) + 1} ${year}`;
    if (granularity === 'month') return date.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric', timeZone: 'UTC' });

    let formatted = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
    return granularity === 'week' ? `Sem. du ${formatted}` : formatted;
}

function getSubmissionTimelineAxisTitle(granularity) {
    return {
        day: 'Jour de soumission',
        week: 'Semaine de soumission',
        month: 'Mois de soumission',
        quarter: 'Trimestre de soumission',
        semester: 'Semestre de soumission',
        year: 'Année de soumission'
    }[granularity] || 'Période de soumission';
}

function getSubmissionEntityValue(row, level) {
    let col = baseColsInfo.find(c => c.key === level.toLowerCase());
    if (!col) return '';
    return cleanSpaces(getKoboValue(row, col.matches, col.ex, col.mustMatch));
}

function getSubmissionTimelineColor(index, alpha) {
    let hue = Math.round((index * 137.508) % 360);
    return `hsla(${hue}, 68%, 43%, ${alpha})`;
}

function getSubmissionTimelinePointStyle(index) {
    const styles = ['circle', 'rectRot', 'triangle', 'rect', 'star', 'crossRot', 'cross'];
    return styles[index % styles.length];
}

function getSubmissionTimelineDash(index) {
    const patterns = [[], [8, 4], [3, 3], [10, 3, 2, 3], [2, 5], [12, 5]];
    return patterns[index % patterns.length];
}

function destroySubmissionTimelineIndividualCharts(level) {
    (submissionTimelineIndividualChartsRefs[level] || []).forEach(chart => {
        if (chart && typeof chart.destroy === 'function') chart.destroy();
    });
    submissionTimelineIndividualChartsRefs[level] = [];
}

function buildSubmissionTimelineModel(level, datedRows, bucketKeys, granularity, displayMode) {
    let entityTotals = {};
    let valuesByEntity = {};

    datedRows.forEach(item => {
        let entity = getSubmissionEntityValue(item.row, level);
        if (!entity || entity.toLowerCase() === 'non renseigné') return;
        let bucket = getSubmissionTimelineBucket(item.date, granularity);
        entityTotals[entity] = (entityTotals[entity] || 0) + 1;
        if (!valuesByEntity[entity]) valuesByEntity[entity] = {};
        valuesByEntity[entity][bucket] = (valuesByEntity[entity][bucket] || 0) + 1;
    });

    let rankedEntities = Object.entries(entityTotals)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'));

    let series = {};
    rankedEntities.forEach(([entity]) => {
        let runningTotal = 0;
        series[entity] = bucketKeys.map(bucket => {
            let value = valuesByEntity[entity][bucket] || 0;
            if (displayMode === 'cumulative') {
                runningTotal += value;
                return runningTotal;
            }
            return value;
        });
    });

    return { entityTotals, rankedEntities, series };
}

function updateSubmissionTimelineLegend(level, chart) {
    const legendContainer = document.getElementById(`timeline-legend-${level.toLowerCase()}`);
    if (!legendContainer || !chart) return;
    legendContainer.innerHTML = '';

    chart.data.datasets.forEach((dataset, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'timeline-legend-item';
        button.title = `Masquer ou afficher ${dataset.label}`;

        const swatch = document.createElement('span');
        swatch.className = 'timeline-legend-swatch';
        swatch.style.borderColor = dataset.borderColor;
        swatch.style.borderStyle = dataset.borderDash && dataset.borderDash.length ? 'dashed' : 'solid';

        const text = document.createElement('span');
        text.className = 'timeline-legend-text';
        text.textContent = dataset.label;

        button.appendChild(swatch);
        button.appendChild(text);
        button.addEventListener('click', function() {
            chart.setDatasetVisibility(index, !chart.isDatasetVisible(index));
            button.classList.toggle('is-hidden', !chart.isDatasetVisible(index));
            chart.update();
        });
        legendContainer.appendChild(button);
    });
}

function buildSubmissionTimelineDataset(entity, values, index, bucketCount) {
    let color = getSubmissionTimelineColor(index, 1);
    return {
        label: entity,
        data: values,
        borderColor: color,
        backgroundColor: getSubmissionTimelineColor(index, 0.10),
        pointBackgroundColor: color,
        pointBorderColor: '#ffffff',
        pointBorderWidth: 1,
        pointStyle: getSubmissionTimelinePointStyle(index),
        pointRadius: bucketCount > 45 ? 0 : 3,
        pointHoverRadius: 6,
        borderDash: getSubmissionTimelineDash(index),
        borderWidth: 2.2,
        tension: 0.18,
        fill: false,
        spanGaps: true
    };
}

function getSubmissionTimelineChartOptions(granularity, displayMode, datasetCount, showLegend) {
    const dataLabel = displayMode === 'cumulative' ? 'Nombre cumulé de soumissions' : 'Nombre de soumissions';
    return {
        responsive: true,
        maintainAspectRatio: false,
        normalized: true,
        animation: datasetCount > 20 ? false : { duration: 350 },
        interaction: { mode: datasetCount > 1 ? 'index' : 'nearest', intersect: false },
        plugins: {
            legend: { display: !!showLegend },
            tooltip: {
                callbacks: {
                    title: items => items.length ? `Période : ${items[0].label}` : '',
                    label: context => `${context.dataset.label} : ${context.parsed.y} soumission${context.parsed.y > 1 ? 's' : ''}${displayMode === 'cumulative' ? ' cumulée(s)' : ''}`
                }
            }
        },
        scales: {
            x: {
                title: { display: true, text: getSubmissionTimelineAxisTitle(granularity), font: { weight: 'bold' } },
                ticks: { autoSkip: true, maxTicksLimit: 16, maxRotation: 0, minRotation: 0 },
                grid: { display: false }
            },
            y: {
                beginAtZero: true,
                title: { display: true, text: dataLabel, font: { weight: 'bold' } },
                ticks: { precision: 0 }
            }
        }
    };
}

function setSubmissionTimelineStageWidth(stage, bucketCount, granularity) {
    if (!stage) return;
    const pixelsPerBucket = granularity === 'day' ? 54 : (granularity === 'week' ? 62 : 78);
    const desiredWidth = Math.max(720, bucketCount * pixelsPerBucket + 220);
    stage.style.width = `${desiredWidth}px`;
}

function renderGroupedSubmissionTimelineChart(level, model, bucketKeys, granularity, displayMode, topLimit) {
    const lower = level.toLowerCase();
    const canvas = document.getElementById(`submissionTimelineChart${level}`);
    const emptyState = document.getElementById(`timeline-empty-${lower}`);
    const stage = document.getElementById(`timeline-stage-${lower}`);
    const legend = document.getElementById(`timeline-legend-${lower}`);
    if (!canvas || !emptyState || !stage) return;

    if (submissionTimelineChartsRefs[level]) {
        submissionTimelineChartsRefs[level].destroy();
        submissionTimelineChartsRefs[level] = null;
    }

    let entities = model.rankedEntities.slice();
    if (topLimit !== 'all') entities = entities.slice(0, Number(topLimit));

    if (entities.length === 0 || bucketKeys.length === 0) {
        canvas.style.display = 'none';
        emptyState.style.display = 'flex';
        if (legend) legend.innerHTML = '';
        return;
    }

    canvas.style.display = 'block';
    emptyState.style.display = 'none';
    setSubmissionTimelineStageWidth(stage, bucketKeys.length, granularity);

    const labels = bucketKeys.map(key => formatSubmissionTimelineLabel(key, granularity));
    const datasets = entities.map(([entity], index) =>
        buildSubmissionTimelineDataset(entity, model.series[entity], index, bucketKeys.length)
    );

    submissionTimelineChartsRefs[level] = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels, datasets },
        options: getSubmissionTimelineChartOptions(granularity, displayMode, datasets.length, false)
    });

    updateSubmissionTimelineLegend(level, submissionTimelineChartsRefs[level]);
}

function createIndividualSubmissionTimelineCard(level, entity, total, values, bucketKeys, granularity, displayMode, colorIndex) {
    const col = document.createElement('div');
    col.className = 'col-12 col-xl-6';

    const card = document.createElement('article');
    card.className = 'timeline-individual-chart-card';

    const heading = document.createElement('div');
    heading.className = 'timeline-individual-chart-heading';

    const titleWrap = document.createElement('div');
    const title = document.createElement('h6');
    title.className = 'mb-1';
    title.textContent = entity;
    const subtitle = document.createElement('small');
    subtitle.className = 'text-muted';
    subtitle.textContent = `${SUBMISSION_TIMELINE_LABELS[granularity]} · ${displayMode === 'cumulative' ? 'Données cumulées' : 'Données détaillées'}`;
    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);

    const actions = document.createElement('div');
    actions.className = 'd-flex align-items-center gap-2';
    const totalBadge = document.createElement('span');
    totalBadge.className = 'badge bg-primary';
    totalBadge.textContent = `${total} soumission${total > 1 ? 's' : ''}`;
    const expandButton = document.createElement('button');
    expandButton.type = 'button';
    expandButton.className = 'btn btn-outline-secondary btn-sm timeline-expand-individual-btn';
    expandButton.innerHTML = '<i class="fas fa-expand-alt"></i>';
    expandButton.title = `Agrandir le graphique de ${entity}`;
    actions.appendChild(totalBadge);
    actions.appendChild(expandButton);

    heading.appendChild(titleWrap);
    heading.appendChild(actions);

    const scroll = document.createElement('div');
    scroll.className = 'timeline-individual-chart-scroll';
    const stage = document.createElement('div');
    stage.className = 'timeline-individual-chart-stage';
    setSubmissionTimelineStageWidth(stage, bucketKeys.length, granularity);
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `Évolution temporelle des soumissions de ${entity}`);
    stage.appendChild(canvas);
    scroll.appendChild(stage);

    card.appendChild(heading);
    card.appendChild(scroll);
    col.appendChild(card);

    const dataset = buildSubmissionTimelineDataset(entity, values, colorIndex, bucketKeys.length);
    dataset.borderWidth = 2.8;
    dataset.pointRadius = bucketKeys.length > 60 ? 0 : 3.5;
    dataset.borderDash = [];

    return {
        col,
        card,
        canvas,
        dataset,
        expandButton,
        labels: bucketKeys.map(key => formatSubmissionTimelineLabel(key, granularity)),
        options: getSubmissionTimelineChartOptions(granularity, displayMode, 1, false),
        entity
    };
}

function renderIndividualSubmissionTimelineCharts(level, model, bucketKeys, granularity, displayMode) {
    const lower = level.toLowerCase();
    const grid = document.getElementById(`timeline-individual-grid-${lower}`);
    const emptyState = document.getElementById(`timeline-empty-individual-${lower}`);
    const searchInput = document.getElementById(`timeline-search-${lower}`);
    const pageSizeSelect = document.getElementById(`timeline-page-size-${lower}`);
    const pageInfo = document.getElementById(`timeline-page-info-${lower}`);
    const prevButton = document.querySelector(`.timeline-page-prev[data-level="${level}"]`);
    const nextButton = document.querySelector(`.timeline-page-next[data-level="${level}"]`);
    if (!grid || !emptyState || !searchInput || !pageSizeSelect || !pageInfo) return;

    destroySubmissionTimelineIndividualCharts(level);
    grid.innerHTML = '';

    const state = submissionTimelineIndividualState[level];
    state.search = searchInput.value.trim();
    const normalizedSearch = state.search.toLocaleLowerCase('fr');
    const filteredEntities = model.rankedEntities.filter(([entity]) =>
        !normalizedSearch || entity.toLocaleLowerCase('fr').includes(normalizedSearch)
    );

    const pageSize = Math.max(1, Number(pageSizeSelect.value) || 6);
    const totalPages = Math.max(1, Math.ceil(filteredEntities.length / pageSize));
    state.page = Math.min(Math.max(1, state.page), totalPages);
    const startIndex = (state.page - 1) * pageSize;
    const pageEntities = filteredEntities.slice(startIndex, startIndex + pageSize);

    pageInfo.textContent = filteredEntities.length
        ? `Page ${state.page} / ${totalPages} · ${filteredEntities.length} entité(s)`
        : 'Page 0 / 0 · 0 entité';
    if (prevButton) prevButton.disabled = state.page <= 1 || filteredEntities.length === 0;
    if (nextButton) nextButton.disabled = state.page >= totalPages || filteredEntities.length === 0;

    if (pageEntities.length === 0 || bucketKeys.length === 0) {
        emptyState.style.display = 'block';
        return;
    }
    emptyState.style.display = 'none';

    pageEntities.forEach(([entity, total], pageIndex) => {
        const built = createIndividualSubmissionTimelineCard(
            level, entity, total, model.series[entity], bucketKeys, granularity, displayMode, startIndex + pageIndex
        );
        grid.appendChild(built.col);

        const chart = new Chart(built.canvas.getContext('2d'), {
            type: 'line',
            data: { labels: built.labels, datasets: [built.dataset] },
            options: built.options
        });
        built.card._timelineChart = chart;
        built.expandButton.addEventListener('click', function() {
            const expanded = built.card.classList.toggle('is-expanded');
            document.body.classList.toggle('timeline-chart-expanded', expanded);
            built.expandButton.innerHTML = expanded ? '<i class="fas fa-compress-alt"></i>' : '<i class="fas fa-expand-alt"></i>';
            built.expandButton.title = expanded ? 'Réduire le graphique' : `Agrandir le graphique de ${built.entity}`;
            setTimeout(() => chart.resize(), 60);
        });
        submissionTimelineIndividualChartsRefs[level].push(chart);
    });
}

function updateSubmissionTimelineSelectionUI(granularity, displayMode, layoutMode) {
    const periodLabel = SUBMISSION_TIMELINE_LABELS[granularity] || 'Période';
    const modeLabel = displayMode === 'cumulative' ? 'Données cumulées' : 'Données détaillées';
    const layoutLabel = layoutMode === 'individual' ? 'Affichage individuel' : 'Affichage groupé';
    const periodLower = periodLabel.toLocaleLowerCase('fr');

    $('#timeline-selected-period').text(periodLabel);
    $('#timeline-selected-mode').text(modeLabel);
    $('#timeline-selected-layout').text(layoutLabel);
    $('#timeline-selection-explanation').text(
        displayMode === 'cumulative'
            ? `Chaque point additionne les soumissions depuis le début de la période filtrée jusqu’au ${periodLower} affiché.`
            : `Chaque point montre uniquement le nombre de soumissions enregistré pendant le ${periodLower} correspondant.`
    );

    ['dren', 'cisco', 'zap'].forEach(lower => {
        $(`#timeline-period-badge-${lower}`).text(`${periodLabel} · ${displayMode === 'cumulative' ? 'Cumulé' : 'Détaillé'} · ${layoutMode === 'individual' ? 'Individuel' : 'Groupé'}`);
        $(`#timeline-description-${lower}`).text(
            layoutMode === 'individual'
                ? `Chaque entité possède son propre graphique. Utilisez la recherche et la pagination pour parcourir toutes les entités.`
                : `Les entités sélectionnées sont comparées dans un même graphique. La légende latérale permet de masquer ou d’afficher chaque courbe.`
        );
    });

    $('#timeline-top-entities').prop('disabled', layoutMode === 'individual');
    const currentIndex = SUBMISSION_TIMELINE_GRANULARITIES.indexOf(granularity);
    $('#timeline-zoom-in-btn').prop('disabled', currentIndex <= 0);
    $('#timeline-zoom-out-btn').prop('disabled', currentIndex >= SUBMISSION_TIMELINE_GRANULARITIES.length - 1);
}

function renderSubmissionTimelineLevel(level, model, bucketKeys, granularity, displayMode, layoutMode, topLimit) {
    const lower = level.toLowerCase();
    const groupedView = document.getElementById(`timeline-grouped-view-${lower}`);
    const individualView = document.getElementById(`timeline-individual-view-${lower}`);
    if (!groupedView || !individualView) return;

    if (layoutMode === 'individual') {
        groupedView.style.display = 'none';
        individualView.style.display = 'block';
        if (submissionTimelineChartsRefs[level]) {
            submissionTimelineChartsRefs[level].destroy();
            submissionTimelineChartsRefs[level] = null;
        }
        renderIndividualSubmissionTimelineCharts(level, model, bucketKeys, granularity, displayMode);
    } else {
        groupedView.style.display = 'block';
        individualView.style.display = 'none';
        destroySubmissionTimelineIndividualCharts(level);
        renderGroupedSubmissionTimelineChart(level, model, bucketKeys, granularity, displayMode, topLimit);
    }
}

function renderSubmissionTimelineCharts(data) {
    if (Array.isArray(data)) submissionTimelineSourceData = data;
    if (!document.getElementById('submissionTimelineChartDREN')) return;

    const source = Array.isArray(submissionTimelineSourceData) ? submissionTimelineSourceData : [];
    const granularity = $('#timeline-granularity').val() || 'day';
    const displayMode = $('#timeline-display-mode').val() || 'detailed';
    const layoutMode = $('input[name="timeline-layout-mode"]:checked').val() || 'grouped';
    const topLimit = $('#timeline-top-entities').val() || '10';
    const startValue = $('#timeline-date-start').val();
    const endValue = $('#timeline-date-end').val();
    let startDate = startValue ? parseSubmissionDate(startValue) : null;
    let endDate = endValue ? parseSubmissionDate(endValue) : null;

    if (startDate && endDate && startDate > endDate) [startDate, endDate] = [endDate, startDate];

    const datedRows = source
        .map(row => ({ row, date: parseSubmissionDate(row['_submission_time']) }))
        .filter(item => item.date)
        .filter(item => (!startDate || item.date >= startDate) && (!endDate || item.date <= endDate));

    const allAvailableDates = source
        .map(row => parseSubmissionDate(row['_submission_time']))
        .filter(Boolean)
        .sort((a, b) => a - b);

    if (allAvailableDates.length > 0) {
        const minDate = formatISODateUTC(allAvailableDates[0]);
        const maxDate = formatISODateUTC(allAvailableDates[allAvailableDates.length - 1]);
        $('#timeline-date-start, #timeline-date-end').attr('min', minDate).attr('max', maxDate);
    }

    let bucketKeys = [];
    if (datedRows.length > 0) {
        const sortedFilteredDates = datedRows.map(item => item.date).sort((a, b) => a - b);
        const effectiveStart = startDate || sortedFilteredDates[0];
        const effectiveEnd = endDate || sortedFilteredDates[sortedFilteredDates.length - 1];
        bucketKeys = generateSubmissionTimelineBuckets(effectiveStart, effectiveEnd, granularity);
    }

    const uniqueEntities = new Set();
    datedRows.forEach(item => {
        ['DREN', 'CISCO', 'ZAP'].forEach(level => {
            const entity = getSubmissionEntityValue(item.row, level);
            if (entity && entity.toLowerCase() !== 'non renseigné') uniqueEntities.add(`${level}|||${entity}`);
        });
    });

    $('#timeline-dated-count').text(datedRows.length.toLocaleString('fr-FR'));
    $('#timeline-entities-count').text(uniqueEntities.size.toLocaleString('fr-FR'));
    if (datedRows.length > 0) {
        const sortedDates = datedRows.map(item => item.date).sort((a, b) => a - b);
        const first = sortedDates[0].toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
        const last = sortedDates[sortedDates.length - 1].toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
        $('#timeline-period-label').text(first === last ? first : `${first} – ${last}`);
    } else {
        $('#timeline-period-label').text('Aucune date');
    }

    updateSubmissionTimelineSelectionUI(granularity, displayMode, layoutMode);
    const models = {};
    ['DREN', 'CISCO', 'ZAP'].forEach(level => {
        const model = buildSubmissionTimelineModel(level, datedRows, bucketKeys, granularity, displayMode);
        models[level] = model;
        renderSubmissionTimelineLevel(level, model, bucketKeys, granularity, displayMode, layoutMode, topLimit);
    });
    submissionTimelineRenderContext = { datedRows, bucketKeys, granularity, displayMode, layoutMode, topLimit, models };
}

function resetSubmissionTimelineControls() {
    $('#timeline-granularity').val('day');
    $('#timeline-display-mode').val('detailed');
    $('#timeline-top-entities').val('10');
    $('#timeline-layout-grouped').prop('checked', true);
    $('#timeline-date-start, #timeline-date-end').val('');
    ['DREN', 'CISCO', 'ZAP'].forEach(level => {
        submissionTimelineIndividualState[level] = { page: 1, search: '' };
        $(`#timeline-search-${level.toLowerCase()}`).val('');
        $(`#timeline-page-size-${level.toLowerCase()}`).val('6');
    });
    renderSubmissionTimelineCharts();
}

function renderAnalysis(data) {
    let totalRows = data.length;
    let freqDren = data.reduce((acc, row) => { let v = cleanSpaces(getKoboValue(row, ['dren'], ['activite', 'produit', 'budget', 'cisco', 'zap', 'sous'])); let k = v || "Non renseigné"; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
    let freqCisco = data.reduce((acc, row) => { let v = cleanSpaces(getKoboValue(row, ['cisco'], ['activite', 'produit', 'budget', 'dren', 'zap', 'sous'])); let k = v || "Non renseigné"; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
    let freqZap = data.reduce((acc, row) => { let v = cleanSpaces(getKoboValue(row, ['zap'], ['activite', 'produit', 'budget', 'dren', 'cisco', 'sous'])); let k = v || "Non renseigné"; acc[k] = (acc[k] || 0) + 1; return acc; }, {});

    if (totalRows === 0) $('#ai-report-content').html("<p>Aucune donnée.</p>");
    else {
        let maxDren = Object.entries(freqDren).filter(([k,v]) => k !== "Non renseigné").sort((a,b) => b[1] - a[1])[0];
        $('#ai-report-content').html(`<p>L'analyse intelligente révèle que <span class="highlight-val">${totalRows}</span> formulaires ont été soumis. La couverture s'étend sur <span class="highlight-val">${Object.keys(freqDren).length-1}</span> DREN(s) et <span class="highlight-val">${Object.keys(freqCisco).length-1}</span> CISCO(s). ${maxDren ? `La zone dominante est la DREN <span class="highlight-val">${maxDren[0]}</span> (${Math.round((maxDren[1]/totalRows)*100)}%).` : ''}</p>`);
    }

    const popTab = (id, fd) => {
        let tb = $('#'+id).empty(), s = Object.entries(fd).sort((a,b)=>b[1]-a[1]);
        if(s.length===0) tb.append('<tr><td colspan="3" class="text-muted">Vide</td></tr>');
        else s.forEach(([n,c]) => { let p=(c/totalRows*100).toFixed(1)+'%'; tb.append(`<tr><td><strong>${n}</strong></td><td><span class="badge bg-primary fs-6">${c}</span></td><td class="align-middle"><div class="d-flex align-items-center justify-content-center"><span class="me-2" style="width: 45px; font-weight: bold;">${p}</span><div class="progress" style="width: 80px; height: 10px;"><div class="progress-bar bg-info" style="width: ${p};"></div></div></div></td></tr>`); });
    };
    popTab('dren-summary-table', freqDren); popTab('cisco-summary-table', freqCisco); popTab('zap-summary-table', freqZap);

    renderSubmissionTimelineCharts(data);

    renderAlgorithmChart('kmeans', 'kmeansChartDREN', 'kmeansListsDREN', 'rules-kmeans-dren', freqDren, chartsRefs.kmeans.DREN, c => chartsRefs.kmeans.DREN = c);
    renderAlgorithmChart('kmeans', 'kmeansChartCISCO', 'kmeansListsCISCO', 'rules-kmeans-cisco', freqCisco, chartsRefs.kmeans.CISCO, c => chartsRefs.kmeans.CISCO = c);
    renderAlgorithmChart('kmeans', 'kmeansChartZAP', 'kmeansListsZAP', 'rules-kmeans-zap', freqZap, chartsRefs.kmeans.ZAP, c => chartsRefs.kmeans.ZAP = c);

    renderAlgorithmChart('jenks', 'jenksChartDREN', 'jenksListsDREN', 'rules-jenks-dren', freqDren, chartsRefs.jenks.DREN, c => chartsRefs.jenks.DREN = c);
    renderAlgorithmChart('jenks', 'jenksChartCISCO', 'jenksListsCISCO', 'rules-jenks-cisco', freqCisco, chartsRefs.jenks.CISCO, c => chartsRefs.jenks.CISCO = c);
    renderAlgorithmChart('jenks', 'jenksChartZAP', 'jenksListsZAP', 'rules-jenks-zap', freqZap, chartsRefs.jenks.ZAP, c => chartsRefs.jenks.ZAP = c);

    renderAlgorithmChart('dbscan', 'dbscanChartDREN', 'dbscanListsDREN', 'rules-dbscan-dren', freqDren, chartsRefs.dbscan.DREN, c => chartsRefs.dbscan.DREN = c);
    renderAlgorithmChart('dbscan', 'dbscanChartCISCO', 'dbscanListsCISCO', 'rules-dbscan-cisco', freqCisco, chartsRefs.dbscan.CISCO, c => chartsRefs.dbscan.CISCO = c);
    renderAlgorithmChart('dbscan', 'dbscanChartZAP', 'dbscanListsZAP', 'rules-dbscan-zap', freqZap, chartsRefs.dbscan.ZAP, c => chartsRefs.dbscan.ZAP = c);

    runExpertSystem(freqDren, freqCisco, freqZap);
}

function setupAnalysisTableSearch(inputId, tbodyId) {
    $('#' + inputId).on('keyup', function() {
        let val = cleanSpaces($(this).val());
        $('#' + tbodyId + ' tr').filter(function() { $(this).toggle(fuzzyMatch(val, cleanSpaces($(this).text()))); });
    });
}

function applyFilters() {
    const f = { 
        dren: cleanSpaces($('#filter-dren').val()), cisco: cleanSpaces($('#filter-cisco').val()), zap: cleanSpaces($('#filter-zap').val()), 
        act: cleanSpaces($('#filter-activite').val()), prod: cleanSpaces($('#filter-produit').val()), 
        sAct: cleanSpaces($('#filter-sous-activite').val()), sProd: cleanSpaces($('#filter-sous-produit').val()),
        dateDebut: $('#filter-date-debut').val(), dateFin: $('#filter-date-fin').val(),
        onlyDoublons: $('#filter-only-doublons').is(':checked'),
        onlyAnomalies: $('#filter-only-anomalies').is(':checked'),
        dateDebutReal: $('#filter-date-debut-realisation').val(), dateFinReal: $('#filter-date-fin-realisation').val(),
        valMinReal: $('#filter-val-min-realisation').val(), valMaxReal: $('#filter-val-max-realisation').val(),
        chkDren: $('#chk-dren').is(':checked'), chkCisco: $('#chk-cisco').is(':checked'), chkZap: $('#chk-zap').is(':checked'),
        chkActDren: $('#chk-act-dren').is(':checked'), chkActCisco: $('#chk-act-cisco').is(':checked'), chkActZap: $('#chk-act-zap').is(':checked'),
        chkProdDren: $('#chk-prod-dren').is(':checked'), chkProdCisco: $('#chk-prod-cisco').is(':checked'), chkProdZap: $('#chk-prod-zap').is(':checked'),
        chkSactDren: $('#chk-sact-dren').is(':checked'), chkSactCisco: $('#chk-sact-cisco').is(':checked'), chkSactZap: $('#chk-sact-zap').is(':checked'),
        chkSprodDren: $('#chk-sprod-dren').is(':checked'), chkSprodCisco: $('#chk-sprod-cisco').is(':checked'), chkSprodZap: $('#chk-sprod-zap').is(':checked')
    };

    let dStart = f.dateDebut ? new Date(f.dateDebut) : null; if (dStart) dStart.setHours(0, 0, 0, 0);
    let dEnd = f.dateFin ? new Date(f.dateFin) : null; if (dEnd) dEnd.setHours(23, 59, 59, 999);
    
    let dStartReal = f.dateDebutReal ? new Date(f.dateDebutReal) : null; if (dStartReal) dStartReal.setHours(0, 0, 0, 0);
    let dEndReal = f.dateFinReal ? new Date(f.dateFinReal) : null; if (dEndReal) dEndReal.setHours(23, 59, 59, 999);

    let hasVal = (val) => val && val !== 'non renseigné' && val !== '';

    let vC = 0;
    $('#table-body tr').each(function() {
        const s = $(this).data('search'); if (!s) return; 
        let mD = fuzzyMatch(f.dren, s.dren), mC = fuzzyMatch(f.cisco, s.cisco), mZ = fuzzyMatch(f.zap, s.zap);
        let mA = fuzzyMatch(f.act, s.activiteDren) || fuzzyMatch(f.act, s.activiteCisco) || fuzzyMatch(f.act, s.activiteZap);
        let mP = fuzzyMatch(f.prod, s.produitDren) || fuzzyMatch(f.prod, s.produitCisco) || fuzzyMatch(f.prod, s.produitZap);
        let mSA = fuzzyMatch(f.sAct, s.sousActiviteDren) || fuzzyMatch(f.sAct, s.sousActiviteCisco) || fuzzyMatch(f.sAct, s.sousActiviteZap);
        let mSP = fuzzyMatch(f.sProd, s.sousProduitDren) || fuzzyMatch(f.sProd, s.sousProduitCisco) || fuzzyMatch(f.sProd, s.sousProduitZap);
        
        let dateMatch = true;
        if (s.subDateObj) {
            if (dStart && s.subDateObj < dStart) dateMatch = false;
            if (dEnd && s.subDateObj > dEnd) dateMatch = false;
        } else if (dStart || dEnd) dateMatch = false;

        let dateRealMatch = true;
        if (s.realDateObj) {
            if (dStartReal && s.realDateObj < dStartReal) dateRealMatch = false;
            if (dEndReal && s.realDateObj > dEndReal) dateRealMatch = false;
        } else if (dStartReal || dEndReal) dateRealMatch = false;
        
        let valRealMatch = true;
        if (s.realValue !== undefined) {
            if (f.valMinReal !== "" && s.realValue < parseFloat(f.valMinReal)) valRealMatch = false;
            if (f.valMaxReal !== "" && s.realValue > parseFloat(f.valMaxReal)) valRealMatch = false;
        } else if (f.valMinReal !== "" || f.valMaxReal !== "") {
            valRealMatch = false; 
        }

        let doublonMatch = true; if (f.onlyDoublons && !s.isDoublon) doublonMatch = false;
        let anomalyMatch = true; if (f.onlyAnomalies && !s.isAnomaly) anomalyMatch = false;

        let chkMatch = true;
        if (f.chkDren && !hasVal(s.dren)) chkMatch = false;
        if (f.chkCisco && !hasVal(s.cisco)) chkMatch = false;
        if (f.chkZap && !hasVal(s.zap)) chkMatch = false;

        if (f.chkActDren && !hasVal(s.activiteDren)) chkMatch = false;
        if (f.chkActCisco && !hasVal(s.activiteCisco)) chkMatch = false;
        if (f.chkActZap && !hasVal(s.activiteZap)) chkMatch = false;

        if (f.chkProdDren && !hasVal(s.produitDren)) chkMatch = false;
        if (f.chkProdCisco && !hasVal(s.produitCisco)) chkMatch = false;
        if (f.chkProdZap && !hasVal(s.produitZap)) chkMatch = false;

        if (f.chkSactDren && !hasVal(s.sousActiviteDren)) chkMatch = false;
        if (f.chkSactCisco && !hasVal(s.sousActiviteCisco)) chkMatch = false;
        if (f.chkSactZap && !hasVal(s.sousActiviteZap)) chkMatch = false;

        if (f.chkSprodDren && !hasVal(s.sousProduitDren)) chkMatch = false;
        if (f.chkSprodCisco && !hasVal(s.sousProduitCisco)) chkMatch = false;
        if (f.chkSprodZap && !hasVal(s.sousProduitZap)) chkMatch = false;

        if (mD && mC && mZ && mA && mP && mSA && mSP && dateMatch && dateRealMatch && valRealMatch && doublonMatch && anomalyMatch && chkMatch) { $(this).show(); vC++; } else { $(this).hide(); }
    });
    $('#record-count').text(vC);
}

function clearFilters() { 
    $('.filter-input').not('[type="checkbox"]').val(''); 
    $('.filter-input[type="checkbox"]').prop('checked', false);
    applyFilters(); 
}

function getCurrentFilters() { 
    let filters = { 
        "DREN": cleanSpaces($('#filter-dren').val()) || "Tous", "CISCO": cleanSpaces($('#filter-cisco').val()) || "Tous", "ZAP": cleanSpaces($('#filter-zap').val()) || "Tous", 
        "Activité": cleanSpaces($('#filter-activite').val()) || "Tous", "Produit": cleanSpaces($('#filter-produit').val()) || "Tous", 
        "Sous-activité": cleanSpaces($('#filter-sous-activite').val()) || "Tous", "Sous-produit": cleanSpaces($('#filter-sous-produit').val()) || "Tous",
        "Date de début (Soumission)": $('#filter-date-debut').val() || "Toutes", "Date de fin (Soumission)": $('#filter-date-fin').val() || "Toutes",
        "Date de début (Suivi de la Réalisation)": $('#filter-date-debut-realisation').val() || "Toutes", "Date de fin (Suivi de la Réalisation)": $('#filter-date-fin-realisation').val() || "Toutes",
        "Valeur Minimum (Réalisation)": $('#filter-val-min-realisation').val() || "Aucune", "Valeur Maximum (Réalisation)": $('#filter-val-max-realisation').val() || "Aucune",
        "Filtre Strict Doublons": $('#filter-only-doublons').is(':checked') ? "Activé" : "Désactivé",
        "Filtre Strict Anomalies": $('#filter-only-anomalies').is(':checked') ? "Activé" : "Désactivé"
    }; 
    
    if ($('#chk-dren').is(':checked')) filters["Présence DREN"] = "Requise";
    if ($('#chk-cisco').is(':checked')) filters["Présence CISCO"] = "Requise";
    if ($('#chk-zap').is(':checked')) filters["Présence ZAP"] = "Requise";
    if ($('#chk-act-dren').is(':checked')) filters["Présence Activité DREN"] = "Requise";
    if ($('#chk-act-cisco').is(':checked')) filters["Présence Activité CISCO"] = "Requise";
    if ($('#chk-act-zap').is(':checked')) filters["Présence Activité ZAP"] = "Requise";
    
    return filters;
}

function getFiltersPlainText() { let f = getCurrentFilters(), t = ""; for (let k in f) { if (f[k] !== "Tous" && f[k] !== "Toutes" && f[k] !== "Désactivé" && f[k] !== "Aucune") t += `- ${k} : ${f[k]}\n`; } return t === "" ? "- Aucun filtre (Toutes les données)" : t; }
function getAnalysisFilters() { return { "Recherche Locale - Tableau DREN": cleanSpaces($('#search-dren-table').val()) || "Aucune", "Recherche Locale - Tableau CISCO": cleanSpaces($('#search-cisco-table').val()) || "Aucune", "Recherche Locale - Tableau ZAP": cleanSpaces($('#search-zap-table').val()) || "Aucune" }; }
function getAnalysisFiltersPlainText() { let f = getAnalysisFilters(), t = ""; for (let k in f) { if (f[k] !== "Aucune") t += `- ${k} : ${f[k]}\n`; } return t === "" ? "- Aucun filtre local appliqué" : t; }

function downloadFile(b, fn) { let a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = fn; a.style.display="none"; document.body.appendChild(a); a.click(); document.body.removeChild(a); }

function exportTableToCSV(pfx) {
    let fn = generateFilename(pfx, 'csv'), csv = [], d = getFormattedDateTime(), f = getCurrentFilters();
    csv.push(`"${TITRE_PLATEFORME}"`); csv.push(`"${SOUS_TITRE_PLATEFORME}"`); csv.push("");
    csv.push(`"--- METADONNEES D'EXPORT ---"`); csv.push(`"Date d'exportation";"${d}"`); csv.push("");
    csv.push(`"--- CRITERES DE RECHERCHE APPLIQUES ---"`); for (let k in f) csv.push(`"${k}";"${f[k]}"`); csv.push("");
    csv.push(`"--- RESULTATS ---"`);
    $('#data-table tr:visible').each(function() {
        let r = []; $(this).find('td, th').each(function() {
            let cd = cleanSpaces($(this).attr('data-csv') || $(this).text()).replace(/(\r\n|\n|\r)/gm, '').replace(/"/g, '""');
            r.push(`"${cd}"`);
            if ($(this).attr('colspan')) { for (let k = 1; k < parseInt($(this).attr('colspan')); k++) r.push('""'); }
        });
        csv.push(r.join(";"));
    });
    downloadFile(new Blob(["\uFEFF" + csv.join("\n")], {type: "text/csv;charset=utf-8;"}), fn);
}

function exportTableToExcel(pfx) {
    let fn = generateFilename(pfx, 'xlsx'), wb = XLSX.utils.book_new(), wsD = [], merges = [];
    wsD.push([TITRE_PLATEFORME]); wsD.push([SOUS_TITRE_PLATEFORME]); wsD.push([]);
    wsD.push(["--- METADONNEES D'EXPORT ---"]); wsD.push(["Date d'exportation", getFormattedDateTime()]); wsD.push([]);
    wsD.push(["--- CRITERES DE RECHERCHE APPLIQUES ---"]); let f = getCurrentFilters(); for(let k in f) wsD.push([k, f[k]]); wsD.push([]);
    wsD.push(["--- RESULTATS ---"]);
    let hrIdx = wsD.length, h1 = [], cH = 0;
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } });
    $('#table-group-header-row th').each(function() {
        h1.push(cleanSpaces($(this).text())); let cs = parseInt($(this).attr('colspan') || 1, 10);
        if (cs > 1) { merges.push({ s: { r: hrIdx, c: cH }, e: { r: hrIdx, c: cH + cs - 1 } }); for (let i = 1; i < cs; i++) h1.push(""); }
        cH += cs;
    });
    if (h1.length > 0) wsD.push(h1);
    let h2 = []; $('#table-sub-header-row th').each(function() { h2.push(cleanSpaces($(this).text())); }); wsD.push(h2);
    $('#table-body tr:visible').each(function() { let r = []; $(this).find('td').each(function() { r.push(cleanSpaces($(this).attr('data-csv') || $(this).text())); }); wsD.push(r); });
    let ws = XLSX.utils.aoa_to_sheet(wsD); if (merges.length > 0) ws['!merges'] = merges;
    XLSX.utils.book_append_sheet(wb, ws, "Donnees_Kobo"); XLSX.writeFile(wb, fn);
}

function exportTableToHTML(pfx) {
    let fh = `<div style="background-color: #ecf0f1; padding: 15px; border-radius: 5px; margin-bottom: 20px;"><h3 style="margin-top: 0;">Critères appliqués</h3><p><strong>Date :</strong> ${getFormattedDateTime()}</p><ul>`;
    let f = getCurrentFilters(); for (let k in f) fh += `<li><strong>${k}</strong> : ${f[k]}</li>`; fh += `</ul></div>`;
    
    let tooltipHTML = `<div id="image-preview-tooltip" style="display: none; position: fixed; z-index: 9999; border: 3px solid #2980b9; border-radius: 8px; background: #fff; padding: 5px; box-shadow: 0 15px 30px rgba(0,0,0,0.3); pointer-events: none;"><img id="preview-img" src="" style="max-width: 350px; max-height: 350px; border-radius: 4px; object-fit: contain; display: block;" alt="Aperçu de l'image"></div>`;
    
    let scriptHTML = `<script>
        function showImagePreview(event, url) { const tooltip = document.getElementById('image-preview-tooltip'); const img = document.getElementById('preview-img'); img.src = url; tooltip.style.display = 'block'; moveImagePreview(event); }
        function hideImagePreview() { document.getElementById('image-preview-tooltip').style.display = 'none'; document.getElementById('preview-img').src = ''; }
        function moveImagePreview(event) { const tooltip = document.getElementById('image-preview-tooltip'); if (tooltip.style.display === 'block') { let x = event.clientX + 15; let y = event.clientY + 15; if (x + tooltip.offsetWidth > window.innerWidth) { x = event.clientX - tooltip.offsetWidth - 15; } if (y + tooltip.offsetHeight > window.innerHeight) { y = event.clientY - tooltip.offsetHeight - 15; } tooltip.style.left = x + 'px'; tooltip.style.top = y + 'px'; } }
    <\/script>`;

    let h = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><style>body{font-family:sans-serif;padding:20px;}table{border-collapse:collapse;width:100%;margin-top:20px;}th,td{border:1px solid #ddd;padding:8px;text-align:center;}th{background:#333;color:#fff;} a{color:#2980b9; text-decoration:none;} a:hover{text-decoration:underline;}</style></head><body>${tooltipHTML}<h2>${TITRE_PLATEFORME}</h2><h4>${SOUS_TITRE_PLATEFORME}</h4>${fh}${document.getElementById('data-table').outerHTML}${scriptHTML}</body></html>`;
    downloadFile(new Blob([h], { type: 'text/html' }), generateFilename(pfx, 'html'));
}

function getTableJSONData() {
    let h = []; $('#table-sub-header-row th').each(function() { h.push(cleanSpaces($(this).text())); });
    let jd = []; $('#table-body tr:visible').each(function() { let r = {}; $(this).find('td').each(function(i) { r[h[i]] = cleanSpaces($(this).attr('data-csv') || $(this).text()); }); jd.push(r); });
    return JSON.stringify({ "titre_plateforme": TITRE_PLATEFORME, "sous_titre": SOUS_TITRE_PLATEFORME, "date_exportation": getFormattedDateTime(), "criteres": getCurrentFilters(), "resultats": jd }, null, 2); 
}

function exportTableToJSONFile(pfx) { downloadFile(new Blob([getTableJSONData()], { type: 'application/json;charset=utf-8;' }), generateFilename(pfx, 'json')); }

function getAiInsightsArray() { let a = []; $('#ai-report-content p').each(function() { let t = cleanSpaces($(this).text()); if(t) a.push(t); }); return a.length > 0 ? a : ["Aucune donnée."]; }

function getAnalysisJSONData() {
    let fo = { "titre_plateforme": TITRE_PLATEFORME, "sous_titre": SOUS_TITRE_PLATEFORME, "date_exportation": getFormattedDateTime(), "criteres_locaux": getAnalysisFilters(), "analyse_ia": getAiInsightsArray(), "analyse_dren": [], "analyse_cisco": [], "analyse_zap": [] };
    [{k:"analyse_dren", id:"dren-summary-table", hd:["Nom","Soumissions","Part (%)"]}, {k:"analyse_cisco", id:"cisco-summary-table", hd:["Nom","Soumissions","Part (%)"]}, {k:"analyse_zap", id:"zap-summary-table", hd:["Nom","Soumissions","Part (%)"]}].forEach(t => {
        $(`#${t.id} tr:visible`).each(function() {
            let ro = {}, ok = false; $(this).find('td').each(function(i) { let v = cleanSpaces((i===2)?$(this).find('span').text():$(this).text()); if(v!=="Aucune donnée trouvée") { ro[t.hd[i]] = v; ok = true; } });
            if(ok) fo[t.k].push(ro);
        });
    });
    return JSON.stringify(fo, null, 2);
}

function exportAnalysisToJSONFile(pfx) { downloadFile(new Blob([getAnalysisJSONData()], { type: 'application/json;charset=utf-8;' }), generateFilename(pfx, 'json')); }

function exportAnalysisToCSV(pfx) {
    let csv = [], f = getAnalysisFilters();
    csv.push(`"${TITRE_PLATEFORME}"`); csv.push(`"${SOUS_TITRE_PLATEFORME}"`); csv.push("");
    csv.push(`"--- METADONNEES D'EXPORT ---"`); csv.push(`"Date d'exportation";"${getFormattedDateTime()}"`); csv.push("");
    csv.push(`"--- CRITERES LOCAUX ---"`); for(let k in f) csv.push(`"${k}";"${f[k]}"`); csv.push("");
    csv.push(`"--- ANALYSE INTELLIGENTE ---"`); getAiInsightsArray().forEach(l => csv.push(`"${cleanSpaces(l).replace(/"/g, '""')}"`)); csv.push("");
    [{t:"DETAIL DREN", id:"dren-summary-table"}, {t:"DETAIL CISCO", id:"cisco-summary-table"}, {t:"DETAIL ZAP", id:"zap-summary-table"}].forEach(tb => {
        csv.push(`"${tb.t}"`); csv.push(`"Nom";"Soumissions";"Part (%)"`);
        $(`#${tb.id} tr:visible`).each(function() { let r=[]; $(this).find('td').each(function(i) { r.push(`"${cleanSpaces((i===2)?$(this).find('span').text():$(this).text())}"`); }); if(r.length>0 && r[0]!=='"Aucune donnée trouvée"') csv.push(r.join(";")); }); csv.push("");
    });
    downloadFile(new Blob(["\uFEFF" + csv.join("\n")], {type: "text/csv;charset=utf-8;"}), generateFilename(pfx, 'csv'));
}

function exportAnalysisToExcel(pfx) {
    let wb = XLSX.utils.book_new(), wsD = [], mg = [{s:{r:0,c:0},e:{r:0,c:3}}, {s:{r:1,c:0},e:{r:1,c:3}}];
    wsD.push([TITRE_PLATEFORME]); wsD.push([SOUS_TITRE_PLATEFORME]); wsD.push([]);
    wsD.push(["--- METADONNEES D'EXPORT ---"]); wsD.push(["Date d'exportation", getFormattedDateTime()]); wsD.push([]);
    wsD.push(["--- CRITERES LOCAUX ---"]); let f = getAnalysisFilters(); for(let k in f) wsD.push([k, f[k]]); wsD.push([]);
    wsD.push(["--- ANALYSE INTELLIGENTE ---"]); let sR = wsD.length; getAiInsightsArray().forEach(l => wsD.push([cleanSpaces(l)])); let eR = wsD.length-1; wsD.push([]);
    for(let r=sR; r<=eR; r++) mg.push({s:{r:r,c:0},e:{r:r,c:3}});
    [{t:"DETAIL DREN", id:"dren-summary-table", h:["Nom","Soumissions","Part (%)"]}, {t:"DETAIL CISCO", id:"cisco-summary-table", h:["Nom","Soumissions","Part (%)"]}, {t:"DETAIL ZAP", id:"zap-summary-table", h:["Nom","Soumissions","Part (%)"]}].forEach(tb => {
        wsD.push([tb.t]); wsD.push(tb.h);
        $(`#${tb.id} tr:visible`).each(function() { let r=[]; $(this).find('td').each(function(i) { r.push(cleanSpaces((i===2)?$(this).find('span').text():$(this).text())); }); if(r.length>0 && r[0]!=="Aucune donnée trouvée") wsD.push(r); }); wsD.push([]);
    });
    let ws = XLSX.utils.aoa_to_sheet(wsD); ws['!merges'] = mg; XLSX.utils.book_append_sheet(wb, ws, "Analyse"); XLSX.writeFile(wb, generateFilename(pfx, 'xlsx'));
}

function exportAnalysisToHTML(pfx) {
    let fh = `<div style="background-color: #e8f4f8; padding: 15px; border-radius: 5px; margin-bottom: 20px;"><h3>Critères locaux</h3><p><strong>Date :</strong> ${getFormattedDateTime()}</p><ul>`;
    let f = getAnalysisFilters(); for (let k in f) fh += `<li><strong>${k}</strong> : ${f[k]}</li>`; fh += `</ul></div>`;
    let clone = document.getElementById('analyse').cloneNode(true); $(clone).find('input, .btn-group').remove();
    let h = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><style>body{font-family:sans-serif;padding:20px;}table{border-collapse:collapse;width:100%;margin-bottom:20px;}th,td{border:1px solid #ddd;padding:8px;}th{background:#333;color:#fff;}</style></head><body><h2>${TITRE_PLATEFORME}</h2><h4>${SOUS_TITRE_PLATEFORME}</h4>${fh}${clone.innerHTML}</body></html>`;
    downloadFile(new Blob([h], { type: 'text/html' }), generateFilename(pfx, 'html'));
}

function getExpertJSONData() {
    let headers = ["Entité Administrative", "Niveau", "Soumissions", "Diagnostic du Système", "Action Requise / Recommandation"];
    let jd = [];
    $('#expert-table-body tr:visible').each(function() {
        let r = {}; let cells = $(this).find('td');
        if (cells.length === 5) {
            r[headers[0]] = cleanSpaces($(cells[0]).text()); r[headers[1]] = cleanSpaces($(cells[1]).text());
            r[headers[2]] = cleanSpaces($(cells[2]).text()); r[headers[3]] = cleanSpaces($(cells[3]).text());
            r[headers[4]] = cleanSpaces($(cells[4]).text()); jd.push(r);
        }
    });
    return JSON.stringify({ "titre_plateforme": TITRE_PLATEFORME, "sous_titre": "Registre des Diagnostics", "date_exportation": getFormattedDateTime(), "resultats": jd }, null, 2);
}

function exportExpertToJSONFile(pfx) { downloadFile(new Blob([getExpertJSONData()], { type: 'application/json;charset=utf-8;' }), generateFilename(pfx, 'json')); }

function exportExpertToCSV(pfx) {
    let fn = generateFilename(pfx, 'csv'), csv = [], d = getFormattedDateTime();
    csv.push(`"${TITRE_PLATEFORME}"`); csv.push(`"Registre des Diagnostics et Recommandations"`); csv.push("");
    csv.push(`"--- METADONNEES D'EXPORT ---"`); csv.push(`"Date d'exportation";"${d}"`); csv.push("");
    csv.push(`"Entité Administrative";"Niveau";"Soumissions";"Diagnostic du Système";"Action Requise / Recommandation"`);
    $('#expert-table-body tr:visible').each(function() {
        let cells = $(this).find('td');
        if(cells.length === 5) { let row = []; for(let i=0; i<5; i++) { row.push(`"${cleanSpaces($(cells[i]).text()).replace(/"/g, '""')}"`); } csv.push(row.join(";")); }
    });
    downloadFile(new Blob(["\uFEFF" + csv.join("\n")], {type: "text/csv;charset=utf-8;"}), fn);
}

function exportExpertToExcel(pfx) {
    let fn = generateFilename(pfx, 'xlsx'), wb = XLSX.utils.book_new(), wsD = [];
    wsD.push([TITRE_PLATEFORME]); wsD.push(["Registre des Diagnostics et Recommandations"]); wsD.push([]);
    wsD.push(["Date d'exportation", getFormattedDateTime()]); wsD.push([]);
    wsD.push(["Entité Administrative", "Niveau", "Soumissions", "Diagnostic du Système", "Action Requise / Recommandation"]);
    $('#expert-table-body tr:visible').each(function() {
        let cells = $(this).find('td');
        if(cells.length === 5) { let row = []; for(let i=0; i<5; i++) row.push(cleanSpaces($(cells[i]).text())); wsD.push(row); }
    });
    let ws = XLSX.utils.aoa_to_sheet(wsD); XLSX.utils.book_append_sheet(wb, ws, "Recommandations"); XLSX.writeFile(wb, fn);
}

function exportExpertToHTML(pfx) {
    let clone = document.getElementById('expert-table').outerHTML;
    let h = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><style>body{font-family:sans-serif;padding:20px;}table{border-collapse:collapse;width:100%;margin-top:20px;}th,td{border:1px solid #ddd;padding:8px;}th{background:#8e44ad;color:#fff;}</style></head><body><h2>${TITRE_PLATEFORME}</h2><h4>Registre des Diagnostics (Généré le ${getFormattedDateTime()})</h4>${clone}</body></html>`;
    downloadFile(new Blob([h], { type: 'text/html' }), generateFilename(pfx, 'html'));
}

function sendToGmail() { let j = getTableJSONData(); navigator.clipboard.writeText(j).then(function() { alert("✅ SUCCÈS !\nCopié dans le presse-papiers.\nCollez-le dans Gmail."); window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent("Rapport - Plateforme de Suivi")}&body=${encodeURIComponent(`Bonjour,\n\nDate : ${getFormattedDateTime()}\nCritères :\n${getFiltersPlainText()}\nNombre : ${$('#record-count').text()}\n\n[ COLLER JSON ICI ]\n\nCordialement.`)}`, '_blank'); }).catch(function() { alert("❌ Erreur Presse-papiers."); }); }
function sendToWhatsApp() { let j = getTableJSONData(); navigator.clipboard.writeText(j).then(function() { alert("✅ SUCCÈS !\nCopié dans le presse-papiers.\nCollez-le dans WhatsApp."); window.open(`https://wa.me/?text=${encodeURIComponent(`📊 *Rapport Kobo*\nDate : ${getFormattedDateTime()}\n*Critères :*\n${getFiltersPlainText()}\nNombre : *${$('#record-count').text()}*\n\n[ COLLER JSON ICI ]`)}`, '_blank'); }).catch(function() { alert("❌ Erreur Presse-papiers."); }); }
function sendAnalysisToGmail() { let j = getAnalysisJSONData(); navigator.clipboard.writeText(j).then(function() { alert("✅ SUCCÈS !\nCopié. Collez-le dans Gmail."); window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent("Analyse - Plateforme")}&body=${encodeURIComponent(`Bonjour,\n\nDate : ${getFormattedDateTime()}\n[ COLLER JSON ICI ]\n\nCordialement.`)}`, '_blank'); }).catch(function() { alert("❌ Erreur."); }); }
function sendAnalysisToWhatsApp() { let j = getAnalysisJSONData(); navigator.clipboard.writeText(j).then(function() { alert("✅ SUCCÈS !\nCopié. Collez-le dans WhatsApp."); window.open(`https://wa.me/?text=${encodeURIComponent(`📊 *Synthèse Kobo*\nDate : ${getFormattedDateTime()}\n[ COLLER JSON ICI ]`)}`, '_blank'); }).catch(function() { alert("❌ Erreur."); }); }
function sendExpertToGmail() { let j = getExpertJSONData(); navigator.clipboard.writeText(j).then(function() { alert("✅ SUCCÈS !\nCopié. Collez-le dans Gmail."); window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent("Recommandations")}&body=${encodeURIComponent(`Bonjour,\n\nDate : ${getFormattedDateTime()}\n[ COLLER JSON ICI ]\n\nCordialement.`)}`, '_blank'); }).catch(function() { alert("❌ Erreur."); }); }
function sendExpertToWhatsApp() { let j = getExpertJSONData(); navigator.clipboard.writeText(j).then(function() { alert("✅ SUCCÈS !\nCopié. Collez-le dans WhatsApp."); window.open(`https://wa.me/?text=${encodeURIComponent(`📊 *Recommandations Système Expert*\nDate : ${getFormattedDateTime()}\n\n[ COLLER JSON ICI ]`)}`, '_blank'); }).catch(function() { alert("❌ Erreur."); }); }

window.getDBSCANExportData = function() {
    let flatData = [];
    ['DREN', 'CISCO', 'ZAP'].forEach(lvl => {
        if (globalDBSCANAnomalies[lvl]) {
            globalDBSCANAnomalies[lvl].forEach(item => {
                flatData.push({ "Niveau": lvl, "Entité": item.name, "Nombre de Soumissions": item.count, "Statut": "⚠️ Anomalie de Soumission (Bruit DBSCAN)" });
            });
        }
    });
    return flatData;
}

window.exportDBSCANToCSV = function(pfx) {
    let data = window.getDBSCANExportData(); if (data.length === 0) return alert("Aucune anomalie détectée.");
    let fn = generateFilename(pfx, 'csv'), csv = [], d = getFormattedDateTime();
    csv.push(`"${TITRE_PLATEFORME}"`); csv.push(`"Rapport des Anomalies DBSCAN"`); csv.push("");
    csv.push(`"Niveau";"Entité";"Nombre de Soumissions";"Statut"`);
    data.forEach(row => { csv.push(`"${row.Niveau}";"${cleanSpaces(row['Entité']).replace(/"/g, '""')}";"${row['Nombre de Soumissions']}";"${row.Statut}"`); });
    downloadFile(new Blob(["\uFEFF" + csv.join("\n")], {type: "text/csv;charset=utf-8;"}), fn);
}

window.exportDBSCANToExcel = function(pfx) {
    let data = window.getDBSCANExportData(); if (data.length === 0) return alert("Aucune anomalie détectée.");
    let fn = generateFilename(pfx, 'xlsx'), wb = XLSX.utils.book_new(), wsD = [];
    wsD.push([TITRE_PLATEFORME]); wsD.push(["Rapport des Anomalies DBSCAN"]); wsD.push([]);
    wsD.push(["Niveau", "Entité", "Nombre de Soumissions", "Statut"]);
    data.forEach(row => { wsD.push([ row.Niveau, cleanSpaces(row['Entité']), row['Nombre de Soumissions'], row.Statut ]); });
    let ws = XLSX.utils.aoa_to_sheet(wsD); XLSX.utils.book_append_sheet(wb, ws, "Anomalies"); XLSX.writeFile(wb, fn);
}

window.exportDBSCANToHTML = function(pfx) {
    let data = window.getDBSCANExportData(); if (data.length === 0) return alert("Aucune anomalie détectée.");
    let htmlTable = `<table style="width:100%; border-collapse:collapse; margin-top:20px;"><thead><tr style="background-color:#e74c3c; color:white;"><th style="padding:10px; border:1px solid #ddd;">Niveau</th><th style="padding:10px; border:1px solid #ddd;">Entité</th><th style="padding:10px; border:1px solid #ddd;">Soumissions</th><th style="padding:10px; border:1px solid #ddd;">Statut</th></tr></thead><tbody>`;
    data.forEach(row => { htmlTable += `<tr><td style="padding:10px; border:1px solid #ddd; text-align:center;">${row.Niveau}</td><td style="padding:10px; border:1px solid #ddd;">${row['Entité']}</td><td style="padding:10px; border:1px solid #ddd; text-align:center; font-weight:bold; color:#c0392b;">${row['Nombre de Soumissions']}</td><td style="padding:10px; border:1px solid #ddd; text-align:center;">${row.Statut}</td></tr>`; });
    htmlTable += `</tbody></table>`;
    let h = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><style>body{font-family:sans-serif;padding:20px;background:#f4f7f6;}</style></head><body><h2>${TITRE_PLATEFORME}</h2><h4 style="color:#e74c3c;">Rapport DBSCAN - ${getFormattedDateTime()}</h4>${htmlTable}</body></html>`;
    downloadFile(new Blob([h], { type: 'text/html' }), generateFilename(pfx, 'html'));
}

window.exportDBSCANToJSONFile = function(pfx) { 
    let data = window.getDBSCANExportData(); if (data.length === 0) return alert("Aucune anomalie détectée.");
    let j = JSON.stringify({ "titre_plateforme": TITRE_PLATEFORME, "sous_titre": "Rapport DBSCAN", "date_exportation": getFormattedDateTime(), "resultats": data }, null, 2);
    downloadFile(new Blob([j], { type: 'application/json;charset=utf-8;' }), generateFilename(pfx, 'json')); 
}

window.sendDBSCANToGmail = function() { let data = window.getDBSCANExportData(); if (data.length === 0) return alert("Aucune anomalie détectée."); navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(function() { alert("✅ SUCCÈS !\nCopié.\nCollez-le dans Gmail."); window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent("Anomalies DBSCAN")}&body=${encodeURIComponent(`Bonjour,\n\n[ COLLER JSON ICI ]`)}`, '_blank'); }); }
window.sendDBSCANToWhatsApp = function() { let data = window.getDBSCANExportData(); if (data.length === 0) return alert("Aucune anomalie détectée."); navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(function() { alert("✅ SUCCÈS !\nCopié.\nCollez-le dans WhatsApp."); window.open(`https://wa.me/?text=${encodeURIComponent(`🚨 *Anomalies DBSCAN*\n\n[ COLLER JSON ICI ]`)}`, '_blank'); }); }


function getRealisationsData() {
    let realData = [];
    allData.forEach(row => {
        let dateSubRaw = row['_submission_time'] ? row['_submission_time'].substring(0, 10) : null;
        if (!dateSubRaw) return; 
        
        let vDren = cleanSpaces(getKoboValue(row, ['dren'], ['activite', 'produit', 'budget', 'cisco', 'zap', 'sous'], []));
        let vCisco = cleanSpaces(getKoboValue(row, ['cisco'], ['activite', 'produit', 'budget', 'dren', 'zap', 'sous'], []));
        let vZap = cleanSpaces(getKoboValue(row, ['zap'], ['activite', 'produit', 'budget', 'dren', 'cisco', 'sous'], []));
        
        let act = cleanSpaces(getKoboValue(row, ['activite', 'activité', 'produit'], ['sous_activite', 'sous-activite', 'sous_produit', 'sous-produit'], []));
        let sAct = cleanSpaces(getKoboValue(row, ['sous_activite', 'sous-activite'], [], []));
        let labelAct = (sAct && sAct !== 'Non renseigné') ? sAct : (act || 'Non spécifiée');

        let isAnomaly = (!sAct || sAct.toLowerCase() === 'non renseigné');

        for(let key in row) {
            let lowKey = key.split('/').pop().toLowerCase();
            if(lowKey.includes('realisation') || lowKey.includes('quantit') || lowKey.includes('effectif') || lowKey.includes('montant')) {
                let val = parseFloat(row[key]);
                if(!isNaN(val)) {
                    let niveau = vZap ? 'ZAP' : (vCisco ? 'CISCO' : (vDren ? 'DREN' : 'National'));
                    let entite = vZap || vCisco || vDren || 'Inconnue';
                    
                    realData.push({ 
                        date: dateSubRaw,
                        niveau: niveau, 
                        entite: entite, 
                        activite: labelAct, 
                        valeur: val,
                        isAnomaly: isAnomaly 
                    });
                }
            }
        }
    });
    return realData;
}

window.extractRealisationsTable = function() {
    let data = getRealisationsData();
    let tbody = $('#tbody-realisations').empty();
    
    if(data.length === 0) {
        tbody.append('<tr><td colspan="5" class="text-center text-muted py-4">Aucune donnée chiffrée de type "Réalisation" trouvée dans la base.</td></tr>');
        return;
    }

    data.sort((a, b) => new Date(b.date) - new Date(a.date));

    data.forEach(item => {
        let trClass = item.isAnomaly ? 'class="table-danger"' : '';
        let entiteTextColor = item.isAnomaly ? 'text-danger' : 'text-success';
        let anomalyBadge = item.isAnomaly ? '<br><span class="badge bg-danger mt-1 px-2 py-1 shadow-sm"><i class="fas fa-exclamation-triangle"></i> Anomalie de Liaison</span>' : '';
        let valeurTextColor = item.isAnomaly ? 'text-danger' : '';

        tbody.append(`
            <tr ${trClass}>
                <td class="text-center align-middle">${item.date}</td>
                <td class="text-center align-middle"><span class="badge bg-secondary">${item.niveau}</span></td>
                <td class="fw-bold align-middle ${entiteTextColor}">${item.entite}${anomalyBadge}</td>
                <td class="small align-middle">${item.activite}</td>
                <td class="text-center align-middle bg-light fw-bold fs-5 ${valeurTextColor}">${item.valeur.toLocaleString('fr-FR')}</td>
            </tr>
        `);
    });
};

window.runRealisationTemporel = function() {
    let selectedLevel = $('#real-niveau-select').val(); 
    let data = getRealisationsData();
    
    let timeSeries = {};
    let allMonthsSet = new Set();

    data.forEach(item => {
        let entiteName = '';
        if(selectedLevel === 'dren' && item.niveau === 'DREN') entiteName = item.entite;
        if(selectedLevel === 'cisco' && item.niveau === 'CISCO') entiteName = item.entite;
        if(selectedLevel === 'zap' && item.niveau === 'ZAP') entiteName = item.entite;
        
        if(!entiteName) return; 

        let monthYear = item.date.substring(0, 7); 
        allMonthsSet.add(monthYear);

        if(!timeSeries[entiteName]) timeSeries[entiteName] = {};
        if(!timeSeries[entiteName][monthYear]) timeSeries[entiteName][monthYear] = 0;
        
        timeSeries[entiteName][monthYear] += item.valeur;
    });

    let allMonths = Array.from(allMonthsSet).sort();
    if (allMonths.length === 0) {
        $('#container-chart-real-temporel').html('<div class="text-center text-muted py-5 mt-5"><i class="fas fa-exclamation-circle fa-3x mb-3 text-warning"></i><br>Aucune Réalisation enregistrée en propre à ce niveau (pas de cumul hiérarchique).</div>');
        return;
    }

    $('#real-info-temporel').show();
    $('#container-chart-real-temporel').empty().append('<canvas id="chart-real-temporel"></canvas>');

    let datasets = [];
    const colors = ['#1abc9c', '#3498db', '#9b59b6', '#f1c40f', '#e67e22', '#e74c3c', '#34495e', '#2ecc71', '#8e44ad', '#d35400'];
    let colorIdx = 0;

    for(let entite in timeSeries) {
        let dataPoints = allMonths.map(m => timeSeries[entite][m] || 0);
        
        let totalReals = dataPoints.reduce((a,b)=>a+b, 0);
        if(totalReals === 0) continue;

        let col = colors[colorIdx % colors.length];
        datasets.push({
            label: entite,
            data: dataPoints,
            borderColor: col,
            backgroundColor: col + '33',
            borderWidth: 2,
            tension: 0.3,
            fill: false
        });
        colorIdx++;
    }

    if (datasets.length > 15) {
        datasets.sort((a, b) => b.data.reduce((s,v)=>s+v,0) - a.data.reduce((s,v)=>s+v,0));
        datasets = datasets.slice(0, 15);
        $('#real-info-temporel').append(' <em>(Affichage limité aux 15 entités les plus performantes pour la lisibilité).</em>');
    }

    let ctx = document.getElementById('chart-real-temporel').getContext('2d');
    if (chartRealisationTemporel) chartRealisationTemporel.destroy();

    chartRealisationTemporel = new Chart(ctx, {
        type: 'line',
        data: { labels: allMonths, datasets: datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { tooltip: { mode: 'index', intersect: false } },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Volume Cumulé Réalisations' } },
                x: { title: { display: true, text: 'Mois (YYYY-MM)' } }
            }
        }
    });
};

window.runRealisationClustering = function() {
    let data = getRealisationsData();
    if(data.length === 0) {
        $('#real-clustering-results').html('<div class="col-12 text-center text-muted py-5">Aucune donnée chiffrée trouvée.</div>');
        return;
    }

    let agg = { dren: {}, cisco: {}, zap: {} };
    data.forEach(item => {
        if(item.niveau === 'DREN') { agg.dren[item.entite] = (agg.dren[item.entite] || 0) + item.valeur; }
        if(item.niveau === 'CISCO') { agg.cisco[item.entite] = (agg.cisco[item.entite] || 0) + item.valeur; }
        if(item.niveau === 'ZAP') { agg.zap[item.entite] = (agg.zap[item.entite] || 0) + item.valeur; }
    });

    let html = '';
    
    const createClusteringHTML = (levelName, levelData) => {
        let entries = Object.entries(levelData);
        if(entries.length === 0) return '';
        
        entries.sort((a,b) => b[1] - a[1]);
        let counts = entries.map(e => e[1]);
        let labels = entries.map(e => e[0]);
        
        let assignments = performJenks(counts, 3);
        
        let clustersInfo = [
            { title: "Performances Faibles", items: [], badge: "bg-danger", border: "border-danger", icon: "fa-arrow-down" },
            { title: "Performances Moyennes", items: [], badge: "bg-warning text-dark", border: "border-warning", icon: "fa-minus" },
            { title: "Excellentes Performances", items: [], badge: "bg-success", border: "border-success", icon: "fa-trophy" }
        ];
        
        for(let i=0; i<entries.length; i++) {
            clustersInfo[assignments[i]].items.push({ name: labels[i], val: counts[i] });
        }

        let blockHtml = `<div class="col-12 mt-4"><h5 class="text-primary mb-3 text-uppercase border-bottom pb-2">${levelName}</h5><div class="row">`;
        
        [2, 1, 0].forEach(idx => {
            let group = clustersInfo[idx];
            blockHtml += `
                <div class="col-md-4 mb-3">
                    <div class="card h-100 shadow-sm ${group.border}">
                        <div class="card-header bg-light fw-bold"><i class="fas ${group.icon}"></i> ${group.title}</div>
                        <ul class="list-group list-group-flush" style="max-height: 250px; overflow-y: auto;">
            `;
            group.items.forEach(item => {
                blockHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">${item.name} <span class="badge ${group.badge} rounded-pill fs-6">${item.val.toLocaleString('fr-FR')}</span></li>`;
            });
            if(group.items.length === 0) blockHtml += `<li class="list-group-item text-muted">Aucune entité (Aucune réalisation en propre)</li>`;
            blockHtml += `</ul></div></div>`;
        });
        
        blockHtml += `</div></div>`;
        return blockHtml;
    };

    html += createClusteringHTML('Niveau DREN (Réalisations Propres)', agg.dren);
    html += createClusteringHTML('Niveau CISCO (Réalisations Propres)', agg.cisco);
    html += createClusteringHTML('Niveau ZAP (Réalisations Propres)', agg.zap);

    $('#real-clustering-results').html(html);
};

async function fetchData() {
    $('#loading-box').show(); $('#error-box').hide();
    $('#table-body').empty(); $('#table-group-header-row').empty(); $('#table-sub-header-row').empty();
    $('#sync-status').html('<span class="badge bg-warning text-dark sync-badge"><i class="fas fa-spinner fa-spin"></i> Collecte en cours...</span>');
    
    await loadDictionaryAutomatically();

    try {
        const koboUrl = 'https://kf.kobotoolbox.org/api/v2/assets/ath6cv2NrXEUijffeKJqSf/data.json?_t=' + new Date().getTime();
        
        const fetchUrls = [
            koboUrl, 
            'https://api.allorigins.win/raw?url=' + encodeURIComponent(koboUrl),
            'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(koboUrl),
            'https://corsproxy.io/?' + encodeURIComponent(koboUrl)
        ];

        let response = null;
        let fetchSuccess = false;

        for (let url of fetchUrls) {
            try {
                response = await fetch(url, { cache: 'no-store' });
                if (response.ok) {
                    fetchSuccess = true;
                    break; 
                }
            } catch (e) {
                console.warn("Le navigateur a bloqué l'accès via :", url);
            }
        }

        if (!fetchSuccess) {
            throw new Error("L'antivirus ou l'extension du navigateur (ex: uBlock) bloque la connexion. Veuillez importer votre fichier JSON manuellement via le bouton en haut.");
        }
        
        const payload = await response.json();
        allData = extractKoboRecordsFromPayload(payload).filter(row => row !== null && typeof row === 'object' && !Array.isArray(row));
        
        renderTable(allData);
        renderAnalysis(allData);
        if (typeof window.refreshAdvancedAnalysisFromMainData === 'function') window.refreshAdvancedAnalysisFromMainData(allData);
        
        let bEx = isExcelLoaded ? '<span class="badge bg-success ms-2"><i class="fas fa-check-circle"></i> Traduit</span>' : '<span class="badge bg-warning text-dark ms-2"><i class="fas fa-info-circle"></i> Brut</span>';
        $('#sync-status').html(`<span class="badge bg-success sync-badge"><i class="fas fa-check-double"></i> Ok : ${allData.length} Lignes</span>`).append(bEx);

    } catch (error) {
        $('#error-box').html('<strong>Erreur de sécurité réseau :</strong> ' + error.message).show();
        $('#sync-status').html('<span class="badge bg-danger sync-badge">Échec Kobo</span>');
    } finally { 
        $('#loading-box').hide(); 
    }
}

/* ========================================================================== */
/* EXPORTS COMPLETS DES GRAPHIQUES TEMPORELS + IMPORT/EXPORT JSON HORS-LIGNE */
/* ========================================================================== */

function timelineEscapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function timelineSafeFilename(value) {
    return cleanSpaces(value || 'graphique')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100) || 'graphique';
}

function timelineTimestamp() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
}

function setTimelineExportStatus(message, type) {
    const el = document.getElementById('timeline-export-status');
    if (!el) return;
    el.className = `alert py-2 px-3 timeline-export-status alert-${type || 'info'}`;
    el.innerHTML = message;
    el.classList.remove('d-none');
    if (type === 'success') setTimeout(() => el.classList.add('d-none'), 6500);
}

function getTimelineScopeLevels(scope) {
    const normalized = String(scope || 'ALL').toUpperCase();
    return normalized === 'ALL' ? ['DREN', 'CISCO', 'ZAP'] : [normalized].filter(level => ['DREN', 'CISCO', 'ZAP'].includes(level));
}

function getTimelineCriteriaSnapshot() {
    const granularity = $('#timeline-granularity').val() || 'day';
    const displayMode = $('#timeline-display-mode').val() || 'detailed';
    const layoutMode = $('input[name="timeline-layout-mode"]:checked').val() || 'grouped';
    return {
        date_exportation: getFormattedDateTime(),
        granularite_cle: granularity,
        granularite: SUBMISSION_TIMELINE_LABELS[granularity] || granularity,
        type_donnees_cle: displayMode,
        type_donnees: displayMode === 'cumulative' ? 'Données cumulées' : 'Données détaillées',
        organisation_cle: layoutMode,
        organisation: layoutMode === 'individual' ? 'Affichage individuel' : 'Affichage groupé',
        entites_graphique_groupe: $('#timeline-top-entities').val() || '10',
        date_debut: $('#timeline-date-start').val() || 'Première date disponible',
        date_fin: $('#timeline-date-end').val() || 'Dernière date disponible',
        criteres_recherche_principaux: typeof getCurrentFilters === 'function' ? getCurrentFilters() : {},
        criteres_locaux_analyse: typeof getAnalysisFilters === 'function' ? getAnalysisFilters() : {}
    };
}

function ensureTimelineRenderContext() {
    if (!submissionTimelineRenderContext || !submissionTimelineRenderContext.models) renderSubmissionTimelineCharts();
    return submissionTimelineRenderContext;
}

function getAnalysisSummaryObject() {
    const result = { DREN: [], CISCO: [], ZAP: [] };
    [['DREN', 'dren-summary-table'], ['CISCO', 'cisco-summary-table'], ['ZAP', 'zap-summary-table']].forEach(([level, id]) => {
        $(`#${id} tr:visible`).each(function() {
            const cells = $(this).find('td');
            if (cells.length !== 3) return;
            const name = cleanSpaces($(cells[0]).text());
            if (!name || name === 'Aucune donnée trouvée' || name === 'Vide') return;
            result[level].push({
                entite: name,
                soumissions: Number(cleanSpaces($(cells[1]).text()).replace(/[^0-9.-]/g, '')) || 0,
                part: cleanSpaces($(cells[2]).find('span').text() || $(cells[2]).text())
            });
        });
    });
    return result;
}

function buildTimelineExportData(scope) {
    const context = ensureTimelineRenderContext();
    const levels = getTimelineScopeLevels(scope);
    const fullSummary = getAnalysisSummaryObject();
    const fullAdvanced = typeof window.getAdvancedAnalysisExportSnapshot === 'function' ? window.getAdvancedAnalysisExportSnapshot() : null;
    const scopedSummary = {};
    levels.forEach(level => { scopedSummary[level] = fullSummary[level] || []; });
    let scopedAdvanced = fullAdvanced;
    if (fullAdvanced && levels.length === 1) {
        const selectedLevel = levels[0];
        const algorithms = {};
        Object.entries(fullAdvanced.algorithms || {}).forEach(([algorithm, levelData]) => {
            algorithms[algorithm] = { [selectedLevel]: (levelData && levelData[selectedLevel]) || [] };
        });
        scopedAdvanced = { ...fullAdvanced, algorithms, charts: (fullAdvanced.charts || []).filter(chart => chart.level === selectedLevel) };
    }
    const report = {
        titre_plateforme: TITRE_PLATEFORME,
        sous_titre: SOUS_TITRE_PLATEFORME,
        criteres: getTimelineCriteriaSnapshot(),
        analyse_ia: getAiInsightsArray(),
        synthese: scopedSummary,
        graphiques_temporels: {},
        analyse_avancee: scopedAdvanced
    };
    if (!context) return report;

    levels.forEach(level => {
        const model = context.models && context.models[level];
        if (!model) return;
        report.graphiques_temporels[level] = {
            nombre_entites: model.rankedEntities.length,
            entites: model.rankedEntities.map(([entity, total]) => ({
                nom: entity,
                total_soumissions: total,
                valeurs: context.bucketKeys.map((bucket, index) => ({
                    periode_cle: bucket,
                    periode: formatSubmissionTimelineLabel(bucket, context.granularity),
                    valeur: model.series[entity][index] || 0
                }))
            }))
        };
    });
    return report;
}

function getTimelineExportDescriptors(scope, entityName) {
    const context = ensureTimelineRenderContext();
    if (!context || !context.models || !context.bucketKeys.length) return [];
    const levels = getTimelineScopeLevels(scope);
    const descriptors = [];
    levels.forEach(level => {
        const model = context.models[level];
        if (!model) return;
        let ranked = model.rankedEntities.slice();
        if (entityName) ranked = ranked.filter(([entity]) => entity === entityName);
        if (!entityName && context.layoutMode === 'grouped') {
            if (context.topLimit !== 'all') ranked = ranked.slice(0, Number(context.topLimit));
            if (ranked.length) descriptors.push({ kind: 'timeline', level, entity: null, entities: ranked, title: `Soumissions groupées — ${level}` });
        } else {
            ranked.forEach(([entity, total]) => descriptors.push({ kind: 'timeline', level, entity, total, entities: [[entity, total]], title: `${level} — ${entity}` }));
        }
    });
    if (!entityName && typeof window.getAdvancedAnalysisExportSnapshot === 'function') {
        const advanced = window.getAdvancedAnalysisExportSnapshot();
        const allowedLevels = new Set(levels);
        (advanced && Array.isArray(advanced.charts) ? advanced.charts : []).forEach(chart => {
            if (allowedLevels.has(chart.level)) descriptors.push({ ...chart, kind: 'advanced' });
        });
    }
    return descriptors;
}

async function renderTimelineDescriptorToDataURL(descriptor, format) {
    const context = ensureTimelineRenderContext();
    if (!context) throw new Error('Les graphiques ne sont pas encore disponibles.');
    const isAdvanced = descriptor.kind === 'advanced';
    const width = isAdvanced
        ? 1500
        : Math.min(2400, Math.max(1100, context.bucketKeys.length * (context.granularity === 'day' ? 46 : 64) + 300));
    const height = isAdvanced ? 760 : (descriptor.entity ? 620 : 760);
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-10000px;top:0;background:#fff;z-index:-1;';
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    holder.appendChild(canvas);
    document.body.appendChild(holder);

    let chartType = 'line';
    let chartData;
    let options;
    if (isAdvanced) {
        chartType = descriptor.chartType || 'bar';
        chartData = JSON.parse(JSON.stringify(descriptor.data || { labels: [], datasets: [] }));
        options = {
            responsive: false,
            maintainAspectRatio: false,
            animation: false,
            normalized: true,
            layout: { padding: { left: 25, right: 25, top: 15, bottom: 25 } },
            plugins: {
                legend: { display: true, position: 'bottom', labels: { usePointStyle: true, boxWidth: 18, padding: 12 } },
                title: { display: true, text: descriptor.title, font: { size: 20, weight: 'bold' }, padding: { top: 10, bottom: 18 } },
                tooltip: { enabled: true }
            },
            scales: chartType === 'scatter'
                ? { x: { display: false }, y: { beginAtZero: true, title: { display: true, text: 'Volume de soumissions' }, ticks: { precision: 0 } } }
                : { x: { ticks: { autoSkip: false, maxRotation: 42, minRotation: 20 } }, y: { beginAtZero: true, title: { display: true, text: 'Volume de soumissions' }, ticks: { precision: 0 } } }
        };
    } else {
        const model = context.models[descriptor.level];
        const labels = context.bucketKeys.map(bucket => formatSubmissionTimelineLabel(bucket, context.granularity));
        const datasets = descriptor.entities.map(([entity], localIndex) => {
            const globalIndex = Math.max(0, model.rankedEntities.findIndex(([name]) => name === entity));
            const dataset = buildSubmissionTimelineDataset(entity, model.series[entity], globalIndex >= 0 ? globalIndex : localIndex, context.bucketKeys.length);
            if (descriptor.entity) {
                dataset.borderDash = [];
                dataset.borderWidth = 3;
            }
            return dataset;
        });
        chartData = { labels, datasets };
        options = getSubmissionTimelineChartOptions(context.granularity, context.displayMode, datasets.length, true);
        options.responsive = false;
        options.maintainAspectRatio = false;
        options.animation = false;
        options.devicePixelRatio = 1;
        options.plugins.legend = {
            display: datasets.length > 1,
            position: 'bottom',
            labels: { usePointStyle: true, boxWidth: 18, padding: 12, font: { size: 12 } }
        };
        options.plugins.title = {
            display: true,
            text: [descriptor.title, `${SUBMISSION_TIMELINE_LABELS[context.granularity]} · ${context.displayMode === 'cumulative' ? 'Données cumulées' : 'Données détaillées'}`],
            font: { size: 18, weight: 'bold' },
            padding: { top: 10, bottom: 18 }
        };
        options.scales.x.ticks.maxTicksLimit = 20;
    }

    const whiteBackgroundPlugin = {
        id: `whiteBackground_${Date.now()}_${Math.random()}`,
        beforeDraw(chart) {
            const ctx = chart.ctx;
            ctx.save();
            ctx.globalCompositeOperation = 'destination-over';
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, chart.width, chart.height);
            ctx.restore();
        }
    };
    const chart = new Chart(canvas.getContext('2d'), { type: chartType, data: chartData, options, plugins: [whiteBackgroundPlugin] });
    await new Promise(resolve => setTimeout(resolve, 90));
    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const dataURL = canvas.toDataURL(mime, format === 'jpeg' ? 0.94 : 1);
    chart.destroy();
    holder.remove();
    return dataURL;
}

function timelineDataURLToBlob(dataURL) {
    const parts = dataURL.split(',');
    const mime = (parts[0].match(/:(.*?);/) || [null, 'application/octet-stream'])[1];
    const bytes = atob(parts[1]);
    const array = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i);
    return new Blob([array], { type: mime });
}

async function createTimelineImagePackage(scope, format, entityName) {
    const descriptors = getTimelineExportDescriptors(scope, entityName);
    if (!descriptors.length) throw new Error('Aucun graphique n’est disponible pour cette sélection.');
    const extension = format === 'jpeg' ? 'jpg' : 'png';
    if (descriptors.length === 1) {
        setTimelineExportStatus('<span class="spinner-border spinner-border-sm me-2"></span>Création du graphique…', 'info');
        const descriptor = descriptors[0];
        const dataURL = await renderTimelineDescriptorToDataURL(descriptor, format);
        const label = descriptor.entity || descriptor.title || 'graphique';
        const filename = `${descriptor.level}_${timelineSafeFilename(label)}_${timelineTimestamp()}.${extension}`;
        return { blob: timelineDataURLToBlob(dataURL), filename, assets: [{ descriptor, filename }] };
    }
    if (typeof JSZip === 'undefined') throw new Error('La bibliothèque ZIP n’est pas chargée.');
    const zip = new JSZip();
    const assets = [];
    for (let i = 0; i < descriptors.length; i++) {
        setTimelineExportStatus(`<span class="spinner-border spinner-border-sm me-2"></span>Création du graphique ${i + 1} / ${descriptors.length}…`, 'info');
        const descriptor = descriptors[i];
        const dataURL = await renderTimelineDescriptorToDataURL(descriptor, format);
        const label = descriptor.entity || descriptor.title || 'graphique';
        const filename = `${descriptor.level}_${timelineSafeFilename(label)}_${String(i + 1).padStart(3, '0')}.${extension}`;
        zip.file(filename, dataURL.split(',')[1], { base64: true });
        assets.push({ descriptor, filename });
    }
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }, metadata => {
        setTimelineExportStatus(`<span class="spinner-border spinner-border-sm me-2"></span>Compression des graphiques : ${Math.round(metadata.percent)} %`, 'info');
    });
    return { blob, filename: `graphiques_${String(scope).toLowerCase()}_${timelineTimestamp()}.zip`, assets };
}

async function exportTimelineImages(scope, format, entityName) {
    try {
        const result = await createTimelineImagePackage(scope, format || 'png', entityName);
        downloadFile(result.blob, result.filename);
        setTimelineExportStatus(`<i class="fas fa-check-circle me-2"></i>Export terminé : <strong>${timelineEscapeHtml(result.filename)}</strong>`, 'success');
    } catch (error) {
        console.error(error);
        setTimelineExportStatus(`<i class="fas fa-exclamation-triangle me-2"></i>${timelineEscapeHtml(error.message)}`, 'danger');
    }
}

function timelineCriteriaHtml(criteria) {
    const rows = [];
    Object.entries(criteria).forEach(([key, value]) => {
        if (value && typeof value === 'object') {
            Object.entries(value).forEach(([subKey, subValue]) => rows.push(`<tr><th>${timelineEscapeHtml(key)} — ${timelineEscapeHtml(subKey)}</th><td>${timelineEscapeHtml(subValue)}</td></tr>`));
        } else rows.push(`<tr><th>${timelineEscapeHtml(key)}</th><td>${timelineEscapeHtml(value)}</td></tr>`);
    });
    return `<table class="criteria"><tbody>${rows.join('')}</tbody></table>`;
}


function timelineXmlEscape(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function timelineDataURLToBytes(dataURL) {
    const parts = String(dataURL || '').split(',');
    if (parts.length < 2) throw new Error('Image du graphique invalide.');
    const binary = atob(parts[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

function timelineReadPngDimensions(bytes) {
    if (!bytes || bytes.length < 24 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) {
        return { width: 1200, height: 700 };
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
}

function timelineDocxImageSize(bytes) {
    const dimensions = timelineReadPngDimensions(bytes);
    const maxWidthInches = 10.0;
    const maxHeightInches = 5.8;
    let widthInches = maxWidthInches;
    let heightInches = widthInches * dimensions.height / Math.max(1, dimensions.width);
    if (heightInches > maxHeightInches) {
        heightInches = maxHeightInches;
        widthInches = heightInches * dimensions.width / Math.max(1, dimensions.height);
    }
    return {
        cx: Math.max(1, Math.round(widthInches * 914400)),
        cy: Math.max(1, Math.round(heightInches * 914400))
    };
}

function timelineFlattenCriteria(criteria) {
    const rows = [];
    Object.entries(criteria || {}).forEach(([key, value]) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            Object.entries(value).forEach(([subKey, subValue]) => rows.push([`${key} — ${subKey}`, subValue]));
        } else {
            rows.push([key, value]);
        }
    });
    return rows;
}

function timelineDocxParagraph(text, options) {
    const opts = options || {};
    const align = opts.align ? `<w:jc w:val="${timelineXmlEscape(opts.align)}"/>` : '';
    const spacing = `<w:spacing w:before="${opts.before || 0}" w:after="${opts.after === undefined ? 120 : opts.after}"/>`;
    const pageBreakBefore = opts.pageBreakBefore ? '<w:pageBreakBefore/>' : '';
    const keepNext = opts.keepNext ? '<w:keepNext/>' : '';
    const size = opts.size || 22;
    const color = opts.color || '243447';
    const bold = opts.bold ? '<w:b/>' : '';
    const italic = opts.italic ? '<w:i/>' : '';
    return `<w:p><w:pPr>${align}${spacing}${pageBreakBefore}${keepNext}</w:pPr><w:r><w:rPr>${bold}${italic}<w:color w:val="${color}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${timelineXmlEscape(text)}</w:t></w:r></w:p>`;
}

function timelineDocxTable(rows) {
    const border = '<w:top w:val="single" w:sz="4" w:color="CBD5E1"/><w:left w:val="single" w:sz="4" w:color="CBD5E1"/><w:bottom w:val="single" w:sz="4" w:color="CBD5E1"/><w:right w:val="single" w:sz="4" w:color="CBD5E1"/><w:insideH w:val="single" w:sz="4" w:color="CBD5E1"/><w:insideV w:val="single" w:sz="4" w:color="CBD5E1"/>';
    const tableRows = rows.map(([label, value]) => {
        const left = `<w:tc><w:tcPr><w:tcW w:w="4300" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="EAF2F8"/></w:tcPr>${timelineDocxParagraph(label, { bold: true, size: 18, after: 30 })}</w:tc>`;
        const right = `<w:tc><w:tcPr><w:tcW w:w="9200" w:type="dxa"/></w:tcPr>${timelineDocxParagraph(value === null || value === undefined || value === '' ? 'Aucune' : value, { size: 18, after: 30 })}</w:tc>`;
        return `<w:tr>${left}${right}</w:tr>`;
    }).join('');
    return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblLayout w:type="fixed"/><w:tblBorders>${border}</w:tblBorders><w:tblCellMar><w:top w:w="90" w:type="dxa"/><w:left w:w="110" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:right w:w="110" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="4300"/><w:gridCol w:w="9200"/></w:tblGrid>${tableRows}</w:tbl>`;
}

function timelineDocxImageParagraph(image, index) {
    const size = timelineDocxImageSize(image.bytes);
    const relationshipId = `rIdImage${index + 1}`;
    const imageName = `graphique_${String(index + 1).padStart(3, '0')}.png`;
    return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="100" w:after="180"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${size.cx}" cy="${size.cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${index + 1}" name="${timelineXmlEscape(imageName)}" descr="${timelineXmlEscape(image.descriptor.title)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${index + 1}" name="${timelineXmlEscape(imageName)}" descr="${timelineXmlEscape(image.descriptor.title)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${size.cx}" cy="${size.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

async function timelineCreateDocxBlob(images, criteria, documentTitle) {
    if (typeof JSZip === 'undefined') throw new Error('La bibliothèque ZIP nécessaire au format DOCX n’est pas chargée.');
    const zip = new JSZip();
    const created = new Date().toISOString();
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
    const packageRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
    const imageRelationships = images.map((_, index) => `<Relationship Id="rIdImage${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/graphique_${String(index + 1).padStart(3, '0')}.png"/>`).join('');
    const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>${imageRelationships}</Relationships>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`;
    const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
    const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${timelineXmlEscape(documentTitle)}</dc:title><dc:creator>Plateforme PMA PTA 2026</dc:creator><cp:lastModifiedBy>Plateforme PMA PTA 2026</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified></cp:coreProperties>`;
    const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Plateforme PMA PTA 2026</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><Company>MEN Madagascar</Company><AppVersion>16.0000</AppVersion></Properties>`;
    const criteriaRows = timelineFlattenCriteria(criteria);
    let body = timelineDocxParagraph(documentTitle, { bold: true, size: 34, color: '1F4E78', after: 220, keepNext: true });
    body += timelineDocxParagraph('Critères de recherche et d’affichage', { bold: true, size: 26, color: '2F5597', after: 100, keepNext: true });
    body += timelineDocxTable(criteriaRows);
    images.forEach((image, index) => {
        body += timelineDocxParagraph(image.descriptor.title, { bold: true, size: 28, color: '2F5597', before: index === 0 ? 260 : 0, after: 80, pageBreakBefore: true, keepNext: true });
        body += timelineDocxParagraph(`${criteria.granularite || ''} · ${criteria.type_donnees || ''} · ${criteria.organisation || ''}`, { italic: true, size: 19, color: '667085', after: 80, keepNext: true });
        body += timelineDocxImageParagraph(image, index);
    });
    body += '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="680" w:right="680" w:bottom="680" w:left="680" w:header="360" w:footer="360" w:gutter="0"/><w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr>';
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}</w:body></w:document>`;
    zip.file('[Content_Types].xml', contentTypes);
    zip.file('_rels/.rels', packageRels);
    zip.file('docProps/core.xml', core);
    zip.file('docProps/app.xml', app);
    zip.file('word/document.xml', documentXml);
    zip.file('word/styles.xml', styles);
    zip.file('word/settings.xml', settings);
    zip.file('word/_rels/document.xml.rels', documentRels);
    images.forEach((image, index) => zip.file(`word/media/graphique_${String(index + 1).padStart(3, '0')}.png`, image.bytes));
    return zip.generateAsync({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
    }, metadata => {
        setTimelineExportStatus(`<span class="spinner-border spinner-border-sm me-2"></span>Création du document Word : ${Math.round(metadata.percent)} %`, 'info');
    });
}

async function createTimelineWordPackage(scope, entityName) {
    const descriptors = getTimelineExportDescriptors(scope, entityName);
    if (!descriptors.length) throw new Error('Aucun graphique n’est disponible.');
    const images = [];
    for (let i = 0; i < descriptors.length; i++) {
        setTimelineExportStatus(`<span class="spinner-border spinner-border-sm me-2"></span>Préparation Word : graphique ${i + 1} / ${descriptors.length}…`, 'info');
        const dataURL = await renderTimelineDescriptorToDataURL(descriptors[i], 'png');
        images.push({ descriptor: descriptors[i], bytes: timelineDataURLToBytes(dataURL) });
    }
    const criteria = getTimelineCriteriaSnapshot();
    const blob = await timelineCreateDocxBlob(images, criteria, TITRE_PLATEFORME);
    const label = entityName ? timelineSafeFilename(entityName) : String(scope).toLowerCase();
    return { blob, filename: `rapport_graphiques_${label}_${timelineTimestamp()}.docx` };
}

async function exportTimelineWord(scope, entityName) {
    try {
        const result = await createTimelineWordPackage(scope, entityName);
        downloadFile(result.blob, result.filename);
        setTimelineExportStatus(`<i class="fas fa-check-circle me-2"></i>Rapport Word créé : <strong>${timelineEscapeHtml(result.filename)}</strong>`, 'success');
    } catch (error) {
        console.error(error);
        setTimelineExportStatus(`<i class="fas fa-exclamation-triangle me-2"></i>${timelineEscapeHtml(error.message)}`, 'danger');
    }
}

async function shareTimelineExport(scope, format, entityName) {
    try {
        const result = format === 'word'
            ? await createTimelineWordPackage(scope, entityName)
            : await createTimelineImagePackage(scope, format || 'png', entityName);
        const file = new File([result.blob], result.filename, { type: result.blob.type || 'application/octet-stream' });
        if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
            await navigator.share({ title: 'Graphiques KoboToolbox', text: 'Graphiques de l’onglet Analyse avec les critères de recherche.', files: [file] });
            setTimelineExportStatus('<i class="fas fa-check-circle me-2"></i>Partage terminé.', 'success');
        } else {
            downloadFile(result.blob, result.filename);
            setTimelineExportStatus('<i class="fas fa-info-circle me-2"></i>Le partage direct de fichiers n’est pas disponible dans ce navigateur. Le fichier a été téléchargé afin que vous puissiez le joindre manuellement.', 'warning');
        }
    } catch (error) {
        if (error && error.name === 'AbortError') return;
        console.error(error);
        setTimelineExportStatus(`<i class="fas fa-exclamation-triangle me-2"></i>${timelineEscapeHtml(error.message)}`, 'danger');
    }
}

function timelineCsvCell(value) {
    return `"${String(value === null || value === undefined ? '' : value).replace(/"/g, '""').replace(/[\r\n]+/g, ' ')}"`;
}

function buildTimelineCSV(scope) {
    const report = buildTimelineExportData(scope);
    const csv = [];
    csv.push(timelineCsvCell(report.titre_plateforme));
    csv.push(timelineCsvCell(report.sous_titre));
    csv.push('');
    csv.push(timelineCsvCell('--- CRITERES DE RECHERCHE ET D’AFFICHAGE ---'));
    Object.entries(report.criteres).forEach(([key, value]) => {
        if (value && typeof value === 'object') Object.entries(value).forEach(([subKey, subValue]) => csv.push(`${timelineCsvCell(`${key} — ${subKey}`)};${timelineCsvCell(subValue)}`));
        else csv.push(`${timelineCsvCell(key)};${timelineCsvCell(value)}`);
    });
    csv.push('');
    csv.push(timelineCsvCell('--- ANALYSE INTELLIGENTE ---'));
    report.analyse_ia.forEach(item => csv.push(timelineCsvCell(item)));
    csv.push('');
    csv.push(timelineCsvCell('--- DONNEES DES GRAPHIQUES TEMPORELS ---'));
    csv.push(`${timelineCsvCell('Niveau')};${timelineCsvCell('Entité')};${timelineCsvCell('Total soumissions')};${timelineCsvCell('Période')};${timelineCsvCell('Clé période')};${timelineCsvCell('Valeur')};${timelineCsvCell('Granularité')};${timelineCsvCell('Type de données')}`);
    Object.entries(report.graphiques_temporels).forEach(([level, levelData]) => {
        levelData.entites.forEach(entity => entity.valeurs.forEach(point => {
            csv.push([level, entity.nom, entity.total_soumissions, point.periode, point.periode_cle, point.valeur, report.criteres.granularite, report.criteres.type_donnees].map(timelineCsvCell).join(';'));
        }));
    });

    const advanced = report.analyse_avancee;
    if (advanced) {
        csv.push('');
        csv.push(timelineCsvCell('--- CRITERES DU SOUS-MODULE AVANCE ---'));
        Object.entries(advanced.filters || {}).forEach(([key, value]) => csv.push(`${timelineCsvCell(key)};${timelineCsvCell(value)}`));
        csv.push('');
        csv.push(timelineCsvCell('--- RESULTATS K-MEANS / JENKS / DBSCAN ---'));
        Object.entries(advanced.algorithms || {}).forEach(([algorithm, levels]) => {
            Object.entries(levels || {}).forEach(([level, rows]) => {
                csv.push(`${timelineCsvCell(algorithm)};${timelineCsvCell(level)}`);
                (rows || []).forEach(row => csv.push([algorithm, level, ...row].map(timelineCsvCell).join(';')));
                csv.push('');
            });
        });
        if (Array.isArray(advanced.filtered_rows) && advanced.filtered_rows.length) {
            csv.push(timelineCsvCell('--- BASE FILTREE DU SOUS-MODULE AVANCE ---'));
            const headers = (advanced.headers && advanced.headers.length) ? advanced.headers : Object.keys(advanced.filtered_rows[0]);
            csv.push(headers.map(timelineCsvCell).join(';'));
            advanced.filtered_rows.forEach(row => csv.push(headers.map(header => timelineCsvCell(row[header])).join(';')));
        }
    }
    return '\ufeff' + csv.join('\n');
}

async function buildTimelineHtmlDocument(scope) {
    const report = buildTimelineExportData(scope);
    const descriptors = getTimelineExportDescriptors(scope);
    const assets = [];
    for (let i = 0; i < descriptors.length; i++) {
        setTimelineExportStatus(`<span class="spinner-border spinner-border-sm me-2"></span>Préparation HTML : graphique ${i + 1} / ${descriptors.length}…`, 'info');
        assets.push({ descriptor: descriptors[i], dataURL: await renderTimelineDescriptorToDataURL(descriptors[i], 'png') });
    }
    const dataSections = Object.entries(report.graphiques_temporels).map(([level, levelData]) => {
        const rows = levelData.entites.flatMap(entity => entity.valeurs.map(point => `<tr><td>${timelineEscapeHtml(entity.nom)}</td><td>${entity.total_soumissions}</td><td>${timelineEscapeHtml(point.periode)}</td><td>${point.valeur}</td></tr>`)).join('');
        return `<section><h2>Données temporelles ${level}</h2><div class="table-wrap"><table><thead><tr><th>Entité</th><th>Total</th><th>Période</th><th>Valeur</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
    }).join('');

    let advancedHtml = '';
    const advanced = report.analyse_avancee;
    if (advanced) {
        const filterRows = Object.entries(advanced.filters || {}).map(([key, value]) => `<tr><th>${timelineEscapeHtml(key)}</th><td>${timelineEscapeHtml(value)}</td></tr>`).join('');
        const algorithms = Object.entries(advanced.algorithms || {}).map(([algorithm, levels]) => {
            const levelTables = Object.entries(levels || {}).map(([level, rows]) => `<h4>${timelineEscapeHtml(level)}</h4><table><tbody>${(rows || []).map(row => `<tr>${row.map(cell => `<td>${timelineEscapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('');
            return `<section><h3>${timelineEscapeHtml(algorithm)}</h3>${levelTables}</section>`;
        }).join('');
        let rawTable = '';
        if (Array.isArray(advanced.filtered_rows) && advanced.filtered_rows.length) {
            const headers = (advanced.headers && advanced.headers.length) ? advanced.headers : Object.keys(advanced.filtered_rows[0]);
            rawTable = `<h3>Base filtrée du sous-module avancé (${advanced.filtered_count} ligne(s))</h3><div class="table-wrap"><table><thead><tr>${headers.map(header => `<th>${timelineEscapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${advanced.filtered_rows.map(row => `<tr>${headers.map(header => `<td>${timelineEscapeHtml(row[header])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
        }
        advancedHtml = `<section><h2>Sous-module avancé : critères</h2><table class="criteria"><tbody>${filterRows}</tbody></table>${algorithms}${rawTable}</section>`;
    }
    return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rapport Analyse Kobo</title><style>body{font-family:Segoe UI,Arial,sans-serif;margin:0;padding:24px;color:#243447;background:#f4f7fb}main{max-width:1500px;margin:auto;background:#fff;padding:28px;border-radius:12px}h1{color:#1f4e78}h2{color:#2f5597;margin-top:28px}.criteria,table{border-collapse:collapse;width:100%}.criteria th,.criteria td,th,td{border:1px solid #d8e0e8;padding:8px;text-align:left}.criteria th,thead th{background:#eaf2f8}.chart{margin:26px 0;padding:16px;border:1px solid #d8e0e8;border-radius:10px;page-break-inside:avoid}.chart img{max-width:100%;height:auto;display:block;margin:auto}.table-wrap{overflow:auto;max-height:650px}</style></head><body><main><h1>${timelineEscapeHtml(report.titre_plateforme)}</h1><p>${timelineEscapeHtml(report.sous_titre)}</p><h2>Critères de recherche et d’affichage</h2>${timelineCriteriaHtml(report.criteres)}<h2>Analyse intelligente</h2><ul>${report.analyse_ia.map(item => `<li>${timelineEscapeHtml(item)}</li>`).join('')}</ul><h2>Graphiques exportés</h2>${assets.map(item => `<article class="chart"><h3>${timelineEscapeHtml(item.descriptor.title)}</h3><img src="${item.dataURL}" alt="${timelineEscapeHtml(item.descriptor.title)}"></article>`).join('')}${dataSections}${advancedHtml}</main></body></html>`;
}

async function buildTimelineExcelBlob(scope) {
    if (typeof ExcelJS === 'undefined') throw new Error('La bibliothèque ExcelJS n’est pas disponible. Vérifiez la connexion aux bibliothèques CDN.');
    const report = buildTimelineExportData(scope);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Plateforme PMA — KoboToolbox';
    workbook.created = new Date();
    const criteriaSheet = workbook.addWorksheet('Criteres');
    criteriaSheet.columns = [{ header: 'Critère', key: 'critere', width: 48 }, { header: 'Valeur', key: 'valeur', width: 85 }];
    criteriaSheet.addRow(['Titre', report.titre_plateforme]);
    criteriaSheet.addRow(['Sous-titre', report.sous_titre]);
    Object.entries(report.criteres).forEach(([key, value]) => {
        if (value && typeof value === 'object') Object.entries(value).forEach(([subKey, subValue]) => criteriaSheet.addRow([`${key} — ${subKey}`, String(subValue)]));
        else criteriaSheet.addRow([key, String(value)]);
    });
    if (report.analyse_avancee) {
        criteriaSheet.addRow([]);
        criteriaSheet.addRow(['Critères du sous-module avancé', '']);
        Object.entries(report.analyse_avancee.filters || {}).forEach(([key, value]) => criteriaSheet.addRow([key, String(value)]));
    }
    criteriaSheet.addRow([]);
    criteriaSheet.addRow(['Analyse intelligente', '']);
    report.analyse_ia.forEach(item => criteriaSheet.addRow(['', item]));
    criteriaSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    criteriaSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    criteriaSheet.views = [{ state: 'frozen', ySplit: 1 }];

    Object.entries(report.graphiques_temporels).forEach(([level, levelData]) => {
        const sheet = workbook.addWorksheet(level);
        sheet.columns = [
            { header: 'Entité', key: 'entite', width: 42 }, { header: 'Total soumissions', key: 'total', width: 20 },
            { header: 'Période', key: 'periode', width: 24 }, { header: 'Clé période', key: 'cle', width: 18 },
            { header: 'Valeur', key: 'valeur', width: 14 }, { header: 'Granularité', key: 'granularite', width: 18 },
            { header: 'Type de données', key: 'mode', width: 24 }
        ];
        levelData.entites.forEach(entity => entity.valeurs.forEach(point => sheet.addRow({
            entite: entity.nom, total: entity.total_soumissions, periode: point.periode, cle: point.periode_cle,
            valeur: point.valeur, granularite: report.criteres.granularite, mode: report.criteres.type_donnees
        })));
        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: level === 'DREN' ? 'FF0D6EFD' : (level === 'CISCO' ? 'FF198754' : 'FF8E44AD') } };
        sheet.autoFilter = { from: 'A1', to: 'G1' };
        sheet.views = [{ state: 'frozen', ySplit: 1 }];
    });

    const advanced = report.analyse_avancee;
    if (advanced && Array.isArray(advanced.filtered_rows) && advanced.filtered_rows.length) {
        const headers = (advanced.headers && advanced.headers.length) ? advanced.headers : Object.keys(advanced.filtered_rows[0]);
        const rawSheet = workbook.addWorksheet('Donnees_filtrees');
        rawSheet.addRow(headers);
        advanced.filtered_rows.forEach(row => rawSheet.addRow(headers.map(header => row[header] === undefined ? '' : row[header])));
        rawSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        rawSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF343A40' } };
        rawSheet.views = [{ state: 'frozen', ySplit: 1 }];
        rawSheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Math.max(1, headers.length) } };
        headers.forEach((header, index) => rawSheet.getColumn(index + 1).width = Math.min(45, Math.max(12, String(header).length + 3)));
    }
    if (advanced && advanced.algorithms) {
        const algoSheet = workbook.addWorksheet('IA_Classements');
        algoSheet.columns = [{ header: 'Algorithme', width: 18 }, { header: 'Niveau', width: 15 }, { header: 'Entité / Libellé', width: 48 }, { header: 'Valeur', width: 18 }, { header: 'Classe / Statut', width: 32 }];
        Object.entries(advanced.algorithms).forEach(([algorithm, levels]) => Object.entries(levels || {}).forEach(([level, rows]) => (rows || []).forEach(row => algoSheet.addRow([algorithm, level, row[0] || '', row[1] || '', row.slice(2).join(' | ')]))));
        algoSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        algoSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6F42C1' } };
        algoSheet.views = [{ state: 'frozen', ySplit: 1 }];
    }

    const descriptors = getTimelineExportDescriptors(scope);
    const rowCursors = {};
    for (const descriptor of descriptors) {
        setTimelineExportStatus(`<span class="spinner-border spinner-border-sm me-2"></span>Insertion des graphiques dans Excel : ${descriptor.title}…`, 'info');
        const dataURL = await renderTimelineDescriptorToDataURL(descriptor, 'png');
        const sheet = workbook.getWorksheet(descriptor.level);
        if (!sheet) continue;
        const startRow = rowCursors[descriptor.level] || sheet.rowCount + 3;
        sheet.getCell(`A${startRow}`).value = descriptor.title;
        sheet.getCell(`A${startRow}`).font = { bold: true, size: 14 };
        const imageId = workbook.addImage({ base64: dataURL, extension: 'png' });
        sheet.addImage(imageId, { tl: { col: 0, row: startRow }, ext: { width: 1100, height: 610 } });
        for (let i = 0; i < 33; i++) sheet.addRow([]);
        rowCursors[descriptor.level] = startRow + 35;
    }
    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}


async function exportTimelineScopeData(scope, format) {
    try {
        const normalized = String(format || 'json').toLowerCase();
        const prefix = `analyse_${String(scope).toLowerCase()}_${timelineTimestamp()}`;
        if (normalized === 'json') {
            downloadFile(new Blob([JSON.stringify(buildTimelineExportData(scope), null, 2)], { type: 'application/json;charset=utf-8' }), `${prefix}.json`);
        } else if (normalized === 'csv') {
            downloadFile(new Blob([buildTimelineCSV(scope)], { type: 'text/csv;charset=utf-8' }), `${prefix}.csv`);
        } else if (normalized === 'html') {
            const html = await buildTimelineHtmlDocument(scope);
            downloadFile(new Blob([html], { type: 'text/html;charset=utf-8' }), `${prefix}.html`);
        } else if (normalized === 'xlsx') {
            const blob = await buildTimelineExcelBlob(scope);
            downloadFile(blob, `${prefix}.xlsx`);
        }
        setTimelineExportStatus(`<i class="fas fa-check-circle me-2"></i>Export ${normalized.toUpperCase()} terminé.`, 'success');
    } catch (error) {
        console.error(error);
        setTimelineExportStatus(`<i class="fas fa-exclamation-triangle me-2"></i>${timelineEscapeHtml(error.message)}`, 'danger');
    }
}

/* Redéfinition des exports généraux de l’onglet Analyse. */
function getAnalysisJSONData() {
    return JSON.stringify(buildTimelineExportData('ALL'), null, 2);
}

function exportAnalysisToJSONFile(pfx) {
    downloadFile(new Blob([getAnalysisJSONData()], { type: 'application/json;charset=utf-8' }), generateFilename(pfx, 'json'));
}

function exportAnalysisToCSV(pfx) {
    downloadFile(new Blob([buildTimelineCSV('ALL')], { type: 'text/csv;charset=utf-8' }), generateFilename(pfx, 'csv'));
}

async function exportAnalysisToExcel(pfx) {
    try {
        setTimelineExportStatus('<span class="spinner-border spinner-border-sm me-2"></span>Création du classeur Excel avec critères, données et graphiques…', 'info');
        const blob = await buildTimelineExcelBlob('ALL');
        downloadFile(blob, generateFilename(pfx, 'xlsx'));
        setTimelineExportStatus('<i class="fas fa-check-circle me-2"></i>Classeur XLSX complet créé.', 'success');
    } catch (error) {
        console.error(error);
        setTimelineExportStatus(`<i class="fas fa-exclamation-triangle me-2"></i>${timelineEscapeHtml(error.message)}`, 'danger');
    }
}

async function exportAnalysisToHTML(pfx) {
    try {
        const html = await buildTimelineHtmlDocument('ALL');
        downloadFile(new Blob([html], { type: 'text/html;charset=utf-8' }), generateFilename(pfx, 'html'));
        setTimelineExportStatus('<i class="fas fa-check-circle me-2"></i>Rapport HTML complet créé.', 'success');
    } catch (error) {
        console.error(error);
        setTimelineExportStatus(`<i class="fas fa-exclamation-triangle me-2"></i>${timelineEscapeHtml(error.message)}`, 'danger');
    }
}

async function exportAdvancedSingleChart(chartKey, format) {
    try {
        const snapshot = typeof window.getAdvancedAnalysisExportSnapshot === 'function' ? window.getAdvancedAnalysisExportSnapshot() : null;
        const descriptor = snapshot && Array.isArray(snapshot.charts) ? snapshot.charts.find(chart => chart.key === chartKey) : null;
        if (!descriptor) throw new Error('Ce graphique avancé n’est pas encore disponible. Ouvrez son sous-onglet puis réessayez.');
        const dataURL = await renderTimelineDescriptorToDataURL({ ...descriptor, kind: 'advanced' }, format || 'png');
        const extension = format === 'jpeg' ? 'jpg' : 'png';
        const filename = `${timelineSafeFilename(descriptor.title)}_${timelineTimestamp()}.${extension}`;
        downloadFile(timelineDataURLToBlob(dataURL), filename);
        setTimelineExportStatus(`<i class="fas fa-check-circle me-2"></i>Graphique exporté : <strong>${timelineEscapeHtml(filename)}</strong>`, 'success');
    } catch (error) {
        console.error(error);
        setTimelineExportStatus(`<i class="fas fa-exclamation-triangle me-2"></i>${timelineEscapeHtml(error.message)}`, 'danger');
    }
}

async function exportAdvancedSingleWord(chartKey) {
    try {
        const snapshot = typeof window.getAdvancedAnalysisExportSnapshot === 'function' ? window.getAdvancedAnalysisExportSnapshot() : null;
        const descriptor = snapshot && Array.isArray(snapshot.charts) ? snapshot.charts.find(chart => chart.key === chartKey) : null;
        if (!descriptor) throw new Error('Ce graphique avancé n’est pas encore disponible.');
        const dataURL = await renderTimelineDescriptorToDataURL({ ...descriptor, kind: 'advanced' }, 'png');
        const criteria = getTimelineCriteriaSnapshot();
        const blob = await timelineCreateDocxBlob([{ descriptor, bytes: timelineDataURLToBytes(dataURL) }], criteria, descriptor.title);
        const filename = `${timelineSafeFilename(descriptor.title)}_${timelineTimestamp()}.docx`;
        downloadFile(blob, filename);
        setTimelineExportStatus(`<i class="fas fa-check-circle me-2"></i>Document Word créé : <strong>${timelineEscapeHtml(filename)}</strong>`, 'success');
    } catch (error) {
        console.error(error);
        setTimelineExportStatus(`<i class="fas fa-exclamation-triangle me-2"></i>${timelineEscapeHtml(error.message)}`, 'danger');
    }
}

async function shareAdvancedSingleChart(chartKey) {
    try {
        const snapshot = typeof window.getAdvancedAnalysisExportSnapshot === 'function' ? window.getAdvancedAnalysisExportSnapshot() : null;
        const descriptor = snapshot && Array.isArray(snapshot.charts) ? snapshot.charts.find(chart => chart.key === chartKey) : null;
        if (!descriptor) throw new Error('Ce graphique avancé n’est pas encore disponible.');
        const dataURL = await renderTimelineDescriptorToDataURL({ ...descriptor, kind: 'advanced' }, 'png');
        const blob = timelineDataURLToBlob(dataURL);
        const filename = `${timelineSafeFilename(descriptor.title)}_${timelineTimestamp()}.png`;
        const file = new File([blob], filename, { type: 'image/png' });
        if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
            await navigator.share({ title: descriptor.title, files: [file] });
        } else {
            downloadFile(blob, filename);
            alert('Le navigateur ne permet pas le partage direct de fichiers. Le graphique a été téléchargé.');
        }
    } catch (error) {
        if (error && error.name === 'AbortError') return;
        console.error(error);
        setTimelineExportStatus(`<i class="fas fa-exclamation-triangle me-2"></i>${timelineEscapeHtml(error.message)}`, 'danger');
    }
}


/* Carte individuelle enrichie : export PNG/JPEG/Word et partage par entité. */
function createIndividualSubmissionTimelineCard(level, entity, total, values, bucketKeys, granularity, displayMode, colorIndex) {
    const col = document.createElement('div');
    col.className = 'col-12 col-xl-6';
    const card = document.createElement('article');
    card.className = 'timeline-individual-chart-card';
    const heading = document.createElement('div');
    heading.className = 'timeline-individual-chart-heading';
    const titleWrap = document.createElement('div');
    const title = document.createElement('h6');
    title.className = 'mb-1';
    title.textContent = entity;
    const subtitle = document.createElement('small');
    subtitle.className = 'text-muted';
    subtitle.textContent = `${SUBMISSION_TIMELINE_LABELS[granularity]} · ${displayMode === 'cumulative' ? 'Données cumulées' : 'Données détaillées'}`;
    titleWrap.append(title, subtitle);

    const actions = document.createElement('div');
    actions.className = 'd-flex align-items-center flex-wrap gap-2 timeline-individual-actions';
    const totalBadge = document.createElement('span');
    totalBadge.className = 'badge bg-primary';
    totalBadge.textContent = `${total} soumission${total > 1 ? 's' : ''}`;
    actions.appendChild(totalBadge);

    const exportGroup = document.createElement('div');
    exportGroup.className = 'btn-group btn-group-sm';
    const exportToggle = document.createElement('button');
    exportToggle.type = 'button';
    exportToggle.className = 'btn btn-outline-success dropdown-toggle';
    exportToggle.dataset.bsToggle = 'dropdown';
    exportToggle.innerHTML = '<i class="fas fa-download"></i> Exporter';
    const exportMenu = document.createElement('ul');
    exportMenu.className = 'dropdown-menu dropdown-menu-end';
    [['PNG', 'png'], ['JPEG', 'jpeg']].forEach(([label, format]) => {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'dropdown-item'; button.textContent = label;
        button.addEventListener('click', () => exportTimelineImages(level, format, entity));
        li.appendChild(button); exportMenu.appendChild(li);
    });
    const wordLi = document.createElement('li');
    const wordButton = document.createElement('button');
    wordButton.type = 'button'; wordButton.className = 'dropdown-item'; wordButton.textContent = 'Word';
    wordButton.addEventListener('click', () => exportTimelineWord(level, entity));
    wordLi.appendChild(wordButton); exportMenu.appendChild(wordLi);
    exportGroup.append(exportToggle, exportMenu);
    actions.appendChild(exportGroup);

    const shareButton = document.createElement('button');
    shareButton.type = 'button';
    shareButton.className = 'btn btn-outline-info btn-sm';
    shareButton.innerHTML = '<i class="fas fa-share-alt"></i>';
    shareButton.title = `Partager le graphique de ${entity}`;
    shareButton.addEventListener('click', () => shareTimelineExport(level, 'png', entity));
    actions.appendChild(shareButton);

    const expandButton = document.createElement('button');
    expandButton.type = 'button';
    expandButton.className = 'btn btn-outline-secondary btn-sm timeline-expand-individual-btn';
    expandButton.innerHTML = '<i class="fas fa-expand-alt"></i>';
    expandButton.title = `Agrandir le graphique de ${entity}`;
    actions.appendChild(expandButton);

    heading.append(titleWrap, actions);
    const scroll = document.createElement('div');
    scroll.className = 'timeline-individual-chart-scroll';
    const stage = document.createElement('div');
    stage.className = 'timeline-individual-chart-stage';
    setSubmissionTimelineStageWidth(stage, bucketKeys.length, granularity);
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `Évolution temporelle des soumissions de ${entity}`);
    stage.appendChild(canvas); scroll.appendChild(stage);
    card.append(heading, scroll); col.appendChild(card);

    const dataset = buildSubmissionTimelineDataset(entity, values, colorIndex, bucketKeys.length);
    dataset.borderWidth = 2.8; dataset.pointRadius = bucketKeys.length > 60 ? 0 : 3.5; dataset.borderDash = [];
    return { col, card, canvas, dataset, expandButton, labels: bucketKeys.map(key => formatSubmissionTimelineLabel(key, granularity)), options: getSubmissionTimelineChartOptions(granularity, displayMode, 1, false), entity };
}

/* Import et export de la base brute KoboToolbox au format JSON. */
function extractKoboRecordsFromPayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    for (const key of ['results', 'data', 'records', 'base_kobo', 'rows']) {
        if (Array.isArray(payload[key])) return payload[key];
    }
    return [];
}

window.importKoboRecords = function(records, sourceLabel) {
    const cleanRecords = (Array.isArray(records) ? records : []).filter(row => row && typeof row === 'object' && !Array.isArray(row));
    if (!cleanRecords.length) throw new Error('La base JSON ne contient aucune ligne exploitable.');
    allData = cleanRecords;
    submissionTimelineSourceData = allData;
    $('#error-box').hide();
    renderTable(allData);
    renderAnalysis(allData);
    $('#sync-status').html(`<span class="badge bg-success sync-badge"><i class="fas fa-file-code"></i> JSON chargé : ${allData.length} ligne(s)</span><span class="badge bg-info text-dark ms-2">${timelineEscapeHtml(sourceLabel || 'Import manuel')}</span>`);
    if (typeof window.refreshAdvancedAnalysisFromMainData === 'function') window.refreshAdvancedAnalysisFromMainData(allData);
    return allData.length;
};

window.exportKoboBaseJSON = function() {
    if (!Array.isArray(allData) || !allData.length) {
        alert('Aucune donnée KoboToolbox n’est disponible à exporter.');
        return;
    }
    const payload = {
        type: 'kobotoolbox_offline_backup',
        version: 1,
        exported_at: new Date().toISOString(),
        exported_at_local: getFormattedDateTime(),
        count: allData.length,
        results: allData
    };
    downloadFile(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }), `base_kobotoolbox_${timelineTimestamp()}.json`);
};

function importKoboJSONFile(file) {
    if (!file) return;
    const reader = new FileReader();
    $('#loading-text').text('Importation et analyse de la base JSON…');
    $('#loading-box').show();
    reader.onload = function(event) {
        try {
            const payload = JSON.parse(String(event.target.result || ''));
            const rows = extractKoboRecordsFromPayload(payload);
            window.importKoboRecords(rows, file.name);
        } catch (error) {
            console.error(error);
            $('#error-box').html(`<strong>Erreur d’importation JSON :</strong> ${timelineEscapeHtml(error.message)}`).show();
        } finally {
            $('#loading-box').hide();
            $('#loading-text').text('Synchronisation et modélisation des données…');
            const input = document.getElementById('json-file');
            if (input) input.value = '';
        }
    };
    reader.onerror = function() {
        $('#loading-box').hide();
        $('#error-box').html('<strong>Erreur :</strong> le fichier JSON n’a pas pu être lu.').show();
    };
    reader.readAsText(file, 'utf-8');
}


$(document).ready(function() {
    fetchData();
    $('#json-file').on('change', function(event) {
        const file = event.target.files && event.target.files[0];
        if (file) importKoboJSONFile(file);
    });
    let typingTimer;
    $('.filter-input').on('keyup', function () { clearTimeout(typingTimer); typingTimer = setTimeout(applyFilters, 300); });
    $('.filter-input').on('change', applyFilters);
    
    setupAnalysisTableSearch('search-dren-table', 'dren-summary-table');
    setupAnalysisTableSearch('search-cisco-table', 'cisco-summary-table');
    setupAnalysisTableSearch('search-zap-table', 'zap-summary-table');

    $('#timeline-refresh-btn').on('click', function() { renderSubmissionTimelineCharts(); });
    $('#timeline-reset-btn').on('click', resetSubmissionTimelineControls);
    $('#timeline-granularity, #timeline-display-mode, #timeline-top-entities, #timeline-date-start, #timeline-date-end').on('change', function() {
        ['DREN', 'CISCO', 'ZAP'].forEach(level => { submissionTimelineIndividualState[level].page = 1; });
        renderSubmissionTimelineCharts();
    });
    $('.timeline-layout-radio').on('change', function() {
        ['DREN', 'CISCO', 'ZAP'].forEach(level => { submissionTimelineIndividualState[level].page = 1; });
        renderSubmissionTimelineCharts();
    });

    $('#timeline-zoom-in-btn').on('click', function() {
        const current = $('#timeline-granularity').val() || 'day';
        const index = SUBMISSION_TIMELINE_GRANULARITIES.indexOf(current);
        if (index > 0) {
            $('#timeline-granularity').val(SUBMISSION_TIMELINE_GRANULARITIES[index - 1]);
            renderSubmissionTimelineCharts();
        }
    });
    $('#timeline-zoom-out-btn').on('click', function() {
        const current = $('#timeline-granularity').val() || 'day';
        const index = SUBMISSION_TIMELINE_GRANULARITIES.indexOf(current);
        if (index >= 0 && index < SUBMISSION_TIMELINE_GRANULARITIES.length - 1) {
            $('#timeline-granularity').val(SUBMISSION_TIMELINE_GRANULARITIES[index + 1]);
            renderSubmissionTimelineCharts();
        }
    });

    let timelineSearchTimer;
    $('.timeline-individual-search-input').on('input', function() {
        const level = $(this).data('level');
        if (!level || !submissionTimelineIndividualState[level]) return;
        submissionTimelineIndividualState[level].page = 1;
        clearTimeout(timelineSearchTimer);
        timelineSearchTimer = setTimeout(function() { renderSubmissionTimelineCharts(); }, 220);
    });
    $('.timeline-page-size-select').on('change', function() {
        const level = $(this).data('level');
        if (level && submissionTimelineIndividualState[level]) submissionTimelineIndividualState[level].page = 1;
        renderSubmissionTimelineCharts();
    });
    $('.timeline-page-prev').on('click', function() {
        const level = $(this).data('level');
        if (level && submissionTimelineIndividualState[level]) {
            submissionTimelineIndividualState[level].page = Math.max(1, submissionTimelineIndividualState[level].page - 1);
            renderSubmissionTimelineCharts();
        }
    });
    $('.timeline-page-next').on('click', function() {
        const level = $(this).data('level');
        if (level && submissionTimelineIndividualState[level]) {
            submissionTimelineIndividualState[level].page += 1;
            renderSubmissionTimelineCharts();
        }
    });

    $('.timeline-expand-level-btn').on('click', function() {
        const level = $(this).data('level');
        const card = document.getElementById(`timeline-card-${String(level).toLowerCase()}`);
        if (!card) return;
        const expanded = card.classList.toggle('is-expanded');
        document.body.classList.toggle('timeline-chart-expanded', expanded);
        $(this).html(expanded ? '<i class="fas fa-compress-alt"></i> Réduire' : '<i class="fas fa-expand-alt"></i> Agrandir');
        setTimeout(function() {
            if (submissionTimelineChartsRefs[level]) submissionTimelineChartsRefs[level].resize();
            (submissionTimelineIndividualChartsRefs[level] || []).forEach(chart => chart.resize());
        }, 60);
    });

    $(document).on('keydown', function(event) {
        if (event.key !== 'Escape') return;
        const expanded = document.querySelector('.timeline-chart-card.is-expanded, .timeline-individual-chart-card.is-expanded');
        if (!expanded) return;
        expanded.classList.remove('is-expanded');
        document.body.classList.remove('timeline-chart-expanded');
        $('.timeline-expand-level-btn').html('<i class="fas fa-expand-alt"></i> Agrandir');
        setTimeout(function() {
            Object.values(submissionTimelineChartsRefs).forEach(chart => { if (chart) chart.resize(); });
            Object.values(submissionTimelineIndividualChartsRefs).flat().forEach(chart => { if (chart) chart.resize(); });
        }, 60);
    });

    const analyseTab = document.getElementById('analyse-tab');
    if (analyseTab) {
        analyseTab.addEventListener('shown.bs.tab', function() {
            setTimeout(function() {
                Object.values(submissionTimelineChartsRefs).forEach(chart => { if (chart) chart.resize(); });
                Object.values(submissionTimelineIndividualChartsRefs).flat().forEach(chart => { if (chart) chart.resize(); });
            }, 50);
        });
    }
    
    if (window.filterSoumissionsTables) {
        $('#search-soumissions-table').on('keyup', window.filterSoumissionsTables);
        $('.filter-soumissions-radio').on('change', window.filterSoumissionsTables);
    }
});
