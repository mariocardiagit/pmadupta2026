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
        if (String(key ?? '').startsWith('_')) continue;
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
        if (document.getElementById('master-realisations')?.classList.contains('active')) {
            setTimeout(() => window.runRealisationTemporel(), 0);
        }
        
        let bEx = isExcelLoaded ? '<span class="badge bg-success ms-2"><i class="fas fa-check-circle"></i> Traduit</span>' : '<span class="badge bg-warning text-dark ms-2"><i class="fas fa-info-circle"></i> Brut</span>';
        $('#sync-status').html(`<span class="badge bg-success sync-badge"><i class="fas fa-check-double"></i> Ok : ${allData.length} Lignes</span>`).append(bEx);

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? 'Erreur inconnue');
        const isNetworkError = /connexion|réseau|network|fetch|bloque|cors|antivirus|adblock|ublock/i.test(message);
        const title = isNetworkError ? 'Erreur de connexion KoboToolbox' : 'Erreur interne de traitement';
        console.error(title + ' :', error);
        $('#error-box').html(`<strong>${title} :</strong> ${escapeRealisationHtml(message)}`).show();
        $('#sync-status').html(`<span class="badge bg-danger sync-badge">${isNetworkError ? 'Échec Kobo' : 'Erreur de traitement'}</span>`);
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
            if (metaKeywords.some(kw => vName.includes(kw.replace(/_/g, ''))) || String(vName ?? '').startsWith('_')) mtSet.add(key); else exSet.add(key);
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
            if (String(name ?? '').startsWith('sa_part')) return 101;
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
                    let isImage = ((att.mimetype && String(att.mimetype).startsWith('image/')) || (att.filename && att.filename.match(/\.(jpeg|jpg|png|gif)$/i)));
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
        
        const omMissionRange = getOmMissionDateRange(row);
        sData.realOmStartObj = omMissionRange.start;
        sData.realOmEndObj = omMissionRange.end;
        sData.realOmStartValue = omMissionRange.startValue;
        sData.realOmEndValue = omMissionRange.endValue;

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

function getOmMissionDateRange(row) {
    const startValue = typeof findRealisationFieldValue === 'function' ? findRealisationFieldValue(row, 'start') : '';
    const endValue = typeof findRealisationFieldValue === 'function' ? findRealisationFieldValue(row, 'end') : '';
    return {
        start: parseSubmissionDate(startValue),
        end: parseSubmissionDate(endValue),
        startValue,
        endValue
    };
}
window.getOmMissionDateRange = getOmMissionDateRange;

function parseOmFilterInput(value, endOfDay = false) {
    const parsed = parseSubmissionDate(value);
    if (!parsed) return null;
    if (endOfDay) parsed.setUTCHours(23, 59, 59, 999);
    else parsed.setUTCHours(0, 0, 0, 0);
    return parsed;
}
window.parseOmFilterInput = parseOmFilterInput;

function rowMatchesOmMissionDateRange(row, startFilterValue, endFilterValue) {
    const startFilter = parseOmFilterInput(startFilterValue, false);
    const endFilter = parseOmFilterInput(endFilterValue, true);
    const range = getOmMissionDateRange(row);
    if (startFilter && (!range.start || range.start < startFilter)) return false;
    if (endFilter && (!range.end || range.end > endFilter)) return false;
    return true;
}
window.rowMatchesOmMissionDateRange = rowMatchesOmMissionDateRange;

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
        dateDebutOm: $('#filter-date-debut-om-missionnaire').val(), dateFinOm: $('#filter-date-fin-om-missionnaire').val(),
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
    let dStartOm = parseOmFilterInput(f.dateDebutOm, false);
    let dEndOm = parseOmFilterInput(f.dateFinOm, true);

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
        
        let dateOmMatch = true;
        if (dStartOm) {
            if (!s.realOmStartObj || s.realOmStartObj < dStartOm) dateOmMatch = false;
        }
        if (dEndOm) {
            if (!s.realOmEndObj || s.realOmEndObj > dEndOm) dateOmMatch = false;
        }

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

        if (mD && mC && mZ && mA && mP && mSA && mSP && dateMatch && dateRealMatch && dateOmMatch && valRealMatch && doublonMatch && anomalyMatch && chkMatch) { $(this).show(); vC++; } else { $(this).hide(); }
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
        "Date debut realisation dans om missionnaire": $('#filter-date-debut-om-missionnaire').val() || "Toutes", "Date fin realisation dans om missionnaire": $('#filter-date-fin-om-missionnaire').val() || "Toutes",
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


var realisationTimelineChartsRefs = { DREN: [], CISCO: [], ZAP: [] };

function normalizeRealisationKey(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function escapeRealisationHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
}

function findRealisationFieldValue(row, type) {
    let best = null;
    Object.entries(row || {}).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '' || Array.isArray(value) || typeof value === 'object') return;
        const normalized = normalizeRealisationKey(key);
        const leaf = normalized.split('_').filter(Boolean).slice(-1)[0] || normalized;
        let score = -Infinity;
        if (type === 'value') {
            if (/^\d{4}-\d{1,2}-\d{1,2}/.test(String(value).trim())) return;
            if (/(^|_)(date|debut|fin|start|end|today|jour|mois|annee|year)(_|$)/.test(normalized)) return;
            if (/(realisation|realisations)/.test(normalized)) score = 70;
            if (/(valeur|quantite|effectif|montant|nombre_realise)/.test(normalized)) score = Math.max(score, 45);
            if (/(^|_)realisations?$/.test(normalized) || leaf === 'realisations' || leaf === 'realisation') score = 120;
            if (normalized.includes('activite') || normalized.includes('produit') || normalized.includes('budgetiser')) score -= 35;
        } else if (type === 'start') {
            if (normalized.includes('date_debut_realisation')) score = 120;
            else if (normalized.includes('debut_realisation')) score = 100;
            else if (normalized.includes('date_debut') && /(mission|om|realisation)/.test(normalized)) score = 80;
        } else if (type === 'end') {
            if (normalized.includes('date_fin_realisation')) score = 120;
            else if (normalized.includes('fin_realisation')) score = 100;
            else if (normalized.includes('date_fin') && /(mission|om|realisation)/.test(normalized)) score = 80;
        } else if (type === 'followup') {
            if (/(^|_)date_enq$/.test(normalized) || normalized.endsWith('_date_enq')) score = 110;
            else if (normalized.includes('date_de_suivi') || normalized.includes('date_suivi')) score = 100;
        }
        if (score > -Infinity && (!best || score > best.score)) best = { value, score, key };
    });
    return best ? best.value : '';
}

function parseRealisationNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const text = String(value).trim();
    if (!text || /^\d{4}-\d{1,2}-\d{1,2}/.test(text)) return null;
    const normalized = text.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.').replace(/[^0-9.+-]/g, '');
    if (!normalized || !/[0-9]/.test(normalized)) return null;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
}

function getRealisationEntityAndActivity(row) {
    const values = {
        DREN: cleanSpaces(getKoboValue(row, ['dren'], ['activite', 'produit', 'budget', 'cisco', 'zap', 'sous'], [])),
        CISCO: cleanSpaces(getKoboValue(row, ['cisco'], ['activite', 'produit', 'budget', 'dren', 'zap', 'sous'], [])),
        ZAP: cleanSpaces(getKoboValue(row, ['zap'], ['activite', 'produit', 'budget', 'dren', 'cisco', 'sous'], []))
    };
    const valid = value => value && value.toLowerCase() !== 'non renseigné';
    const niveau = valid(values.ZAP) ? 'ZAP' : (valid(values.CISCO) ? 'CISCO' : (valid(values.DREN) ? 'DREN' : 'National'));
    const entite = niveau === 'National' ? 'Inconnue' : values[niveau];
    const suffix = niveau === 'DREN' ? 'Dren' : (niveau === 'CISCO' ? 'Cisco' : 'Zap');
    const subCol = baseColsInfo.find(col => col.key === `sousActivite${suffix}`);
    const actCol = baseColsInfo.find(col => col.key === `activite${suffix}`);
    const sAct = subCol ? cleanSpaces(getKoboValue(row, subCol.matches, subCol.ex, subCol.mustMatch)) : '';
    const act = actCol ? cleanSpaces(getKoboValue(row, actCol.matches, actCol.ex, actCol.mustMatch)) : '';
    const validSub = valid(sAct);
    return { niveau, entite, activite: validSub ? sAct : (valid(act) ? act : 'Non spécifiée'), isAnomaly: !validSub };
}

function getRealisationsData() {
    const realData = [];
    (Array.isArray(allData) ? allData : []).forEach(row => {
        const valeur = parseRealisationNumber(findRealisationFieldValue(row, 'value'));
        if (valeur === null) return;
        const entity = getRealisationEntityAndActivity(row);
        if (entity.niveau === 'National') return;
        const startDate = parseSubmissionDate(findRealisationFieldValue(row, 'start'));
        const endDate = parseSubmissionDate(findRealisationFieldValue(row, 'end'));
        const followupDate = parseSubmissionDate(findRealisationFieldValue(row, 'followup'));
        const submissionDate = parseSubmissionDate(row['_submission_time']);
        realData.push({
            id: row['_id'] || row['_uuid'] || '',
            niveau: entity.niveau,
            entite: entity.entite,
            activite: entity.activite,
            valeur,
            isAnomaly: entity.isAnomaly,
            dateStart: startDate,
            dateEnd: endDate,
            dateFollowup: followupDate,
            dateSubmission: submissionDate,
            date: startDate || followupDate || submissionDate
        });
    });
    return realData;
}

function getRealisationReferenceDate(item) {
    // Graphiques agrégés : la valeur est classée selon sa date de début. Le diagramme Gantt utilise séparément les deux bornes début-fin.
    return item.dateStart;
}

function getRealisationPeriodKey(date, granularity) {
    const d = new Date(date.getTime());
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth();
    if (granularity === 'year') return `${year}`;
    if (granularity === 'semester') return `${year}-S${month < 6 ? 1 : 2}`;
    if (granularity === 'quarter') return `${year}-T${Math.floor(month / 3) + 1}`;
    if (granularity === 'month') return `${year}-${String(month + 1).padStart(2, '0')}`;
    if (granularity === 'week') {
        const monday = new Date(Date.UTC(year, month, d.getUTCDate()));
        const day = monday.getUTCDay();
        monday.setUTCDate(monday.getUTCDate() - (day === 0 ? 6 : day - 1));
        return formatISODateUTC(monday);
    }
    return formatISODateUTC(d);
}

function formatRealisationPeriodLabel(key, granularity) {
    if (granularity === 'year') return key;
    if (granularity === 'semester') return key.replace('-S', ' — Semestre ');
    if (granularity === 'quarter') return key.replace('-T', ' — Trimestre ');
    if (granularity === 'month') {
        const date = parseSubmissionDate(`${key}-01`);
        return date ? date.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : key;
    }
    const date = parseSubmissionDate(key);
    if (!date) return key;
    const label = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
    return granularity === 'week' ? `Sem. du ${label}` : label;
}

function realisationPeriodSortValue(key, granularity) {
    if (granularity === 'year') return Number(key);
    if (granularity === 'semester') {
        const [year, sem] = key.split('-S'); return Number(year) * 12 + (Number(sem) - 1) * 6;
    }
    if (granularity === 'quarter') {
        const [year, quarter] = key.split('-T'); return Number(year) * 12 + (Number(quarter) - 1) * 3;
    }
    if (granularity === 'month') return Number(key.replace('-', ''));
    return parseSubmissionDate(key)?.getTime() || 0;
}

function getRealisationPeriodStart(date, granularity) {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    if (granularity === 'year') return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    if (granularity === 'semester') return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() < 6 ? 0 : 6, 1));
    if (granularity === 'quarter') return new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1));
    if (granularity === 'month') return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    if (granularity === 'week') {
        const day = d.getUTCDay();
        d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
    }
    return d;
}

function incrementRealisationPeriod(date, granularity) {
    const next = new Date(date.getTime());
    if (granularity === 'year') next.setUTCFullYear(next.getUTCFullYear() + 1);
    else if (granularity === 'semester') next.setUTCMonth(next.getUTCMonth() + 6);
    else if (granularity === 'quarter') next.setUTCMonth(next.getUTCMonth() + 3);
    else if (granularity === 'month') next.setUTCMonth(next.getUTCMonth() + 1);
    else if (granularity === 'week') next.setUTCDate(next.getUTCDate() + 7);
    else next.setUTCDate(next.getUTCDate() + 1);
    return next;
}

function generateRealisationPeriodKeys(startDate, endDate, granularity) {
    if (!startDate || !endDate || startDate > endDate) return [];
    const keys = [];
    let cursor = getRealisationPeriodStart(startDate, granularity);
    const last = getRealisationPeriodStart(endDate, granularity);
    let guard = 0;
    while (cursor <= last && guard < 20000) {
        keys.push(getRealisationPeriodKey(cursor, granularity));
        cursor = incrementRealisationPeriod(cursor, granularity);
        guard += 1;
    }
    return keys;
}

function cumulativeRealisationValues(values) {
    let total = 0;
    return values.map(value => (total += Number(value) || 0));
}

const realisationEndLabelsPlugin = {
    id: 'realisationEndLabelsPlugin',
    afterDatasetsDraw(chart, args, options) {
        if (!options || !options.enabled || !chart.chartArea) return;
        const labels = [];
        chart.data.datasets.forEach((dataset, index) => {
            if (chart.getDatasetMeta(index).hidden) return;
            const meta = chart.getDatasetMeta(index);
            const numericValues = [...(dataset.data || [])].map(Number);
            let lastIndex = numericValues.reduce((last, value, i) => Number.isFinite(value) && value !== 0 ? i : last, -1);
            if (lastIndex < 0) lastIndex = numericValues.reduce((last, value, i) => Number.isFinite(value) ? i : last, -1);
            const point = meta.data?.[lastIndex];
            if (!point) return;
            labels.push({ label: dataset.label, x: point.x, y: point.y, color: dataset.borderColor || '#34495e' });
        });
        labels.sort((a, b) => a.y - b.y);
        const minGap = 15;
        const top = chart.chartArea.top + 8;
        const bottom = chart.chartArea.bottom - 8;
        labels.forEach((item, index) => { item.targetY = index === 0 ? Math.max(top, item.y) : Math.max(item.y, labels[index - 1].targetY + minGap); });
        for (let index = labels.length - 2; index >= 0; index--) labels[index].targetY = Math.min(labels[index].targetY, labels[index + 1].targetY - minGap);
        const ctx = chart.ctx;
        ctx.save(); ctx.font = '11px Segoe UI'; ctx.textBaseline = 'middle';
        labels.forEach(item => {
            item.targetY = Math.max(top, Math.min(bottom, item.targetY));
            const lineX = chart.chartArea.right + 12;
            ctx.strokeStyle = item.color; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(item.x + 3, item.y); ctx.lineTo(lineX, item.targetY); ctx.stroke();
            ctx.fillStyle = '#2c3e50'; ctx.fillText(item.label, lineX + 5, item.targetY);
        });
        ctx.restore();
    }
};

