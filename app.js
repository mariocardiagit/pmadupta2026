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
var submissionTimelinePageState = { DREN: 1, CISCO: 1, ZAP: 1 };
var submissionTimelineSourceData = [];

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
            throw new Error("La sécurité de Firefox (ou AdBlock) bloque toutes les connexions. Veuillez importer votre fichier Excel manuellement via le bouton en haut.");
        }
        
        allData = (await response.json()).results || [];
        allData = allData.filter(row => row !== null && typeof row === 'object');
        
        renderTable(allData);
        renderAnalysis(allData);
        
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


function getSubmissionTimelineBucket(date, granularity) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return '';
    let d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    if (granularity === 'year') d = new Date(Date.UTC(y, 0, 1));
    else if (granularity === 'semester') d = new Date(Date.UTC(y, m < 6 ? 0 : 6, 1));
    else if (granularity === 'quarter') d = new Date(Date.UTC(y, Math.floor(m / 3) * 3, 1));
    else if (granularity === 'month') d = new Date(Date.UTC(y, m, 1));
    else if (granularity === 'week') {
        const day = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() - day + 1);
    }
    return formatISODateUTC(d);
}

function formatSubmissionTimelineLabel(bucketKey, granularity) {
    const date = parseSubmissionDate(bucketKey);
    if (!date) return bucketKey;
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    if (granularity === 'year') return `${year}`;
    if (granularity === 'semester') return `${month < 6 ? 'S1' : 'S2'} ${year}`;
    if (granularity === 'quarter') return `T${Math.floor(month / 3) + 1} ${year}`;
    if (granularity === 'month') return date.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    const formatted = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
    return granularity === 'week' ? `Sem. ${formatted}` : formatted;
}

function getSubmissionEntityValue(row, level) {
    const col = baseColsInfo.find(c => c.key === String(level || '').toLowerCase());
    if (!col) return '';
    return cleanSpaces(getKoboValue(row, col.matches, col.ex, col.mustMatch));
}

function timelineEscapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function getSubmissionTimelineColor(index, alpha) {
    const hue = Math.round((index * 137.508) % 360);
    return `hsla(${hue}, 68%, 43%, ${alpha})`;
}

function getTimelineGranularityLabel(value) {
    return ({ day: 'Jour', week: 'Semaine', month: 'Mois', quarter: 'Trimestre', semester: 'Semestre', year: 'Année' })[value] || 'Jour';
}

function getTimelineChartTypeLabel(value) {
    return ({
        line: 'Courbes', area: 'Aires', bar: 'Diagrammes en barres', stackedBar: 'Barres empilées',
        horizontalBar: 'Barres horizontales (totaux)', pie: 'Diagrammes circulaires',
        doughnut: 'Diagrammes en anneau', histogram: 'Histogramme des volumes', radar: 'Diagramme radar'
    })[value] || 'Courbes';
}

function selectedTimelineLayout() {
    return document.querySelector('input[name="timeline-layout-mode"]:checked')?.value || 'grouped';
}

function selectedTimelineChartType() {
    return document.getElementById('timeline-chart-type')?.value || 'line';
}

function timelinePointStyle(index) {
    return ['circle', 'rectRounded', 'triangle', 'rectRot', 'crossRot', 'star'][index % 6];
}

function timelineDash(index) {
    return [[], [9, 4], [3, 4], [12, 4, 3, 4], [1, 3], [7, 2, 2, 2]][index % 6];
}

function advanceTimelineBucket(date, granularity) {
    const d = new Date(date.getTime());
    if (granularity === 'year') d.setUTCFullYear(d.getUTCFullYear() + 1, 0, 1);
    else if (granularity === 'semester') d.setUTCMonth(d.getUTCMonth() + 6, 1);
    else if (granularity === 'quarter') d.setUTCMonth(d.getUTCMonth() + 3, 1);
    else if (granularity === 'month') d.setUTCMonth(d.getUTCMonth() + 1, 1);
    else if (granularity === 'week') d.setUTCDate(d.getUTCDate() + 7);
    else d.setUTCDate(d.getUTCDate() + 1);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function buildTimelineBucketKeys(datedRows, granularity, startDate, endDate) {
    if (!datedRows.length && !startDate && !endDate) return [];
    const sorted = datedRows.map(item => item.date).sort((a, b) => a - b);
    const min = startDate || sorted[0];
    const max = endDate || sorted[sorted.length - 1];
    if (!min || !max) return [];
    let cursor = parseSubmissionDate(getSubmissionTimelineBucket(min, granularity));
    const last = parseSubmissionDate(getSubmissionTimelineBucket(max, granularity));
    const keys = [];
    while (cursor && last && cursor <= last && keys.length < 5000) {
        keys.push(formatISODateUTC(cursor));
        cursor = advanceTimelineBucket(cursor, granularity);
    }
    return keys;
}

function cumulativeTimelineValues(values) {
    let sum = 0;
    return values.map(value => (sum += Number(value) || 0));
}

function buildTimelineLevelData(level, datedRows, bucketKeys) {
    const totals = {};
    const byEntity = {};
    datedRows.forEach(item => {
        const entity = getSubmissionEntityValue(item.row, level);
        if (!entity || entity.toLowerCase() === 'non renseigné') return;
        const bucket = getSubmissionTimelineBucket(item.date, document.getElementById('timeline-granularity')?.value || 'day');
        totals[entity] = (totals[entity] || 0) + 1;
        if (!byEntity[entity]) byEntity[entity] = {};
        byEntity[entity][bucket] = (byEntity[entity][bucket] || 0) + 1;
    });
    const ranked = Object.entries(totals).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr', { sensitivity: 'base', numeric: true }));
    return { totals, byEntity, ranked, bucketKeys };
}

function buildTimelineHistogram(values) {
    const nums = values.map(Number).filter(Number.isFinite);
    if (!nums.length) return { labels: [], counts: [] };
    const min = Math.min(...nums), max = Math.max(...nums);
    if (min === max) return { labels: [`${min} soumission${min > 1 ? 's' : ''}`], counts: [nums.length] };
    const binCount = Math.min(10, Math.max(3, Math.ceil(Math.sqrt(nums.length))));
    const width = Math.max(1, Math.ceil((max - min + 1) / binCount));
    const bins = [];
    for (let start = min; start <= max; start += width) bins.push({ start, end: Math.min(max, start + width - 1), count: 0 });
    nums.forEach(value => {
        const idx = Math.min(bins.length - 1, Math.floor((value - min) / width));
        bins[idx].count++;
    });
    return {
        labels: bins.map(bin => bin.start === bin.end ? `${bin.start}` : `${bin.start}–${bin.end}`),
        counts: bins.map(bin => bin.count)
    };
}

function setTimelineStageDimensions(level, bucketCount, entityCount, chartType) {
    const stage = document.getElementById(`timeline-stage-${level.toLowerCase()}`);
    if (!stage) return;
    const temporal = !['pie', 'doughnut', 'horizontalBar', 'histogram'].includes(chartType);
    stage.style.minWidth = `${temporal ? Math.max(900, 240 + bucketCount * 72) : 900}px`;
    const labelHeight = (chartType === 'line' || chartType === 'area') ? entityCount * 24 + 100 : 390;
    stage.style.height = `${Math.max(390, Math.min(1600, labelHeight))}px`;
}

const timelineEndLabelsPlugin = {
    id: 'timelineEndLabelsPlugin',
    afterDatasetsDraw(chart, args, options) {
        if (!options?.enabled || chart.config.type !== 'line') return;
        const ctx = chart.ctx, area = chart.chartArea;
        if (!area) return;
        const items = [];
        chart.data.datasets.forEach((dataset, index) => {
            if (!chart.isDatasetVisible(index)) return;
            const meta = chart.getDatasetMeta(index);
            let point = null;
            for (let i = meta.data.length - 1; i >= 0; i--) {
                if (dataset.data[i] == null || !Number.isFinite(Number(dataset.data[i]))) continue;
                point = meta.data[i];
                if (Number(dataset.data[i]) !== 0) break;
            }
            if (!point) return;
            items.push({ label: String(dataset.label || ''), color: dataset.borderColor, x: point.x, sourceY: point.y, y: point.y });
        });
        if (!items.length) return;
        items.sort((a, b) => a.y - b.y);
        const gap = 20;
        const top = area.top + 12, bottom = area.bottom - 12;
        items[0].y = Math.max(top, items[0].y);
        for (let i = 1; i < items.length; i++) items[i].y = Math.max(items[i].y, items[i - 1].y + gap);
        if (items[items.length - 1].y > bottom) {
            items[items.length - 1].y = bottom;
            for (let i = items.length - 2; i >= 0; i--) items[i].y = Math.min(items[i].y, items[i + 1].y - gap);
        }
        if (items[0].y < top) {
            const shift = top - items[0].y;
            items.forEach(item => item.y += shift);
        }
        ctx.save();
        ctx.font = '600 11px Segoe UI, Arial, sans-serif';
        ctx.textBaseline = 'middle';
        items.forEach(item => {
            const textWidth = ctx.measureText(item.label).width;
            const boxX = area.right + 20;
            const boxY = item.y - 9;
            const boxWidth = Math.min(textWidth + 38, chart.width - boxX - 6);
            ctx.strokeStyle = item.color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(item.x + 2, item.sourceY);
            ctx.lineTo(area.right + 7, item.sourceY);
            ctx.lineTo(area.right + 14, item.y);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,.94)';
            ctx.strokeStyle = item.color;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(boxX, boxY, boxWidth, 18, 5);
            else ctx.rect(boxX, boxY, boxWidth, 18);
            ctx.fill(); ctx.stroke();
            ctx.strokeStyle = item.color;
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(boxX + 5, item.y); ctx.lineTo(boxX + 22, item.y); ctx.stroke();
            ctx.fillStyle = item.color;
            ctx.fillText(item.label, boxX + 27, item.y, Math.max(20, boxWidth - 31));
        });
        ctx.restore();
    }
};
if (typeof Chart !== 'undefined' && Chart.registry && !Chart.registry.plugins.get('timelineEndLabelsPlugin')) Chart.register(timelineEndLabelsPlugin);

