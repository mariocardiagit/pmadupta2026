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
var submissionTimelineSourceData = [];
var intelligentAnalysisSnapshot = null;

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
    let bucketDate = new Date(date.getTime());
    if (granularity === 'month') {
        bucketDate = new Date(Date.UTC(bucketDate.getUTCFullYear(), bucketDate.getUTCMonth(), 1));
    } else if (granularity === 'week') {
        let day = bucketDate.getUTCDay();
        let daysFromMonday = day === 0 ? 6 : day - 1;
        bucketDate.setUTCDate(bucketDate.getUTCDate() - daysFromMonday);
    }
    return formatISODateUTC(bucketDate);
}

function formatSubmissionTimelineLabel(bucketKey, granularity) {
    let date = parseSubmissionDate(bucketKey);
    if (!date) return bucketKey;
    if (granularity === 'month') {
        return date.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    }
    let formatted = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
    return granularity === 'week' ? `Sem. du ${formatted}` : formatted;
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

function renderOneSubmissionTimelineChart(level, datedRows, bucketKeys, granularity, topLimit) {
    const canvasId = `submissionTimelineChart${level}`;
    const emptyId = `timeline-empty-${level.toLowerCase()}`;
    const canvas = document.getElementById(canvasId);
    const emptyState = document.getElementById(emptyId);
    if (!canvas || !emptyState) return;

    if (submissionTimelineChartsRefs[level]) {
        submissionTimelineChartsRefs[level].destroy();
        submissionTimelineChartsRefs[level] = null;
    }

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

    let rankedEntities = Object.entries(entityTotals).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'));
    if (topLimit !== 'all') rankedEntities = rankedEntities.slice(0, Number(topLimit));

    if (rankedEntities.length === 0 || bucketKeys.length === 0) {
        canvas.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
    }

    canvas.style.display = 'block';
    emptyState.style.display = 'none';

    let labels = bucketKeys.map(key => formatSubmissionTimelineLabel(key, granularity));
    let datasets = rankedEntities.map(([entity], index) => {
        let color = getSubmissionTimelineColor(index, 1);
        return {
            label: entity,
            data: bucketKeys.map(bucket => valuesByEntity[entity][bucket] || 0),
            borderColor: color,
            backgroundColor: getSubmissionTimelineColor(index, 0.12),
            pointBackgroundColor: color,
            pointBorderColor: '#ffffff',
            pointBorderWidth: 1,
            pointRadius: bucketKeys.length > 45 ? 0 : 2.5,
            pointHoverRadius: 5,
            borderWidth: 2,
            tension: 0.22,
            fill: false,
            spanGaps: true
        };
    });

    submissionTimelineChartsRefs[level] = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            normalized: true,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { usePointStyle: true, pointStyle: 'line', boxWidth: 22, padding: 14 }
                },
                tooltip: {
                    callbacks: {
                        title: items => items.length ? `Date : ${items[0].label}` : '',
                        label: context => `${context.dataset.label} : ${context.parsed.y} soumission${context.parsed.y > 1 ? 's' : ''}`
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: granularity === 'month' ? 'Mois de soumission' : (granularity === 'week' ? 'Semaine de soumission' : 'Date de soumission'), font: { weight: 'bold' } },
                    ticks: { autoSkip: true, maxTicksLimit: 14, maxRotation: 0, minRotation: 0 },
                    grid: { display: false }
                },
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Nombre de soumissions', font: { weight: 'bold' } },
                    ticks: { precision: 0 }
                }
            }
        }
    });
}

function renderSubmissionTimelineCharts(data) {
    if (Array.isArray(data)) submissionTimelineSourceData = data;
    if (!document.getElementById('submissionTimelineChartDREN')) return;

    let source = Array.isArray(submissionTimelineSourceData) ? submissionTimelineSourceData : [];
    let granularity = $('#timeline-granularity').val() || 'day';
    let topLimit = $('#timeline-top-entities').val() || '10';
    let startValue = $('#timeline-date-start').val();
    let endValue = $('#timeline-date-end').val();
    let startDate = startValue ? parseSubmissionDate(startValue) : null;
    let endDate = endValue ? parseSubmissionDate(endValue) : null;

    let datedRows = source
        .map(row => ({ row: row, date: parseSubmissionDate(row['_submission_time']) }))
        .filter(item => item.date)
        .filter(item => (!startDate || item.date >= startDate) && (!endDate || item.date <= endDate));

    let allAvailableDates = source.map(row => parseSubmissionDate(row['_submission_time'])).filter(Boolean).sort((a, b) => a - b);
    if (allAvailableDates.length > 0) {
        let minDate = formatISODateUTC(allAvailableDates[0]);
        let maxDate = formatISODateUTC(allAvailableDates[allAvailableDates.length - 1]);
        $('#timeline-date-start, #timeline-date-end').attr('min', minDate).attr('max', maxDate);
    }

    let bucketKeys = [...new Set(datedRows.map(item => getSubmissionTimelineBucket(item.date, granularity)))].sort();
    let uniqueEntities = new Set();
    datedRows.forEach(item => {
        ['DREN', 'CISCO', 'ZAP'].forEach(level => {
            let entity = getSubmissionEntityValue(item.row, level);
            if (entity && entity.toLowerCase() !== 'non renseigné') uniqueEntities.add(`${level}|||${entity}`);
        });
    });

    $('#timeline-dated-count').text(datedRows.length.toLocaleString('fr-FR'));
    $('#timeline-entities-count').text(uniqueEntities.size.toLocaleString('fr-FR'));
    if (datedRows.length > 0) {
        let sortedDates = datedRows.map(item => item.date).sort((a, b) => a - b);
        let first = sortedDates[0].toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
        let last = sortedDates[sortedDates.length - 1].toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
        $('#timeline-period-label').text(first === last ? first : `${first} – ${last}`);
    } else {
        $('#timeline-period-label').text('Aucune date');
    }

    ['DREN', 'CISCO', 'ZAP'].forEach(level => renderOneSubmissionTimelineChart(level, datedRows, bucketKeys, granularity, topLimit));
}

function resetSubmissionTimelineControls() {
    $('#timeline-granularity').val('day');
    $('#timeline-top-entities').val('10');
    $('#timeline-date-start, #timeline-date-end').val('');
    renderSubmissionTimelineCharts();
    renderIntelligentAnalysisReport(submissionTimelineSourceData);
}

function aiEscapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function aiFormatNumber(value, decimals) {
    let n = Number(value);
    if (!Number.isFinite(n)) n = 0;
    return n.toLocaleString('fr-FR', {
        minimumFractionDigits: decimals || 0,
        maximumFractionDigits: decimals || 0
    });
}

function aiPercent(value, total, decimals) {
    if (!total) return '0,0 %';
    return `${aiFormatNumber((Number(value) / Number(total)) * 100, decimals === undefined ? 1 : decimals)} %`;
}