function destroyRealisationCharts(level) {
    const key = String(level || '').toUpperCase();
    const refs = Array.isArray(realisationTimelineChartsRefs[key])
        ? realisationTimelineChartsRefs[key]
        : (realisationTimelineChartsRefs[key] ? [realisationTimelineChartsRefs[key]] : []);
    refs.forEach(ref => {
        const chart = ref && ref.chart ? ref.chart : ref;
        if (chart && typeof chart.destroy === 'function') chart.destroy();
    });
    realisationTimelineChartsRefs[key] = [];
}

function getRealisationChartProfile(chartType) {
    const profiles = {
        line: { type: 'line', line: true },
        smoothLine: { type: 'line', line: true, smooth: true },
        steppedLine: { type: 'line', line: true, stepped: true },
        area: { type: 'line', line: true, area: true },
        bar: { type: 'bar', bar: true },
        stackedBar: { type: 'bar', bar: true, stacked: true },
        horizontalBar: { type: 'bar', bar: true, horizontal: true },
        stackedHorizontalBar: { type: 'bar', bar: true, horizontal: true, stacked: true },
        gantt: { type: 'bar', gantt: true, horizontal: true },
        histogram: { type: 'bar', bar: true, histogram: true },
        mixed: { type: 'bar', mixed: true },
        radar: { type: 'radar', radar: true },
        scatter: { type: 'line', line: true, scatter: true },
        pie: { type: 'pie', circular: true },
        doughnut: { type: 'doughnut', circular: true },
        polarArea: { type: 'polarArea', circular: true }
    };
    return profiles[chartType] || profiles.line;
}


const REALISATION_CHART_DESCRIPTIONS = {
    line: {
        icon: 'fa-chart-line',
        title: 'Courbes : évolution et comparaison des tendances',
        summary: 'Suit les valeurs dans l’ordre chronologique et permet de comparer la trajectoire de plusieurs DREN, CISCO ou ZAP.',
        distinction: 'met surtout en évidence les hausses, baisses, ruptures et croisements au fil du temps.'
    },
    smoothLine: {
        icon: 'fa-wave-square',
        title: 'Courbes lissées : lecture simplifiée de la tendance générale',
        summary: 'Adoucit visuellement les changements entre les points pour faire ressortir la direction générale de l’évolution.',
        distinction: 'facilite la lecture d’une tendance globale, mais la courbe entre deux observations est une interpolation visuelle.'
    },
    steppedLine: {
        icon: 'fa-chart-line',
        title: 'Courbes en escalier : changements par paliers',
        summary: 'Affiche les variations comme des passages nets d’un niveau à un autre, sans pente intermédiaire.',
        distinction: 'convient lorsque la valeur est considérée comme stable pendant une période puis change à une date précise.'
    },
    area: {
        icon: 'fa-chart-area',
        title: 'Aires : importance du volume dans le temps',
        summary: 'Remplit la surface sous la courbe afin de renforcer visuellement le poids des valeurs et leur évolution.',
        distinction: 'met davantage l’accent sur l’intensité ou le volume que sur la précision de chaque point.'
    },
    bar: {
        icon: 'fa-chart-bar',
        title: 'Barres verticales : comparaison précise entre périodes',
        summary: 'Compare directement la hauteur des valeurs pour chaque période et pour chaque entité sélectionnée.',
        distinction: 'rend les écarts ponctuels plus faciles à comparer qu’une courbe, surtout avec peu de périodes.'
    },
    stackedBar: {
        icon: 'fa-layer-group',
        title: 'Barres verticales empilées : composition du total par période',
        summary: 'Additionne visuellement les contributions des entités dans une même barre pour chaque période.',
        distinction: 'montre à la fois le total et la part de chaque entité, mais compare moins précisément les segments éloignés de la base.'
    },
    horizontalBar: {
        icon: 'fa-bars',
        title: 'Barres horizontales : classement lisible des entités',
        summary: 'Place les entités sur l’axe vertical et leurs valeurs sur l’axe horizontal, avec davantage d’espace pour les noms longs.',
        distinction: 'est particulièrement adapté aux classements et aux libellés détaillés de DREN, CISCO ou ZAP.'
    },
    stackedHorizontalBar: {
        icon: 'fa-stream',
        title: 'Barres horizontales empilées : composition par entité',
        summary: 'Présente le total de chaque entité et la répartition de ses composantes dans une barre horizontale.',
        distinction: 'combine classement et lecture de composition, tout en préservant la lisibilité des noms longs.'
    },
    gantt: {
        icon: 'fa-project-diagram',
        recommended: true,
        title: 'Gantt : durée et chevauchement des périodes',
        summary: 'Représente chaque réalisation sur tout son intervalle, depuis la date de début jusqu’à la date de fin.',
        distinction: 'c’est le seul graphique de la liste qui conserve simultanément les deux bornes temporelles et rend visibles la durée ainsi que les chevauchements.'
    },
    histogram: {
        icon: 'fa-chart-bar',
        title: 'Histogramme : distribution des valeurs de réalisation',
        summary: 'Regroupe les valeurs par classes pour montrer où elles se concentrent et comment elles se dispersent.',
        distinction: 'analyse la fréquence, la dispersion et les valeurs atypiques plutôt que l’ordre chronologique.'
    },
    mixed: {
        icon: 'fa-chart-line',
        title: 'Graphique mixte : volumes et tendance dans une même vue',
        summary: 'Combine des barres pour les valeurs ponctuelles et une courbe pour faciliter la lecture de l’évolution.',
        distinction: 'réunit deux modes de lecture complémentaires, mais demande de vérifier attentivement les légendes et les échelles.'
    },
    radar: {
        icon: 'fa-bullseye',
        title: 'Radar : comparaison des profils de plusieurs entités',
        summary: 'Projette les valeurs sur plusieurs axes rayonnants afin de comparer la forme générale des profils.',
        distinction: 'fait ressortir les forces et faiblesses relatives, surtout avec peu d’entités et peu de périodes.'
    },
    scatter: {
        icon: 'fa-braille',
        title: 'Nuage de points : dispersion, regroupements et valeurs atypiques',
        summary: 'Affiche chaque observation comme un point pour révéler les concentrations, écarts et éventuelles relations.',
        distinction: 'privilégie l’analyse de la distribution et des anomalies plutôt que la continuité temporelle.'
    },
    pie: {
        icon: 'fa-chart-pie',
        title: 'Diagramme circulaire : part de chaque entité dans le total',
        summary: 'Montre comment le total des réalisations se répartit entre les catégories ou entités affichées.',
        distinction: 'est utile pour une composition à un instant ou sur une période globale, mais pas pour suivre une évolution chronologique.'
    },
    doughnut: {
        icon: 'fa-dot-circle',
        title: 'Diagramme en anneau : répartition du total avec synthèse centrale',
        summary: 'Présente les parts relatives comme un diagramme circulaire, avec un centre disponible pour afficher un total ou un indicateur.',
        distinction: 'met l’accent sur la composition globale et reste plus lisible avec un nombre limité de catégories.'
    },
    polarArea: {
        icon: 'fa-sun',
        title: 'Aires polaires : comparaison visuelle des contributions',
        summary: 'Compare les catégories par secteurs de même angle dont le rayon varie selon la valeur.',
        distinction: 'offre une lecture visuelle forte des écarts, mais est moins précise qu’un diagramme en barres pour comparer des valeurs proches.'
    }
};

function updateRealisationChartDescription(chartType) {
    const description = REALISATION_CHART_DESCRIPTIONS[chartType] || REALISATION_CHART_DESCRIPTIONS.line;
    const panel = document.getElementById('real-chart-type-description');
    const icon = document.getElementById('real-chart-type-description-icon');
    const title = document.getElementById('real-chart-type-description-title');
    const summary = document.getElementById('real-chart-type-description-summary');
    const distinction = document.getElementById('real-chart-type-description-distinction');
    const recommendedBadge = document.getElementById('real-chart-recommended-badge');
    if (icon) icon.className = `fas ${description.icon}`;
    if (title) title.textContent = description.title;
    if (summary) summary.textContent = description.summary;
    if (distinction) distinction.innerHTML = `<strong>Ce qui le distingue :</strong> ${description.distinction}`;
    if (recommendedBadge) recommendedBadge.classList.toggle('d-none', !description.recommended);
    if (panel) {
        panel.dataset.chartType = chartType;
        panel.classList.toggle('is-gantt', chartType === 'gantt');
    }
}

const REALISATION_POINT_STYLES = ['circle', 'rect', 'triangle', 'rectRot', 'star', 'cross', 'crossRot', 'dash'];
const REALISATION_DASH_PATTERNS = [[], [9, 4], [3, 3], [12, 4, 3, 4], [2, 5], [14, 5], [7, 3, 2, 3], [1, 3]];
const REALISATION_ZOOM_LEVELS = ['day', 'week', 'month', 'quarter', 'semester', 'year'];
const REALISATION_ZOOM_LABELS = { day: 'Jour', week: 'Semaine', month: 'Mois', quarter: 'Trimestre', semester: 'Semestre', year: 'Année' };

function updateRealisationZoomControls() {
    const select = document.getElementById('real-period-select');
    const granularity = select?.value || 'month';
    const index = REALISATION_ZOOM_LEVELS.indexOf(granularity);
    const label = document.getElementById('real-zoom-label');
    const plus = document.getElementById('real-zoom-plus');
    const minus = document.getElementById('real-zoom-minus');
    if (label) label.textContent = REALISATION_ZOOM_LABELS[granularity] || granularity;
    if (plus) plus.disabled = index <= 0;
    if (minus) minus.disabled = index < 0 || index >= REALISATION_ZOOM_LEVELS.length - 1;
}

window.zoomRealisationTimeline = function(direction) {
    const select = document.getElementById('real-period-select');
    if (!select) return;
    const currentIndex = Math.max(0, REALISATION_ZOOM_LEVELS.indexOf(select.value));
    const nextIndex = Math.max(0, Math.min(REALISATION_ZOOM_LEVELS.length - 1, currentIndex + (direction > 0 ? -1 : 1)));
    if (nextIndex === currentIndex) return;
    select.value = REALISATION_ZOOM_LEVELS[nextIndex];
    updateRealisationZoomControls();
    window.runRealisationTemporel();
};


function syncRealisationChartControls() {
    const chartType = document.getElementById('real-chart-type')?.value || 'gantt';
    updateRealisationChartDescription(chartType);
    const mode = document.getElementById('real-display-mode');
    const periodLabel = document.getElementById('real-period-select-label');
    const help = document.getElementById('real-chart-help');
    const isGantt = chartType === 'gantt';
    if (mode) {
        if (isGantt) mode.value = 'detailed';
        mode.disabled = isGantt;
        mode.title = isGantt
            ? 'Le diagramme de périodes représente chaque réalisation individuellement sur son intervalle début-fin.'
            : '';
    }
    if (periodLabel) periodLabel.textContent = isGantt ? 'Graduation temporelle' : 'Période d’agrégation';
    if (help) {
        help.className = `alert ${isGantt ? 'alert-primary' : 'alert-success'} py-2 px-3 mb-0 small`;
        help.innerHTML = isGantt
            ? '<i class="fas fa-info-circle"></i> <strong>Diagramme de périodes (Gantt)</strong> : chaque barre commence à la « Date debut realisation dans om missionnaire » et se termine à la « Date fin realisation dans om missionnaire ». Les dates de début et de fin des réalisations sont maintenant visibles sur l’axe des abscisses X. La valeur est écrite dans la barre ou à son extrémité. Les barres de défilement horizontale et verticale apparaissent automatiquement lorsque la chronologie ou le nombre de missions dépasse la zone visible. Le mode cumulé est désactivé pour préserver une ligne par réalisation.'
            : '<i class="fas fa-info-circle"></i> <strong>Axe temporel OM missionnaire</strong> : borne gauche = plus petite date de début ; borne droite = plus grande date de fin. Les graphiques classiques agrègent les valeurs selon la date de début. <strong>Données détaillées</strong> : valeur de chaque période. <strong>Données cumulées</strong> : somme progressive.';
    }
}

function getRealisationTooltipValue(context) {
    const parsed = context?.parsed;
    if (typeof parsed === 'number') return parsed;
    if (parsed && Number.isFinite(parsed.r)) return parsed.r;
    if (parsed && Number.isFinite(parsed.y)) return parsed.y;
    if (parsed && Number.isFinite(parsed.x)) return parsed.x;
    const raw = context?.raw;
    return Number.isFinite(Number(raw)) ? Number(raw) : 0;
}

function renderRealisationLegend(level, items, chart, kind = 'dataset') {
    const target = document.getElementById(`real-legend-${level.toLowerCase()}`);
    if (!target) return;
    if (!items.length || !chart) { target.innerHTML = ''; return; }
    target.innerHTML = items.map((item, index) => `<button type="button" class="realisation-legend-item" data-real-legend-index="${index}" title="Cliquer pour masquer ou réafficher"><i style="background:${item.color}"></i><strong>${escapeRealisationHtml(item.label)}</strong><small>${Number(item.total || 0).toLocaleString('fr-FR')}</small></button>`).join('');
    target.querySelectorAll('[data-real-legend-index]').forEach(button => {
        button.addEventListener('click', function() {
            const index = Number(this.dataset.realLegendIndex);
            if (kind === 'data' && typeof chart.toggleDataVisibility === 'function') {
                chart.toggleDataVisibility(index);
                this.classList.toggle('is-hidden', !chart.getDataVisibility(index));
            } else {
                const visible = chart.isDatasetVisible(index);
                chart.setDatasetVisibility(index, !visible);
                this.classList.toggle('is-hidden', visible);
            }
            chart.update();
        });
    });
}

function createRealisationDataset(entity, values, total, index, settings, profile) {
    const color = getSubmissionTimelineColor(index, 1);
    const isArea = profile.area;
    const dataset = {
        label: entity,
        data: values,
        _total: total,
        borderColor: color,
        backgroundColor: getSubmissionTimelineColor(index, isArea ? .18 : .48),
        pointBackgroundColor: color,
        pointBorderColor: '#fff',
        pointBorderWidth: 1,
        pointRadius: values.length > 45 ? 0 : 3.5,
        pointHoverRadius: 6,
        pointStyle: REALISATION_POINT_STYLES[index % REALISATION_POINT_STYLES.length],
        borderDash: REALISATION_DASH_PATTERNS[index % REALISATION_DASH_PATTERNS.length],
        borderWidth: 2.2,
        tension: profile.smooth ? .42 : .16,
        stepped: !!profile.stepped,
        fill: !!isArea,
        showLine: !profile.scatter
    };
    if (profile.histogram) {
        dataset.barPercentage = 1;
        dataset.categoryPercentage = 1;
    }
    if (profile.mixed) dataset.type = index % 2 === 0 ? 'bar' : 'line';
    return dataset;
}