function renderTimelineLegend(level, chart, labels, colors, totals, dashes) {
    const box = document.getElementById(`timeline-legend-${level.toLowerCase()}`);
    if (!box) return;
    box.innerHTML = '<div class="timeline-legend-title">Légende visuelle</div>';
    if (!labels.length) {
        box.insertAdjacentHTML('beforeend', '<div class="text-muted small">Aucune donnée.</div>');
        return;
    }
    const pieLike = chart.config.type === 'pie' || chart.config.type === 'doughnut';
    labels.forEach((label, i) => {
        const visible = pieLike ? chart.getDataVisibility(i) : (chart.data.datasets.length === labels.length ? chart.isDatasetVisible(i) : true);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `timeline-legend-item${visible ? '' : ' is-muted'}`;
        const dash = dashes?.[i]?.length ? (dashes[i].length <= 2 ? 'dashed' : 'dotted') : 'solid';
        button.innerHTML = `<span class="timeline-legend-swatch" style="background:transparent;border:0;border-top:3px ${dash} ${colors[i]};border-radius:0"></span><span class="timeline-legend-label">${timelineEscapeHtml(label)}</span><span class="timeline-legend-value">${Number(totals[i] || 0).toLocaleString('fr-FR')}</span>`;
        if (pieLike || chart.data.datasets.length === labels.length) {
            button.addEventListener('click', () => {
                if (pieLike) chart.toggleDataVisibility(i); else chart.setDatasetVisibility(i, !chart.isDatasetVisible(i));
                chart.update();
                renderTimelineLegend(level, chart, labels, colors, totals, dashes);
            });
        } else button.disabled = true;
        box.appendChild(button);
    });
}

function groupedTimelineConfig(level, levelData, bucketKeys, granularity, displayMode, chartType, topLimit) {
    let ranked = levelData.ranked;
    if (topLimit !== 'all') ranked = ranked.slice(0, Number(topLimit));
    const labels = bucketKeys.map(key => formatSubmissionTimelineLabel(key, granularity));
    const entityLabels = ranked.map(item => item[0]);
    const totals = ranked.map(item => item[1]);
    const colors = ranked.map((_, i) => getSubmissionTimelineColor(i, 1));
    const dashes = ranked.map((_, i) => timelineDash(i));
    const datasets = ranked.map(([entity], i) => {
        const raw = bucketKeys.map(bucket => levelData.byEntity[entity]?.[bucket] || 0);
        const values = displayMode === 'cumulative' ? cumulativeTimelineValues(raw) : raw;
        return {
            label: entity, data: values, borderColor: colors[i], backgroundColor: getSubmissionTimelineColor(i, chartType === 'area' ? .18 : .28),
            pointBackgroundColor: colors[i], pointBorderColor: '#fff', pointBorderWidth: 1,
            pointRadius: bucketKeys.length > 45 ? 0 : 2.7, pointHoverRadius: 5,
            pointStyle: timelinePointStyle(i), borderDash: dashes[i], borderWidth: 2,
            tension: .22, fill: chartType === 'area', spanGaps: true
        };
    });
    let type = 'line', data = { labels, datasets }, indexAxis = 'x', stacked = false, scales = null;
    if (chartType === 'bar' || chartType === 'stackedBar') { type = 'bar'; stacked = chartType === 'stackedBar'; }
    else if (chartType === 'horizontalBar') {
        type = 'bar'; indexAxis = 'y';
        data = { labels: entityLabels, datasets: [{ label: 'Total des soumissions', data: totals, backgroundColor: ranked.map((_, i) => getSubmissionTimelineColor(i, .78)), borderColor: colors, borderWidth: 1.5, borderRadius: 6 }] };
    } else if (chartType === 'pie' || chartType === 'doughnut') {
        type = chartType;
        data = { labels: entityLabels, datasets: [{ label: 'Total des soumissions', data: totals, backgroundColor: ranked.map((_, i) => getSubmissionTimelineColor(i, .82)), borderColor: '#fff', borderWidth: 2, hoverOffset: 8 }] };
    } else if (chartType === 'histogram') {
        type = 'bar';
        const histogram = buildTimelineHistogram(totals);
        data = { labels: histogram.labels, datasets: [{ label: `Nombre de ${level}`, data: histogram.counts, backgroundColor: 'rgba(41,128,185,.72)', borderColor: 'rgba(31,97,141,1)', borderWidth: 1.5, borderRadius: 5 }] };
    } else if (chartType === 'radar') {
        type = 'radar';
        const radarLabels = labels.length > 18 ? labels.slice(-18) : labels;
        const offset = labels.length - radarLabels.length;
        data = { labels: radarLabels, datasets: datasets.map(ds => ({ ...ds, data: ds.data.slice(offset), backgroundColor: ds.backgroundColor.replace(/0\.28|0\.18/, '0.08'), borderWidth: 2, pointRadius: 2 })) };
    }
    if (!['pie', 'doughnut', 'radar'].includes(type)) {
        scales = {
            x: { stacked, beginAtZero: chartType === 'horizontalBar', title: { display: true, text: chartType === 'horizontalBar' ? 'Nombre de soumissions' : (chartType === 'histogram' ? 'Classe de volume (soumissions par entité)' : getTimelineGranularityLabel(granularity)), font: { weight: 'bold' } }, ticks: { autoSkip: chartType !== 'horizontalBar', maxTicksLimit: 16, maxRotation: chartType === 'bar' || chartType === 'stackedBar' ? 30 : 0 } },
            y: { stacked, beginAtZero: true, title: { display: true, text: chartType === 'horizontalBar' ? `Entités ${level}` : (chartType === 'histogram' ? `Nombre de ${level}` : 'Nombre de soumissions'), font: { weight: 'bold' } }, ticks: { precision: 0 } }
        };
    }
    return { type, data, indexAxis, scales, entityLabels, totals, colors, dashes, ranked };
}