function aiMedian(values) {
    let sorted = (values || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    let middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function aiQuantile(values, quantile) {
    let sorted = (values || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    let position = (sorted.length - 1) * quantile;
    let base = Math.floor(position);
    let rest = position - base;
    return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

function aiGranularityLabel(key) {
    return ({ day: 'Jour', week: 'Semaine', month: 'Mois', quarter: 'Trimestre', semester: 'Semestre', year: 'Année' })[key] || 'Jour';
}

function aiBucketKey(date, granularity) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return '';
    let year = date.getUTCFullYear();
    let month = date.getUTCMonth();
    if (granularity === 'year') return `${year}-01-01`;
    if (granularity === 'semester') return `${year}-${month < 6 ? '01' : '07'}-01`;
    if (granularity === 'quarter') return `${year}-${String(Math.floor(month / 3) * 3 + 1).padStart(2, '0')}-01`;
    if (granularity === 'month') return `${year}-${String(month + 1).padStart(2, '0')}-01`;
    if (granularity === 'week') {
        let d = new Date(Date.UTC(year, month, date.getUTCDate()));
        let day = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() - day + 1);
        return formatISODateUTC(d);
    }
    return formatISODateUTC(date);
}

function aiBucketLabel(key, granularity) {
    let date = parseSubmissionDate(key);
    if (!date) return key || 'Période inconnue';
    let year = date.getUTCFullYear();
    let month = date.getUTCMonth();
    if (granularity === 'year') return `Année ${year}`;
    if (granularity === 'semester') return `${month < 6 ? '1er' : '2e'} semestre ${year}`;
    if (granularity === 'quarter') return `${Math.floor(month / 3) + 1}e trimestre ${year}`;
    if (granularity === 'month') return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    if (granularity === 'week') return `Semaine du ${date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}`;
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function aiEntityValue(row, level) {
    let low = String(level || '').toLowerCase();
    let col = baseColsInfo.find(c => c.key === low);
    if (!col) return '';
    return cleanSpaces(getKoboValue(row, col.matches, col.ex, col.mustMatch));
}

function aiIsMissingEntity(value) {
    let clean = cleanSpaces(value).toLowerCase();
    return !clean || clean === 'non renseigné' || clean === 'n/a' || clean === 'na' || clean === 'null' || clean === 'undefined';
}

function aiRelativePosition(count, stats) {
    if (!stats.entityCount) return { label: 'Non déterminé', badge: 'bg-secondary', detail: 'Aucune comparaison possible.' };
    if (stats.allEqual) return { label: 'Volume identique', badge: 'bg-primary', detail: `Même volume que toutes les autres entités du niveau (${aiFormatNumber(count)}).` };
    if (count >= stats.q3 && count > stats.median) return { label: 'Volume relatif élevé', badge: 'bg-success', detail: `Au moins au niveau du troisième quartile (${aiFormatNumber(stats.q3, 1)}).` };
    if (count > stats.median) return { label: 'Au-dessus de la médiane', badge: 'bg-info text-dark', detail: `Supérieur à la médiane du niveau (${aiFormatNumber(stats.median, 1)}).` };
    if (count === stats.median) return { label: 'Au niveau médian', badge: 'bg-primary', detail: `Égal à la médiane du niveau (${aiFormatNumber(stats.median, 1)}).` };
    if (count <= stats.q1 && count < stats.median) return { label: 'Volume relatif faible', badge: 'bg-danger', detail: `Au plus au niveau du premier quartile (${aiFormatNumber(stats.q1, 1)}).` };
    return { label: 'Sous la médiane', badge: 'bg-warning text-dark', detail: `Inférieur à la médiane du niveau (${aiFormatNumber(stats.median, 1)}).` };
}

function aiTrendInfo(previous, recent, hasTemporalData) {
    if (!hasTemporalData) return { label: 'Dates insuffisantes', badge: 'bg-secondary', icon: 'fa-calendar-times', sentence: 'La tendance temporelle ne peut pas être calculée.' };
    if (previous === null || previous === undefined) return { label: 'Première période', badge: 'bg-secondary', icon: 'fa-minus', sentence: `Première période comparable : ${aiFormatNumber(recent)} soumission(s).` };
    if (recent > previous) {
        let delta = recent - previous;
        return { label: 'Hausse récente', badge: 'bg-success', icon: 'fa-arrow-trend-up', sentence: `Hausse de ${aiFormatNumber(delta)} soumission(s), de ${aiFormatNumber(previous)} à ${aiFormatNumber(recent)}.` };
    }
    if (recent < previous) {
        let delta = previous - recent;
        return { label: 'Baisse récente', badge: 'bg-danger', icon: 'fa-arrow-trend-down', sentence: `Baisse de ${aiFormatNumber(delta)} soumission(s), de ${aiFormatNumber(previous)} à ${aiFormatNumber(recent)}.` };
    }
    return { label: 'Stabilité récente', badge: 'bg-primary', icon: 'fa-equals', sentence: `Volume stable à ${aiFormatNumber(recent)} soumission(s) sur les deux dernières périodes.` };
}

function aiRecommendation(entity, count, stats, trend, recent, missingDates) {
    let actions = [];
    if (!stats.allEqual && count <= stats.q1 && count < stats.median) {
        actions.push("vérifier si le faible volume correspond à une absence réelle d’activité, à un retard de saisie ou à un problème d’accès à KoboToolbox");
    } else if (!stats.allEqual && count >= stats.q3 && count > stats.median) {
        actions.push("maintenir le rythme de transmission et contrôler les doublons éventuels afin de confirmer que le volume élevé est réel");
    } else {
        actions.push("maintenir le suivi régulier et comparer le volume avec les objectifs opérationnels de l’entité");
    }
    if (trend && trend.label === 'Baisse récente') actions.push("effectuer une relance ciblée et rechercher la cause de la baisse récente");
    if (trend && trend.label === 'Hausse récente') actions.push("documenter les facteurs de progression pour identifier les pratiques reproductibles");
    if (recent === 0 && trend && trend.label !== 'Dates insuffisantes') actions.push("vérifier l’absence de soumission pendant la période la plus récente");
    if (missingDates > 0) actions.push("améliorer la complétude des dates de soumission avant une interprétation temporelle définitive");
    return actions.join(' ; ') + '.';
}

function buildAiLevelAnalysis(level, data, freq, datedRows, globalBuckets, granularity, totalRows) {
    let entries = Object.entries(freq || {})
        .filter(([name]) => !aiIsMissingEntity(name))
        .map(([name, count]) => ({ name, count: Number(count) || 0 }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr', { sensitivity: 'base', numeric: true }));
    let counts = entries.map(item => item.count);
    let namedTotal = counts.reduce((sum, value) => sum + value, 0);
    let missing = Math.max(0, totalRows - namedTotal);
    let stats = {
        entityCount: entries.length,
        namedTotal,
        missing,
        mean: entries.length ? namedTotal / entries.length : 0,
        median: aiMedian(counts),
        q1: aiQuantile(counts, 0.25),
        q3: aiQuantile(counts, 0.75),
        min: counts.length ? Math.min(...counts) : 0,
        max: counts.length ? Math.max(...counts) : 0,
        allEqual: counts.length > 0 && counts.every(value => value === counts[0]),
        top1Share: entries.length && namedTotal ? entries[0].count / namedTotal * 100 : 0,
        top3Share: namedTotal ? entries.slice(0, 3).reduce((sum, item) => sum + item.count, 0) / namedTotal * 100 : 0
    };

    let temporalByEntity = {};
    entries.forEach(item => { temporalByEntity[item.name] = { dates: [], buckets: {}, allDatedCount: 0 }; });
    data.forEach(row => {
        let name = aiEntityValue(row, level);
        if (aiIsMissingEntity(name) || !temporalByEntity[name]) return;
        if (parseSubmissionDate(row['_submission_time'])) temporalByEntity[name].allDatedCount++;
    });
    datedRows.forEach(item => {
        let name = aiEntityValue(item.row, level);
        if (aiIsMissingEntity(name) || !temporalByEntity[name]) return;
        let bucket = aiBucketKey(item.date, granularity);
        temporalByEntity[name].dates.push(item.date);
        temporalByEntity[name].buckets[bucket] = (temporalByEntity[name].buckets[bucket] || 0) + 1;
    });

    let rows = entries.map((item, index) => {
        let temporal = temporalByEntity[item.name] || { dates: [], buckets: {}, allDatedCount: 0 };
        let dates = temporal.dates.slice().sort((a, b) => a - b);
        let firstDate = dates.length ? dates[0] : null;
        let lastDate = dates.length ? dates[dates.length - 1] : null;
        let latestBucket = globalBuckets.length ? globalBuckets[globalBuckets.length - 1] : null;
        let previousBucket = globalBuckets.length > 1 ? globalBuckets[globalBuckets.length - 2] : null;
        let recent = latestBucket ? (temporal.buckets[latestBucket] || 0) : 0;
        let previous = previousBucket ? (temporal.buckets[previousBucket] || 0) : null;
        let trend = aiTrendInfo(previous, recent, dates.length > 0 && globalBuckets.length > 0);
        let relative = aiRelativePosition(item.count, stats);
        let dateText = dates.length
            ? `${firstDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })} → ${lastDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })}`
            : 'Aucune date exploitable';
        let activePeriods = Object.keys(temporal.buckets).length;
        let recommendation = aiRecommendation(item.name, item.count, stats, trend, recent, Math.max(0, item.count - temporal.allDatedCount));
        return {
            level,
            rank: index + 1,
            name: item.name,
            count: item.count,
            share: totalRows ? item.count / totalRows * 100 : 0,
            relative,
            firstDate,
            lastDate,
            dateText,
            activePeriods,
            recent,
            previous,
            trend,
            recommendation
        };
    });

    return { level, entries, rows, stats };
}

function renderIntelligentAnalysisReport(data, frequencies) {
    let container = document.getElementById('ai-report-content');
    if (!container) return;
    let source = Array.isArray(data) ? data : [];
    let totalRows = source.length;
    if (!totalRows) {
        intelligentAnalysisSnapshot = { generated_at: getFormattedDateTime(), total_rows: 0, levels: {} };
        container.innerHTML = `
            <div class="alert alert-secondary mb-0">
                <h6 class="fw-bold"><i class="fas fa-database"></i> Aucune donnée à analyser</h6>
                <p class="mb-0">Chargez une base KoboToolbox ou importez une sauvegarde JSON, puis actualisez l’analyse.</p>
            </div>`;
        return;
    }

    let granularity = document.getElementById('timeline-granularity')?.value || 'day';
    let displayMode = document.getElementById('timeline-display-mode')?.value || 'detailed';
    let startValue = document.getElementById('timeline-date-start')?.value || '';
    let endValue = document.getElementById('timeline-date-end')?.value || '';
    let startDate = startValue ? parseSubmissionDate(startValue) : null;
    let endDate = endValue ? parseSubmissionDate(endValue) : null;
    let datedRowsAll = source.map(row => ({ row, date: parseSubmissionDate(row['_submission_time']) })).filter(item => item.date);
    let datedRows = datedRowsAll.filter(item => (!startDate || item.date >= startDate) && (!endDate || item.date <= endDate));
    let globalBuckets = [...new Set(datedRows.map(item => aiBucketKey(item.date, granularity)).filter(Boolean))].sort();
    let allDates = datedRows.map(item => item.date).sort((a, b) => a - b);
    let dateRange = allDates.length
        ? `${allDates[0].toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })} au ${allDates[allDates.length - 1].toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })}`
        : 'aucune période exploitable';

    let freqs = frequencies || {
        DREN: source.reduce((acc, row) => { let v = aiEntityValue(row, 'DREN'); let k = aiIsMissingEntity(v) ? 'Non renseigné' : v; acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
        CISCO: source.reduce((acc, row) => { let v = aiEntityValue(row, 'CISCO'); let k = aiIsMissingEntity(v) ? 'Non renseigné' : v; acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
        ZAP: source.reduce((acc, row) => { let v = aiEntityValue(row, 'ZAP'); let k = aiIsMissingEntity(v) ? 'Non renseigné' : v; acc[k] = (acc[k] || 0) + 1; return acc; }, {})
    };
    let analyses = {
        DREN: buildAiLevelAnalysis('DREN', source, freqs.DREN, datedRows, globalBuckets, granularity, totalRows),
        CISCO: buildAiLevelAnalysis('CISCO', source, freqs.CISCO, datedRows, globalBuckets, granularity, totalRows),
        ZAP: buildAiLevelAnalysis('ZAP', source, freqs.ZAP, datedRows, globalBuckets, granularity, totalRows)
    };

    let namedEntityCount = analyses.DREN.stats.entityCount + analyses.CISCO.stats.entityCount + analyses.ZAP.stats.entityCount;
    let latestLabel = globalBuckets.length ? aiBucketLabel(globalBuckets[globalBuckets.length - 1], granularity) : 'Période indisponible';
    let previousLabel = globalBuckets.length > 1 ? aiBucketLabel(globalBuckets[globalBuckets.length - 2], granularity) : 'Période antérieure indisponible';

    let comparativeRows = ['DREN', 'CISCO', 'ZAP'].map(level => {
        let s = analyses[level].stats;
        let completeness = totalRows ? s.namedTotal / totalRows * 100 : 0;
        return `<tr>
            <th scope="row">${level}</th>
            <td>${aiFormatNumber(s.entityCount)}</td>
            <td>${aiFormatNumber(s.namedTotal)} / ${aiFormatNumber(totalRows)} (${aiFormatNumber(completeness, 1)} %)</td>
            <td>${aiFormatNumber(s.missing)}</td>
            <td>${aiFormatNumber(s.mean, 1)}</td>
            <td>${aiFormatNumber(s.median, 1)}</td>
            <td>${aiFormatNumber(s.top1Share, 1)} %</td>
            <td>${aiFormatNumber(s.top3Share, 1)} %</td>
        </tr>`;
    }).join('');

    let levelSections = ['DREN', 'CISCO', 'ZAP'].map(level => {
        let analysis = analyses[level];
        let s = analysis.stats;
        if (!analysis.rows.length) {
            return `<section class="ai-level-section mb-4" data-ai-level="${level}">
                <h5 class="ai-section-title"><i class="fas fa-building text-secondary"></i> Analyse exhaustive des ${level}</h5>
                <div class="alert alert-warning">Aucune entité ${level} renseignée dans le périmètre analysé.</div>
            </section>`;
        }
        let top = analysis.rows[0];
        let low = analysis.rows[analysis.rows.length - 1];
        let rowsHtml = analysis.rows.map(row => `<tr data-ai-entity="${aiEscapeHtml(row.name)}">
            <td class="text-center fw-bold">${row.rank}</td>
            <td><strong>${aiEscapeHtml(row.name)}</strong></td>
            <td class="text-center"><span class="badge bg-primary">${aiFormatNumber(row.count)}</span></td>
            <td class="text-center">${aiFormatNumber(row.share, 1)} %</td>
            <td><span class="badge ${row.relative.badge}">${aiEscapeHtml(row.relative.label)}</span><div class="small text-muted mt-1">${aiEscapeHtml(row.relative.detail)}</div></td>
            <td>${aiEscapeHtml(row.dateText)}<div class="small text-muted">${aiFormatNumber(row.activePeriods)} période(s) active(s)</div></td>
            <td><span class="badge ${row.trend.badge}"><i class="fas ${row.trend.icon}"></i> ${aiEscapeHtml(row.trend.label)}</span><div class="small mt-1">${aiEscapeHtml(row.trend.sentence)}</div></td>
            <td>${aiEscapeHtml(row.recommendation)}</td>
        </tr>`).join('');
        return `<section class="ai-level-section mb-4" data-ai-level="${level}">
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
                <h5 class="ai-section-title mb-0"><i class="fas fa-building text-primary"></i> Analyse exhaustive des ${level}</h5>
                <span class="badge bg-dark">${aiFormatNumber(analysis.rows.length)} / ${aiFormatNumber(analysis.rows.length)} entité(s) mentionnée(s)</span>
            </div>
            <p>Le niveau ${level} comprend <strong>${aiFormatNumber(s.entityCount)} entité(s)</strong>. Le volume moyen est de <strong>${aiFormatNumber(s.mean, 1)}</strong> soumission(s) et la médiane de <strong>${aiFormatNumber(s.median, 1)}</strong>. ${s.allEqual ? `Toutes les entités ont un volume identique de ${aiFormatNumber(s.min)} soumission(s).` : `Le volume varie de ${aiFormatNumber(s.min)} à ${aiFormatNumber(s.max)} soumission(s).`} L’entité la plus représentée est <strong>${aiEscapeHtml(top.name)}</strong> avec ${aiFormatNumber(top.count)} soumission(s) ; l’entité située au dernier rang du classement est <strong>${aiEscapeHtml(low.name)}</strong> avec ${aiFormatNumber(low.count)} soumission(s). Ces positions sont relatives aux données chargées et ne constituent pas, à elles seules, une mesure de performance.</p>
            <div class="table-responsive border rounded ai-entity-scroll" style="max-height: 520px; overflow: auto;">
                <table class="table table-sm table-striped table-hover align-middle mb-0 ai-entity-analysis-table">
                    <thead class="table-dark"><tr><th>Rang</th><th>Entité ${level}</th><th>Soumissions</th><th>Part du périmètre</th><th>Position relative</th><th>Couverture temporelle</th><th>Tendance récente</th><th>Interprétation et action proposée</th></tr></thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        </section>`;
    }).join('');

    let priorityRows = [];
    ['DREN', 'CISCO', 'ZAP'].forEach(level => {
        analyses[level].rows.forEach(row => {
            let priority = row.relative.label === 'Volume relatif faible' || row.trend.label === 'Baisse récente' || row.recent === 0;
            if (priority) priorityRows.push({ level, row });
        });
    });
    priorityRows.sort((a, b) => a.row.count - b.row.count || a.level.localeCompare(b.level) || a.row.name.localeCompare(b.row.name, 'fr'));
    let priorityHtml = priorityRows.length
        ? `<ul class="mb-0">${priorityRows.map(item => `<li><strong>${item.level} — ${aiEscapeHtml(item.row.name)}</strong> : ${aiEscapeHtml(item.row.recommendation)}</li>`).join('')}</ul>`
        : `<p class="mb-0">Aucune priorité relative n’a été détectée à partir des volumes et des deux dernières périodes disponibles. Cette absence d’alerte ne remplace pas la comparaison avec les objectifs officiels.</p>`;

    container.innerHTML = `
        <div class="ai-report-v2">
            <div class="ai-report-summary-grid mb-3">
                <div class="ai-report-metric"><span>Formulaires analysés</span><strong>${aiFormatNumber(totalRows)}</strong></div>
                <div class="ai-report-metric"><span>Dates exploitables</span><strong>${aiFormatNumber(datedRowsAll.length)}</strong><small>${aiPercent(datedRowsAll.length, totalRows)} du périmètre · ${aiFormatNumber(datedRows.length)} dans la période temporelle</small></div>
                <div class="ai-report-metric"><span>Entités nommément analysées</span><strong>${aiFormatNumber(namedEntityCount)}</strong><small>DREN + CISCO + ZAP</small></div>
                <div class="ai-report-metric"><span>Granularité temporelle</span><strong>${aiEscapeHtml(aiGranularityLabel(granularity))}</strong><small>${displayMode === 'cumulative' ? 'Affichage cumulé' : 'Affichage détaillé'}</small></div>
            </div>

            <div class="ai-report-callout mb-3">
                <h6><i class="fas fa-lightbulb"></i> Conclusion générale</h6>
                <p class="mb-1">L’analyse porte sur <strong>${aiFormatNumber(totalRows)} soumission(s)</strong>, enregistrée(s) sur la période <strong>${aiEscapeHtml(dateRange)}</strong>. Elle mentionne individuellement les <strong>${aiFormatNumber(analyses.DREN.stats.entityCount)} DREN</strong>, les <strong>${aiFormatNumber(analyses.CISCO.stats.entityCount)} CISCO</strong> et les <strong>${aiFormatNumber(analyses.ZAP.stats.entityCount)} ZAP</strong> présentes dans la base.</p>
                <p class="mb-0">La comparaison temporelle utilise la granularité <strong>${aiEscapeHtml(aiGranularityLabel(granularity))}</strong>. La dernière période est <strong>${aiEscapeHtml(latestLabel)}</strong>${globalBuckets.length > 1 ? ` et elle est comparée à <strong>${aiEscapeHtml(previousLabel)}</strong>` : ''}. Les tendances sont calculées à partir des soumissions propres à chaque période, même lorsque le graphique est présenté en mode cumulé, afin d’éviter qu’une courbe cumulative soit automatiquement interprétée comme une progression réelle. Les volumes globaux par entité portent sur tout le périmètre chargé ; les dates temporelles servent à la comparaison des périodes et aux graphiques.</p>
            </div>

            <section class="mb-4">
                <h5 class="ai-section-title"><i class="fas fa-book-open text-info"></i> Méthode d’interprétation et précautions</h5>
                <ul class="ai-method-list mb-0">
                    <li><strong>Volume :</strong> nombre de formulaires KoboToolbox associés à une entité dans le périmètre courant. Il ne mesure pas directement la qualité ni le taux de réalisation des activités.</li>
                    <li><strong>Part du périmètre :</strong> proportion du nombre total de lignes analysées. Les totaux DREN, CISCO et ZAP sont trois lectures hiérarchiques des mêmes formulaires et ne doivent pas être additionnés.</li>
                    <li><strong>Moyenne, médiane et quartiles :</strong> repères statistiques relatifs aux entités présentes. Ils ne remplacent pas une cible administrative ou un objectif contractuel.</li>
                    <li><strong>Tendance récente :</strong> comparaison des deux dernières périodes ${aiEscapeHtml(aiGranularityLabel(granularity).toLowerCase())} disponibles après application des dates temporelles.</li>
                    <li><strong>Recommandations :</strong> actions de vérification, de relance ou de contrôle. Toute conclusion définitive doit être confrontée aux objectifs, au calendrier de collecte, aux doublons et au contexte local.</li>
                </ul>
            </section>

            <section class="mb-4">
                <h5 class="ai-section-title"><i class="fas fa-scale-balanced text-success"></i> Comparaison globale des trois niveaux</h5>
                <div class="table-responsive border rounded">
                    <table class="table table-sm table-bordered align-middle mb-0 ai-comparison-table">
                        <thead class="table-light"><tr><th>Niveau</th><th>Entités</th><th>Données renseignées</th><th>Non renseignées</th><th>Moyenne</th><th>Médiane</th><th>Part de la 1re entité</th><th>Part des 3 premières</th></tr></thead>
                        <tbody>${comparativeRows}</tbody>
                    </table>
                </div>
            </section>

            ${levelSections}

            <section class="ai-priority-section mb-2">
                <h5 class="ai-section-title"><i class="fas fa-list-check text-danger"></i> Points de vigilance et actions ciblées</h5>
                ${priorityHtml}
            </section>

            <div class="alert alert-warning mt-3 mb-0">
                <strong><i class="fas fa-triangle-exclamation"></i> Limite importante :</strong> une soumission élevée peut provenir d’une activité soutenue, d’un périmètre plus large ou de doublons ; une soumission faible peut provenir d’un retard, d’un problème de connexion, d’un calendrier différent ou d’une absence réelle d’activité. Le rapport propose des signaux de contrôle et non un classement définitif de performance.
            </div>
        </div>`;

    intelligentAnalysisSnapshot = {
        generated_at: getFormattedDateTime(),
        total_rows: totalRows,
        dated_rows: datedRows.length,
        undated_rows: totalRows - datedRowsAll.length,
        temporal_filter: { granularity, granularity_label: aiGranularityLabel(granularity), display_mode: displayMode, start: startValue || null, end: endValue || null, latest_period: latestLabel, previous_period: previousLabel },
        methodology: {
            volume: 'Nombre de formulaires KoboToolbox associés à une entité ; ce volume ne constitue pas une mesure directe de performance.',
            share: 'Part calculée sur le nombre total de lignes analysées.',
            trend: 'Comparaison des deux dernières périodes disponibles avec des volumes non cumulés.',
            caution: 'Les conclusions doivent être confrontées aux objectifs, au contexte local, aux doublons et à la complétude des données.'
        },
        levels: Object.fromEntries(Object.entries(analyses).map(([level, analysis]) => [level, {
            statistics: analysis.stats,
            entities: analysis.rows.map(row => ({
                rank: row.rank,
                name: row.name,
                submissions: row.count,
                share_percent: Number(row.share.toFixed(2)),
                relative_position: row.relative.label,
                first_submission: row.firstDate ? formatISODateUTC(row.firstDate) : null,
                last_submission: row.lastDate ? formatISODateUTC(row.lastDate) : null,
                active_periods: row.activePeriods,
                recent_period_submissions: row.recent,
                previous_period_submissions: row.previous,
                trend: row.trend.label,
                trend_explanation: row.trend.sentence,
                recommendation: row.recommendation
            }))
        }]))
    };
}

function renderAnalysis(data) {
    let totalRows = data.length;
    let freqDren = data.reduce((acc, row) => { let v = cleanSpaces(getKoboValue(row, ['dren'], ['activite', 'produit', 'budget', 'cisco', 'zap', 'sous'])); let k = v || "Non renseigné"; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
    let freqCisco = data.reduce((acc, row) => { let v = cleanSpaces(getKoboValue(row, ['cisco'], ['activite', 'produit', 'budget', 'dren', 'zap', 'sous'])); let k = v || "Non renseigné"; acc[k] = (acc[k] || 0) + 1; return acc; }, {});
    let freqZap = data.reduce((acc, row) => { let v = cleanSpaces(getKoboValue(row, ['zap'], ['activite', 'produit', 'budget', 'dren', 'cisco', 'sous'])); let k = v || "Non renseigné"; acc[k] = (acc[k] || 0) + 1; return acc; }, {});

    renderIntelligentAnalysisReport(data, { DREN: freqDren, CISCO: freqCisco, ZAP: freqZap });

    const popTab = (id, fd) => {
        let tb = $('#'+id).empty(), s = Object.entries(fd).sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0], 'fr'));
        if(s.length===0) tb.append('<tr><td colspan="3" class="text-muted">Vide</td></tr>');
        else s.forEach(([n,c]) => { let p=totalRows ? (c/totalRows*100).toFixed(1)+'%' : '0.0%'; tb.append(`<tr><td><strong>${aiEscapeHtml(n)}</strong></td><td><span class="badge bg-primary fs-6">${c}</span></td><td class="align-middle"><div class="d-flex align-items-center justify-content-center"><span class="me-2" style="width: 45px; font-weight: bold;">${p}</span><div class="progress" style="width: 80px; height: 10px;"><div class="progress-bar bg-info" style="width: ${p};"></div></div></div></td></tr>`); });
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

function getAiInsightsArray() {
    let lines = [];
    let root = document.getElementById('ai-report-content');
    if (!root) return ["Aucune donnée."];
    root.querySelectorAll('h5, h6, p, li, tbody tr').forEach(node => {
        if (node.tagName === 'TR') {
            let cells = Array.from(node.querySelectorAll('th, td')).map(cell => cleanSpaces(cell.textContent)).filter(Boolean);
            if (cells.length) lines.push(cells.join(' | '));
        } else {
            let text = cleanSpaces(node.textContent);
            if (text) lines.push(text);
        }
    });
    return [...new Set(lines)].length ? [...new Set(lines)] : ["Aucune donnée."];
}

function getIntelligentAnalysisStructuredData() {
    return intelligentAnalysisSnapshot ? JSON.parse(JSON.stringify(intelligentAnalysisSnapshot)) : null;
}

function getAnalysisJSONData() {
    let fo = { "titre_plateforme": TITRE_PLATEFORME, "sous_titre": SOUS_TITRE_PLATEFORME, "date_exportation": getFormattedDateTime(), "criteres_locaux": getAnalysisFilters(), "analyse_ia": getAiInsightsArray(), "analyse_ia_structuree": getIntelligentAnalysisStructuredData(), "analyse_dren": [], "analyse_cisco": [], "analyse_zap": [] };
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

    $('#timeline-refresh-btn').on('click', function() { renderSubmissionTimelineCharts(); renderIntelligentAnalysisReport(submissionTimelineSourceData); });
    $('#timeline-reset-btn').on('click', resetSubmissionTimelineControls);
    $('#timeline-granularity, #timeline-top-entities, #timeline-date-start, #timeline-date-end, #timeline-display-mode').on('change', function() { renderSubmissionTimelineCharts(); renderIntelligentAnalysisReport(submissionTimelineSourceData); });
    $(document).on('change', 'input[name="timeline-layout-mode"]', function() { renderIntelligentAnalysisReport(submissionTimelineSourceData); });

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

/* ========================================================================== */
/* EXPORTS FIDÈLES DE L'ONGLET 2 : ANALYSE (WORD DOCX, PDF ET HTML)           */
/* ========================================================================== */
(function () {
    'use strict';

    const REPORT_PAGE = {
        widthMm: 297,
        heightMm: 210,
        marginMm: 7,
        widthEmu: Math.round(10.9 * 914400),
        heightEmu: Math.round(7.35 * 914400)
    };

    const REPORT_SCOPE_LEVELS = ['DREN', 'CISCO', 'ZAP'];
    const REPORT_EXPORT_CSS = `
        :root { color-scheme: light; }
        * { box-sizing: border-box; }
        body { margin: 0; background: #fff; color: #243447; font-family: "Segoe UI", Arial, sans-serif; }
        .analysis-report-root { width: 1180px; margin: 0 auto; padding: 22px; background: #fff; color: #243447; }
        .analysis-export-block { background: #fff; margin: 0 0 22px; padding: 18px; border: 1px solid #d9e2ec; border-radius: 10px; break-inside: avoid; }
        .analysis-report-cover { border-top: 7px solid #0d6efd; }
        .analysis-report-cover h1 { margin: 0 0 8px; color: #1f4e78; font-size: 25px; line-height: 1.3; }
        .analysis-report-cover h2 { margin: 0 0 16px; color: #52606d; font-size: 17px; font-weight: 500; }
        .analysis-report-meta { display: flex; flex-wrap: wrap; gap: 10px; margin: 12px 0 18px; }
        .analysis-report-chip { display: inline-block; padding: 7px 10px; border-radius: 999px; background: #eaf2ff; border: 1px solid #b6d2ff; color: #0b57d0; font-size: 13px; font-weight: 600; }
        .analysis-report-title { color: #1f4e78; border-bottom: 2px solid #9fbad0; padding-bottom: 7px; margin: 0 0 14px; font-size: 22px; }
        .analysis-report-subtitle { color: #2f5597; margin: 0 0 12px; font-size: 18px; }
        .analysis-report-note { color: #52606d; font-size: 13px; line-height: 1.55; }
        .analysis-report-criteria { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; }
        .analysis-report-criteria th, .analysis-report-criteria td { border: 1px solid #cbd5e1; padding: 7px 9px; vertical-align: top; text-align: left; }
        .analysis-report-criteria th { width: 39%; background: #eef4fb; color: #243b53; }
        .analysis-report-root h1, .analysis-report-root h2, .analysis-report-root h3, .analysis-report-root h4, .analysis-report-root h5, .analysis-report-root h6 { break-after: avoid; }
        .analysis-report-root h3 { color: #1f4e78; margin-top: 0; }
        .analysis-report-root h4 { color: #2f5597; }
        .analysis-report-root p, .analysis-report-root li { line-height: 1.5; }
        .analysis-report-root table { width: 100% !important; border-collapse: collapse !important; table-layout: auto !important; font-size: 11px !important; }
        .analysis-report-root th, .analysis-report-root td { border: 1px solid #cfd8e3 !important; padding: 6px 7px !important; white-space: normal !important; overflow-wrap: anywhere !important; vertical-align: top !important; }
        .analysis-report-root th { background: #34495e !important; color: #fff !important; }
        .analysis-report-root tbody tr:nth-child(even) { background: #f8fafc; }
        .analysis-report-root .table-responsive,
        .analysis-report-root .adv-table-responsive,
        .analysis-report-root .timeline-chart-scroll,
        .analysis-report-root [style*="overflow-y"],
        .analysis-report-root [style*="overflow-x"] { max-height: none !important; overflow: visible !important; }
        .analysis-report-root .timeline-chart-stage { width: 100% !important; min-width: 0 !important; height: auto !important; }
        .analysis-report-root .timeline-grouped-layout { display: block !important; }
        .analysis-report-root .timeline-html-legend { max-height: none !important; overflow: visible !important; margin-top: 12px; display: flex; flex-wrap: wrap; gap: 8px; }
        .analysis-report-root .timeline-html-legend button,
        .analysis-report-root .timeline-html-legend .timeline-legend-item { display: inline-flex; align-items: center; gap: 5px; border: 1px solid #d7dde5; background: #fff; border-radius: 5px; padding: 4px 7px; font-size: 11px; }
        .analysis-report-root .report-chart-image { display: block; width: 100%; height: auto; max-height: none; object-fit: contain; background: #fff; border: 1px solid #d7dde5; border-radius: 6px; }
        .analysis-report-root .report-image-placeholder { min-height: 120px; display: flex; align-items: center; justify-content: center; padding: 15px; border: 1px dashed #9aa5b1; color: #627d98; background: #f7f9fb; text-align: center; }
        .analysis-report-root .timeline-chart-card,
        .analysis-report-root .adv-analysis-card,
        .analysis-report-root .analysis-card { box-shadow: none !important; break-inside: avoid; }
        .analysis-report-root .ai-insights { box-shadow: none !important; break-inside: auto; }
        .analysis-report-root .ai-report-summary-grid { display: grid !important; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
        .analysis-report-root .ai-report-metric { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; background: #f8fbff; }
        .analysis-report-root .ai-report-metric span { display: block; color: #52606d; font-size: 10px; font-weight: 700; text-transform: uppercase; }
        .analysis-report-root .ai-report-metric strong { display: block; color: #1f4e78; font-size: 19px; margin-top: 3px; }
        .analysis-report-root .ai-report-metric small { color: #627d98; font-size: 10px; }
        .analysis-report-root .ai-report-callout { border: 1px solid #b8d8ee; border-left: 5px solid #2980b9; background: #f5fbff; border-radius: 7px; padding: 12px; }
        .analysis-report-root .ai-level-section { border: 1px solid #d9e2ec; border-radius: 8px; padding: 12px; margin-bottom: 16px; break-inside: auto; }
        .analysis-report-root .ai-entity-analysis-table { font-size: 9px !important; }
        .analysis-report-root .ai-entity-analysis-table tbody tr { break-inside: avoid; }
        .analysis-report-root .ai-priority-section { border-left: 5px solid #e67e22; background: #fff8e6; border-radius: 7px; padding: 12px; }
        .analysis-report-root .timeline-individual-grid { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
        .analysis-report-root .timeline-individual-grid > * { width: auto !important; max-width: none !important; }
        .analysis-report-root .nav, .analysis-report-root .dropdown-menu,
        .analysis-report-root .btn, .analysis-report-root button,
        .analysis-report-root .adv-chart-export-toolbar,
        .analysis-report-root .timeline-export-status,
        .analysis-report-root .timeline-pagination-controls { display: none !important; }
        .analysis-report-root input, .analysis-report-root select, .analysis-report-root textarea { opacity: 1 !important; color: #243447 !important; background: #f8fafc !important; border: 1px solid #cbd5e1 !important; }
        .analysis-report-root .tab-pane { display: block !important; opacity: 1 !important; visibility: visible !important; margin-top: 18px; }
        .analysis-report-root .report-pane-heading { margin: 20px 0 12px; padding: 9px 12px; background: #eef4fb; border-left: 5px solid #0d6efd; color: #1f4e78; font-size: 19px; }
        .analysis-report-root .alert { border: 1px solid #b8c4ce; padding: 10px 12px; border-radius: 6px; }
        .analysis-report-root img { max-width: 100%; height: auto; }
        .analysis-report-footer { text-align: center; color: #7b8794; border-top: 1px solid #d9e2ec; padding-top: 12px; font-size: 11px; }
        @media print {
            @page { size: A4 landscape; margin: 8mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .analysis-export-block { break-inside: avoid; }
        }
    `;

    function reportEscapeHtml(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function reportEscapeXml(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    }

    function reportSafeFilename(value) {
        return String(value || 'rapport').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100) || 'rapport';
    }

    function reportTimestamp() {
        const d = new Date();
        return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
    }

    function reportFilename(scope, extension) {
        const label = scope === 'ALL' ? 'analyse_complete' : `analyse_${String(scope).toLowerCase()}`;
        return `${reportSafeFilename(label)}_${reportTimestamp()}_kobo.${extension}`;
    }

    function setReportExportStatus(message, type) {
        const status = document.getElementById('timeline-export-status');
        if (!status) return;
        status.className = `alert alert-${type || 'info'} py-2 px-3 timeline-export-status`;
        status.textContent = message;
        status.classList.remove('d-none');
    }

    function clearReportExportStatusLater() {
        setTimeout(function () {
            const status = document.getElementById('timeline-export-status');
            if (status) status.classList.add('d-none');
        }, 7000);
    }

    function reportDownload(blob, filename) {
        if (typeof downloadFile === 'function') {
            downloadFile(blob, filename);
            return;
        }
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
    }

    function selectedOptionText(id, fallback) {
        const el = document.getElementById(id);
        if (!el) return fallback || '';
        if (el.tagName === 'SELECT') return el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : (fallback || '');
        return el.value || fallback || '';
    }

    function selectedTimelineLayout() {
        const checked = document.querySelector('input[name="timeline-layout-mode"]:checked');
        return checked ? checked.value : 'grouped';
    }

    function scopeLabel(scope) {
        return scope === 'ALL' ? 'DREN, CISCO et ZAP' : String(scope || 'ALL');
    }

    function reportCriteria(scope) {
        const criteria = {
            'Date de génération': typeof getFormattedDateTime === 'function' ? getFormattedDateTime() : new Date().toLocaleString('fr-FR'),
            'Périmètre du rapport': scopeLabel(scope),
            'Période d’agrégation': selectedOptionText('timeline-granularity', 'Jour'),
            'Type de données temporelles': selectedOptionText('timeline-display-mode', 'Données détaillées'),
            'Organisation des graphiques': selectedTimelineLayout() === 'individual' ? 'Affichage individuel' : 'Affichage groupé',
            'Entités du graphique groupé': selectedOptionText('timeline-top-entities', 'Top 10'),
            'Date de début temporelle': document.getElementById('timeline-date-start')?.value || 'Première date disponible',
            'Date de fin temporelle': document.getElementById('timeline-date-end')?.value || 'Dernière date disponible'
        };
        if (typeof getCurrentFilters === 'function') {
            try {
                const main = getCurrentFilters();
                Object.keys(main || {}).forEach(key => { criteria[`Filtre principal — ${key}`] = main[key]; });
            } catch (error) { console.warn('Lecture des filtres principaux impossible :', error); }
        }
        if (typeof getAnalysisFilters === 'function') {
            try {
                const local = getAnalysisFilters();
                Object.keys(local || {}).forEach(key => { criteria[`Filtre local Analyse — ${key}`] = local[key]; });
            } catch (error) { console.warn('Lecture des filtres locaux impossible :', error); }
        }
        if (typeof window.getAdvancedAnalysisExportSnapshot === 'function') {
            try {
                const advanced = window.getAdvancedAnalysisExportSnapshot();
                Object.keys(advanced?.filters || {}).forEach(key => { criteria[`Analyse complémentaire — ${key}`] = advanced.filters[key]; });
                if (advanced && Number.isFinite(advanced.filtered_count)) criteria['Lignes du sous-module complémentaire'] = advanced.filtered_count;
            } catch (error) { console.warn('Lecture des critères avancés impossible :', error); }
        }
        return criteria;
    }

    function criteriaTable(criteria) {
        const rows = Object.entries(criteria).map(([key, value]) => `<tr><th>${reportEscapeHtml(key)}</th><td>${reportEscapeHtml(value)}</td></tr>`).join('');
        return `<table class="analysis-report-criteria"><tbody>${rows}</tbody></table>`;
    }

    async function waitForReportPaint(delay) {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    }

    async function ensureChartsReadyForReport() {
        const advancedPanes = Array.from(document.querySelectorAll('#analyse .adv-module-container .tab-pane'));
        const saved = advancedPanes.map(pane => ({ pane, style: pane.getAttribute('style'), className: pane.className }));
        try {
            advancedPanes.forEach(pane => {
                pane.style.display = 'block';
                pane.style.visibility = 'visible';
                pane.classList.add('show', 'active');
            });
            if (typeof renderSubmissionTimelineCharts === 'function') {
                try { renderSubmissionTimelineCharts(); } catch (error) { console.warn('Actualisation temporelle partielle :', error); }
            }
            if (typeof window.getAdvancedAnalysisExportSnapshot === 'function') {
                try { window.getAdvancedAnalysisExportSnapshot(); } catch (error) { console.warn('Actualisation avancée partielle :', error); }
            }
            await waitForReportPaint(250);
            document.querySelectorAll('#analyse canvas').forEach(canvas => {
                try {
                    const chart = window.Chart && typeof Chart.getChart === 'function' ? Chart.getChart(canvas) : null;
                    if (chart) {
                        chart.resize();
                        chart.update('none');
                    }
                } catch (error) { /* Un graphique isolé ne doit pas bloquer le rapport. */ }
            });
            await waitForReportPaint(150);
        } finally {
            saved.forEach(item => {
                item.pane.className = item.className;
                if (item.style === null) item.pane.removeAttribute('style');
                else item.pane.setAttribute('style', item.style);
            });
        }
    }

    function cloneWithLiveControlValues(source) {
        const clone = source.cloneNode(true);
        const sourceControls = source.querySelectorAll('input, select, textarea');
        const cloneControls = clone.querySelectorAll('input, select, textarea');
        sourceControls.forEach((control, index) => {
            const target = cloneControls[index];
            if (!target) return;
            if (control.tagName === 'SELECT') {
                target.value = control.value;
                Array.from(target.options).forEach(option => { option.selected = option.value === control.value; });
            } else if (control.type === 'checkbox' || control.type === 'radio') {
                target.checked = control.checked;
                if (control.checked) target.setAttribute('checked', 'checked');
                else target.removeAttribute('checked');
            } else {
                target.value = control.value;
                target.setAttribute('value', control.value);
                if (target.tagName === 'TEXTAREA') target.textContent = control.value;
            }
            target.disabled = true;
        });
        return clone;
    }

    function serializableChartOptions(chart) {
        let options = {};
        try { options = JSON.parse(JSON.stringify(chart.options || {})); } catch (error) { options = {}; }
        options.responsive = false;
        options.maintainAspectRatio = false;
        options.animation = false;
        if (!options.plugins) options.plugins = {};
        if (!options.plugins.legend) options.plugins.legend = {};
        options.plugins.legend.display = options.plugins.legend.display !== false;
        return options;
    }

    function canvasHasVisiblePixels(canvas) {
        try {
            if (!canvas || canvas.width < 2 || canvas.height < 2) return false;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            const stepX = Math.max(1, Math.floor(canvas.width / 18));
            const stepY = Math.max(1, Math.floor(canvas.height / 12));
            for (let y = 0; y < canvas.height; y += stepY) {
                for (let x = 0; x < canvas.width; x += stepX) {
                    const pixel = context.getImageData(x, y, 1, 1).data;
                    if (pixel[3] > 8 && (pixel[0] < 248 || pixel[1] < 248 || pixel[2] < 248)) return true;
                }
            }
        } catch (error) { return true; }
        return false;
    }

    function chartCanvasDataUrl(canvas) {
        try {
            if (canvas.width > 80 && canvas.height > 80 && canvasHasVisiblePixels(canvas)) {
                const direct = canvas.toDataURL('image/png', 1);
                if (direct && direct.length > 500) return direct;
            }
        } catch (error) { /* Essayer un rendu de remplacement. */ }
        try {
            const chart = window.Chart && typeof Chart.getChart === 'function' ? Chart.getChart(canvas) : null;
            if (!chart) return null;
            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = 1500;
            exportCanvas.height = 720;
            const config = {
                type: chart.config.type,
                data: JSON.parse(JSON.stringify(chart.data || { labels: [], datasets: [] })),
                options: serializableChartOptions(chart)
            };
            const exportChart = new Chart(exportCanvas.getContext('2d'), config);
            exportChart.update('none');
            const url = exportCanvas.toDataURL('image/png', 1);
            exportChart.destroy();
            return url;
        } catch (error) {
            console.warn('Conversion du graphique impossible :', error);
            return null;
        }
    }

    function replaceClonedCanvases(source, clone) {
        const sourceCanvases = source.querySelectorAll('canvas');
        const cloneCanvases = clone.querySelectorAll('canvas');
        sourceCanvases.forEach((canvas, index) => {
            const target = cloneCanvases[index];
            if (!target) return;
            const url = chartCanvasDataUrl(canvas);
            if (url) {
                const image = document.createElement('img');
                image.className = 'report-chart-image';
                image.src = url;
                image.alt = canvas.getAttribute('aria-label') || canvas.id || `Graphique ${index + 1}`;
                target.replaceWith(image);
            } else {
                const placeholder = document.createElement('div');
                placeholder.className = 'report-image-placeholder';
                placeholder.textContent = `Le graphique « ${canvas.getAttribute('aria-label') || canvas.id || index + 1} » n’a pas pu être rendu.`;
                target.replaceWith(placeholder);
            }
        });
    }

    function removeReportActions(root) {
        root.querySelectorAll('.dropdown-menu, .btn-group, .adv-chart-export-toolbar, .timeline-export-status').forEach(el => el.remove());
        root.querySelectorAll('button').forEach(el => el.remove());
        root.querySelectorAll('[onclick]').forEach(el => el.removeAttribute('onclick'));
        root.querySelectorAll('input[type="file"]').forEach(el => {
            const note = document.createElement('span');
            note.className = 'analysis-report-note';
            note.textContent = 'Commande d’importation disponible sur la plateforme Web.';
            el.replaceWith(note);
        });
    }

    function removeOtherLevels(root, scope) {
        if (scope === 'ALL') return;
        const keep = String(scope).toLowerCase();
        REPORT_SCOPE_LEVELS.filter(level => level !== scope).forEach(level => {
            const low = level.toLowerCase();
            root.querySelectorAll(`[id*="${low}"]`).forEach(el => {
                if (el.closest(`#timeline-card-${keep}`)) return;
                const levelColumn = el.closest('.col-md-4, .col-lg-4, .col-xl-4');
                if (levelColumn && /DREN|CISCO|ZAP/i.test(levelColumn.textContent || '')) levelColumn.remove();
                else if (el.id && (el.id.startsWith('timeline-card-') || el.id.includes(`-${low}-`))) el.remove();
            });
        });
        root.querySelectorAll('.timeline-chart-card').forEach(card => {
            if (String(card.dataset.level || '').toLowerCase() !== keep) card.remove();
        });
        root.querySelectorAll('[id$="-summary-table-container"]').forEach(table => {
            if (!table.id.startsWith(keep)) {
                const col = table.closest('.col-md-4');
                if (col) col.remove();
            }
        });
    }

    function normalizeReportVisibility(root) {
        const layout = selectedTimelineLayout();
        if (layout === 'individual') root.querySelectorAll('.timeline-grouped-view').forEach(el => el.remove());
        else root.querySelectorAll('.timeline-individual-view').forEach(el => el.remove());

        root.querySelectorAll('.timeline-empty-state, .timeline-empty-individual').forEach(el => {
            const source = el.id ? document.getElementById(el.id) : null;
            if (source && getComputedStyle(source).display === 'none') el.remove();
        });

        const paneTitles = {
            'adv-data-view': '1. Données et filtres complémentaires',
            'adv-kmeans-view': '2. Intelligence artificielle K-Means',
            'adv-jenks-view': '3. Intelligence artificielle Jenks',
            'adv-dbscan-view': '4. Intelligence artificielle DBSCAN — anomalies'
        };
        root.querySelectorAll('.adv-module-container .nav').forEach(el => el.remove());
        root.querySelectorAll('.adv-module-container .tab-pane').forEach(pane => {
            pane.classList.remove('fade');
            pane.classList.add('show', 'active');
            pane.style.display = 'block';
            pane.style.opacity = '1';
            const heading = document.createElement('h3');
            heading.className = 'report-pane-heading';
            heading.textContent = paneTitles[pane.id] || pane.id;
            pane.parentNode.insertBefore(heading, pane);
        });
        root.querySelectorAll('.table-responsive, .adv-table-responsive, .timeline-chart-scroll').forEach(el => {
            el.style.maxHeight = 'none';
            el.style.overflow = 'visible';
        });
        root.querySelectorAll('[style*="max-height"]').forEach(el => { el.style.maxHeight = 'none'; });
        root.querySelectorAll('[style*="overflow"]').forEach(el => { el.style.overflow = 'visible'; });
    }

    function addReportBlock(root, content, className) {
        if (!content) return null;
        const block = document.createElement('section');
        block.className = `analysis-export-block ${className || ''}`.trim();
        block.appendChild(content);
        root.appendChild(block);
        return block;
    }

    function cloneElementForReport(source) {
        if (!source) return null;
        const clone = cloneWithLiveControlValues(source);
        replaceClonedCanvases(source, clone);
        removeReportActions(clone);
        normalizeReportVisibility(clone);
        return clone;
    }

    async function createAnalysisReportRoot(scope) {
        scope = REPORT_SCOPE_LEVELS.includes(scope) ? scope : 'ALL';
        await ensureChartsReadyForReport();
        const source = document.getElementById('analyse');
        if (!source) throw new Error("L’onglet Analyse n’a pas été trouvé.");

        const root = document.createElement('main');
        root.className = 'analysis-report-root';
        root.dataset.scope = scope;

        const cover = document.createElement('section');
        cover.className = 'analysis-export-block analysis-report-cover';
        const criteria = reportCriteria(scope);
        cover.innerHTML = `
            <h1>${reportEscapeHtml(typeof TITRE_PLATEFORME !== 'undefined' ? TITRE_PLATEFORME : 'Rapport analytique KoboToolbox')}</h1>
            <h2>${reportEscapeHtml(typeof SOUS_TITRE_PLATEFORME !== 'undefined' ? SOUS_TITRE_PLATEFORME : 'Données et analyses')}</h2>
            <div class="analysis-report-meta">
                <span class="analysis-report-chip">Onglet 2 : Analyse</span>
                <span class="analysis-report-chip">Périmètre : ${reportEscapeHtml(scopeLabel(scope))}</span>
                <span class="analysis-report-chip">Rapport fidèle à l’affichage Web</span>
            </div>
            <h3 class="analysis-report-title">Critères, réglages et contexte de l’affichage</h3>
            <p class="analysis-report-note">Ce rapport reprend les textes explicatifs, valeurs sélectionnées, indicateurs, tableaux, légendes, graphiques et images disponibles dans l’onglet Analyse au moment de l’exportation. Les boutons interactifs sont volontairement retirés du document.</p>
            ${criteriaTable(criteria)}
        `;
        root.appendChild(cover);

        const topHeader = source.children[0] ? cloneElementForReport(source.children[0]) : null;
        if (topHeader) addReportBlock(root, topHeader, 'analysis-report-heading-block');

        const ai = cloneElementForReport(document.getElementById('ai-report-container'));
        if (ai) addReportBlock(root, ai, 'analysis-report-ai-block');

        const timelineSource = source.querySelector('.submission-timeline-panel');
        if (timelineSource) {
            const timelineClone = cloneElementForReport(timelineSource);
            removeOtherLevels(timelineClone, scope);
            const cards = Array.from(timelineClone.querySelectorAll('.timeline-chart-card'));
            cards.forEach(card => card.remove());
            addReportBlock(root, timelineClone, 'analysis-report-timeline-intro');
            const selectedCards = Array.from(timelineSource.querySelectorAll('.timeline-chart-card')).filter(card => scope === 'ALL' || card.dataset.level === scope);
            selectedCards.forEach(card => {
                const cardClone = cloneElementForReport(card);
                addReportBlock(root, cardClone, `analysis-report-timeline-${String(card.dataset.level || '').toLowerCase()}`);
            });
        }

        const summaryRow = Array.from(source.children).find(el => el.classList && el.classList.contains('row'));
        if (summaryRow) {
            const summaryClone = cloneElementForReport(summaryRow);
            removeOtherLevels(summaryClone, scope);
            addReportBlock(root, summaryClone, 'analysis-report-summary-tables');
        }

        const advancedSource = source.querySelector('.advanced-analysis-final-section');
        if (advancedSource) {
            const advancedClone = cloneElementForReport(advancedSource);
            removeOtherLevels(advancedClone, scope);
            const module = advancedClone.querySelector('.adv-module-container');
            if (module) {
                const panes = Array.from(module.querySelectorAll('.tab-pane'));
                panes.forEach(pane => pane.remove());
                module.querySelectorAll('.report-pane-heading').forEach(h => h.remove());
            }
            addReportBlock(root, advancedClone, 'analysis-report-advanced-intro');

            const sourcePanes = Array.from(advancedSource.querySelectorAll('.adv-module-container .tab-pane'));
            const paneTitleMap = {
                'adv-data-view': '1. Données et filtres complémentaires',
                'adv-kmeans-view': '2. Intelligence artificielle K-Means',
                'adv-jenks-view': '3. Intelligence artificielle Jenks',
                'adv-dbscan-view': '4. Intelligence artificielle DBSCAN — anomalies'
            };
            sourcePanes.forEach(pane => {
                const paneClone = cloneElementForReport(pane);
                removeOtherLevels(paneClone, scope);
                const wrapper = document.createElement('div');
                const heading = document.createElement('h3');
                heading.className = 'analysis-report-title';
                heading.textContent = paneTitleMap[pane.id] || pane.id;
                wrapper.appendChild(heading);
                wrapper.appendChild(paneClone);
                addReportBlock(root, wrapper, `analysis-report-pane-${pane.id}`);
            });
        }

        const footer = document.createElement('footer');
        footer.className = 'analysis-export-block analysis-report-footer';
        footer.innerHTML = `Rapport généré depuis l’onglet « 2 : Analyse » — ${reportEscapeHtml(criteria['Date de génération'])}.`;
        root.appendChild(footer);
        return root;
    }

    async function inlineReportImages(root) {
        const images = Array.from(root.querySelectorAll('img'));
        for (const image of images) {
            const src = image.getAttribute('src') || '';
            if (!src || src.startsWith('data:') || src.startsWith('blob:')) continue;
            try {
                const response = await fetch(src, { mode: 'cors', credentials: 'omit' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const blob = await response.blob();
                const dataUrl = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
                image.src = dataUrl;
            } catch (error) {
                image.setAttribute('data-original-src', src);
                image.title = `${image.title || image.alt || 'Image'} — source externe : ${src}`;
            }
        }
    }

    function reportHtmlDocument(root) {
        return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rapport complet — Onglet Analyse</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
<link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
<style>${REPORT_EXPORT_CSS}</style>
</head>
<body>${root.outerHTML}</body>
</html>`;
    }

    async function waitForReportImages(root) {
        const images = Array.from(root.querySelectorAll('img'));
        await Promise.all(images.map(image => {
            if (image.complete && image.naturalWidth > 0) return Promise.resolve();
            return new Promise(resolve => {
                const done = () => resolve();
                image.addEventListener('load', done, { once: true });
                image.addEventListener('error', done, { once: true });
                setTimeout(done, 12000);
            });
        }));
    }

    function attachRootForCapture(root) {
        const host = document.createElement('div');
        host.style.position = 'fixed';
        host.style.left = '-15000px';
        host.style.top = '0';
        host.style.width = '1220px';
        host.style.zIndex = '-1000';
        host.style.background = '#fff';
        const style = document.createElement('style');
        style.textContent = REPORT_EXPORT_CSS;
        host.appendChild(style);
        host.appendChild(root);
        document.body.appendChild(host);
        return host;
    }

    function tableChunkBlocks(block, rowsPerChunk) {
        const table = block.querySelector('table');
        const tbody = table && table.querySelector('tbody');
        if (!tbody) return [block];
        const rows = Array.from(tbody.querySelectorAll(':scope > tr'));
        if (rows.length <= rowsPerChunk) return [block];
        const chunks = [];
        for (let start = 0; start < rows.length; start += rowsPerChunk) {
            const clone = block.cloneNode(true);
            const cloneBody = clone.querySelector('table tbody');
            const cloneRows = Array.from(cloneBody.querySelectorAll(':scope > tr'));
            cloneRows.forEach((row, index) => {
                if (index < start || index >= start + rowsPerChunk) row.remove();
            });
            const marker = document.createElement('p');
            marker.className = 'analysis-report-note';
            marker.textContent = `Lignes ${start + 1} à ${Math.min(start + rowsPerChunk, rows.length)} sur ${rows.length}`;
            clone.insertBefore(marker, clone.firstChild);
            chunks.push(clone);
        }
        return chunks;
    }

    async function captureReportCanvases(scope) {
        if (typeof window.html2canvas !== 'function') throw new Error('La bibliothèque de capture HTML n’est pas disponible. Rechargez la page puis recommencez.');
        const root = await createAnalysisReportRoot(scope);
        await inlineReportImages(root);
        const host = attachRootForCapture(root);
        try {
            await waitForReportImages(root);
            await waitForReportPaint(350);
            let blocks = Array.from(root.querySelectorAll(':scope > .analysis-export-block'));
            const expanded = [];
            blocks.forEach(block => tableChunkBlocks(block, 34).forEach(chunk => expanded.push(chunk)));
            const canvases = [];
            for (let index = 0; index < expanded.length; index++) {
                const block = expanded[index];
                let captureNode = block;
                let temporary = false;
                if (!block.isConnected) {
                    root.appendChild(block);
                    captureNode = block;
                    temporary = true;
                }
                setReportExportStatus(`Préparation du rapport : élément ${index + 1} / ${expanded.length}…`, 'info');
                await waitForReportPaint(80);
                const canvas = await html2canvas(captureNode, {
                    backgroundColor: '#ffffff',
                    scale: 1.35,
                    useCORS: true,
                    allowTaint: false,
                    logging: false,
                    imageTimeout: 15000,
                    windowWidth: 1240,
                    scrollX: 0,
                    scrollY: 0
                });
                canvases.push(canvas);
                if (temporary) block.remove();
            }
            return canvases;
        } finally {
            host.remove();
        }
    }

    function splitCanvasIntoLandscapePages(canvas) {
        const contentRatio = (REPORT_PAGE.widthMm - 2 * REPORT_PAGE.marginMm) / (REPORT_PAGE.heightMm - 2 * REPORT_PAGE.marginMm);
        const maxSliceHeight = Math.max(1, Math.floor(canvas.width / contentRatio));
        const pages = [];
        for (let y = 0; y < canvas.height; y += maxSliceHeight) {
            const height = Math.min(maxSliceHeight, canvas.height - y);
            const pageCanvas = document.createElement('canvas');
            pageCanvas.width = canvas.width;
            pageCanvas.height = height;
            const context = pageCanvas.getContext('2d');
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
            context.drawImage(canvas, 0, y, canvas.width, height, 0, 0, canvas.width, height);
            pages.push(pageCanvas);
        }
        return pages;
    }

    function allReportPages(canvases) {
        const pages = [];
        canvases.forEach(canvas => splitCanvasIntoLandscapePages(canvas).forEach(page => pages.push(page)));
        return pages;
    }

    function dataUrlBytes(dataUrl) {
        const base64 = String(dataUrl).split(',')[1] || '';
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    async function buildDocxFromPages(pages, scope) {
        if (typeof window.JSZip !== 'function') throw new Error('JSZip est indisponible : le document Word ne peut pas être créé.');
        const zip = new JSZip();
        const now = new Date().toISOString();
        const images = [];
        const relations = [];
        const paragraphs = [];

        pages.forEach((canvas, index) => {
            const imageNumber = index + 1;
            const relationshipId = `rId${imageNumber + 1}`;
            const dataUrl = canvas.toDataURL('image/png', 1);
            images.push({ name: `image${imageNumber}.png`, bytes: dataUrlBytes(dataUrl) });
            relations.push(`<Relationship Id="${relationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${imageNumber}.png"/>`);

            const ratio = canvas.height / canvas.width;
            let cx = REPORT_PAGE.widthEmu;
            let cy = Math.round(cx * ratio);
            if (cy > REPORT_PAGE.heightEmu) {
                cy = REPORT_PAGE.heightEmu;
                cx = Math.round(cy / ratio);
            }
            paragraphs.push(`
                <w:p>
                    <w:pPr><w:jc w:val="center"/><w:spacing w:after="0"/></w:pPr>
                    <w:r><w:drawing>
                        <wp:inline distT="0" distB="0" distL="0" distR="0">
                            <wp:extent cx="${cx}" cy="${cy}"/>
                            <wp:docPr id="${imageNumber}" name="Page ${imageNumber}" descr="Rapport Analyse — ${reportEscapeXml(scopeLabel(scope))}"/>
                            <wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>
                            <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
                                <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                                    <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                                        <pic:nvPicPr><pic:cNvPr id="0" name="image${imageNumber}.png"/><pic:cNvPicPr/></pic:nvPicPr>
                                        <pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
                                        <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
                                    </pic:pic>
                                </a:graphicData>
                            </a:graphic>
                        </wp:inline>
                    </w:drawing></w:r>
                </w:p>${imageNumber < pages.length ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : ''}`);
        });

        zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`);

        zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);

        zip.folder('docProps').file('core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>Rapport complet de l’onglet Analyse</dc:title><dc:subject>${reportEscapeXml(scopeLabel(scope))}</dc:subject><dc:creator>Plateforme KoboToolbox PMA</dc:creator><cp:lastModifiedBy>Plateforme KoboToolbox PMA</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`);
        zip.folder('docProps').file('app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Plateforme KoboToolbox PMA</Application><Pages>${pages.length}</Pages><Company></Company><AppVersion>1.0</AppVersion></Properties>`);

        const word = zip.folder('word');
        word.file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${paragraphs.join('')}<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="397" w:right="397" w:bottom="397" w:left="397" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`);
        word.file('styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="20"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr/></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`);
        word.file('settings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="100"/><w:compat/></w:settings>`);
        word.folder('_rels').file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${relations.join('')}</Relationships>`);
        const media = word.folder('media');
        images.forEach(image => media.file(image.name, image.bytes));
        return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    }

    async function buildPdfFromPages(pages, scope) {
        if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('La bibliothèque PDF n’est pas disponible. Rechargez la page puis recommencez.');
        const jsPDF = window.jspdf.jsPDF;
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
        pages.forEach((canvas, index) => {
            if (index > 0) pdf.addPage('a4', 'landscape');
            const maxW = REPORT_PAGE.widthMm - 2 * REPORT_PAGE.marginMm;
            const maxH = REPORT_PAGE.heightMm - 2 * REPORT_PAGE.marginMm;
            const ratio = canvas.height / canvas.width;
            let width = maxW;
            let height = width * ratio;
            if (height > maxH) {
                height = maxH;
                width = height / ratio;
            }
            const x = (REPORT_PAGE.widthMm - width) / 2;
            const y = REPORT_PAGE.marginMm;
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', x, y, width, height, undefined, 'FAST');
        });
        pdf.setProperties({
            title: 'Rapport complet de l’onglet Analyse',
            subject: scopeLabel(scope),
            author: 'Plateforme KoboToolbox PMA',
            creator: 'Plateforme KoboToolbox PMA'
        });
        return pdf.output('blob');
    }

    async function createWordBlob(scope) {
        const canvases = await captureReportCanvases(scope);
        const pages = allReportPages(canvases);
        if (!pages.length) throw new Error('Aucune page n’a pu être créée.');
        setReportExportStatus(`Création du document Word (${pages.length} page(s))…`, 'info');
        return buildDocxFromPages(pages, scope);
    }

    async function createPdfBlob(scope) {
        const canvases = await captureReportCanvases(scope);
        const pages = allReportPages(canvases);
        if (!pages.length) throw new Error('Aucune page n’a pu être créée.');
        setReportExportStatus(`Création du PDF (${pages.length} page(s))…`, 'info');
        return buildPdfFromPages(pages, scope);
    }

    window.exportTimelineWord = async function (scope) {
        scope = REPORT_SCOPE_LEVELS.includes(scope) ? scope : 'ALL';
        try {
            setReportExportStatus('Préparation du rapport Word fidèle à la page Web…', 'info');
            const blob = await createWordBlob(scope);
            reportDownload(blob, reportFilename(scope, 'docx'));
            setReportExportStatus('Rapport Word DOCX créé avec les textes, tableaux, graphiques et images de l’onglet Analyse.', 'success');
        } catch (error) {
            console.error('Export Word complet impossible :', error);
            setReportExportStatus(`Échec de l’export Word : ${error.message}`, 'danger');
            alert(`Impossible de créer le rapport Word complet : ${error.message}`);
        } finally { clearReportExportStatusLater(); }
    };

    window.exportAnalysisToPDF = async function (scope) {
        scope = REPORT_SCOPE_LEVELS.includes(scope) ? scope : 'ALL';
        try {
            setReportExportStatus('Préparation du rapport PDF fidèle à la page Web…', 'info');
            const blob = await createPdfBlob(scope);
            reportDownload(blob, reportFilename(scope, 'pdf'));
            setReportExportStatus('Rapport PDF créé avec les textes, tableaux, graphiques et images de l’onglet Analyse.', 'success');
        } catch (error) {
            console.error('Export PDF complet impossible :', error);
            setReportExportStatus(`Échec de l’export PDF : ${error.message}`, 'danger');
            alert(`Impossible de créer le rapport PDF complet : ${error.message}`);
        } finally { clearReportExportStatusLater(); }
    };

    window.exportAnalysisToHTML = async function (prefix, scope) {
        scope = REPORT_SCOPE_LEVELS.includes(scope) ? scope : 'ALL';
        try {
            setReportExportStatus('Préparation du rapport HTML autonome et complet…', 'info');
            const root = await createAnalysisReportRoot(scope);
            await inlineReportImages(root);
            const html = reportHtmlDocument(root);
            const filename = `${reportSafeFilename(prefix || (scope === 'ALL' ? 'analyse_complete' : `analyse_${scope.toLowerCase()}`))}_${reportTimestamp()}_kobo.html`;
            reportDownload(new Blob(['\uFEFF' + html], { type: 'text/html;charset=utf-8' }), filename);
            setReportExportStatus('Rapport HTML complet créé. Les graphiques sont intégrés comme images et les détails textuels sont conservés.', 'success');
        } catch (error) {
            console.error('Export HTML complet impossible :', error);
            setReportExportStatus(`Échec de l’export HTML : ${error.message}`, 'danger');
            alert(`Impossible de créer le rapport HTML complet : ${error.message}`);
        } finally { clearReportExportStatusLater(); }
    };

    function reportCanvasEntries(scope) {
        const analyse = document.getElementById('analyse');
        if (!analyse) return [];
        return Array.from(analyse.querySelectorAll('canvas')).filter(canvas => {
            if (scope === 'ALL') return true;
            const text = `${canvas.id} ${canvas.getAttribute('aria-label') || ''}`.toUpperCase();
            return text.includes(scope);
        }).map((canvas, index) => ({
            name: reportSafeFilename(canvas.getAttribute('aria-label') || canvas.id || `graphique_${index + 1}`),
            dataUrl: chartCanvasDataUrl(canvas)
        })).filter(entry => entry.dataUrl);
    }

    window.exportTimelineImages = async function (scope, format) {
        scope = REPORT_SCOPE_LEVELS.includes(scope) ? scope : 'ALL';
        format = String(format || 'png').toLowerCase() === 'jpeg' ? 'jpeg' : 'png';
        try {
            await ensureChartsReadyForReport();
            const entries = reportCanvasEntries(scope);
            if (!entries.length) throw new Error('Aucun graphique n’est disponible pour ce périmètre.');
            if (entries.length === 1) {
                const canvas = document.createElement('canvas');
                const image = new Image();
                image.src = entries[0].dataUrl;
                await image.decode();
                canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
                canvas.getContext('2d').drawImage(image, 0, 0);
                const blob = await new Promise(resolve => canvas.toBlob(resolve, format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.94));
                reportDownload(blob, `${entries[0].name}_${reportTimestamp()}.${format === 'jpeg' ? 'jpg' : 'png'}`);
                return;
            }
            if (typeof JSZip !== 'function') throw new Error('JSZip est indisponible.');
            const zip = new JSZip();
            for (const entry of entries) {
                const bytes = dataUrlBytes(entry.dataUrl);
                if (format === 'png') zip.file(`${entry.name}.png`, bytes);
                else {
                    const image = new Image(); image.src = entry.dataUrl; await image.decode();
                    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
                    canvas.getContext('2d').drawImage(image, 0, 0);
                    const jpegUrl = canvas.toDataURL('image/jpeg', 0.94);
                    zip.file(`${entry.name}.jpg`, dataUrlBytes(jpegUrl));
                }
            }
            const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
            reportDownload(blob, `graphiques_${scope.toLowerCase()}_${reportTimestamp()}.zip`);
        } catch (error) {
            alert(`Impossible d’exporter les graphiques : ${error.message}`);
        }
    };

    window.exportTimelineScopeData = function (scope, format) {
        const f = String(format || '').toLowerCase();
        if (f === 'html') return window.exportAnalysisToHTML(`analyse_${String(scope).toLowerCase()}`, scope);
        if (f === 'xlsx' && typeof exportAnalysisToExcel === 'function') return exportAnalysisToExcel(`analyse_${String(scope).toLowerCase()}`);
        if (f === 'csv' && typeof exportAnalysisToCSV === 'function') return exportAnalysisToCSV(`analyse_${String(scope).toLowerCase()}`);
        if (f === 'json' && typeof exportAnalysisToJSONFile === 'function') return exportAnalysisToJSONFile(`analyse_${String(scope).toLowerCase()}`);
        alert(`Format d’export non pris en charge : ${format}`);
    };

    async function shareReportFile(scope, type) {
        let blob, extension, mime;
        if (type === 'pdf') {
            blob = await createPdfBlob(scope); extension = 'pdf'; mime = 'application/pdf';
        } else {
            blob = await createWordBlob(scope); extension = 'docx'; mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        }
        const filename = reportFilename(scope, extension);
        const file = new File([blob], filename, { type: mime });
        if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
            await navigator.share({ title: 'Rapport complet KoboToolbox', text: `Rapport Analyse — ${scopeLabel(scope)}`, files: [file] });
        } else {
            reportDownload(blob, filename);
            alert('Le partage direct de fichiers n’est pas disponible dans ce navigateur. Le rapport a été téléchargé afin que vous puissiez le joindre manuellement.');
        }
    }

    window.shareTimelineExport = async function (scope, type) {
        scope = REPORT_SCOPE_LEVELS.includes(scope) ? scope : 'ALL';
        type = String(type || 'word').toLowerCase();
        try {
            if (type === 'png') {
                await window.exportTimelineImages(scope, 'png');
                alert('Le paquet d’images a été téléchargé. Vous pouvez maintenant le joindre au service de partage de votre choix.');
                return;
            }
            await shareReportFile(scope, type === 'pdf' ? 'pdf' : 'word');
        } catch (error) {
            if (error && error.name === 'AbortError') return;
            alert(`Le partage n’a pas pu être préparé : ${error.message}`);
        }
    };

    function advancedCanvasByKey(key) {
        const map = {
            kmeansDREN: 'adv-kmeans-dren-chart', kmeansCISCO: 'adv-kmeans-cisco-chart', kmeansZAP: 'adv-kmeans-zap-chart',
            jenksDREN: 'adv-jenks-dren-chart', jenksCISCO: 'adv-jenks-cisco-chart', jenksZAP: 'adv-jenks-zap-chart',
            dbscanDREN: 'adv-dbscan-dren-chart', dbscanCISCO: 'adv-dbscan-cisco-chart', dbscanZAP: 'adv-dbscan-zap-chart'
        };
        return document.getElementById(map[key] || key);
    }

    window.exportAdvancedSingleChart = async function (key, format) {
        const canvas = advancedCanvasByKey(key);
        if (!canvas) return alert('Graphique avancé introuvable.');
        await ensureChartsReadyForReport();
        const url = chartCanvasDataUrl(canvas);
        if (!url) return alert('Le graphique ne peut pas être converti en image.');
        const image = new Image(); image.src = url; await image.decode();
        const output = document.createElement('canvas'); output.width = image.naturalWidth; output.height = image.naturalHeight;
        output.getContext('2d').drawImage(image, 0, 0);
        const jpeg = String(format).toLowerCase() === 'jpeg';
        const blob = await new Promise(resolve => output.toBlob(resolve, jpeg ? 'image/jpeg' : 'image/png', 0.94));
        reportDownload(blob, `${reportSafeFilename(key)}_${reportTimestamp()}.${jpeg ? 'jpg' : 'png'}`);
    };

    window.exportAdvancedSingleWord = async function (key) {
        const canvas = advancedCanvasByKey(key);
        if (!canvas) return alert('Graphique avancé introuvable.');
        await ensureChartsReadyForReport();
        const url = chartCanvasDataUrl(canvas);
        if (!url) return alert('Le graphique ne peut pas être converti.');
        const image = new Image(); image.src = url; await image.decode();
        const page = document.createElement('canvas'); page.width = image.naturalWidth; page.height = image.naturalHeight;
        page.getContext('2d').drawImage(image, 0, 0);
        const blob = await buildDocxFromPages(splitCanvasIntoLandscapePages(page), key);
        reportDownload(blob, `${reportSafeFilename(key)}_${reportTimestamp()}.docx`);
    };

    window.shareAdvancedSingleChart = async function (key) {
        const canvas = advancedCanvasByKey(key);
        if (!canvas) return alert('Graphique avancé introuvable.');
        await ensureChartsReadyForReport();
        const url = chartCanvasDataUrl(canvas);
        if (!url) return alert('Le graphique ne peut pas être converti.');
        const blob = new Blob([dataUrlBytes(url)], { type: 'image/png' });
        const file = new File([blob], `${reportSafeFilename(key)}.png`, { type: 'image/png' });
        if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) await navigator.share({ files: [file], title: key });
        else {
            reportDownload(blob, file.name);
            alert('Le graphique a été téléchargé afin que vous puissiez le partager manuellement.');
        }
    };
})();