function buildRealisationChartOptions(settings, profile, entityCount, individual = false) {
    const isCircular = profile.circular;
    const isRadar = profile.radar;
    const horizontal = profile.horizontal;
    const lineLabelsEnabled = profile.line && !profile.scatter && !individual;
    const options = {
        responsive: true,
        maintainAspectRatio: false,
        normalized: true,
        interaction: { mode: isCircular ? 'nearest' : 'index', intersect: false },
        layout: { padding: { right: lineLabelsEnabled ? 245 : 20, top: 12, bottom: 8, left: 6 } },
        plugins: {
            legend: { display: false },
            realisationEndLabelsPlugin: { enabled: lineLabelsEnabled },
            tooltip: {
                callbacks: {
                    label: context => `${context.dataset.label || context.label || 'Réalisation'} : ${getRealisationTooltipValue(context).toLocaleString('fr-FR')}`
                }
            }
        }
    };
    if (!isCircular && !isRadar) {
        options.indexAxis = horizontal ? 'y' : 'x';
        const valueAxis = horizontal ? 'x' : 'y';
        const categoryAxis = horizontal ? 'y' : 'x';
        options.scales = {};
        options.scales[categoryAxis] = {
            stacked: !!profile.stacked,
            title: { display: true, text: 'Période OM missionnaire (début minimum → fin maximum)', font: { weight: 'bold' } },
            ticks: { maxRotation: horizontal ? 0 : (profile.bar ? 35 : 0), autoSkip: true, maxTicksLimit: individual ? 12 : 18 }
        };
        options.scales[valueAxis] = {
            stacked: !!profile.stacked,
            beginAtZero: true,
            title: { display: true, text: settings.mode === 'cumulative' ? 'Réalisations cumulées' : 'Réalisations de la période', font: { weight: 'bold' } }
        };
    }
    if (isRadar) {
        options.scales = { r: { beginAtZero: true, ticks: { backdropColor: 'transparent' }, pointLabels: { font: { size: individual ? 10 : 9 } } } };
    }
    return options;
}

function getRealisationSeries(byEntity, ranked, periodKeys, settings, profile) {
    return ranked.map(([entity, total], index) => {
        const detailed = periodKeys.map(key => byEntity[entity]?.[key] || 0);
        const values = settings.mode === 'cumulative' ? cumulativeRealisationValues(detailed) : detailed;
        return { entity, total, values, dataset: createRealisationDataset(entity, values, total, index, settings, profile), index };
    });
}

function createGroupedRealisationChart(level, canvas, stage, series, labels, settings, profile) {
    stage.classList.remove('realisation-gantt-stage');
    stage.parentElement?.classList.remove('realisation-gantt-scroll');
    stage.style.width = '';
    let chartData;
    let legendItems;
    let legendKind = 'dataset';
    if (profile.circular) {
        const colors = series.map(item => getSubmissionTimelineColor(item.index, .72));
        chartData = {
            labels: series.map(item => item.entity),
            datasets: [{
                label: settings.mode === 'cumulative' ? 'Réalisations cumulées finales' : 'Total des réalisations',
                data: series.map(item => item.total),
                backgroundColor: colors,
                borderColor: series.map(item => getSubmissionTimelineColor(item.index, 1)),
                borderWidth: 1.5
            }]
        };
        legendItems = series.map((item, index) => ({ label: item.entity, color: colors[index], total: chartData.datasets[0].data[index] }));
        legendKind = 'data';
    } else {
        chartData = { labels, datasets: series.map(item => item.dataset) };
        legendItems = series.map(item => ({ label: item.entity, color: item.dataset.borderColor, total: item.total }));
    }
    stage.style.minWidth = profile.horizontal ? `${Math.max(900, 500 + series.length * 75)}px` : `${Math.max(900, 340 + labels.length * 72)}px`;
    stage.style.height = `${Math.min(820, Math.max(430, 310 + series.length * 18))}px`;
    const chart = new Chart(canvas.getContext('2d'), {
        type: profile.type,
        data: chartData,
        plugins: [realisationEndLabelsPlugin],
        options: buildRealisationChartOptions(settings, profile, series.length, false)
    });
    realisationTimelineChartsRefs[level].push({ chart, name: level.toLowerCase() });
    renderRealisationLegend(level, legendItems, chart, legendKind);
}

function createIndividualRealisationCharts(level, container, series, labels, settings, profile) {
    container.innerHTML = '';
    series.forEach((item, index) => {
        const card = document.createElement('article');
        card.className = 'realisation-individual-card';
        card.innerHTML = `<div class="realisation-individual-heading"><strong>${escapeRealisationHtml(item.entity)}</strong><span>Total : ${Number(item.total).toLocaleString('fr-FR')}</span></div>${getRealisationAxisBoundaryHtml(settings.axisStart, settings.axisEnd)}<div class="realisation-individual-canvas"><canvas></canvas></div>`;
        container.appendChild(card);
        const canvas = card.querySelector('canvas');
        let chartData;
        let chartType = profile.type;
        if (profile.circular) {
            const periodColors = labels.map((_, periodIndex) => getSubmissionTimelineColor(periodIndex, .72));
            chartData = {
                labels,
                datasets: [{ label: item.entity, data: item.values, backgroundColor: periodColors, borderColor: labels.map((_, periodIndex) => getSubmissionTimelineColor(periodIndex, 1)), borderWidth: 1.2 }]
            };
        } else if (profile.mixed) {
            const base = item.dataset;
            chartType = 'bar';
            chartData = { labels, datasets: [
                { ...base, type: 'bar', label: `${item.entity} — barres`, borderDash: [] },
                { ...base, type: 'line', label: `${item.entity} — courbe`, backgroundColor: 'transparent', fill: false }
            ] };
        } else {
            chartData = { labels, datasets: [item.dataset] };
        }
        const chart = new Chart(canvas.getContext('2d'), {
            type: chartType,
            data: chartData,
            plugins: [realisationEndLabelsPlugin],
            options: buildRealisationChartOptions(settings, profile, 1, true)
        });
        realisationTimelineChartsRefs[level].push({ chart, name: `${level.toLowerCase()}_${index + 1}_${normalizeRealisationKey(item.entity).slice(0, 45)}` });
    });
}


const realisationGanttLabelsPlugin = {
    id: 'realisationGanttLabelsPlugin',
    afterDatasetsDraw(chart, args, options) {
        if (!options || !options.enabled || !chart.chartArea) return;
        const ctx = chart.ctx;
        ctx.save();
        ctx.font = '700 11px Segoe UI';
        ctx.textBaseline = 'middle';
        chart.data.datasets.forEach((dataset, datasetIndex) => {
            if (!chart.isDatasetVisible(datasetIndex)) return;
            const meta = chart.getDatasetMeta(datasetIndex);
            meta.data.forEach((bar, dataIndex) => {
                const record = dataset._records?.[dataIndex];
                if (!record || !bar) return;
                const left = Math.min(bar.base, bar.x);
                const right = Math.max(bar.base, bar.x);
                const width = right - left;
                const text = `Valeur : ${Number(record.valeur).toLocaleString('fr-FR')}`;
                const textWidth = ctx.measureText(text).width;
                if (width >= textWidth + 18) {
                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'center';
                    ctx.fillText(text, left + width / 2, bar.y);
                } else {
                    const targetX = Math.min(chart.chartArea.right + 155, right + 7);
                    ctx.fillStyle = dataset.borderColor || '#2c3e50';
                    ctx.textAlign = 'left';
                    ctx.fillText(text, targetX, bar.y);
                }
            });
        });
        ctx.restore();
    }
};

function formatRealisationGanttDate(value) {
    const date = value instanceof Date ? value : new Date(Number(value));
    if (!date || Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}


function getRealisationAxisBoundaryHtml(axisStart, axisEnd) {
    const startText = axisStart ? formatRealisationGanttDate(axisStart) : '—';
    const endText = axisEnd ? formatRealisationGanttDate(axisEnd) : '—';
    return `<div class="realisation-axis-boundaries realisation-axis-boundaries-individual" aria-label="Bornes temporelles du graphique"><span class="realisation-axis-boundary realisation-axis-boundary-start"><i class="fas fa-play-circle"></i> Date de début minimale : <strong>${startText}</strong></span><span class="realisation-axis-boundary realisation-axis-boundary-end">Date de fin maximale : <strong>${endText}</strong> <i class="fas fa-flag-checkered"></i></span></div>`;
}

function updateRealisationAxisBoundaries(axisStart, axisEnd) {
    const startText = axisStart ? formatRealisationGanttDate(axisStart) : '—';
    const endText = axisEnd ? formatRealisationGanttDate(axisEnd) : '—';
    ['dren', 'cisco', 'zap'].forEach(level => {
        const startNode = document.getElementById(`real-axis-start-${level}`);
        const endNode = document.getElementById(`real-axis-end-${level}`);
        if (startNode) startNode.textContent = startText;
        if (endNode) endNode.textContent = endText;
    });
}

function getRealisationGanttTickLimit(granularity) {
    return ({ day: 24, week: 18, month: 14, quarter: 10, semester: 8, year: 7 })[granularity] || 14;
}

function countRealisationGanttUnits(axisStart, axisEnd, granularity) {
    const start = axisStart instanceof Date ? axisStart : new Date(axisStart);
    const end = axisEnd instanceof Date ? axisEnd : new Date(axisEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 1;
    const dayMs = 86400000;
    if (granularity === 'day') return Math.max(1, Math.floor((end - start) / dayMs) + 1);
    if (granularity === 'week') return Math.max(1, Math.ceil(((end - start) / dayMs + 1) / 7));
    const months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth()) + 1;
    if (granularity === 'month') return Math.max(1, months);
    if (granularity === 'quarter') return Math.max(1, Math.ceil(months / 3));
    if (granularity === 'semester') return Math.max(1, Math.ceil(months / 6));
    return Math.max(1, end.getUTCFullYear() - start.getUTCFullYear() + 1);
}

function getRealisationGanttStageWidth(axisStart, axisEnd, granularity, boundaryCount = 0, individual = false) {
    const units = countRealisationGanttUnits(axisStart, axisEnd, granularity);
    const pixelsPerUnit = ({ day: 42, week: 92, month: 128, quarter: 175, semester: 235, year: 290 })[granularity] || 128;
    const base = individual ? 570 : 660;
    const minimum = individual ? 1180 : 1320;
    const timelineWidth = base + units * pixelsPerUnit;
    const boundaryWidth = base + Math.max(0, Number(boundaryCount) || 0) * (individual ? 56 : 62);
    return Math.min(22000, Math.max(minimum, timelineWidth, boundaryWidth));
}

function getRealisationGanttStageHeight(rowCount, individual = false) {
    const rows = Math.max(1, Number(rowCount) || 1);
    const base = individual ? 125 : 145;
    const rowHeight = individual ? 46 : 44;
    return Math.min(24000, Math.max(individual ? 350 : 480, base + rows * rowHeight));
}

function collectRealisationGanttBoundaryValues(records, axisStart, axisEnd) {
    const values = new Set();
    if (axisStart instanceof Date && !Number.isNaN(axisStart.getTime())) values.add(axisStart.getTime());
    if (axisEnd instanceof Date && !Number.isNaN(axisEnd.getTime())) values.add(axisEnd.getTime());
    (records || []).forEach(record => {
        if (record?.dateStart instanceof Date && !Number.isNaN(record.dateStart.getTime())) values.add(record.dateStart.getTime());
        if (record?.dateEnd instanceof Date && !Number.isNaN(record.dateEnd.getTime())) values.add(record.dateEnd.getTime());
    });
    return [...values].sort((a, b) => a - b);
}

function getRankedRealisationGanttEntities(records, top) {
    let ranked = Object.entries(records.reduce((acc, item) => {
        acc[item.entite] = (acc[item.entite] || 0) + Number(item.valeur || 0);
        return acc;
    }, {})).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'));
    if (top !== 'all') ranked = ranked.slice(0, Number(top));
    return ranked;
}

function buildRealisationGanttRows(records) {
    return [...records].sort((a, b) => {
        const dateDiff = (a.dateStart?.getTime() || 0) - (b.dateStart?.getTime() || 0);
        if (dateDiff) return dateDiff;
        const entityDiff = String(a.entite).localeCompare(String(b.entite), 'fr');
        if (entityDiff) return entityDiff;
        return String(a.id).localeCompare(String(b.id), 'fr');
    }).map((record, index) => ({
        record,
        label: `${record.entite} — ${record.activite || 'Sous-activité non spécifiée'} — Mission ${index + 1}${record.id ? ` (#${record.id})` : ''}`
    }));
}

function createRealisationGanttDatasets(rows, ranked) {
    const rankIndex = new Map(ranked.map(([entity], index) => [entity, index]));
    return ranked.map(([entity, total], entityIndex) => {
        const color = getSubmissionTimelineColor(entityIndex, 1);
        const data = rows.map(({ record }) => record.entite === entity
            ? [record.dateStart.getTime(), record.dateEnd.getTime()]
            : null);
        const recordMap = rows.map(({ record }) => record.entite === entity ? record : null);
        return {
            label: entity,
            data,
            _records: recordMap,
            _total: total,
            backgroundColor: getSubmissionTimelineColor(entityIndex, .72),
            borderColor: color,
            borderWidth: 1.4,
            borderSkipped: false,
            borderRadius: 5,
            minBarLength: 4,
            barPercentage: .78,
            categoryPercentage: .86
        };
    });
}

function buildRealisationGanttOptions(settings, axisStart, axisEnd, rowCount, individual = false, boundaryValues = []) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        normalized: true,
        indexAxis: 'y',
        interaction: { mode: 'nearest', axis: 'y', intersect: true },
        layout: { padding: { right: 185, top: 12, bottom: 32, left: 6 } },
        plugins: {
            legend: { display: false },
            realisationGanttLabelsPlugin: { enabled: true },
            tooltip: {
                callbacks: {
                    title: items => {
                        const context = items?.[0];
                        const record = context?.dataset?._records?.[context.dataIndex];
                        return record ? record.entite : 'Réalisation';
                    },
                    label: context => {
                        const record = context.dataset?._records?.[context.dataIndex];
                        if (!record) return '';
                        return [
                            `Début : ${formatRealisationGanttDate(record.dateStart)}`,
                            `Fin : ${formatRealisationGanttDate(record.dateEnd)}`,
                            `Valeur : ${Number(record.valeur).toLocaleString('fr-FR')}`,
                            `Sous-activité : ${record.activite || 'Non spécifiée'}`
                        ];
                    }
                }
            }
        },
        scales: {
            x: {
                type: 'linear',
                min: axisStart.getTime(),
                max: axisEnd.getTime(),
                title: { display: true, text: 'Période de réalisation OM missionnaire (début minimum → fin maximum)', font: { weight: 'bold' } },
                afterBuildTicks: scale => {
                    const minimum = axisStart.getTime();
                    const maximum = axisEnd.getTime();
                    const values = new Set();
                    (boundaryValues || []).forEach(value => {
                        const numeric = Number(value);
                        if (!Number.isNaN(numeric)) values.add(numeric);
                    });
                    scale.ticks.forEach(tick => {
                        const numeric = Number(tick.value);
                        if (!Number.isNaN(numeric)) values.add(numeric);
                    });
                    values.add(minimum);
                    values.add(maximum);
                    scale.ticks = [...values].sort((a, b) => a - b).map(value => ({
                        value,
                        major: value === minimum || value === maximum
                    }));
                },
                ticks: {
                    autoSkip: false,
                    maxRotation: 55,
                    minRotation: 55,
                    padding: 8,
                    font: context => ({ size: context.tick?.major ? 11 : 10, weight: context.tick?.major ? '700' : '400' }),
                    callback: value => formatRealisationGanttDate(value)
                },
                grid: { color: 'rgba(67, 96, 78, .12)' }
            },
            y: {
                stacked: true,
                title: { display: true, text: individual ? 'Missions de l’entité' : 'Entités et missions', font: { weight: 'bold' } },
                ticks: {
                    autoSkip: false,
                    font: { size: rowCount > 24 ? 9 : 10 },
                    callback: function(value) {
                        const label = this.getLabelForValue(value);
                        return label.length > 72 ? `${label.slice(0, 69)}…` : label;
                    }
                },
                grid: { display: false }
            }
        }
    };
}