function renderOneSubmissionTimelineChart(level, datedRows, bucketKeys, granularity, topLimit, displayMode, chartType) {
    const canvas = document.getElementById(`submissionTimelineChart${level}`);
    const empty = document.getElementById(`timeline-empty-${level.toLowerCase()}`);
    if (!canvas || !empty) return;
    if (submissionTimelineChartsRefs[level]) submissionTimelineChartsRefs[level].destroy();
    const levelData = buildTimelineLevelData(level, datedRows, bucketKeys);
    if (!levelData.ranked.length) {
        canvas.style.display = 'none'; empty.style.display = 'flex';
        document.getElementById(`timeline-legend-${level.toLowerCase()}`).innerHTML = '<div class="text-muted small">Aucune entité à afficher.</div>';
        return;
    }
    canvas.style.display = 'block'; empty.style.display = 'none';
    const config = groupedTimelineConfig(level, levelData, bucketKeys, granularity, displayMode, chartType, topLimit);
    setTimelineStageDimensions(level, bucketKeys.length, config.ranked.length, chartType);
    const rightPadding = (chartType === 'line' || chartType === 'area') ? 230 : 18;
    const chart = new Chart(canvas.getContext('2d'), {
        type: config.type, data: config.data,
        options: {
            responsive: true, maintainAspectRatio: false, normalized: true, indexAxis: config.indexAxis,
            layout: { padding: { right: rightPadding, top: 12, bottom: 8, left: 4 } },
            interaction: { mode: ['line', 'bar'].includes(config.type) ? 'index' : 'nearest', intersect: false },
            plugins: {
                legend: { display: false },
                timelineEndLabelsPlugin: { enabled: chartType === 'line' || chartType === 'area' },
                tooltip: { callbacks: {
                    title: items => items?.length ? `${chartType === 'pie' || chartType === 'doughnut' || chartType === 'horizontalBar' ? 'Entité' : getTimelineGranularityLabel(granularity)} : ${items[0].label}` : '',
                    label: context => {
                        let value = context.parsed?.y;
                        if (chartType === 'horizontalBar') value = context.parsed?.x;
                        if (chartType === 'pie' || chartType === 'doughnut') value = context.parsed;
                        if (chartType === 'histogram') return `${context.dataset.label} : ${value}`;
                        return `${context.dataset.label || context.label} : ${value} soumission${Number(value) > 1 ? 's' : ''}`;
                    }
                }}
            },
            scales: config.scales || undefined
        }
    });
    submissionTimelineChartsRefs[level] = chart;
    const legendLabels = chartType === 'histogram' ? config.data.labels : config.entityLabels;
    const legendColors = chartType === 'histogram' ? config.data.labels.map(() => 'rgba(41,128,185,1)') : config.colors;
    const legendTotals = chartType === 'histogram' ? config.data.datasets[0].data : config.totals;
    renderTimelineLegend(level, chart, legendLabels, legendColors, legendTotals, config.dashes);
}

function destroyIndividualTimelineCharts(level) {
    (submissionTimelineIndividualChartsRefs[level] || []).forEach(chart => { try { chart.destroy(); } catch (_) {} });
    submissionTimelineIndividualChartsRefs[level] = [];
}

function individualTimelineConfig(entity, series, labels, chartType, color, granularity) {
    let type = 'line', data = { labels, datasets: [{ label: entity, data: series, borderColor: color, backgroundColor: color.replace(', 1)', ', .18)'), borderWidth: 2, pointRadius: labels.length > 45 ? 0 : 2.5, tension: .22, fill: chartType === 'area' }] }, indexAxis = 'x', scales;
    if (chartType === 'bar' || chartType === 'stackedBar') type = 'bar';
    else if (chartType === 'horizontalBar') { type = 'bar'; indexAxis = 'y'; }
    else if (chartType === 'pie' || chartType === 'doughnut') {
        type = chartType;
        const filtered = labels.map((label, i) => ({ label, value: series[i] })).filter(item => item.value > 0);
        data = { labels: filtered.map(item => item.label), datasets: [{ label: entity, data: filtered.map(item => item.value), backgroundColor: filtered.map((_, i) => getSubmissionTimelineColor(i, .8)), borderColor: '#fff', borderWidth: 2 }] };
    } else if (chartType === 'histogram') {
        type = 'bar'; const h = buildTimelineHistogram(series); data = { labels: h.labels, datasets: [{ label: 'Nombre de périodes', data: h.counts, backgroundColor: color.replace(', 1)', ', .72)'), borderColor: color, borderWidth: 1.5 }] };
    } else if (chartType === 'radar') {
        type = 'radar'; const useLabels = labels.length > 18 ? labels.slice(-18) : labels; const offset = labels.length - useLabels.length; data = { labels: useLabels, datasets: [{ label: entity, data: series.slice(offset), borderColor: color, backgroundColor: color.replace(', 1)', ', .10)'), pointBackgroundColor: color, borderWidth: 2 }] };
    }
    if (!['pie', 'doughnut', 'radar'].includes(type)) scales = {
        x: { beginAtZero: indexAxis === 'y', title: { display: true, text: indexAxis === 'y' ? 'Nombre de soumissions' : (chartType === 'histogram' ? 'Classe de volume' : getTimelineGranularityLabel(granularity)) } },
        y: { beginAtZero: true, title: { display: true, text: indexAxis === 'y' ? 'Périodes' : (chartType === 'histogram' ? 'Nombre de périodes' : 'Soumissions') }, ticks: { precision: 0 } }
    };
    return { type, data, indexAxis, scales };
}