function createGroupedRealisationGanttChart(level, canvas, stage, records, settings, axisStart, axisEnd) {
    const ranked = getRankedRealisationGanttEntities(records, settings.top);
    const selected = new Set(ranked.map(([entity]) => entity));
    const rows = buildRealisationGanttRows(records.filter(item => selected.has(item.entite)));
    if (!rows.length) return null;
    const datasets = createRealisationGanttDatasets(rows, ranked);
    const boundaryValues = collectRealisationGanttBoundaryValues(rows.map(row => row.record), axisStart, axisEnd);
    const stageWidth = getRealisationGanttStageWidth(axisStart, axisEnd, settings.granularity, boundaryValues.length, false);
    const stageHeight = getRealisationGanttStageHeight(rows.length, false);
    stage.classList.add('realisation-gantt-stage');
    stage.parentElement?.classList.add('realisation-gantt-scroll');
    stage.style.width = `${stageWidth}px`;
    stage.style.minWidth = `${stageWidth}px`;
    stage.style.height = `${stageHeight}px`;
    const chart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: { labels: rows.map(row => row.label), datasets },
        plugins: [realisationGanttLabelsPlugin],
        options: buildRealisationGanttOptions(settings, axisStart, axisEnd, rows.length, false, boundaryValues)
    });
    realisationTimelineChartsRefs[level].push({ chart, name: `${level.toLowerCase()}_periodes_gantt` });
    renderRealisationLegend(level, ranked.map(([entity, total], index) => ({
        label: entity,
        color: getSubmissionTimelineColor(index, 1),
        total
    })), chart, 'dataset');
    return chart;
}

function createIndividualRealisationGanttCharts(level, container, records, settings, axisStart, axisEnd) {
    container.innerHTML = '';
    const ranked = getRankedRealisationGanttEntities(records, settings.top);
    ranked.forEach(([entity, total], entityIndex) => {
        const entityRows = buildRealisationGanttRows(records.filter(item => item.entite === entity));
        const card = document.createElement('article');
        card.className = 'realisation-individual-card realisation-gantt-card';
        card.innerHTML = `<div class="realisation-individual-heading"><strong>${escapeRealisationHtml(entity)}</strong><span>${entityRows.length} mission(s) · Total : ${Number(total).toLocaleString('fr-FR')}</span></div>${getRealisationAxisBoundaryHtml(axisStart, axisEnd)}<div class="realisation-individual-canvas realisation-gantt-individual-canvas"><div class="realisation-gantt-individual-stage"><canvas></canvas></div></div>`;
        container.appendChild(card);
        const color = getSubmissionTimelineColor(entityIndex, 1);
        const dataset = {
            label: entity,
            data: entityRows.map(({ record }) => [record.dateStart.getTime(), record.dateEnd.getTime()]),
            _records: entityRows.map(({ record }) => record),
            backgroundColor: getSubmissionTimelineColor(entityIndex, .72),
            borderColor: color,
            borderWidth: 1.4,
            borderSkipped: false,
            borderRadius: 5,
            minBarLength: 4,
            barPercentage: .76,
            categoryPercentage: .84
        };
        const canvas = card.querySelector('canvas');
        const holder = card.querySelector('.realisation-gantt-individual-canvas');
        const innerStage = card.querySelector('.realisation-gantt-individual-stage');
        const boundaryValues = collectRealisationGanttBoundaryValues(entityRows.map(row => row.record), axisStart, axisEnd);
        const stageWidth = getRealisationGanttStageWidth(axisStart, axisEnd, settings.granularity, boundaryValues.length, true);
        const stageHeight = getRealisationGanttStageHeight(entityRows.length, true);
        innerStage.style.width = `${stageWidth}px`;
        innerStage.style.minWidth = `${stageWidth}px`;
        innerStage.style.height = `${stageHeight}px`;
        holder.style.maxHeight = `${Math.min(680, Math.max(390, window.innerHeight ? window.innerHeight * 0.68 : 620))}px`;
        const chart = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: { labels: entityRows.map((row, index) => `Mission ${index + 1} — ${row.record.activite || 'Sous-activité non spécifiée'}${row.record.id ? ` (#${row.record.id})` : ''}`), datasets: [dataset] },
            plugins: [realisationGanttLabelsPlugin],
            options: buildRealisationGanttOptions(settings, axisStart, axisEnd, entityRows.length, true, boundaryValues)
        });
        realisationTimelineChartsRefs[level].push({ chart, name: `${level.toLowerCase()}_${entityIndex + 1}_${normalizeRealisationKey(entity).slice(0, 45)}_gantt` });
    });
}

function renderRealisationGanttLevel(level, records, settings) {
    const levelKey = String(level || '').toUpperCase();
    const levelLower = levelKey.toLowerCase();
    const canvas = document.getElementById(`realisationTimelineChart${levelKey}`);
    const empty = document.getElementById(`real-empty-${levelLower}`);
    const stage = document.getElementById(`real-stage-${levelLower}`);
    const scroll = document.getElementById(`real-scroll-${levelLower}`);
    const individualContainer = document.getElementById(`real-individual-${levelLower}`);
    if (!canvas || !empty || !stage || !scroll || !individualContainer) return;
    destroyRealisationCharts(levelKey);
    const levelRecords = records.filter(item => item.niveau === levelKey && item.dateStart && item.dateEnd);
    if (!levelRecords.length) {
        scroll.classList.remove('d-none');
        individualContainer.classList.add('d-none');
        individualContainer.innerHTML = '';
        canvas.style.display = 'none';
        empty.style.display = 'flex';
        renderRealisationLegend(levelKey, [], null);
        return;
    }
    const starts = levelRecords.map(item => item.dateStart.getTime());
    const ends = levelRecords.map(item => item.dateEnd.getTime());
    const axisStart = settings.axisStart || new Date(Math.min(...starts));
    const axisEnd = settings.axisEnd || new Date(Math.max(...ends));
    empty.style.display = 'none';
    if (settings.layout === 'individual') {
        scroll.classList.add('d-none');
        individualContainer.classList.remove('d-none');
        canvas.style.display = 'none';
        renderRealisationLegend(levelKey, [], null);
        createIndividualRealisationGanttCharts(levelKey, individualContainer, levelRecords, settings, axisStart, axisEnd);
    } else {
        scroll.classList.remove('d-none');
        individualContainer.classList.add('d-none');
        individualContainer.innerHTML = '';
        canvas.style.display = 'block';
        createGroupedRealisationGanttChart(levelKey, canvas, stage, levelRecords, settings, axisStart, axisEnd);
    }
}

function renderRealisationTimelineLevel(level, records, periodKeys, settings) {
    const levelKey = String(level || '').toUpperCase();
    const levelLower = levelKey.toLowerCase();
    const canvas = document.getElementById(`realisationTimelineChart${levelKey}`);
    const empty = document.getElementById(`real-empty-${levelLower}`);
    const stage = document.getElementById(`real-stage-${levelLower}`);
    const scroll = document.getElementById(`real-scroll-${levelLower}`);
    const individualContainer = document.getElementById(`real-individual-${levelLower}`);
    if (!canvas || !empty || !stage || !scroll || !individualContainer) return;
    destroyRealisationCharts(levelKey);

    if (settings.chartType === 'gantt') {
        renderRealisationGanttLevel(levelKey, records, settings);
        return;
    }

    const byEntity = {};
    records.filter(item => item.niveau === levelKey).forEach(item => {
        const date = getRealisationReferenceDate(item);
        if (!date) return;
        const key = getRealisationPeriodKey(date, settings.granularity);
        if (!byEntity[item.entite]) byEntity[item.entite] = {};
        byEntity[item.entite][key] = (byEntity[item.entite][key] || 0) + item.valeur;
    });
    let ranked = Object.entries(byEntity)
        .map(([entity, values]) => [entity, Object.values(values).reduce((sum, value) => sum + value, 0)])
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'));
    if (settings.top !== 'all') ranked = ranked.slice(0, Number(settings.top));

    if (!ranked.length || !periodKeys.length) {
        scroll.classList.remove('d-none');
        individualContainer.classList.add('d-none');
        individualContainer.innerHTML = '';
        canvas.style.display = 'none';
        empty.style.display = 'flex';
        renderRealisationLegend(levelKey, [], null);
        return;
    }

    const labels = periodKeys.map(key => formatRealisationPeriodLabel(key, settings.granularity));
    const profile = getRealisationChartProfile(settings.chartType);
    const series = getRealisationSeries(byEntity, ranked, periodKeys, settings, profile);
    empty.style.display = 'none';

    if (settings.layout === 'individual') {
        scroll.classList.add('d-none');
        individualContainer.classList.remove('d-none');
        canvas.style.display = 'none';
        renderRealisationLegend(levelKey, [], null);
        createIndividualRealisationCharts(levelKey, individualContainer, series, labels, settings, profile);
    } else {
        scroll.classList.remove('d-none');
        individualContainer.classList.add('d-none');
        individualContainer.innerHTML = '';
        canvas.style.display = 'block';
        createGroupedRealisationChart(levelKey, canvas, stage, series, labels, settings, profile);
    }
}

function getRealisationTimelineSettings() {
    return {
        granularity: document.getElementById('real-period-select')?.value || 'month',
        mode: document.getElementById('real-display-mode')?.value || 'detailed',
        chartType: document.getElementById('real-chart-type')?.value || 'gantt',
        top: document.getElementById('real-top-entities')?.value || '10',
        layout: document.querySelector('input[name="real-layout-mode"]:checked')?.value || 'grouped',
        start: parseSubmissionDate(document.getElementById('real-date-start')?.value || ''),
        end: parseSubmissionDate(document.getElementById('real-date-end')?.value || '')
    };
}

window.runRealisationTemporel = function() {
    syncRealisationChartControls();
    updateRealisationZoomControls();
    const settings = getRealisationTimelineSettings();
    const allRecords = getRealisationsData();
    const status = document.getElementById('realisation-timeline-status');
    if (settings.start && settings.end && settings.start > settings.end) {
        if (status) {
            status.className = 'alert alert-danger py-2';
            status.innerHTML = '<i class="fas fa-exclamation-triangle"></i> La date de début minimale OM missionnaire doit être antérieure ou égale à la date de fin maximale OM missionnaire.';
        }
        updateRealisationAxisBoundaries(null, null);
        ['DREN', 'CISCO', 'ZAP'].forEach(level => renderRealisationTimelineLevel(level, [], [], settings));
        return;
    }

    const completeRecords = allRecords.filter(item => item.dateStart && item.dateEnd);
    const dated = completeRecords.filter(item => {
        if (settings.start && item.dateStart < settings.start) return false;
        if (settings.end && item.dateEnd > settings.end) return false;
        return true;
    });

    const starts = dated.map(item => item.dateStart).sort((a, b) => a - b);
    const ends = dated.map(item => item.dateEnd).sort((a, b) => a - b);
    const axisStart = settings.start || starts[0] || null;
    const axisEnd = settings.end || ends[ends.length - 1] || null;
    const periodKeys = generateRealisationPeriodKeys(axisStart, axisEnd, settings.granularity);
    settings.axisStart = axisStart;
    settings.axisEnd = axisEnd;
    updateRealisationAxisBoundaries(axisStart, axisEnd);
    const total = dated.reduce((sum, item) => sum + item.valeur, 0);
    const entities = new Set(dated.map(item => `${item.niveau}|${item.entite}`));
    const setText = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
    setText('real-metric-records', dated.length.toLocaleString('fr-FR'));
    setText('real-metric-total', total.toLocaleString('fr-FR'));
    setText('real-metric-entities', entities.size.toLocaleString('fr-FR'));
    setText('real-metric-period', axisStart && axisEnd ? `${formatISODateUTC(axisStart)} → ${formatISODateUTC(axisEnd)}` : 'Aucune');

    if (status) {
        const missingStart = allRecords.filter(item => !item.dateStart).length;
        const missingEnd = allRecords.filter(item => !item.dateEnd).length;
        const messages = [];
        if (missingStart) messages.push(`${missingStart} réalisation(s) sans Date début OM missionnaire ont été écartées`);
        if (missingEnd) messages.push(`${missingEnd} réalisation(s) sans Date fin OM missionnaire ont été écartées`);
        if (settings.chartType === 'gantt' && dated.length) messages.unshift('Diagramme de périodes actif : chaque valeur couvre tout l’intervalle entre la date de début et la date de fin');
        status.className = dated.length ? (settings.chartType === 'gantt' ? 'alert alert-info py-2' : 'alert alert-warning py-2') : 'alert alert-danger py-2';
        status.classList.toggle('d-none', dated.length > 0 && messages.length === 0);
        status.innerHTML = dated.length === 0
            ? '<i class="fas fa-exclamation-triangle"></i> Aucune réalisation complète ne correspond aux bornes OM missionnaire sélectionnées.'
            : `<i class="fas fa-info-circle"></i> ${messages.join(' ; ')}.`;
    }
    ['DREN', 'CISCO', 'ZAP'].forEach(level => renderRealisationTimelineLevel(level, dated, periodKeys, settings));
};

window.resetRealisationTimelineControls = function() {
    $('#real-period-select').val('month');
    $('#real-display-mode').val('detailed');
    $('#real-chart-type').val('gantt');
    $('#real-top-entities').val('10');
    $('#real-date-start, #real-date-end').val('');
    $('#real-layout-grouped').prop('checked', true);
    syncRealisationChartControls();
    updateRealisationZoomControls();
    window.runRealisationTemporel();
};

function sanitizeRealisationFilename(value) {
    return normalizeRealisationKey(value || 'graphique').replace(/^_+|_+$/g, '').slice(0, 80) || 'graphique';
}

function clampRealisationExportDimension(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, Math.round(Number(value) || minimum)));
}

function getRealisationExportFormat(format = 'png') {
    const normalized = String(format || 'png').toLowerCase();
    if (normalized === 'jpeg' || normalized === 'jpg') {
        return { extension: 'jpg', mime: 'image/jpeg', quality: .96, label: 'JPEG' };
    }
    return { extension: 'png', mime: 'image/png', quality: 1, label: 'PNG' };
}

function isRealisationGanttChart(chart) {
    if (!chart) return false;
    const datasets = Array.isArray(chart.data?.datasets) ? chart.data.datasets : [];
    return chart.options?.indexAxis === 'y' && datasets.some(dataset =>
        Array.isArray(dataset?.data) && dataset.data.some(value => Array.isArray(value) && value.length >= 2)
    );
}

function calculateRealisationExportDimensions(chart) {
    const canvas = chart?.canvas;
    const sourceWidth = Math.max(1, Number(canvas?.width || chart?.width || 1200));
    const sourceHeight = Math.max(1, Number(canvas?.height || chart?.height || 700));
    const labelsCount = Math.max(1, Array.isArray(chart?.data?.labels) ? chart.data.labels.length : 1);
    const datasetsCount = Math.max(1, Array.isArray(chart?.data?.datasets) ? chart.data.datasets.length : 1);
    const gantt = isRealisationGanttChart(chart);

    const contentWidth = gantt
        ? Math.max(sourceWidth * 1.8, 3200 + datasetsCount * 180)
        : Math.max(sourceWidth * 2.2, 2800 + datasetsCount * 170);
    const contentHeight = gantt
        ? Math.max(sourceHeight * 1.8, 1200 + labelsCount * 95)
        : Math.max(sourceHeight * 2.2, 1700 + Math.min(labelsCount, 50) * 28);

    return {
        chartWidth: clampRealisationExportDimension(contentWidth, 2800, 10000),
        chartHeight: clampRealisationExportDimension(contentHeight, 1700, 7000),
        sourceWidth,
        sourceHeight,
        gantt,
        labelsCount,
        datasetsCount
    };
}

function getRealisationExportTitle(ref, level = '') {
    const settings = getRealisationTimelineSettings();
    const chartTypeDescription = REALISATION_CHART_DESCRIPTIONS?.[settings.chartType]?.title || settings.chartType || 'Graphique';
    const rawLevelLabel = String(ref?._level || level || '');
    const knownLevelMatch = rawLevelLabel.match(/DREN|CISCO|ZAP|STD/i);
    const levelLabel = (knownLevelMatch ? knownLevelMatch[0] : rawLevelLabel).toUpperCase();
    const refName = String(ref?.name || '').replace(/_/g, ' ').trim();
    return [
        'Analyse des Réalisations des STD',
        levelLabel ? `Niveau : ${levelLabel}` : '',
        chartTypeDescription,
        refName && !refName.toLowerCase().includes(levelLabel.toLowerCase()) ? refName : ''
    ].filter(Boolean).join(' — ');
}

async function buildRealisationHighResolutionImage(ref, format = 'png', level = '') {
    const chart = ref?.chart;
    const source = chart?.canvas;
    if (!chart || !source) throw new Error('Graphique indisponible pour l’exportation.');

    const formatInfo = getRealisationExportFormat(format);
    const dimensions = calculateRealisationExportDimensions(chart);
    const margin = 80;
    const headerHeight = 190;
    const footerHeight = 90;
    const outputWidth = dimensions.chartWidth + margin * 2;
    const outputHeight = dimensions.chartHeight + headerHeight + footerHeight;
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = outputWidth;
    exportCanvas.height = outputHeight;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) throw new Error('Impossible de préparer le canevas haute définition.');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outputWidth, outputHeight);

    const title = getRealisationExportTitle(ref, level);
    ctx.fillStyle = '#0b6b3a';
    ctx.font = '700 42px Segoe UI, Arial, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(title, margin, 34, outputWidth - margin * 2);

    const settings = getRealisationTimelineSettings();
    const exportSelection = getRealisationExcelSelection(level);
    const periodStart = exportSelection.axisStart ? formatRealisationGanttDate(exportSelection.axisStart) : '—';
    const periodEnd = exportSelection.axisEnd ? formatRealisationGanttDate(exportSelection.axisEnd) : '—';
    ctx.fillStyle = '#425466';
    ctx.font = '500 26px Segoe UI, Arial, sans-serif';
    ctx.fillText(`Période OM missionnaire : ${periodStart} → ${periodEnd}`, margin, 96, outputWidth - margin * 2);
    ctx.fillText(`Dimensions HD : ${outputWidth.toLocaleString('fr-FR')} × ${outputHeight.toLocaleString('fr-FR')} pixels`, margin, 136, outputWidth - margin * 2);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
        source,
        0,
        0,
        source.width,
        source.height,
        margin,
        headerHeight,
        dimensions.chartWidth,
        dimensions.chartHeight
    );

    ctx.fillStyle = '#52606d';
    ctx.font = '500 22px Segoe UI, Arial, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(
        `Export ${formatInfo.label} haute définition — ${new Date().toLocaleString('fr-FR')}`,
        margin,
        outputHeight - footerHeight / 2
    );

    return {
        dataUrl: exportCanvas.toDataURL(formatInfo.mime, formatInfo.quality),
        canvas: exportCanvas,
        width: outputWidth,
        height: outputHeight,
        extension: formatInfo.extension,
        mime: formatInfo.mime,
        label: formatInfo.label
    };
}

function downloadRealisationDataUrl(dataUrl, filename) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
}

async function buildRealisationPrintImages(refs, levelPrefix = '') {
    const images = [];
    for (let index = 0; index < refs.length; index += 1) {
        const ref = refs[index];
        const generated = await buildRealisationHighResolutionImage(ref, 'png', levelPrefix);
        images.push({
            ...generated,
            title: getRealisationExportTitle(ref, levelPrefix),
            index: index + 1
        });
    }
    return images;
}

async function printRealisationReferences(refs, title, levelPrefix = '') {
    const validRefs = Array.isArray(refs) ? refs.filter(ref => ref?.chart) : [];
    if (!validRefs.length) return alert('Aucun graphique disponible pour l’impression.');

    const printWindow = window.open('', '_blank');
    if (!printWindow) return alert('La fenêtre d’impression a été bloquée par le navigateur. Autorisez les fenêtres contextuelles, puis réessayez.');
    printWindow.document.open();
    printWindow.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Préparation de l’impression</title></head><body style="font-family:Arial;padding:30px">Préparation des graphiques haute définition…</body></html>');
    printWindow.document.close();

    try {
        const images = await buildRealisationPrintImages(validRefs, levelPrefix);
        const pages = images.map((image, index) => `
            <section class="print-page">
                <h1>${escapeRealisationHtml(image.title)}</h1>
                <p class="print-meta">Image HD ${image.width.toLocaleString('fr-FR')} × ${image.height.toLocaleString('fr-FR')} pixels — graphique ${index + 1}/${images.length}</p>
                <img src="${image.dataUrl}" alt="${escapeRealisationHtml(image.title)}">
            </section>
        `).join('');
        printWindow.document.open();
        printWindow.document.write(`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeRealisationHtml(title)}</title>
<style>
    @page { size: A3 landscape; margin: 8mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; color: #172b22; background: #fff; }
    .toolbar { position: sticky; top: 0; z-index: 10; display: flex; gap: 10px; padding: 10px 14px; background: #f1f8f4; border-bottom: 1px solid #bdd9c8; }
    .toolbar button { border: 1px solid #138a4d; border-radius: 6px; background: #138a4d; color: #fff; padding: 8px 14px; font-weight: 700; cursor: pointer; }
    .print-page { page-break-after: always; break-after: page; padding: 4mm; }
    .print-page:last-child { page-break-after: auto; break-after: auto; }
    h1 { margin: 0 0 4mm; font-size: 18pt; color: #0b6b3a; }
    .print-meta { margin: 0 0 4mm; font-size: 9pt; color: #52606d; }
    img { display: block; width: 100%; height: auto; max-height: 250mm; object-fit: contain; object-position: top left; }
    @media print { .toolbar { display: none; } .print-page { padding: 0; } }
</style>
</head>
<body>
<div class="toolbar"><button type="button" onclick="window.print()">Imprimer maintenant</button><button type="button" onclick="window.close()">Fermer</button></div>
${pages}
<script>
(function(){
    const images = Array.from(document.images);
    let remaining = images.length;
    const ready = () => { remaining -= 1; if (remaining <= 0) setTimeout(() => window.print(), 350); };
    if (!remaining) setTimeout(() => window.print(), 350);
    images.forEach(image => image.complete ? ready() : (image.onload = ready, image.onerror = ready));
})();
<\/script>
</body>
</html>`);
        printWindow.document.close();
    } catch (error) {
        printWindow.close();
        console.error(error);
        alert(`Impression impossible : ${error.message || error}`);
    }
}


window.exportRealisationChart = async function(level, format = 'png') {
    const key = String(level || '').toUpperCase();
    const refs = Array.isArray(realisationTimelineChartsRefs[key]) ? realisationTimelineChartsRefs[key] : [];
    if (!refs.length) return alert('Aucun graphique disponible pour ce niveau.');
    const formatInfo = getRealisationExportFormat(format);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');

    if (refs.length === 1) {
        const generated = await buildRealisationHighResolutionImage(refs[0], formatInfo.extension, key);
        downloadRealisationDataUrl(
            generated.dataUrl,
            `realisations_${key.toLowerCase()}_${generated.width}x${generated.height}_${stamp}.${generated.extension}`
        );
        return;
    }

    if (typeof JSZip === 'undefined') {
        for (let index = 0; index < refs.length; index += 1) {
            const ref = refs[index];
            const generated = await buildRealisationHighResolutionImage(ref, formatInfo.extension, key);
            downloadRealisationDataUrl(
                generated.dataUrl,
                `realisations_${sanitizeRealisationFilename(ref.name || `${key}_${index + 1}`)}_${generated.width}x${generated.height}_${stamp}.${generated.extension}`
            );
        }
        return;
    }

    const zip = new JSZip();
    for (let index = 0; index < refs.length; index += 1) {
        const ref = refs[index];
        const generated = await buildRealisationHighResolutionImage(ref, formatInfo.extension, key);
        const base64 = generated.dataUrl.split(',')[1];
        zip.file(
            `${String(index + 1).padStart(2, '0')}_${sanitizeRealisationFilename(ref.name || key)}_${generated.width}x${generated.height}.${generated.extension}`,
            base64,
            { base64: true }
        );
    }
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    downloadFile(blob, `realisations_${key.toLowerCase()}_individuelles_${formatInfo.extension}_hd_${stamp}.zip`);
};

window.exportAllRealisationCharts = async function(format = 'png') {
    const available = Object.entries(realisationTimelineChartsRefs)
        .flatMap(([level, refs]) => (Array.isArray(refs) ? refs : []).map(ref => ({ level, ...ref })));
    if (!available.length) return alert('Actualisez d’abord l’analyse temporelle.');
    const formatInfo = getRealisationExportFormat(format);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');

    if (typeof JSZip === 'undefined') {
        for (const level of ['DREN', 'CISCO', 'ZAP']) await window.exportRealisationChart(level, formatInfo.extension);
        return;
    }

    const zip = new JSZip();
    for (let index = 0; index < available.length; index += 1) {
        const ref = available[index];
        const generated = await buildRealisationHighResolutionImage(ref, formatInfo.extension, ref.level);
        const base64 = generated.dataUrl.split(',')[1];
        zip.file(
            `${String(index + 1).padStart(2, '0')}_${ref.level.toLowerCase()}_${sanitizeRealisationFilename(ref.name)}_${generated.width}x${generated.height}.${generated.extension}`,
            base64,
            { base64: true }
        );
    }
    const settings = getRealisationTimelineSettings();
    zip.file('criteres.json', JSON.stringify(settings, (key, value) => value instanceof Date ? formatISODateUTC(value) : value, 2));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    downloadFile(blob, `graphiques_realisations_${formatInfo.extension}_hd_${stamp}.zip`);
};


function getRealisationExcelDate(value) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
    return new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function getRealisationExcelSelection(level = '') {
    const settings = getRealisationTimelineSettings();
    const normalizedLevel = String(level || '').toUpperCase();
    const completeRecords = getRealisationsData().filter(item => item.dateStart && item.dateEnd);
    const dateFiltered = completeRecords.filter(item => {
        if (settings.start && item.dateStart < settings.start) return false;
        if (settings.end && item.dateEnd > settings.end) return false;
        return true;
    });
    const starts = dateFiltered.map(item => item.dateStart).sort((a, b) => a - b);
    const ends = dateFiltered.map(item => item.dateEnd).sort((a, b) => a - b);
    const axisStart = settings.start || starts[0] || null;
    const axisEnd = settings.end || ends[ends.length - 1] || null;
    const levels = normalizedLevel && normalizedLevel !== 'STD' ? [normalizedLevel] : ['DREN', 'CISCO', 'ZAP'];
    const selectedRecords = [];

    levels.forEach(levelKey => {
        const levelRecords = dateFiltered.filter(item => item.niveau === levelKey);
        const ranked = getRankedRealisationGanttEntities(levelRecords, settings.top);
        const selectedEntities = new Set(ranked.map(([entity]) => entity));
        levelRecords.forEach(item => {
            if (selectedEntities.has(item.entite)) selectedRecords.push(item);
        });
    });

    selectedRecords.sort((a, b) => {
        const levelDiff = String(a.niveau).localeCompare(String(b.niveau), 'fr');
        if (levelDiff) return levelDiff;
        const entityDiff = String(a.entite).localeCompare(String(b.entite), 'fr');
        if (entityDiff) return entityDiff;
        const dateDiff = (a.dateStart?.getTime() || 0) - (b.dateStart?.getTime() || 0);
        if (dateDiff) return dateDiff;
        return String(a.id).localeCompare(String(b.id), 'fr');
    });

    return { settings, records: selectedRecords, allFilteredRecords: dateFiltered, axisStart, axisEnd, levels };
}