function renderIndividualTimelineLevel(level, levelData, bucketKeys, granularity, displayMode, chartType) {
    destroyIndividualTimelineCharts(level);
    const low = level.toLowerCase();
    const grid = document.getElementById(`timeline-individual-grid-${low}`);
    const empty = document.getElementById(`timeline-empty-individual-${low}`);
    if (!grid || !empty) return;
    const search = (document.getElementById(`timeline-search-${low}`)?.value || '').trim().toLowerCase();
    const pageSize = Number(document.getElementById(`timeline-page-size-${low}`)?.value || 6);
    const entities = levelData.ranked.filter(([name]) => name.toLowerCase().includes(search));
    const totalPages = Math.max(1, Math.ceil(entities.length / pageSize));
    submissionTimelinePageState[level] = Math.min(Math.max(1, submissionTimelinePageState[level] || 1), totalPages);
    const page = submissionTimelinePageState[level];
    const pageItems = entities.slice((page - 1) * pageSize, page * pageSize);
    const info = document.getElementById(`timeline-page-info-${low}`);
    if (info) info.textContent = entities.length ? `Page ${page} / ${totalPages} · ${entities.length} entité(s)` : 'Page 0 / 0';
    const prev = document.querySelector(`.timeline-page-prev[data-level="${level}"]`), next = document.querySelector(`.timeline-page-next[data-level="${level}"]`);
    if (prev) prev.disabled = page <= 1; if (next) next.disabled = page >= totalPages;
    grid.innerHTML = '';
    if (!pageItems.length) { empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    const labels = bucketKeys.map(key => formatSubmissionTimelineLabel(key, granularity));
    pageItems.forEach(([entity, total], idx) => {
        const canvasId = `timeline-individual-${low}-${page}-${idx}`;
        grid.insertAdjacentHTML('beforeend', `<div class="col-xl-6"><article class="timeline-individual-card"><div class="timeline-individual-card-heading"><strong>${timelineEscapeHtml(entity)}</strong><span class="badge bg-primary">${total.toLocaleString('fr-FR')} soum.</span></div><div class="timeline-individual-canvas-wrap"><canvas id="${canvasId}" role="img" aria-label="Graphique individuel de ${timelineEscapeHtml(entity)}"></canvas></div></article></div>`);
        const raw = bucketKeys.map(bucket => levelData.byEntity[entity]?.[bucket] || 0);
        const series = displayMode === 'cumulative' ? cumulativeTimelineValues(raw) : raw;
        const color = getSubmissionTimelineColor((page - 1) * pageSize + idx, 1);
        const cfg = individualTimelineConfig(entity, series, labels, chartType, color, granularity);
        const chart = new Chart(document.getElementById(canvasId).getContext('2d'), { type: cfg.type, data: cfg.data, options: { responsive: true, maintainAspectRatio: false, indexAxis: cfg.indexAxis, layout: { padding: { right: chartType === 'line' || chartType === 'area' ? 150 : 8 } }, plugins: { legend: { display: chartType === 'pie' || chartType === 'doughnut' || chartType === 'radar', position: 'bottom' }, timelineEndLabelsPlugin: { enabled: chartType === 'line' || chartType === 'area' }, tooltip: { mode: 'index', intersect: false } }, scales: cfg.scales || undefined } });
        submissionTimelineIndividualChartsRefs[level].push(chart);
    });
}

function updateTimelineUI(granularity, displayMode, chartType, layout) {
    const period = getTimelineGranularityLabel(granularity), typeLabel = getTimelineChartTypeLabel(chartType);
    const modeLabel = displayMode === 'cumulative' ? 'Données cumulées' : 'Données détaillées';
    const layoutLabel = layout === 'individual' ? 'Affichage individuel' : 'Affichage groupé';
    const byId = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    byId('timeline-selected-period', period); byId('timeline-selected-mode', modeLabel); byId('timeline-selected-layout', layoutLabel); byId('timeline-selected-chart-type', typeLabel);
    let explanation = `Les données sont regroupées par ${period.toLowerCase()} et affichées sous forme de ${typeLabel.toLowerCase()}.`;
    if (displayMode === 'cumulative') explanation += ' Chaque valeur additionne les périodes précédentes.';
    if (['pie', 'doughnut', 'horizontalBar', 'histogram'].includes(chartType)) explanation += ' Ce type synthétise les totaux ou leur distribution sur la période filtrée.';
    byId('timeline-selection-explanation', explanation);
    ['dren', 'cisco', 'zap'].forEach(low => {
        byId(`timeline-period-badge-${low}`, `${period} · ${displayMode === 'cumulative' ? 'Cumulé' : 'Détaillé'} · ${layout === 'individual' ? 'Individuel' : 'Groupé'} · ${typeLabel}`);
        const desc = document.getElementById(`timeline-description-${low}`);
        if (desc) desc.textContent = layout === 'individual' ? `Chaque ${low.toUpperCase()} est affichée séparément en ${typeLabel.toLowerCase()}.` : `Les ${low.toUpperCase()} sélectionnées sont comparées ensemble en ${typeLabel.toLowerCase()}.`;
        const grouped = document.getElementById(`timeline-grouped-view-${low}`), individual = document.getElementById(`timeline-individual-view-${low}`);
        if (grouped) grouped.style.display = layout === 'grouped' ? '' : 'none';
        if (individual) individual.style.display = layout === 'individual' ? '' : 'none';
    });
}

function renderSubmissionTimelineCharts(data) {
    if (Array.isArray(data)) submissionTimelineSourceData = data;
    if (!document.getElementById('submissionTimelineChartDREN')) return;
    const source = Array.isArray(submissionTimelineSourceData) ? submissionTimelineSourceData : [];
    const granularity = document.getElementById('timeline-granularity')?.value || 'day';
    const displayMode = document.getElementById('timeline-display-mode')?.value || 'detailed';
    const chartType = selectedTimelineChartType();
    const layout = selectedTimelineLayout();
    const topLimit = document.getElementById('timeline-top-entities')?.value || '10';
    const startDate = parseSubmissionDate(document.getElementById('timeline-date-start')?.value || '');
    const endDate = parseSubmissionDate(document.getElementById('timeline-date-end')?.value || '');
    const datedRows = source.map(row => ({ row, date: parseSubmissionDate(row['_submission_time']) })).filter(item => item.date).filter(item => (!startDate || item.date >= startDate) && (!endDate || item.date <= endDate));
    const allDates = source.map(row => parseSubmissionDate(row['_submission_time'])).filter(Boolean).sort((a, b) => a - b);
    if (allDates.length) {
        const min = formatISODateUTC(allDates[0]), max = formatISODateUTC(allDates[allDates.length - 1]);
        ['timeline-date-start', 'timeline-date-end'].forEach(id => { const el = document.getElementById(id); if (el) { el.min = min; el.max = max; } });
    }
    const bucketKeys = buildTimelineBucketKeys(datedRows, granularity, startDate, endDate);
    const levels = {};
    ['DREN', 'CISCO', 'ZAP'].forEach(level => { levels[level] = buildTimelineLevelData(level, datedRows, bucketKeys); });
    const unique = new Set(); Object.entries(levels).forEach(([level, data]) => data.ranked.forEach(([name]) => unique.add(`${level}|${name}`)));
    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    setText('timeline-dated-count', datedRows.length.toLocaleString('fr-FR')); setText('timeline-entities-count', unique.size.toLocaleString('fr-FR'));
    if (datedRows.length) {
        const sorted = datedRows.map(item => item.date).sort((a, b) => a - b);
        const f = d => d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
        setText('timeline-period-label', f(sorted[0]) === f(sorted[sorted.length - 1]) ? f(sorted[0]) : `${f(sorted[0])} – ${f(sorted[sorted.length - 1])}`);
    } else setText('timeline-period-label', 'Aucune date');
    updateTimelineUI(granularity, displayMode, chartType, layout);
    ['DREN', 'CISCO', 'ZAP'].forEach(level => {
        if (layout === 'grouped') renderOneSubmissionTimelineChart(level, datedRows, bucketKeys, granularity, topLimit, displayMode, chartType);
        else renderIndividualTimelineLevel(level, levels[level], bucketKeys, granularity, displayMode, chartType);
    });
}

function resetSubmissionTimelineControls() {
    $('#timeline-granularity').val('day'); $('#timeline-display-mode').val('detailed'); $('#timeline-chart-type').val('line'); $('#timeline-top-entities').val('10');
    $('#timeline-date-start, #timeline-date-end').val(''); $('#timeline-layout-grouped').prop('checked', true);
    submissionTimelinePageState = { DREN: 1, CISCO: 1, ZAP: 1 };
    renderSubmissionTimelineCharts();
}

/* ========================================================================== */
/* EXPORTS ROBUSTES DE L'ONGLET 2 : IMAGES, ZIP, DOCX, PDF, HTML, XLSX, JSON */
/* ========================================================================== */
function pmaExportSafeName(value) {
    return String(value == null ? 'graphique' : value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 110) || 'graphique';
}
function pmaExportTimestamp() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`;
}
function pmaExportStatus(message, type) {
    const box = document.getElementById('timeline-export-status');
    if (!box) return;
    box.className = `alert alert-${type || 'info'} py-2 px-3 timeline-export-status`;
    box.innerHTML = message;
    box.classList.remove('d-none');
    if (type === 'success') setTimeout(() => box.classList.add('d-none'), 7000);
}
function pmaExportDownload(blob, filename) {
    if (!(blob instanceof Blob)) throw new Error('Le fichier généré est invalide.');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename; link.style.display = 'none';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function pmaExportLevels(scope) {
    const normalized = String(scope || 'ALL').toUpperCase();
    return normalized === 'ALL' ? ['DREN','CISCO','ZAP'] : ['DREN','CISCO','ZAP'].includes(normalized) ? [normalized] : [];
}
function pmaExportCriteria(scope) {
    const result = {
        'Date de génération': typeof getFormattedDateTime === 'function' ? getFormattedDateTime() : new Date().toLocaleString('fr-FR'),
        'Périmètre': String(scope || 'ALL').toUpperCase() === 'ALL' ? 'DREN, CISCO et ZAP' : String(scope).toUpperCase(),
        'Période d’agrégation': document.getElementById('timeline-granularity')?.selectedOptions?.[0]?.text || 'Jour',
        'Type de données': document.getElementById('timeline-display-mode')?.selectedOptions?.[0]?.text || 'Données détaillées',
        'Type de graphique': document.getElementById('timeline-chart-type')?.selectedOptions?.[0]?.text || 'Courbes',
        'Organisation': selectedTimelineLayout() === 'individual' ? 'Affichage individuel' : 'Affichage groupé',
        'Entités du graphique groupé': document.getElementById('timeline-top-entities')?.selectedOptions?.[0]?.text || 'Top 10',
        'Date de début': document.getElementById('timeline-date-start')?.value || 'Première date disponible',
        'Date de fin': document.getElementById('timeline-date-end')?.value || 'Dernière date disponible'
    };
    try { Object.entries(typeof getCurrentFilters === 'function' ? getCurrentFilters() : {}).forEach(([k,v]) => result[`Filtre principal — ${k}`] = v); } catch (_) {}
    try { Object.entries(typeof getAnalysisFilters === 'function' ? getAnalysisFilters() : {}).forEach(([k,v]) => result[`Filtre Analyse — ${k}`] = v); } catch (_) {}
    return result;
}
function pmaExportBuildContext() {
    const source = Array.isArray(submissionTimelineSourceData) && submissionTimelineSourceData.length ? submissionTimelineSourceData : (Array.isArray(allData) ? allData : []);
    const granularity = document.getElementById('timeline-granularity')?.value || 'day';
    const displayMode = document.getElementById('timeline-display-mode')?.value || 'detailed';
    const chartType = selectedTimelineChartType();
    const layout = selectedTimelineLayout();
    const topLimit = document.getElementById('timeline-top-entities')?.value || '10';
    const startDate = parseSubmissionDate(document.getElementById('timeline-date-start')?.value || '');
    const endDate = parseSubmissionDate(document.getElementById('timeline-date-end')?.value || '');
    const datedRows = source.map(row => ({row, date: parseSubmissionDate(row['_submission_time'])})).filter(item => item.date)
        .filter(item => (!startDate || item.date >= startDate) && (!endDate || item.date <= endDate));
    const bucketKeys = buildTimelineBucketKeys(datedRows, granularity, startDate, endDate);
    const levels = {};
    ['DREN','CISCO','ZAP'].forEach(level => levels[level] = buildTimelineLevelData(level, datedRows, bucketKeys));
    return {source, granularity, displayMode, chartType, layout, topLimit, startDate, endDate, datedRows, bucketKeys, levels};
}
function pmaExportBuildDescriptors(scope, entityName) {
    const context = pmaExportBuildContext();
    const descriptors = [];
    pmaExportLevels(scope).forEach(level => {
        const model = context.levels[level];
        if (!model || !model.ranked.length) return;
        if (entityName) {
            const item = model.ranked.find(([name]) => name === entityName);
            if (!item) return;
            const labels = context.bucketKeys.map(key => formatSubmissionTimelineLabel(key, context.granularity));
            const raw = context.bucketKeys.map(bucket => model.byEntity[entityName]?.[bucket] || 0);
            const series = context.displayMode === 'cumulative' ? cumulativeTimelineValues(raw) : raw;
            const config = individualTimelineConfig(entityName, series, labels, context.chartType, getSubmissionTimelineColor(0, 1), context.granularity);
            descriptors.push({kind:'timeline', level, entity:entityName, title:`${level} — ${entityName}`, config, entityCount:1, bucketCount:context.bucketKeys.length});
            return;
        }
        if (context.layout === 'grouped') {
            const config = groupedTimelineConfig(level, model, context.bucketKeys, context.granularity, context.displayMode, context.chartType, context.topLimit);
            descriptors.push({kind:'timeline', level, title:`Soumissions groupées — ${level}`, config, entityCount:config.ranked.length, bucketCount:context.bucketKeys.length});
        } else {
            const search = (document.getElementById(`timeline-search-${level.toLowerCase()}`)?.value || '').trim().toLowerCase();
            model.ranked.filter(([name]) => name.toLowerCase().includes(search)).forEach(([entity]) => {
                const labels = context.bucketKeys.map(key => formatSubmissionTimelineLabel(key, context.granularity));
                const raw = context.bucketKeys.map(bucket => model.byEntity[entity]?.[bucket] || 0);
                const series = context.displayMode === 'cumulative' ? cumulativeTimelineValues(raw) : raw;
                const config = individualTimelineConfig(entity, series, labels, context.chartType, getSubmissionTimelineColor(descriptors.length, 1), context.granularity);
                descriptors.push({kind:'timeline', level, entity, title:`${level} — ${entity}`, config, entityCount:1, bucketCount:context.bucketKeys.length});
            });
        }
    });
    if (!entityName && typeof window.getAdvancedAnalysisExportSnapshot === 'function') {
        try {
            const snapshot = window.getAdvancedAnalysisExportSnapshot();
            const allowed = new Set(pmaExportLevels(scope));
            (snapshot?.charts || []).forEach(chart => {
                if (!allowed.has(chart.level)) return;
                descriptors.push({kind:'advanced', level:chart.level, title:chart.title, config:{type:chart.chartType || 'bar', data:chart.data || {labels:[],datasets:[]}, indexAxis:'x', scales:null}, entityCount:(chart.data?.labels || []).length, bucketCount:(chart.data?.labels || []).length});
            });
        } catch (error) { console.warn('Graphiques avancés non préparés :', error); }
    }
    return {context, descriptors};
}
function pmaExportChartDimensions(descriptor) {
    const type = descriptor.config.type;
    let width = 1500, height = 850;
    if (type === 'line' || type === 'bar') width = Math.min(3200, Math.max(1500, 350 + (descriptor.bucketCount || 0) * 75));
    if (descriptor.config.indexAxis === 'y') height = Math.min(2600, Math.max(850, 220 + (descriptor.entityCount || 1) * 48));
    if (type === 'line') height = Math.min(2400, Math.max(850, 250 + (descriptor.entityCount || 1) * 32));
    if (type === 'pie' || type === 'doughnut' || type === 'radar') { width = 1350; height = 1000; }
    return {width, height};
}
function pmaExportCanvasBlob(canvas, mime, quality) {
    return new Promise((resolve, reject) => {
        try {
            canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('La conversion du graphique en image a échoué.')), mime, quality);
        } catch (error) { reject(error); }
    });
}
async function pmaExportRenderDescriptor(descriptor, format) {
    if (typeof Chart === 'undefined') throw new Error('Chart.js n’est pas chargé.');
    const {width, height} = pmaExportChartDimensions(descriptor);
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-20000px;top:0;width:1px;height:1px;overflow:hidden;pointer-events:none;';
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    holder.appendChild(canvas); document.body.appendChild(holder);
    const whiteBackground = { id:`pmaWhiteBackground${Date.now()}${Math.random()}`, beforeDraw(chart) { const c=chart.ctx; c.save(); c.globalCompositeOperation='destination-over'; c.fillStyle='#ffffff'; c.fillRect(0,0,chart.width,chart.height); c.restore(); } };
    let chart;
    try {
        const config = descriptor.config;
        const data = JSON.parse(JSON.stringify(config.data || {labels:[],datasets:[]}));
        const radial = ['pie','doughnut','radar','polarArea'].includes(config.type);
        const lineLabels = config.type === 'line' && (data.datasets || []).length > 1;
        chart = new Chart(canvas.getContext('2d'), {
            type: config.type || 'bar', data,
            plugins:[whiteBackground],
            options:{
                responsive:false, maintainAspectRatio:false, animation:false, normalized:true, devicePixelRatio:1,
                indexAxis:config.indexAxis || 'x',
                layout:{padding:{left:30,right:lineLabels?260:35,top:30,bottom:30}},
                plugins:{
                    legend:{display:true,position:'bottom',labels:{usePointStyle:true,boxWidth:18,padding:14,font:{size:12}}},
                    title:{display:true,text:descriptor.title,font:{size:21,weight:'bold'},padding:{top:8,bottom:20}},
                    timelineEndLabelsPlugin:{enabled:lineLabels}, tooltip:{enabled:false}
                },
                scales:radial ? undefined : (config.scales || {x:{beginAtZero:config.indexAxis==='y'},y:{beginAtZero:true,ticks:{precision:0}}})
            }
        });
        chart.update('none'); chart.draw();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return await pmaExportCanvasBlob(canvas, format === 'jpeg' ? 'image/jpeg' : 'image/png', format === 'jpeg' ? .94 : undefined);
    } finally { try { chart?.destroy(); } catch (_) {} holder.remove(); }
}
async function pmaExportCreateImagePackage(scope, format, entityName) {
    const built = pmaExportBuildDescriptors(scope, entityName);
    const descriptors = built.descriptors;
    if (!descriptors.length) throw new Error('Aucun graphique n’est disponible pour cette sélection. Actualisez d’abord les graphiques.');
    const ext = format === 'jpeg' ? 'jpg' : 'png';
    const assets = [], errors = [];
    for (let i=0;i<descriptors.length;i++) {
        const descriptor=descriptors[i];
        pmaExportStatus(`<span class="spinner-border spinner-border-sm me-2"></span>Création du graphique ${i+1} / ${descriptors.length} : ${timelineEscapeHtml(descriptor.title)}`, 'info');
        try { assets.push({descriptor, blob:await pmaExportRenderDescriptor(descriptor, format), filename:`${String(i+1).padStart(3,'0')}_${pmaExportSafeName(descriptor.title)}.${ext}`}); }
        catch (error) { console.error(descriptor.title,error); errors.push(`${descriptor.title} : ${error.message}`); }
    }
    if (!assets.length) throw new Error(`Aucune image n’a pu être générée.${errors.length ? ' '+errors.join(' | ') : ''}`);
    const forceZip = String(scope || '').toUpperCase()==='ALL' || assets.length>1;
    if (!forceZip) return {blob:assets[0].blob, filename:`${pmaExportSafeName(assets[0].descriptor.title)}_${pmaExportTimestamp()}.${ext}`, assets, errors};
    if (typeof JSZip === 'undefined') throw new Error('JSZip n’est pas chargé. Vérifiez votre connexion Internet ou hébergez la bibliothèque localement.');
    const zip = new JSZip();
    assets.forEach(asset => zip.file(asset.filename, asset.blob));
    zip.file('criteres_export.json', JSON.stringify(pmaExportCriteria(scope), null, 2));
    zip.file('liste_graphiques.txt', assets.map(a => a.descriptor.title).join('\n'));
    if (errors.length) zip.file('ERREURS_EXPORT.txt', errors.join('\n'));
    const blob = await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}}, metadata => pmaExportStatus(`<span class="spinner-border spinner-border-sm me-2"></span>Compression ZIP : ${Math.round(metadata.percent)} %`, 'info'));
    return {blob, filename:`tous_les_graphiques_${String(scope).toLowerCase()}_${pmaExportTimestamp()}.zip`, assets, errors};
}
window.exportTimelineImages = async function(scope, format, entityName) {
    try { const result=await pmaExportCreateImagePackage(scope,format||'png',entityName); pmaExportDownload(result.blob,result.filename); pmaExportStatus(`<i class="fas fa-check-circle me-2"></i>Export terminé : <strong>${timelineEscapeHtml(result.filename)}</strong>${result.errors.length?` — ${result.errors.length} graphique(s) ignoré(s)`:''}`, result.errors.length?'warning':'success'); }
    catch(error){ console.error(error); pmaExportStatus(`<i class="fas fa-exclamation-triangle me-2"></i>${timelineEscapeHtml(error.message)}`,'danger'); alert(`Export impossible : ${error.message}`); }
};
function pmaExportFlattenRows(scope) {
    const {context}=pmaExportBuildDescriptors(scope);
    const rows=[];
    pmaExportLevels(scope).forEach(level => {
        const model=context.levels[level];
        model.ranked.forEach(([entity,total]) => {
            context.bucketKeys.forEach((bucket,index) => {
                const raw=context.bucketKeys.slice(0,index+1).reduce((sum,key)=>sum+(model.byEntity[entity]?.[key]||0),0);
                const detailed=model.byEntity[entity]?.[bucket]||0;
                rows.push({niveau:level,entite:entity,periode_cle:bucket,periode:formatSubmissionTimelineLabel(bucket,context.granularity),soumissions_detaillees:detailed,soumissions_cumulees:raw,total_entite:total});
            });
        });
    });
    return rows;
}
function pmaExportCsvCell(value){ return `"${String(value??'').replace(/"/g,'""')}"`; }
function pmaExportBlobToDataURL(blob){ return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);}); }
async function pmaExportCreateHtml(scope) {
    const built=pmaExportBuildDescriptors(scope); const criteria=pmaExportCriteria(scope); const figures=[];
    for(let i=0;i<built.descriptors.length;i++){pmaExportStatus(`<span class="spinner-border spinner-border-sm me-2"></span>Rapport HTML : graphique ${i+1} / ${built.descriptors.length}`,'info'); const blob=await pmaExportRenderDescriptor(built.descriptors[i],'png'); figures.push({title:built.descriptors[i].title,url:await pmaExportBlobToDataURL(blob)});}
    const criteriaRows=Object.entries(criteria).map(([k,v])=>`<tr><th>${timelineEscapeHtml(k)}</th><td>${timelineEscapeHtml(v)}</td></tr>`).join('');
    const body=figures.map(f=>`<section><h2>${timelineEscapeHtml(f.title)}</h2><img src="${f.url}" alt="${timelineEscapeHtml(f.title)}"></section>`).join('');
    return new Blob([`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Rapport Analyse</title><style>body{font-family:Arial;color:#243447;margin:25px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd5df;padding:7px;text-align:left}th{background:#eaf2f8}section{page-break-after:always;margin-top:28px}img{max-width:100%;height:auto;border:1px solid #ddd}h1,h2{color:#1f4e78}</style></head><body><h1>${timelineEscapeHtml(TITRE_PLATEFORME)}</h1><h2>Critères</h2><table>${criteriaRows}</table>${body}</body></html>`],{type:'text/html;charset=utf-8'});
}
async function pmaExportCreatePdf(scope) {
    if (!window.jspdf?.jsPDF) throw new Error('jsPDF n’est pas chargé.');
    const {jsPDF}=window.jspdf; const built=pmaExportBuildDescriptors(scope); if(!built.descriptors.length) throw new Error('Aucun graphique disponible.');
    const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    for(let i=0;i<built.descriptors.length;i++){
        if(i>0) pdf.addPage('a4','landscape'); pmaExportStatus(`<span class="spinner-border spinner-border-sm me-2"></span>PDF : graphique ${i+1} / ${built.descriptors.length}`,'info');
        const blob=await pmaExportRenderDescriptor(built.descriptors[i],'jpeg'); const url=await pmaExportBlobToDataURL(blob);
        pdf.setFontSize(14); pdf.text(built.descriptors[i].title,12,12); const props=pdf.getImageProperties(url); const maxW=273,maxH=178; const ratio=Math.min(maxW/props.width,maxH/props.height); const w=props.width*ratio,h=props.height*ratio; pdf.addImage(url,'JPEG',12,18,w,h,undefined,'FAST');
    }
    return pdf.output('blob');
}
function pmaXmlEscape(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
function pmaDataUrlBytes(url){const b=atob(String(url).split(',')[1]||'');const a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a;}
function pmaPngSize(bytes){if(bytes.length<24)return{width:1200,height:700};const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);return{width:v.getUint32(16),height:v.getUint32(20)};}
function pmaDocxParagraph(text,opt={}){return `<w:p><w:pPr>${opt.break?'<w:pageBreakBefore/>':''}<w:spacing w:after="${opt.after??120}"/>${opt.center?'<w:jc w:val="center"/>':''}</w:pPr><w:r><w:rPr>${opt.bold?'<w:b/>':''}<w:sz w:val="${opt.size||22}"/><w:szCs w:val="${opt.size||22}"/><w:color w:val="${opt.color||'243447'}"/></w:rPr><w:t xml:space="preserve">${pmaXmlEscape(text)}</w:t></w:r></w:p>`;}
async function pmaExportCreateDocx(scope) {
    if(typeof JSZip==='undefined')throw new Error('JSZip n’est pas chargé.'); const built=pmaExportBuildDescriptors(scope); if(!built.descriptors.length)throw new Error('Aucun graphique disponible.'); const imgs=[];
    for(let i=0;i<built.descriptors.length;i++){pmaExportStatus(`<span class="spinner-border spinner-border-sm me-2"></span>Word : graphique ${i+1} / ${built.descriptors.length}`,'info');const blob=await pmaExportRenderDescriptor(built.descriptors[i],'png');imgs.push({title:built.descriptors[i].title,bytes:pmaDataUrlBytes(await pmaExportBlobToDataURL(blob))});}
    const zip=new JSZip(), created=new Date().toISOString(); const rels=imgs.map((_,i)=>`<Relationship Id="rIdImage${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${i+1}.png"/>`).join('');
    let body=pmaDocxParagraph(TITRE_PLATEFORME,{bold:true,size:34,color:'1F4E78'}); Object.entries(pmaExportCriteria(scope)).forEach(([k,v])=>body+=pmaDocxParagraph(`${k} : ${v}`,{size:19,after:40}));
    imgs.forEach((img,i)=>{const dim=pmaPngSize(img.bytes),maxW=9.8,maxH=5.8;let wi=maxW,hi=wi*dim.height/Math.max(1,dim.width);if(hi>maxH){hi=maxH;wi=hi*dim.width/Math.max(1,dim.height);}const cx=Math.round(wi*914400),cy=Math.round(hi*914400);body+=pmaDocxParagraph(img.title,{bold:true,size:27,color:'2F5597',break:true});body+=`<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${i+1}" name="Graphique ${i+1}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${i+1}" name="image${i+1}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImage${i+1}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;});body+='<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="680" w:right="680" w:bottom="680" w:left="680"/></w:sectPr>';
    zip.file('[Content_Types].xml',`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);zip.file('_rels/.rels',`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);zip.file('word/_rels/document.xml.rels',`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`);zip.file('word/document.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}</w:body></w:document>`);imgs.forEach((img,i)=>zip.file(`word/media/image${i+1}.png`,img.bytes));return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',compression:'DEFLATE'});
}
window.exportTimelineWord=async function(scope,entityName){try{if(entityName){const pkg=await pmaExportCreateImagePackage(scope,'png',entityName);pmaExportDownload(pkg.blob,pkg.filename);return;}const blob=await pmaExportCreateDocx(scope);const fn=`rapport_graphiques_${String(scope).toLowerCase()}_${pmaExportTimestamp()}.docx`;pmaExportDownload(blob,fn);pmaExportStatus(`<i class="fas fa-check-circle me-2"></i>Word créé : <strong>${fn}</strong>`,'success');}catch(error){console.error(error);pmaExportStatus(timelineEscapeHtml(error.message),'danger');alert(error.message);}};
window.exportAnalysisToPDF=async function(scope){try{const blob=await pmaExportCreatePdf(scope);const fn=`rapport_graphiques_${String(scope).toLowerCase()}_${pmaExportTimestamp()}.pdf`;pmaExportDownload(blob,fn);pmaExportStatus(`<i class="fas fa-check-circle me-2"></i>PDF créé : <strong>${fn}</strong>`,'success');return blob;}catch(error){console.error(error);pmaExportStatus(timelineEscapeHtml(error.message),'danger');alert(error.message);}};
window.exportTimelineScopeData=async function(scope,format){try{const rows=pmaExportFlattenRows(scope),criteria=pmaExportCriteria(scope),stamp=pmaExportTimestamp();if(format==='json'){pmaExportDownload(new Blob([JSON.stringify({criteria,rows},null,2)],{type:'application/json;charset=utf-8'}),`analyse_${String(scope).toLowerCase()}_${stamp}.json`);}else if(format==='csv'){const h=['Niveau','Entité','Période clé','Période','Soumissions détaillées','Soumissions cumulées','Total entité'];const lines=[h.map(pmaExportCsvCell).join(';'),...rows.map(r=>[r.niveau,r.entite,r.periode_cle,r.periode,r.soumissions_detaillees,r.soumissions_cumulees,r.total_entite].map(pmaExportCsvCell).join(';'))];pmaExportDownload(new Blob(['\uFEFF'+lines.join('\n')],{type:'text/csv;charset=utf-8'}),`analyse_${String(scope).toLowerCase()}_${stamp}.csv`);}else if(format==='html'){pmaExportDownload(await pmaExportCreateHtml(scope),`rapport_${String(scope).toLowerCase()}_${stamp}.html`);}else if(format==='xlsx'){if(typeof ExcelJS==='undefined')throw new Error('ExcelJS n’est pas chargé.');const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Données temporelles'),wc=wb.addWorksheet('Critères');wc.addRows([['Critère','Valeur'],...Object.entries(criteria)]);ws.addRow(['Niveau','Entité','Période clé','Période','Détaillé','Cumulé','Total']);rows.forEach(r=>ws.addRow([r.niveau,r.entite,r.periode_cle,r.periode,r.soumissions_detaillees,r.soumissions_cumulees,r.total_entite]));const buf=await wb.xlsx.writeBuffer();pmaExportDownload(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`analyse_${String(scope).toLowerCase()}_${stamp}.xlsx`);}pmaExportStatus('<i class="fas fa-check-circle me-2"></i>Export de données terminé.','success');}catch(error){console.error(error);pmaExportStatus(timelineEscapeHtml(error.message),'danger');alert(error.message);}};
window.shareTimelineExport=async function(scope,format,entityName){try{let result;if(format==='word'){const blob=await pmaExportCreateDocx(scope);result={blob,filename:`rapport_${String(scope).toLowerCase()}_${pmaExportTimestamp()}.docx`};}else if(format==='pdf'){const blob=await pmaExportCreatePdf(scope);result={blob,filename:`rapport_${String(scope).toLowerCase()}_${pmaExportTimestamp()}.pdf`};}else result=await pmaExportCreateImagePackage(scope,format||'png',entityName);const file=new File([result.blob],result.filename,{type:result.blob.type||'application/octet-stream'});if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]})))await navigator.share({title:'Graphiques KoboToolbox',files:[file]});else{pmaExportDownload(result.blob,result.filename);alert('Le partage direct n’est pas disponible. Le fichier a été téléchargé.');}}catch(error){if(error?.name==='AbortError')return;console.error(error);pmaExportStatus(timelineEscapeHtml(error.message),'danger');alert(error.message);}};
window.exportAdvancedSingleChart=async function(chartKey,format){try{const snap=window.getAdvancedAnalysisExportSnapshot?.();const chart=snap?.charts?.find(c=>c.key===chartKey);if(!chart)throw new Error('Ce graphique avancé n’est pas encore disponible.');const descriptor={kind:'advanced',level:chart.level,title:chart.title,config:{type:chart.chartType||'bar',data:chart.data||{labels:[],datasets:[]},indexAxis:'x',scales:null},entityCount:chart.data?.labels?.length||1,bucketCount:chart.data?.labels?.length||1};const blob=await pmaExportRenderDescriptor(descriptor,format||'png');pmaExportDownload(blob,`${pmaExportSafeName(chart.title)}_${pmaExportTimestamp()}.${format==='jpeg'?'jpg':'png'}`);}catch(error){console.error(error);alert(error.message);}};
window.shareAdvancedSingleChart=async function(chartKey){try{const snap=window.getAdvancedAnalysisExportSnapshot?.();const chart=snap?.charts?.find(c=>c.key===chartKey);if(!chart)throw new Error('Ce graphique avancé n’est pas encore disponible.');const descriptor={kind:'advanced',level:chart.level,title:chart.title,config:{type:chart.chartType||'bar',data:chart.data},entityCount:chart.data?.labels?.length||1,bucketCount:chart.data?.labels?.length||1};const blob=await pmaExportRenderDescriptor(descriptor,'png');const filename=`${pmaExportSafeName(chart.title)}_${pmaExportTimestamp()}.png`;const file=new File([blob],filename,{type:'image/png'});if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]})))await navigator.share({title:chart.title,files:[file]});else pmaExportDownload(blob,filename);}catch(error){if(error?.name!=='AbortError'){console.error(error);alert(error.message);}}};
window.exportKoboBaseJSON=function(){if(!Array.isArray(allData)||!allData.length)return alert('Aucune donnée KoboToolbox disponible.');const payload={type:'kobotoolbox_offline_backup',version:1,exported_at:new Date().toISOString(),count:allData.length,results:allData};pmaExportDownload(new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'}),`base_kobotoolbox_${pmaExportTimestamp()}.json`);};


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
            throw new Error("L'antivirus ou l'extension du navigateur (ex: uBlock) bloque la connexion. Veuillez importer votre fichier Excel manuellement via le bouton en haut.");
        }
        
        allData = (await response.json()).results || [];
        allData = allData.filter(row => row !== null && typeof row === 'object');
        
        renderTable(allData);
        renderAnalysis(allData);
        
        let bEx = isExcelLoaded ? '<span class="badge bg-success ms-2"><i class="fas fa-check-circle"></i> Traduit</span>' : '<span class="badge bg-warning text-dark ms-2"><i class="fas fa-info-circle"></i> Brut</span>';
        $('#sync-status').html(`<span class="badge bg-success sync-badge"><i class="fas fa-check-double"></i> Ok : ${allData.length} Lignes</span>`).append(bEx);

    } catch (error) {
        $('#error-box').html('<strong>Erreur de sécurité réseau :</strong> ' + error.message).show();
        $('#sync-status').html('<span class="badge bg-danger sync-badge">Échec Kobo</span>');
    } finally { 
        $('#loading-box').hide(); 
    }
}