function getRealisationExcelCriteria(selection) {
    const settings = selection.settings;
    const granularityLabels = { day: 'Jour', week: 'Semaine', month: 'Mois', quarter: 'Trimestre', semester: 'Semestre', year: 'Année' };
    const modeLabels = { detailed: 'Données détaillées', cumulative: 'Données cumulées' };
    const layoutLabels = { grouped: 'Affichage groupé', individual: 'Affichage individuel' };
    const chartDescription = REALISATION_CHART_DESCRIPTIONS?.[settings.chartType];
    return [
        ['Date et heure de l’exportation', new Date().toLocaleString('fr-FR')],
        ['Niveaux exportés', selection.levels.join(', ')],
        ['Type de graphique', chartDescription?.title || settings.chartType || 'Non défini'],
        ['Rôle du graphique', chartDescription?.summary || ''],
        ['Ce qui distingue le graphique', chartDescription?.distinction || ''],
        ['Graduation temporelle', granularityLabels[settings.granularity] || settings.granularity],
        ['Type de données', settings.chartType === 'gantt' ? 'Données détaillées — obligatoire pour le Gantt' : (modeLabels[settings.mode] || settings.mode)],
        ['Organisation des graphiques', layoutLabels[settings.layout] || settings.layout],
        ['Entités affichées', settings.top === 'all' ? 'Toutes' : `Top ${settings.top}`],
        ['Date début minimale — OM missionnaire', selection.axisStart ? formatISODateUTC(selection.axisStart) : 'Aucune'],
        ['Date fin maximale — OM missionnaire', selection.axisEnd ? formatISODateUTC(selection.axisEnd) : 'Aucune'],
        ['Nombre de réalisations exportées', selection.records.length],
        ['Valeur totale exportée', selection.records.reduce((sum, item) => sum + Number(item.valeur || 0), 0)]
    ];
}

function getRealisationExcelArgb(level = '') {
    const colors = { DREN: 'FF198754', CISCO: 'FF0D6EFD', ZAP: 'FFF59E0B', STD: 'FF0B6B3A' };
    return colors[String(level || '').toUpperCase()] || colors.STD;
}

function sanitizeRealisationExcelSheetName(value, fallback = 'Feuille') {
    const cleaned = String(value || fallback).replace(/[\\/\?\*\[\]:]/g, ' ').replace(/\s+/g, ' ').trim();
    return (cleaned || fallback).slice(0, 31);
}

function getUniqueRealisationExcelSheetName(workbook, baseName) {
    const base = sanitizeRealisationExcelSheetName(baseName);
    let candidate = base;
    let index = 2;
    while (workbook.getWorksheet(candidate)) {
        const suffix = ` ${index}`;
        candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
        index += 1;
    }
    return candidate;
}

function styleRealisationExcelTitle(worksheet, range, fillArgb = 'FF0B6B3A') {
    worksheet.mergeCells(range);
    const cell = worksheet.getCell(range.split(':')[0]);
    cell.font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    worksheet.getRow(cell.row).height = 30;
}

function styleRealisationExcelHeader(row, fillArgb = 'FF0B6B3A') {
    row.height = 27;
    row.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = {
            top: { style: 'thin', color: { argb: 'FFD5E2D8' } },
            left: { style: 'thin', color: { argb: 'FFD5E2D8' } },
            bottom: { style: 'thin', color: { argb: 'FFD5E2D8' } },
            right: { style: 'thin', color: { argb: 'FFD5E2D8' } }
        };
    });
}

function styleRealisationExcelDataRows(worksheet, startRow, endRow) {
    if (endRow < startRow) return;
    for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
        const row = worksheet.getRow(rowIndex);
        row.alignment = { vertical: 'top', wrapText: true };
        row.eachCell(cell => {
            cell.border = {
                top: { style: 'hair', color: { argb: 'FFDDE6E0' } },
                left: { style: 'hair', color: { argb: 'FFDDE6E0' } },
                bottom: { style: 'hair', color: { argb: 'FFDDE6E0' } },
                right: { style: 'hair', color: { argb: 'FFDDE6E0' } }
            };
            if (rowIndex % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6FAF7' } };
        });
        if (String(row.getCell(11).value || '').toLowerCase().includes('anomalie')) {
            row.getCell(11).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE0E0' } };
            row.getCell(11).font = { bold: true, color: { argb: 'FFB42318' } };
        }
    }
}

function addRealisationExcelDataSheet(workbook, level, records) {
    const sheetName = getUniqueRealisationExcelSheetName(workbook, `Données ${level}`);
    const worksheet = workbook.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
    const fillArgb = getRealisationExcelArgb(level);
    worksheet.getCell('A1').value = `Réalisations ${level} — Données détaillées`;
    styleRealisationExcelTitle(worksheet, 'A1:K1', fillArgb);
    worksheet.getCell('A2').value = 'Les dates correspondent aux champs « Date debut realisation dans om missionnaire » et « Date fin realisation dans om missionnaire ».';
    worksheet.mergeCells('A2:K2');
    worksheet.getCell('A2').font = { italic: true, color: { argb: 'FF52606D' } };
    worksheet.getCell('A2').alignment = { wrapText: true };

    const headerRowNumber = 4;
    const headers = ['ID Kobo', 'Niveau', 'Entité responsable', 'Sous-activité concernée', 'Date début réalisation OM', 'Date fin réalisation OM', 'Durée (jours inclusifs)', 'Valeur de réalisation', 'Date de suivi', 'Date de soumission', 'Statut de liaison'];
    worksheet.getRow(headerRowNumber).values = headers;
    styleRealisationExcelHeader(worksheet.getRow(headerRowNumber), fillArgb);

    const startRow = headerRowNumber + 1;
    records.forEach((record, index) => {
        const rowNumber = startRow + index;
        const duration = Math.max(1, Math.floor((record.dateEnd.getTime() - record.dateStart.getTime()) / 86400000) + 1);
        const row = worksheet.getRow(rowNumber);
        row.values = [
            String(record.id || ''),
            record.niveau,
            record.entite,
            record.activite || 'Non spécifiée',
            getRealisationExcelDate(record.dateStart),
            getRealisationExcelDate(record.dateEnd),
            null,
            Number(record.valeur || 0),
            getRealisationExcelDate(record.dateFollowup),
            getRealisationExcelDate(record.dateSubmission),
            record.isAnomaly ? 'Anomalie de liaison' : 'Valide'
        ];
        row.getCell(7).value = { formula: `IF(OR(E${rowNumber}="",F${rowNumber}=""),"",F${rowNumber}-E${rowNumber}+1)`, result: duration };
        [5, 6, 9, 10].forEach(column => { row.getCell(column).numFmt = 'dd/mm/yyyy'; });
        row.getCell(7).numFmt = '0';
        row.getCell(8).numFmt = '#,##0.00';
    });

    const endRow = startRow + records.length - 1;
    styleRealisationExcelDataRows(worksheet, startRow, endRow);
    if (records.length) {
        worksheet.autoFilter = { from: { row: headerRowNumber, column: 1 }, to: { row: headerRowNumber, column: headers.length } };
        const totalRow = endRow + 2;
        worksheet.getCell(`G${totalRow}`).value = 'TOTAL';
        worksheet.getCell(`G${totalRow}`).font = { bold: true };
        const totalValue = records.reduce((sum, item) => sum + Number(item.valeur || 0), 0);
        worksheet.getCell(`H${totalRow}`).value = { formula: `SUM(H${startRow}:H${endRow})`, result: totalValue };
        worksheet.getCell(`H${totalRow}`).font = { bold: true, color: { argb: fillArgb } };
        worksheet.getCell(`H${totalRow}`).numFmt = '#,##0.00';
    }

    const widths = [18, 11, 34, 48, 19, 19, 21, 20, 16, 18, 22];
    widths.forEach((width, index) => { worksheet.getColumn(index + 1).width = width; });
    worksheet.pageSetup.orientation = 'landscape';
    worksheet.pageSetup.fitToPage = true;
    worksheet.pageSetup.fitToWidth = 1;
    worksheet.pageSetup.fitToHeight = 0;

    return {
        sheetName,
        recordCount: records.length,
        total: records.reduce((sum, item) => sum + Number(item.valeur || 0), 0),
        entityCount: new Set(records.map(item => item.entite)).size,
        startRow,
        endRow
    };
}

async function buildRealisationExcelImage(ref, level) {
    const generated = await buildRealisationHighResolutionImage(ref, 'png', level);
    const maximumWidth = 3600;
    const maximumHeight = 2400;
    const scale = Math.min(1, maximumWidth / generated.width, maximumHeight / generated.height);
    if (scale >= .999) return generated;
    const width = Math.max(1, Math.round(generated.width * scale));
    const height = Math.max(1, Math.round(generated.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(generated.canvas, 0, 0, width, height);
    return { ...generated, dataUrl: canvas.toDataURL('image/png', 1), canvas, width, height, extension: 'png', mime: 'image/png' };
}

async function addRealisationExcelGraphSheets(workbook, references, levelPrefix = '') {
    for (let index = 0; index < references.length; index += 1) {
        const ref = references[index];
        const level = String(ref._level || levelPrefix || '').toUpperCase();
        const image = await buildRealisationExcelImage(ref, level);
        const sheetName = getUniqueRealisationExcelSheetName(workbook, `Graphique ${level || 'STD'} ${index + 1}`);
        const worksheet = workbook.addWorksheet(sheetName, { views: [{ showGridLines: false }] });
        worksheet.getCell('A1').value = getRealisationExportTitle(ref, level);
        styleRealisationExcelTitle(worksheet, 'A1:J1', getRealisationExcelArgb(level || 'STD'));
        worksheet.getCell('A2').value = `Image intégrée : ${image.width.toLocaleString('fr-FR')} × ${image.height.toLocaleString('fr-FR')} pixels`;
        worksheet.getCell('A2').font = { italic: true, color: { argb: 'FF52606D' } };
        worksheet.mergeCells('A2:J2');
        const imageId = workbook.addImage({ base64: image.dataUrl, extension: 'png' });
        const displayScale = Math.min(1, 1800 / image.width, 1050 / image.height);
        const displayWidth = Math.max(800, Math.round(image.width * displayScale));
        const displayHeight = Math.max(460, Math.round(image.height * displayScale));
        worksheet.addImage(imageId, { tl: { col: 0.15, row: 3 }, ext: { width: displayWidth, height: displayHeight } });
        for (let column = 1; column <= 10; column += 1) worksheet.getColumn(column).width = 22;
        worksheet.pageSetup.orientation = 'landscape';
        worksheet.pageSetup.fitToPage = true;
        worksheet.pageSetup.fitToWidth = 1;
        worksheet.pageSetup.fitToHeight = 1;
    }
}

function fillRealisationExcelCriteriaSheet(worksheet, selection) {
    worksheet.getCell('A1').value = 'Critères de l’analyse des réalisations';
    styleRealisationExcelTitle(worksheet, 'A1:B1', 'FF44546A');
    worksheet.getRow(3).values = ['Critère', 'Valeur'];
    styleRealisationExcelHeader(worksheet.getRow(3), 'FF44546A');
    getRealisationExcelCriteria(selection).forEach((item, index) => {
        const row = worksheet.getRow(index + 4);
        row.values = item;
        row.getCell(1).font = { bold: true };
        row.alignment = { vertical: 'top', wrapText: true };
        if ((index + 4) % 2 === 0) row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F6F8' } }; });
    });
    worksheet.getColumn(1).width = 42;
    worksheet.getColumn(2).width = 80;
    worksheet.views = [{ state: 'frozen', ySplit: 3, showGridLines: false }];
}

function fillRealisationExcelSummarySheet(worksheet, selection, dataSheets) {
    worksheet.getCell('A1').value = 'Analyse des Réalisations des STD — Export Excel XLSX';
    styleRealisationExcelTitle(worksheet, 'A1:E1', 'FF0B6B3A');
    worksheet.getCell('A2').value = 'Le classeur contient les critères, les données détaillées, les durées calculées et les graphiques correspondant à l’affichage sélectionné.';
    worksheet.mergeCells('A2:E2');
    worksheet.getCell('A2').alignment = { wrapText: true };
    worksheet.getCell('A2').font = { italic: true, color: { argb: 'FF52606D' } };

    worksheet.getRow(4).values = ['Niveau', 'Réalisations', 'Entités actives', 'Valeur totale', 'Période couverte'];
    styleRealisationExcelHeader(worksheet.getRow(4), 'FF0B6B3A');
    dataSheets.forEach((info, index) => {
        const row = worksheet.getRow(index + 5);
        row.values = [
            info.level,
            info.recordCount,
            info.entityCount,
            info.total,
            selection.axisStart && selection.axisEnd ? `${formatISODateUTC(selection.axisStart)} → ${formatISODateUTC(selection.axisEnd)}` : 'Aucune'
        ];
        row.getCell(2).numFmt = '#,##0';
        row.getCell(3).numFmt = '#,##0';
        row.getCell(4).numFmt = '#,##0.00';
    });
    const totalRow = 5 + dataSheets.length + 1;
    worksheet.getCell(`A${totalRow}`).value = 'TOTAL';
    worksheet.getCell(`A${totalRow}`).font = { bold: true };
    if (dataSheets.length) {
        worksheet.getCell(`B${totalRow}`).value = { formula: `SUM(B5:B${4 + dataSheets.length})`, result: dataSheets.reduce((sum, info) => sum + info.recordCount, 0) };
        worksheet.getCell(`D${totalRow}`).value = { formula: `SUM(D5:D${4 + dataSheets.length})`, result: dataSheets.reduce((sum, info) => sum + info.total, 0) };
    }
    worksheet.getRow(totalRow).font = { bold: true, color: { argb: 'FF0B6B3A' } };
    worksheet.columns = [{ width: 18 }, { width: 18 }, { width: 18 }, { width: 20 }, { width: 28 }];
    worksheet.views = [{ state: 'frozen', ySplit: 4, showGridLines: false }];
}

async function exportRealisationExcelWorkbook(level = '') {
    if (typeof ExcelJS === 'undefined') return alert('La bibliothèque ExcelJS est indisponible. Rechargez la page puis réessayez.');
    const normalizedLevel = String(level || '').toUpperCase();
    const references = normalizedLevel && normalizedLevel !== 'STD'
        ? (Array.isArray(realisationTimelineChartsRefs[normalizedLevel]) ? realisationTimelineChartsRefs[normalizedLevel].map(ref => ({ ...ref, _level: normalizedLevel })) : [])
        : Object.entries(realisationTimelineChartsRefs).flatMap(([levelKey, refs]) => (Array.isArray(refs) ? refs : []).map(ref => ({ ...ref, _level: levelKey })));
    if (!references.length) return alert('Actualisez d’abord l’analyse afin de créer les graphiques à insérer dans le classeur Excel.');

    const selection = getRealisationExcelSelection(normalizedLevel);
    if (!selection.records.length) return alert('Aucune réalisation ne correspond aux critères sélectionnés.');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Plateforme de Suivi du PMA';
    workbook.lastModifiedBy = 'Plateforme de Suivi du PMA';
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.calcProperties.fullCalcOnLoad = true;
    workbook.subject = 'Analyse des réalisations DREN, CISCO et ZAP';
    workbook.title = normalizedLevel && normalizedLevel !== 'STD' ? `Réalisations ${normalizedLevel}` : 'Réalisations des STD';

    const summarySheet = workbook.addWorksheet('Synthèse', { views: [{ showGridLines: false }] });
    const criteriaSheet = workbook.addWorksheet('Critères', { views: [{ showGridLines: false }] });
    fillRealisationExcelCriteriaSheet(criteriaSheet, selection);

    const dataSheets = [];
    selection.levels.forEach(levelKey => {
        const records = selection.records.filter(item => item.niveau === levelKey);
        if (!records.length) return;
        dataSheets.push({ level: levelKey, ...addRealisationExcelDataSheet(workbook, levelKey, records) });
    });
    fillRealisationExcelSummarySheet(summarySheet, selection, dataSheets);
    await addRealisationExcelGraphSheets(workbook, references, normalizedLevel || 'STD');

    const buffer = await workbook.xlsx.writeBuffer();
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
    const prefix = normalizedLevel && normalizedLevel !== 'STD' ? `realisations_${normalizedLevel.toLowerCase()}` : 'realisations_std_dren_cisco_zap';
    downloadFile(
        new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `${prefix}_donnees_criteres_graphiques_${stamp}.xlsx`
    );
}

window.exportRealisationChartToExcel = async function(level) {
    try {
        await exportRealisationExcelWorkbook(level);
    } catch (error) {
        console.error(error);
        alert(`Export Excel impossible : ${error.message || error}`);
    }
};

window.exportAllRealisationChartsToExcel = async function() {
    try {
        await exportRealisationExcelWorkbook('STD');
    } catch (error) {
        console.error(error);
        alert(`Export Excel impossible : ${error.message || error}`);
    }
};

window.printRealisationChart = async function(level) {
    const key = String(level || '').toUpperCase();
    const refs = Array.isArray(realisationTimelineChartsRefs[key]) ? realisationTimelineChartsRefs[key] : [];
    await printRealisationReferences(refs, `Impression des réalisations ${key}`, key);
};

window.printAllRealisationCharts = async function() {
    const refs = Object.entries(realisationTimelineChartsRefs)
        .flatMap(([level, items]) => (Array.isArray(items) ? items : []).map(ref => ({ ...ref, name: `${level.toLowerCase()}_${ref.name || 'graphique'}`, _level: level })));
    await printRealisationReferences(refs, 'Impression des réalisations DREN, CISCO et ZAP', 'STD');
};


function realisationDataUrlToBlob(dataUrl) {
    const [header, payload] = String(dataUrl || '').split(',');
    if (!header || !payload) throw new Error('Image du graphique indisponible.');
    const mime = (header.match(/data:([^;]+)/) || [])[1] || 'image/png';
    const bytes = atob(payload);
    const array = new Uint8Array(bytes.length);
    for (let index = 0; index < bytes.length; index += 1) array[index] = bytes.charCodeAt(index);
    return new Blob([array], { type: mime });
}

async function buildRealisationSharePackage(refs, prefix, includeCriteria = false) {
    const validRefs = Array.isArray(refs) ? refs.filter(ref => ref?.chart) : [];
    if (!validRefs.length) throw new Error('Aucun graphique disponible.');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
    if (validRefs.length === 1) {
        const generated = await buildRealisationHighResolutionImage(validRefs[0], 'png', prefix);
        const blob = realisationDataUrlToBlob(generated.dataUrl);
        return { blob, filename: `${sanitizeRealisationFilename(prefix)}_${generated.width}x${generated.height}_${stamp}.png`, type: 'image/png' };
    }
    if (typeof JSZip === 'undefined') {
        const generated = await buildRealisationHighResolutionImage(validRefs[0], 'png', prefix);
        const blob = realisationDataUrlToBlob(generated.dataUrl);
        return { blob, filename: `${sanitizeRealisationFilename(prefix)}_${generated.width}x${generated.height}_${stamp}.png`, type: 'image/png' };
    }
    const zip = new JSZip();
    for (let index = 0; index < validRefs.length; index += 1) {
        const ref = validRefs[index];
        const generated = await buildRealisationHighResolutionImage(ref, 'png', prefix);
        const base64 = generated.dataUrl.split(',')[1];
        zip.file(`${String(index + 1).padStart(2, '0')}_${sanitizeRealisationFilename(ref.name || `graphique_${index + 1}`)}_${generated.width}x${generated.height}.png`, base64, { base64: true });
    }
    if (includeCriteria) {
        const settings = getRealisationTimelineSettings();
        zip.file('criteres.json', JSON.stringify(settings, (key, value) => value instanceof Date ? formatISODateUTC(value) : value, 2));
    }
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    return { blob, filename: `${sanitizeRealisationFilename(prefix)}_png_hd_${stamp}.zip`, type: 'application/zip' };
}

async function shareRealisationPackage(packageInfo, title, text) {
    const file = new File([packageInfo.blob], packageInfo.filename, { type: packageInfo.type });
    const sharePayload = { title, text, files: [file] };
    if (navigator.share && (!navigator.canShare || navigator.canShare(sharePayload))) {
        try {
            await navigator.share(sharePayload);
            return true;
        } catch (error) {
            if (error?.name === 'AbortError') return false;
            console.warn('Partage natif impossible :', error);
        }
    }
    downloadFile(packageInfo.blob, packageInfo.filename);
    alert('Le partage direct n’est pas disponible dans ce navigateur. Le fichier a été téléchargé afin que vous puissiez le joindre manuellement.');
    return false;
}

window.shareRealisationChart = async function(level) {
    const key = String(level || '').toUpperCase();
    const refs = Array.isArray(realisationTimelineChartsRefs[key]) ? realisationTimelineChartsRefs[key] : [];
    if (!refs.length) return alert('Aucun graphique disponible pour ce niveau. Actualisez d’abord l’analyse.');
    try {
        const packageInfo = await buildRealisationSharePackage(refs, `realisations_${key.toLowerCase()}`);
        await shareRealisationPackage(
            packageInfo,
            `Analyse des réalisations ${key}`,
            `Graphique des réalisations ${key} — période OM missionnaire, valeurs et entités.`
        );
    } catch (error) {
        console.error(error);
        alert(`Partage impossible : ${error.message || error}`);
    }
};

window.shareAllRealisationCharts = async function() {
    const refs = Object.entries(realisationTimelineChartsRefs)
        .flatMap(([level, items]) => (Array.isArray(items) ? items : []).map(ref => ({ ...ref, name: `${level.toLowerCase()}_${ref.name || 'graphique'}` })));
    if (!refs.length) return alert('Actualisez d’abord l’analyse temporelle.');
    try {
        const packageInfo = await buildRealisationSharePackage(refs, 'graphiques_realisations_dren_cisco_zap', true);
        await shareRealisationPackage(
            packageInfo,
            'Analyse des réalisations des STD',
            'Graphiques des réalisations DREN, CISCO et ZAP avec période de début-fin OM missionnaire.'
        );
    } catch (error) {
        console.error(error);
        alert(`Partage impossible : ${error.message || error}`);
    }
};

window.extractRealisationsTable = function() {
    const data = getRealisationsData();
    const tbody = $('#tbody-realisations').empty();
    if (!data.length) {
        tbody.append('<tr><td colspan="7" class="text-center text-muted py-4">Aucune valeur de réalisation exploitable trouvée dans la base.</td></tr>');
        return;
    }
    data.sort((a,b) => (b.dateSubmission?.getTime() || 0) - (a.dateSubmission?.getTime() || 0));
    data.forEach(item => {
        const trClass = item.isAnomaly ? 'class="table-danger"' : '';
        const anomalyBadge = item.isAnomaly ? '<br><span class="badge bg-danger mt-1"><i class="fas fa-exclamation-triangle"></i> Anomalie de liaison</span>' : '';
        tbody.append(`<tr ${trClass}>
            <td class="text-center">${item.dateSubmission ? formatISODateUTC(item.dateSubmission) : ''}</td>
            <td class="text-center">${item.dateStart ? formatISODateUTC(item.dateStart) : '<span class="text-muted">Non renseignée</span>'}</td>
            <td class="text-center">${item.dateEnd ? formatISODateUTC(item.dateEnd) : '<span class="text-muted">Non renseignée</span>'}</td>
            <td class="text-center"><span class="badge bg-secondary">${item.niveau}</span></td>
            <td class="fw-bold">${escapeRealisationHtml(item.entite)}${anomalyBadge}</td>
            <td class="small">${escapeRealisationHtml(item.activite)}</td>
            <td class="text-center bg-light fw-bold fs-5">${item.valeur.toLocaleString('fr-FR')}</td>
        </tr>`);
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
        if (document.getElementById('master-realisations')?.classList.contains('active')) {
            setTimeout(() => window.runRealisationTemporel(), 0);
        }
        
        let bEx = isExcelLoaded ? '<span class="badge bg-success ms-2"><i class="fas fa-check-circle"></i> Traduit</span>' : '<span class="badge bg-warning text-dark ms-2"><i class="fas fa-info-circle"></i> Brut</span>';
        $('#sync-status').html(`<span class="badge bg-success sync-badge"><i class="fas fa-check-double"></i> Ok : ${allData.length} Lignes</span>`).append(bEx);

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? 'Erreur inconnue');
        const isNetworkError = /connexion|réseau|network|fetch|bloque|cors|antivirus|adblock|ublock/i.test(message);
        const title = isNetworkError ? 'Erreur de connexion KoboToolbox' : 'Erreur interne de traitement';
        console.error(title + ' :', error);
        $('#error-box').html(`<strong>${title} :</strong> ${escapeRealisationHtml(message)}`).show();
        $('#sync-status').html(`<span class="badge bg-danger sync-badge">${isNetworkError ? 'Échec Kobo' : 'Erreur de traitement'}</span>`);
    } finally { 
        $('#loading-box').hide(); 
    }
}


/* ================================================================
   CONTENEURS ADAPTATIFS ET LÉGENDES POUR TOUS LES GRAPHIQUES
   - Le graphique reste fluide tant que son contenu est lisible.
   - Une scrollbar horizontale ou verticale n'apparaît que lorsque
     les dimensions calculées dépassent réellement la zone visible.
   - Les légendes Chart.js sont activées pour les graphiques à plusieurs
     séries et les graphiques circulaires, sauf lorsqu'une légende HTML
     interactive existe déjà à côté du graphique.
   ================================================================ */
const UNIVERSAL_CHART_SCROLL_HOST_SELECTOR = [
    '.global-chart-scroll',
    '.timeline-chart-scroll',
    '.realisation-chart-scroll',
    '.realisation-gantt-individual-canvas',
    '.realisation-individual-canvas'
].join(',');

function getChartInstanceForCanvas(canvas) {
    if (!canvas || typeof Chart === 'undefined') return null;
    try {
        if (typeof Chart.getChart === 'function') {
            const direct = Chart.getChart(canvas);
            if (direct) return direct;
        }
        if (Chart.instances) {
            const instances = Chart.instances instanceof Map
                ? [...Chart.instances.values()]
                : Object.values(Chart.instances);
            return instances.find(instance => instance && instance.canvas === canvas) || null;
        }
    } catch (error) {
        console.warn('Recherche de l’instance Chart.js impossible :', error);
    }
    return null;
}

function hasExternalChartLegend(canvas) {
    if (!canvas) return false;
    const scope = canvas.closest(
        '.timeline-chart-card, .realisation-level-card, .realisation-individual-card, .card, article'
    ) || canvas.parentElement;
    if (!scope) return false;
    return Boolean(scope.querySelector(
        '.timeline-html-legend, .realisation-legend, [data-chart-legend="external"], .chart-html-legend'
    ));
}

function getAdaptiveChartType(chart) {
    return String(chart?.config?.type || chart?.data?.datasets?.[0]?.type || 'line').toLowerCase();
}

function getAdaptiveChartProfile(chart) {
    const datasets = (chart?.data?.datasets || []).filter(dataset => dataset && dataset.hidden !== true);
    const labels = Array.isArray(chart?.data?.labels) ? chart.data.labels : [];
    const dataLengths = datasets.map(dataset => Array.isArray(dataset.data) ? dataset.data.length : 0);
    const labelCount = Math.max(labels.length, ...dataLengths, 0);
    const longestLabel = labels.reduce((max, label) => Math.max(max, String(label ?? '').length), 0);
    const type = getAdaptiveChartType(chart);
    const circular = ['pie', 'doughnut', 'polararea'].includes(type);
    const radar = type === 'radar';
    const scatter = type === 'scatter' || type === 'bubble';
    const horizontal = chart?.options?.indexAxis === 'y';
    const pointCount = dataLengths.reduce((sum, count) => sum + count, 0);
    return {
        datasets,
        datasetCount: datasets.length,
        labels,
        labelCount,
        longestLabel,
        type,
        circular,
        radar,
        scatter,
        horizontal,
        pointCount
    };
}

function configureAdaptiveChartLegend(chart, canvas, updateChart = true) {
    if (!chart || !canvas) return false;

    try {
        const profile = getAdaptiveChartProfile(chart);
        const externalLegend = hasExternalChartLegend(canvas);
        const shouldDisplay = !externalLegend && (profile.circular || profile.radar || profile.datasetCount > 1);
        const desiredPosition = (profile.circular || profile.datasetCount > 6) ? 'bottom' : 'top';

        /*
         * IMPORTANT : on modifie la configuration source (objet JavaScript simple)
         * plutôt que chart.options, qui est un proxy interne de Chart.js. Modifier
         * ce proxy pendant beforeInit pouvait provoquer « startsWith is not a
         * function » dans le résolveur d'options de Chart.js.
         */
        if (!chart.config) return false;
        const sourceOptions = chart.config.options || (chart.config.options = {});
        sourceOptions.plugins = sourceOptions.plugins || {};

        const previousLegend = sourceOptions.plugins.legend;
        const legend = previousLegend && typeof previousLegend === 'object'
            ? Object.assign({}, previousLegend)
            : {};
        const previousLabels = legend.labels && typeof legend.labels === 'object'
            ? Object.assign({}, legend.labels)
            : {};

        profile.datasets.forEach((dataset, index) => {
            const normalizedLabel = String(dataset.label ?? '').trim();
            dataset.label = normalizedLabel || (profile.datasetCount > 1 ? `Série ${index + 1}` : 'Données');
        });

        const signature = [
            shouldDisplay ? '1' : '0',
            desiredPosition,
            profile.datasetCount,
            profile.labelCount,
            externalLegend ? 'external' : 'canvas'
        ].join('|');
        if (chart.$adaptiveLegendSignature === signature) return false;

        legend.display = shouldDisplay;
        if (shouldDisplay) {
            legend.position = desiredPosition;
            legend.align = 'center';
            legend.labels = Object.assign(previousLabels, {
                usePointStyle: true,
                pointStyleWidth: 14,
                boxWidth: 13,
                boxHeight: 8,
                padding: 14,
                font: { size: profile.datasetCount > 12 ? 10 : 11 }
            });
            canvas.classList.add('chartjs-legend-enabled');
        } else {
            canvas.classList.remove('chartjs-legend-enabled');
        }

        sourceOptions.plugins.legend = legend;
        chart.$adaptiveLegendSignature = signature;
        if (updateChart && typeof chart.update === 'function') {
            chart.$adaptiveLegendUpdateInProgress = true;
            try {
                chart.update('none');
            } finally {
                chart.$adaptiveLegendUpdateInProgress = false;
            }
        }
        return true;
    } catch (error) {
        console.warn('Configuration adaptative de la légende ignorée :', error);
        return false;
    }
}

function wrapCanvasInUniversalChartStage(canvas, host, stageClass = 'universal-chart-stage') {
    if (!canvas || !host) return null;
    const currentParent = canvas.parentElement;
    if (!currentParent) return null;

    if (currentParent.classList.contains('universal-chart-stage') || currentParent.classList.contains('universal-chart-existing-stage')) {
        return currentParent;
    }

    const stage = document.createElement('div');
    stage.className = stageClass;
    currentParent.insertBefore(stage, canvas);
    stage.appendChild(canvas);
    return stage;
}

function getAdaptiveChartStage(canvas, host) {
    let stage = canvas.closest(
        '.timeline-chart-stage, .realisation-chart-stage, .realisation-gantt-individual-stage, .universal-chart-stage, .universal-chart-existing-stage, .global-chart-stage'
    );
    if (!stage || !host.contains(stage)) {
        stage = wrapCanvasInUniversalChartStage(canvas, host, 'universal-chart-existing-stage');
    }
    if (stage) stage.classList.add('universal-chart-scroll-stage');
    return stage;
}

function calculateAdaptiveChartDimensions(chart, canvas, host, stage) {
    const profile = getAdaptiveChartProfile(chart);
    const hostWidth = Math.max(320, Math.floor(host.clientWidth || host.parentElement?.clientWidth || 900));
    const viewportCap = Math.max(360, Math.min(720, Math.floor((window.innerHeight || 900) * 0.72)));
    const isGantt = stage.classList.contains('realisation-gantt-stage') || stage.classList.contains('realisation-gantt-individual-stage');

    if (isGantt) {
        const inlineWidth = parseFloat(stage.style.width) || stage.scrollWidth || hostWidth;
        const inlineHeight = parseFloat(stage.style.height) || stage.scrollHeight || 480;
        return {
            width: Math.max(hostWidth, Math.ceil(inlineWidth)),
            height: Math.max(360, Math.ceil(inlineHeight)),
            visibleHeight: Math.min(viewportCap, Math.max(360, Math.ceil(inlineHeight)))
        };
    }

    let width = hostWidth;
    let height = 430;

    const legendItemsPerRow = Math.max(1, Math.floor(hostWidth / 180));
    const legendRows = chart?.options?.plugins?.legend?.display
        ? Math.max(1, Math.ceil(Math.max(profile.datasetCount, profile.circular ? profile.labelCount : 0) / legendItemsPerRow))
        : 0;
    const legendHeight = legendRows * 26;

    if (profile.circular || profile.radar) {
        width = hostWidth;
        height = Math.max(420, 390 + legendHeight);
        if (profile.labelCount > 14) height += Math.min(220, (profile.labelCount - 14) * 10);
    } else if (profile.horizontal) {
        const pixelsPerCategory = profile.labelCount > 45 ? 27 : profile.labelCount > 25 ? 31 : 36;
        height = Math.max(390, 145 + profile.labelCount * pixelsPerCategory + legendHeight);
        width = Math.max(hostWidth, 650 + Math.min(520, profile.longestLabel * 6.5));
        if (profile.datasetCount > 5) width += Math.min(420, (profile.datasetCount - 5) * 34);
    } else if (profile.scatter) {
        width = Math.max(hostWidth, profile.datasetCount > 8 ? 1050 : hostWidth);
        height = Math.max(430, 410 + legendHeight);
    } else {
        const pixelsPerLabel = profile.type === 'bar'
            ? (profile.labelCount > 45 ? 34 : profile.labelCount > 25 ? 42 : 54)
            : (profile.labelCount > 45 ? 42 : profile.labelCount > 25 ? 50 : 65);
        const categoryWidth = profile.labelCount > 10 ? 180 + profile.labelCount * pixelsPerLabel : hostWidth;
        const seriesWidth = profile.datasetCount > 8 ? 760 + profile.datasetCount * 52 : hostWidth;
        width = Math.max(hostWidth, categoryWidth, seriesWidth);
        height = Math.max(420, 395 + legendHeight + Math.max(0, profile.datasetCount - 12) * 7);
    }

    width = Math.min(18000, Math.ceil(width));
    height = Math.min(16000, Math.ceil(height));
    return {
        width,
        height,
        visibleHeight: Math.min(viewportCap, height)
    };
}

function applyAdaptiveChartOverflow(canvas) {
    if (!canvas || !canvas.isConnected) return;
    const host = canvas.closest(UNIVERSAL_CHART_SCROLL_HOST_SELECTOR);
    if (!host) return;
    const stage = getAdaptiveChartStage(canvas, host);
    if (!stage) return;

    const chart = getChartInstanceForCanvas(canvas);
    if (!chart) {
        window.setTimeout(() => applyAdaptiveChartOverflow(canvas), 80);
        return;
    }

    try {
        configureAdaptiveChartLegend(chart, canvas, true);
    } catch (error) {
        console.warn('Légende adaptative non appliquée :', error);
    }

    const availableWidth = Math.max(320, Math.floor(host.clientWidth || host.parentElement?.clientWidth || 900));
    if (availableWidth < 100 || host.offsetParent === null) return;

    const dimensions = calculateAdaptiveChartDimensions(chart, canvas, host, stage);
    const overflowX = dimensions.width > availableWidth + 8;
    const overflowY = dimensions.height > dimensions.visibleHeight + 8;

    stage.style.width = `${dimensions.width}px`;
    stage.style.minWidth = `${dimensions.width}px`;
    stage.style.height = `${dimensions.height}px`;
    stage.style.minHeight = `${dimensions.height}px`;

    host.style.height = `${overflowY ? dimensions.visibleHeight : dimensions.height}px`;
    host.style.maxHeight = `${dimensions.visibleHeight}px`;
    host.style.overflowX = overflowX ? 'auto' : 'hidden';
    host.style.overflowY = overflowY ? 'auto' : 'hidden';
    host.classList.toggle('chart-overflow-x', overflowX);
    host.classList.toggle('chart-overflow-y', overflowY);

    const signature = `${dimensions.width}x${dimensions.height}|${overflowX ? 1 : 0}|${overflowY ? 1 : 0}`;
    if (canvas.dataset.adaptiveChartSignature !== signature) {
        canvas.dataset.adaptiveChartSignature = signature;
        window.requestAnimationFrame(() => {
            try {
                if (typeof chart.resize === 'function') chart.resize();
            } catch (error) {
                console.warn('Redimensionnement adaptatif du graphique impossible :', error);
            }
        });
    }
}

const adaptiveChartScheduled = new WeakSet();
function scheduleAdaptiveChartLayout(canvas, delay = 0) {
    if (!canvas || adaptiveChartScheduled.has(canvas)) return;
    adaptiveChartScheduled.add(canvas);
    window.setTimeout(() => {
        window.requestAnimationFrame(() => {
            adaptiveChartScheduled.delete(canvas);
            applyAdaptiveChartOverflow(canvas);
        });
    }, delay);
}

let adaptiveChartResizeObserver = null;
function observeAdaptiveChartHost(host, canvas) {
    if (typeof ResizeObserver === 'undefined' || !host || !canvas) return;
    if (!adaptiveChartResizeObserver) {
        adaptiveChartResizeObserver = new ResizeObserver(entries => {
            entries.forEach(entry => {
                const observedCanvas = entry.target.querySelector('canvas');
                if (observedCanvas) scheduleAdaptiveChartLayout(observedCanvas, 20);
            });
        });
    }
    if (host.dataset.adaptiveResizeObserved !== '1') {
        host.dataset.adaptiveResizeObserved = '1';
        adaptiveChartResizeObserver.observe(host);
    }
}

function enhanceChartCanvasWithUniversalScrollbars(canvas) {
    if (!(canvas instanceof HTMLCanvasElement) || !canvas.isConnected) return;

    let host = canvas.closest(UNIVERSAL_CHART_SCROLL_HOST_SELECTOR);
    if (!host) {
        const parent = canvas.parentElement;
        if (!parent) return;

        host = document.createElement('div');
        host.className = 'global-chart-scroll universal-chart-scroll-host';
        host.setAttribute('role', 'region');
        host.setAttribute('aria-label', ('Zone adaptative du graphique ' + (canvas.id || '')).trim());

        const stage = document.createElement('div');
        stage.className = 'global-chart-stage universal-chart-scroll-stage';
        parent.insertBefore(host, canvas);
        host.appendChild(stage);
        stage.appendChild(canvas);
    } else {
        host.classList.add('universal-chart-scroll-host');
        getAdaptiveChartStage(canvas, host);
    }

    canvas.dataset.universalScrollbars = '1';
    canvas.classList.add('universal-scrollable-chart-canvas');
    observeAdaptiveChartHost(host, canvas);
    scheduleAdaptiveChartLayout(canvas, 30);
}

function initializeAllChartScrollbars(root = document) {
    const canvases = root instanceof HTMLCanvasElement
        ? [root]
        : Array.from(root.querySelectorAll ? root.querySelectorAll('canvas') : []);
    canvases.forEach(enhanceChartCanvasWithUniversalScrollbars);
}

let universalChartScrollObserver = null;
function observeDynamicChartScrollbars() {
    if (universalChartScrollObserver || !document.body) return;
    universalChartScrollObserver = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (!(node instanceof Element)) return;
                if (node instanceof HTMLCanvasElement) {
                    enhanceChartCanvasWithUniversalScrollbars(node);
                } else {
                    initializeAllChartScrollbars(node);
                }
            });
        });
    });
    universalChartScrollObserver.observe(document.body, { childList: true, subtree: true });
}