$(document).ready(function() {
    fetchData();
    let typingTimer;
    $('.filter-input').on('keyup', function () { clearTimeout(typingTimer); typingTimer = setTimeout(applyFilters, 300); });
    $('.filter-input').on('change', applyFilters);
    
    setupAnalysisTableSearch('search-dren-table', 'dren-summary-table');
    setupAnalysisTableSearch('search-cisco-table', 'cisco-summary-table');
    setupAnalysisTableSearch('search-zap-table', 'zap-summary-table');

    $('#timeline-refresh-btn').on('click', function() { renderSubmissionTimelineCharts(); });
    $('#timeline-reset-btn').on('click', resetSubmissionTimelineControls);
    $('#timeline-granularity, #timeline-display-mode, #timeline-chart-type, #timeline-top-entities, #timeline-date-start, #timeline-date-end').on('change', function() { renderSubmissionTimelineCharts(); });
    $(document).on('change', 'input[name="timeline-layout-mode"]', function() { renderSubmissionTimelineCharts(); });

    const timelineGranularities = ['day', 'week', 'month', 'quarter', 'semester', 'year'];
    $('#timeline-zoom-in-btn').on('click', function() {
        const current = $('#timeline-granularity').val() || 'day';
        const index = timelineGranularities.indexOf(current);
        $('#timeline-granularity').val(timelineGranularities[Math.max(0, index - 1)]).trigger('change');
    });
    $('#timeline-zoom-out-btn').on('click', function() {
        const current = $('#timeline-granularity').val() || 'day';
        const index = timelineGranularities.indexOf(current);
        $('#timeline-granularity').val(timelineGranularities[Math.min(timelineGranularities.length - 1, index + 1)]).trigger('change');
    });
    $(document).on('input', '.timeline-individual-search-input', function() {
        const level = String($(this).data('level') || '').toUpperCase();
        if (level) submissionTimelinePageState[level] = 1;
        renderSubmissionTimelineCharts();
    });
    $(document).on('change', '.timeline-page-size-select', function() {
        const level = String($(this).data('level') || '').toUpperCase();
        if (level) submissionTimelinePageState[level] = 1;
        renderSubmissionTimelineCharts();
    });
    $(document).on('click', '.timeline-page-prev, .timeline-page-next', function() {
        const level = String($(this).data('level') || '').toUpperCase();
        if (!level) return;
        submissionTimelinePageState[level] = Math.max(1, (submissionTimelinePageState[level] || 1) + ($(this).hasClass('timeline-page-next') ? 1 : -1));
        renderSubmissionTimelineCharts();
    });

    const analyseTab = document.getElementById('analyse-tab');
    if (analyseTab) {
        analyseTab.addEventListener('shown.bs.tab', function() {
            setTimeout(function() {
                Object.values(submissionTimelineChartsRefs).forEach(chart => { if (chart) chart.resize(); });
            }, 50);
        });
    }
    
    if (window.filterSoumissionsTables) {
        $('#search-soumissions-table').on('keyup', window.filterSoumissionsTables);
        $('.filter-soumissions-radio').on('change', window.filterSoumissionsTables);
    }
});