function registerAdaptiveChartUiPlugin() {
    if (typeof Chart === 'undefined' || typeof Chart.register !== 'function' || Chart.$adaptiveUiPluginRegistered) return;
    Chart.register({
        id: 'adaptiveChartUiPlugin',
        /*
         * Aucun changement d'options dans beforeInit : Chart.js n'a pas encore
         * terminé la résolution de ses proxys d'options à ce stade.
         */
        afterInit(chart) {
            window.setTimeout(() => {
                try {
                    enhanceChartCanvasWithUniversalScrollbars(chart.canvas);
                    scheduleAdaptiveChartLayout(chart.canvas, 30);
                } catch (error) {
                    console.warn('Initialisation adaptative du graphique ignorée :', error);
                }
            }, 0);
        },
        afterUpdate(chart) {
            if (!chart.$adaptiveLegendUpdateInProgress) {
                scheduleAdaptiveChartLayout(chart.canvas, 20);
            }
        }
    });
    Chart.$adaptiveUiPluginRegistered = true;
}

function resizeAllChartsAfterTabChange() {
    setTimeout(() => {
        initializeAllChartScrollbars(document);
        document.querySelectorAll('canvas').forEach(canvas => scheduleAdaptiveChartLayout(canvas, 20));
    }, 120);
}

registerAdaptiveChartUiPlugin();
window.addEventListener('resize', () => {
    document.querySelectorAll('canvas').forEach(canvas => scheduleAdaptiveChartLayout(canvas, 80));
});

$(document).ready(function() {
    initializeAllChartScrollbars(document);
    observeDynamicChartScrollbars();
    document.addEventListener('shown.bs.tab', resizeAllChartsAfterTabChange);
    document.addEventListener('shown.bs.pill', resizeAllChartsAfterTabChange);
    fetchData();
    let typingTimer;
    $('.filter-input').on('keyup', function () { clearTimeout(typingTimer); typingTimer = setTimeout(applyFilters, 300); });
    $('.filter-input').on('change', applyFilters);
    
    setupAnalysisTableSearch('search-dren-table', 'dren-summary-table');
    setupAnalysisTableSearch('search-cisco-table', 'cisco-summary-table');
    setupAnalysisTableSearch('search-zap-table', 'zap-summary-table');

    $('#timeline-refresh-btn').on('click', function() { renderSubmissionTimelineCharts(); });
    $('#timeline-reset-btn').on('click', resetSubmissionTimelineControls);
    $('#timeline-granularity, #timeline-top-entities, #timeline-date-start, #timeline-date-end').on('change', function() { renderSubmissionTimelineCharts(); });

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
    $('#btn-reset-soumissions-dates-om').on('click', function() {
        $('#soumissions-date-debut-om-missionnaire, #soumissions-date-fin-om-missionnaire').val('');
        $('#soumissions-om-filter-info').removeClass('alert-warning alert-success').addClass('alert-light').html('<i class="fas fa-info-circle text-success"></i> Filtres de dates OM effacés. Relancez l’IA de consolidation pour recalculer les nombres de soumissions.');
    });
    $('#soumissions-date-debut-om-missionnaire, #soumissions-date-fin-om-missionnaire').on('change', function() {
        const start = $('#soumissions-date-debut-om-missionnaire').val();
        const end = $('#soumissions-date-fin-om-missionnaire').val();
        const info = $('#soumissions-om-filter-info');
        if (start && end && start > end) {
            info.removeClass('alert-light alert-success').addClass('alert-warning').html('<i class="fas fa-exclamation-triangle"></i> La date de début OM doit être antérieure ou égale à la date de fin OM.');
        } else {
            info.removeClass('alert-light alert-warning').addClass('alert-success').html('<i class="fas fa-filter"></i> Dates OM modifiées. Cliquez sur <strong>Démarrer l’IA de Consolidation</strong> pour recalculer les résultats.');
        }
    });

    $('#real-period-select, #real-display-mode, #real-chart-type, #real-top-entities, #real-date-start, #real-date-end').on('change', function() {
        syncRealisationChartControls();
        updateRealisationZoomControls();
        window.runRealisationTemporel();
    });
    $('input[name="real-layout-mode"]').on('change', function() { window.runRealisationTemporel(); });
    syncRealisationChartControls();
    updateRealisationZoomControls();
    const realisationMasterTab = document.getElementById('master-realisations-tab');
    if (realisationMasterTab) {
        realisationMasterTab.addEventListener('shown.bs.tab', function() {
            window.runRealisationTemporel();
            setTimeout(function() {
                Object.values(realisationTimelineChartsRefs).flat().forEach(ref => { const chart = ref && ref.chart ? ref.chart : ref; if (chart) chart.resize(); });
            }, 80);
        });
    }
});
