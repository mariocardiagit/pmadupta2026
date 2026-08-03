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
    "Un DOUBLON existe seulement lorsque la même mission concerne la même DREN, la même CISCO, la même ZAP, la même Activité, le même Produit, la même Sous-activité et le même Matricule/CIN, ET que les périodes de réalisation dans om_missionnaire se chevauchent.",
    "1. Le système construit la signature stricte : DREN + CISCO + ZAP + Activité + Produit + Sous-activité + Matricule/CIN.",
    "2. Pour chaque signature identique, il compare les intervalles inclusifs [Date début réalisation, Date fin réalisation].",
    "3. Il y a chevauchement lorsque Début 1 ≤ Fin 2 ET Début 2 ≤ Fin 1. Une date commune aux deux périodes suffit donc à créer un doublon.",
    "LECTURE DU TABLEAU :",
    "- 'DOUBLON — périodes chevauchantes' : la signature est identique et au moins une journée est commune.",
    "- 'MISSION DISTINCTE' : la signature peut être identique, mais les périodes ne se chevauchent pas.",
    "- 'VÉRIFICATION IMPOSSIBLE' : une date ou le matricule est manquant.",
    "- 'ANOMALIE DE DATE' : la date de fin est antérieure à la date de début."
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


function normalizeKoboSearchKey(value) {
    return String(value === null || value === undefined ? '' : value)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function parseKoboSearchDate(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date && !isNaN(value.getTime())) {
        const d = new Date(value.getTime()); d.setHours(0, 0, 0, 0); return d;
    }
    const text = cleanSpaces(value);
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 0, 0, 0, 0);
    const fr = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
    if (fr) return new Date(Number(fr[3]), Number(fr[2]) - 1, Number(fr[1]), 0, 0, 0, 0);
    const d = new Date(text);
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
}

function isExcludedMissionnaireDateCandidatePath(path) {
    const raw = String(path || '');
    const key = normalizeKoboSearchKey(raw);
    const leaf = normalizeKoboSearchKey(raw.split('/').pop().replace(/\[\d+\]/g, ''));
    const excludedLeaves = new Set([
        'start', 'end', 'today', 'date_enq', 'date_de_suivi',
        '_submission_time', 'submission_time', '_date_modified', 'date_modified',
        '_date_created', 'date_created', 'debut_enquete', 'fin_enquete'
    ]);
    if (excludedLeaves.has(leaf)) return true;
    return key.includes('submission_time') || key.includes('date_de_soumission') ||
        key.includes('date_de_suivi') || key.includes('date_enq') ||
        key.includes('horodatage') || key.includes('timestamp');
}

function isLikelyMissionnaireContainerPath(path) {
    const key = normalizeKoboSearchKey(path);
    return key.includes('om_missionnaire') || key.includes('missionnaire') ||
        key.includes('ordre_mission') || key.includes('om_mission') ||
        key.includes('mission') || key.includes('personne') || key.includes('agent');
}

function getLocalMissionnaireDateCandidates(entries, path) {
    const candidates = [];
    (entries || []).forEach(([key, child]) => {
        const fullPath = path ? `${path}/${key}` : key;
        if (isKoboMatriculeKey(fullPath) || isExcludedMissionnaireDateCandidatePath(fullPath)) return;
        const values = primitiveValues(child);
        values.forEach(raw => {
            const date = parseKoboSearchDate(raw);
            if (date) candidates.push({ path: fullPath, date });
        });
    });
    return candidates;
}

function inferMissionnaireRangeFromCandidates(candidates) {
    const valid = (candidates || []).filter(item => item?.date && !isNaN(item.date.getTime()));
    if (valid.length !== 2) return null;
    const dates = valid.map(item => new Date(item.date.getTime())).sort((a, b) => a - b);
    return { start: dates[0], end: dates[1], inferred: true };
}

function getKoboSearchFieldText(path) {
    const rawPath = String(path || '');
    const leaf = rawPath.split('/').pop().replace(/\[\d+\]/g, '');
    let label = '';
    try {
        label = headerMap?.[leaf] || headerMap?.[leaf.toLowerCase()] || '';
        if (!label && typeof getTranslatedHeader === 'function') label = getTranslatedHeader(leaf) || '';
    } catch (_) {}
    return normalizeKoboSearchKey(`${rawPath} ${leaf} ${label}`);
}

function hasMissionnaireDateBoundary(key, boundary) {
    return boundary === 'start'
        ? (key.includes('debut') || key.includes('start') || key.includes('commencement'))
        : (key.includes('fin') || key.includes('end') || key.includes('cloture'));
}

function isOmMissionnaireRealisationDateKey(path, boundary, localMatriculeContext) {
    const key = getKoboSearchFieldText(path);
    const hasDate = key.includes('date');
    const hasRealisation = key.includes('realis') || key.includes('mission');
    const hasSousActivite = key.includes('sous_activ') || key.includes('sousactiv');
    const hasMissionnaire = key.includes('missionnaire') || key.includes('ordre_mission') || key.includes('om_mission') || /(^|_)om($|_)/.test(key);
    const hasPersonRepeat = key.includes('personne') || key.includes('agent') || key.includes('mission');
    const hasBoundary = hasMissionnaireDateBoundary(key, boundary);

    // Cas explicite : le nom XML, son chemin ou son libellé décrit la date de
    // réalisation de la mission/sous-activité.
    if (hasDate && hasBoundary && hasRealisation && (hasSousActivite || hasMissionnaire || hasPersonRepeat)) return true;

    // Dans une répétition qui contient le matricule, les noms XML sont parfois
    // abrégés (debut/fin) ou générés automatiquement. Les métadonnées globales
    // sont exclues afin d'éviter de prendre les heures start/end du formulaire.
    if (localMatriculeContext && !isExcludedMissionnaireDateCandidatePath(path)) {
        if (hasDate && hasBoundary) return true;
        if (hasBoundary && (hasRealisation || hasMissionnaire || hasPersonRepeat)) return true;
    }
    return false;
}

function extractOmMissionnaireRealisationRanges(row) {
    const ranges = [];
    const visit = (value, path) => {
        if (Array.isArray(value)) {
            value.forEach((item, index) => visit(item, `${path}[${index}]`));
            return;
        }
        if (!value || typeof value !== 'object') return;

        const localStarts = [];
        const localEnds = [];
        const explicitPaths = new Set();
        const nested = [];
        const entries = Object.entries(value);
        const hasLocalMatricule = entries.some(([key, child]) => {
            const fullPath = path ? `${path}/${key}` : key;
            return isKoboMatriculeKey(fullPath) && primitiveValues(child).map(normalizeMissionnaireMatricule).some(Boolean);
        });

        entries.forEach(([key, child]) => {
            const fullPath = path ? `${path}/${key}` : key;
            const primitive = primitiveValues(child);
            if (isOmMissionnaireRealisationDateKey(fullPath, 'start', hasLocalMatricule)) {
                primitive.map(parseKoboSearchDate).filter(Boolean).forEach(date => localStarts.push(date));
                explicitPaths.add(fullPath);
            } else if (isOmMissionnaireRealisationDateKey(fullPath, 'end', hasLocalMatricule)) {
                primitive.map(parseKoboSearchDate).filter(Boolean).forEach(date => localEnds.push(date));
                explicitPaths.add(fullPath);
            }
            if (child && typeof child === 'object') nested.push([child, fullPath]);
        });

        // Repli essentiel pour les nouvelles questions Kobo dont les noms XML
        // sont aléatoires : lorsqu'un objet de répétition contient un matricule
        // et exactement deux valeurs de type date, la plus ancienne est le début
        // et la plus récente est la fin.
        if ((hasLocalMatricule || isLikelyMissionnaireContainerPath(path)) && (!localStarts.length || !localEnds.length)) {
            const candidates = getLocalMissionnaireDateCandidates(entries, path)
                .filter(item => !explicitPaths.has(item.path));
            if (!localStarts.length && !localEnds.length) {
                const inferred = inferMissionnaireRangeFromCandidates(candidates);
                if (inferred) {
                    localStarts.push(inferred.start);
                    localEnds.push(inferred.end);
                }
            } else if (!localStarts.length && candidates.length === 1) {
                localStarts.push(candidates[0].date);
            } else if (!localEnds.length && candidates.length === 1) {
                localEnds.push(candidates[0].date);
            }
        }

        const count = Math.max(localStarts.length, localEnds.length);
        for (let i = 0; i < count; i++) {
            ranges.push({
                start: localStarts[i] || localStarts[0] || null,
                end: localEnds[i] || localEnds[0] || null
            });
        }
        nested.forEach(([child, childPath]) => visit(child, childPath));
    };

    visit(row, '');
    const seen = new Set();
    return ranges.filter(range => {
        if (!range.start && !range.end) return false;
        const key = `${range.start ? range.start.getTime() : ''}|${range.end ? range.end.getTime() : ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function isKoboMatriculeKey(path) {
    const key = normalizeKoboSearchKey(path);
    return key.includes('matricule') || key.endsWith('_cin') || key === 'cin' || key.includes('numero_matricule_ou_cin');
}

function primitiveValues(value) {
    if (Array.isArray(value)) return value.flatMap(primitiveValues);
    if (value === null || value === undefined || typeof value === 'object') return [];
    return [value];
}

function normalizeMissionnaireMatricule(value) {
    const raw = cleanSpaces(value);
    if (!raw) return '';
    const compact = raw.replace(/[\s.-]/g, '');
    return compact || raw;
}

function formatMissionnaireDate(value) {
    const date = value instanceof Date ? value : parseKoboSearchDate(value);
    if (!date || isNaN(date.getTime())) return '';
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function extractOmMissionnaireAssignments(row) {
    const assignments = [];

    const addLocalAssignments = (mats, starts, ends, sourcePath) => {
        const cleanMats = mats.map(normalizeMissionnaireMatricule).filter(Boolean);
        const parsedStarts = starts.map(parseKoboSearchDate).filter(Boolean);
        const parsedEnds = ends.map(parseKoboSearchDate).filter(Boolean);
        const count = Math.max(cleanMats.length, parsedStarts.length, parsedEnds.length);
        if (!count) return;
        for (let i = 0; i < count; i++) {
            assignments.push({
                matricule: cleanMats[i] || cleanMats[0] || '',
                start: parsedStarts[i] || parsedStarts[0] || null,
                end: parsedEnds[i] || parsedEnds[0] || null,
                sourcePath: sourcePath || ''
            });
        }
    };

    const visit = (value, path) => {
        if (Array.isArray(value)) {
            value.forEach((item, index) => visit(item, `${path}[${index}]`));
            return;
        }
        if (!value || typeof value !== 'object') return;

        const localMats = [], localStarts = [], localEnds = [];
        const explicitPaths = new Set();
        const nested = [];
        const entries = Object.entries(value);

        entries.forEach(([key, child]) => {
            const fullPath = path ? `${path}/${key}` : key;
            if (isKoboMatriculeKey(fullPath)) localMats.push(...primitiveValues(child));
        });
        const hasLocalMatricule = localMats.map(normalizeMissionnaireMatricule).some(Boolean);
        const missionnaireContext = hasLocalMatricule || isLikelyMissionnaireContainerPath(path);

        entries.forEach(([key, child]) => {
            const fullPath = path ? `${path}/${key}` : key;
            if (isKoboMatriculeKey(fullPath)) return;
            const primitive = primitiveValues(child);
            if (isOmMissionnaireRealisationDateKey(fullPath, 'start', missionnaireContext)) {
                localStarts.push(...primitive);
                explicitPaths.add(fullPath);
            } else if (isOmMissionnaireRealisationDateKey(fullPath, 'end', missionnaireContext)) {
                localEnds.push(...primitive);
                explicitPaths.add(fullPath);
            }
            if (child && typeof child === 'object') nested.push([child, fullPath]);
        });

        // Repli pour les identifiants XML générés automatiquement : si le même
        // objet de répétition contient exactement deux dates exploitables, elles
        // sont interprétées comme début et fin de mission dans l'ordre chronologique.
        if (missionnaireContext && (!localStarts.length || !localEnds.length)) {
            const candidates = getLocalMissionnaireDateCandidates(entries, path)
                .filter(item => !explicitPaths.has(item.path));
            if (!localStarts.length && !localEnds.length) {
                const inferred = inferMissionnaireRangeFromCandidates(candidates);
                if (inferred) {
                    localStarts.push(inferred.start);
                    localEnds.push(inferred.end);
                }
            } else if (!localStarts.length && candidates.length === 1) {
                localStarts.push(candidates[0].date);
            } else if (!localEnds.length && candidates.length === 1) {
                localEnds.push(candidates[0].date);
            }
        }

        addLocalAssignments(localMats, localStarts, localEnds, path);
        nested.forEach(([child, childPath]) => visit(child, childPath));
    };

    visit(row, '');

    const fallbackMats = extractMatricules(row).split(';').map(v => normalizeMissionnaireMatricule(v)).filter(Boolean);
    const fallbackRanges = extractOmMissionnaireRealisationRanges(row);

    // Fusionner les matricules et les périodes même lorsqu'ils proviennent de
    // deux répétitions différentes (par exemple personnes[] et om_missionnaire[]).
    if (assignments.length) {
        assignments.forEach((assignment, i) => {
            const range = fallbackRanges[i] || fallbackRanges[0] || {};
            if (!assignment.matricule) assignment.matricule = fallbackMats[i] || fallbackMats[0] || '';
            if (!assignment.start) assignment.start = range.start || null;
            if (!assignment.end) assignment.end = range.end || null;
        });
        const targetCount = Math.max(fallbackMats.length, fallbackRanges.length);
        for (let i = assignments.length; i < targetCount; i++) {
            const range = fallbackRanges[i] || fallbackRanges[0] || {};
            assignments.push({
                matricule: fallbackMats[i] || fallbackMats[0] || '',
                start: range.start || null,
                end: range.end || null,
                sourcePath: 'fallback-merge'
            });
        }
    } else if (fallbackMats.length || fallbackRanges.length) {
        const count = Math.max(fallbackMats.length, fallbackRanges.length);
        for (let i = 0; i < count; i++) {
            const range = fallbackRanges[i] || fallbackRanges[0] || {};
            assignments.push({
                matricule: fallbackMats[i] || fallbackMats[0] || '',
                start: range.start || null,
                end: range.end || null,
                sourcePath: 'fallback'
            });
        }
    }

    // Dédupliquer sans tenir compte du chemin source, afin d'éviter plusieurs
    // badges identiques dans une même ligne du tableau.
    const seen = new Set();
    return assignments.filter(item => {
        const key = `${item.matricule}|${item.start ? item.start.getTime() : ''}|${item.end ? item.end.getTime() : ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return item.matricule || item.start || item.end;
    });
}

function getDuplicateBaseFields(row) {
    return {
        dren: cleanSpaces(getKoboValue(row, ['dren'], ['activite', 'produit', 'budget', 'cisco', 'zap', 'sous'], [])),
        cisco: cleanSpaces(getKoboValue(row, ['cisco'], ['activite', 'produit', 'budget', 'dren', 'zap', 'sous'], [])),
        zap: cleanSpaces(getKoboValue(row, ['zap'], ['activite', 'produit', 'budget', 'dren', 'cisco', 'sous'], [])),
        activite: cleanSpaces(getKoboValue(row, ['activite', 'activité'], ['sous_activite', 'sous-activite'], [])),
        produit: cleanSpaces(getKoboValue(row, ['produit'], ['sous_produit', 'sous-produit'], [])),
        sousActivite: cleanSpaces(getKoboValue(row, ['sous_activite', 'sous-activite'], [], []))
    };
}

function normalizeDuplicateSignatureValue(value) {
    return cleanSpaces(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function missionnaireIntervalsOverlap(first, second) {
    if (!first?.start || !first?.end || !second?.start || !second?.end) return false;
    return first.start.getTime() <= second.end.getTime() && second.start.getTime() <= first.end.getTime();
}

function buildMissionnaireDuplicateAnalysis(data) {
    const records = [];
    const rowToIssues = {};

    (Array.isArray(data) ? data : []).forEach((row, rowIndex) => {
        const base = getDuplicateBaseFields(row);
        let assignments = extractOmMissionnaireAssignments(row);
        if (!assignments.length) {
            const mats = extractMatricules(row).split(';').map(normalizeMissionnaireMatricule).filter(Boolean);
            assignments = (mats.length ? mats : ['']).map(matricule => ({ matricule, start: null, end: null, sourcePath: 'missing' }));
        }

        assignments.forEach((assignment, assignmentIndex) => {
            const invalidDateOrder = !!(assignment.start && assignment.end && assignment.end.getTime() < assignment.start.getTime());
            const missingFields = [];
            if (!assignment.matricule) missingFields.push('matricule/CIN');
            if (!assignment.start) missingFields.push('date de début');
            if (!assignment.end) missingFields.push('date de fin');
            if (invalidDateOrder) missingFields.push('date de fin antérieure à la date de début');

            const signatureParts = [base.dren, base.cisco, base.zap, base.activite, base.produit, base.sousActivite, assignment.matricule];
            const signature = signatureParts.map(normalizeDuplicateSignatureValue).join('|||');
            const record = {
                id: `${rowIndex}:${assignmentIndex}`,
                rowIndex,
                assignmentIndex,
                row,
                ...base,
                matricule: assignment.matricule,
                start: assignment.start,
                end: assignment.end,
                sourcePath: assignment.sourcePath,
                signature,
                signatureComplete: signatureParts.every(value => cleanSpaces(value) !== ''),
                invalidDateOrder,
                missingFields,
                duplicateGroupIds: []
            };
            records.push(record);

            if (missingFields.length) {
                if (!rowToIssues[rowIndex]) rowToIssues[rowIndex] = [];
                const onlyDatesMissing = !!assignment.matricule && !invalidDateOrder &&
                    missingFields.every(field => field === 'date de début' || field === 'date de fin');
                if (onlyDatesMissing) {
                    rowToIssues[rowIndex].push(`DATES ABSENTES DU JSON — ${missingFields.join(', ')} (ancienne soumission ou champs non renseignés)`);
                } else {
                    const type = invalidDateOrder ? 'ANOMALIE DE DATE' : 'VÉRIFICATION IMPOSSIBLE';
                    rowToIssues[rowIndex].push(`${type} — ${missingFields.join(', ')}`);
                }
            }
        });
    });

    const bySignature = {};
    records.forEach(record => {
        if (!bySignature[record.signature]) bySignature[record.signature] = [];
        bySignature[record.signature].push(record);
    });

    const duplicateGroups = [];
    let counter = 1;
    Object.values(bySignature).forEach(group => {
        const eligible = group.filter(record => record.signatureComplete && record.matricule && record.start && record.end && !record.invalidDateOrder);
        if (eligible.length < 2) return;

        const adjacency = eligible.map(() => new Set());
        for (let i = 0; i < eligible.length; i++) {
            for (let j = i + 1; j < eligible.length; j++) {
                if (missionnaireIntervalsOverlap(eligible[i], eligible[j])) {
                    adjacency[i].add(j);
                    adjacency[j].add(i);
                }
            }
        }

        const visited = new Set();
        for (let startIndex = 0; startIndex < eligible.length; startIndex++) {
            if (visited.has(startIndex) || adjacency[startIndex].size === 0) continue;
            const stack = [startIndex], componentIndexes = [];
            visited.add(startIndex);
            while (stack.length) {
                const current = stack.pop();
                componentIndexes.push(current);
                adjacency[current].forEach(next => {
                    if (!visited.has(next)) { visited.add(next); stack.push(next); }
                });
            }
            if (componentIndexes.length < 2) continue;
            const component = componentIndexes.map(index => eligible[index]);
            const groupId = `Doublon ${counter++}`;
            const pairOverlaps = [];
            for (let i = 0; i < component.length; i++) {
                for (let j = i + 1; j < component.length; j++) {
                    if (!missionnaireIntervalsOverlap(component[i], component[j])) continue;
                    const overlapStart = new Date(Math.max(component[i].start.getTime(), component[j].start.getTime()));
                    const overlapEnd = new Date(Math.min(component[i].end.getTime(), component[j].end.getTime()));
                    pairOverlaps.push({ first: component[i].id, second: component[j].id, start: overlapStart, end: overlapEnd });
                }
            }
            component.forEach(record => record.duplicateGroupIds.push(groupId));
            duplicateGroups.push({ id: groupId, matricule: component[0].matricule, signature: component[0].signature, records: component, pairOverlaps });
        }
    });

    const rowToDuplicateDetails = {};
    duplicateGroups.forEach(group => {
        const overlapLabels = group.pairOverlaps.map(pair => {
            const start = formatMissionnaireDate(pair.start), end = formatMissionnaireDate(pair.end);
            return start === end ? start : `${start} au ${end}`;
        });
        const uniqueOverlapLabels = [...new Set(overlapLabels)];
        const detail = {
            id: group.id,
            matricule: group.matricule,
            overlapText: uniqueOverlapLabels.join(' ; ') || 'périodes chevauchantes',
            periods: group.records.map(record => `${formatMissionnaireDate(record.start)} → ${formatMissionnaireDate(record.end)}`)
        };
        [...new Set(group.records.map(record => record.rowIndex))].forEach(rowIndex => {
            if (!rowToDuplicateDetails[rowIndex]) rowToDuplicateDetails[rowIndex] = [];
            rowToDuplicateDetails[rowIndex].push(detail);
        });
    });

    Object.keys(rowToIssues).forEach(rowIndex => {
        rowToIssues[rowIndex] = [...new Set(rowToIssues[rowIndex])];
    });
    return { records, duplicateGroups, rowToDuplicateDetails, rowToIssues };
}

window.extractOmMissionnaireAssignments = extractOmMissionnaireAssignments;
window.buildMissionnaireDuplicateAnalysis = buildMissionnaireDuplicateAnalysis;
window.missionnaireIntervalsOverlap = missionnaireIntervalsOverlap;
window.formatMissionnaireDate = formatMissionnaireDate;

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
                    if (row.name) {
                        const fieldName = String(row.name).trim();
                        const label = cleanSpaces(row.label || row['label::French (fr)'] || row['label::Français (fr)'] || '');
                        if (label) {
                            headerMap[fieldName] = label;
                            headerMap[fieldName.toLowerCase()] = label;
                        }
                    }
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

    const duplicateAnalysis = buildMissionnaireDuplicateAnalysis(data);
    const rowToDuplicateDetails = duplicateAnalysis.rowToDuplicateDetails;
    const rowToDuplicateIssues = duplicateAnalysis.rowToIssues;

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

        const doublonsForRow = rowToDuplicateDetails[idx] || [];
        const duplicateIssuesForRow = [...new Set(rowToDuplicateIssues[idx] || [])];
        sData.isDoublon = doublonsForRow.length > 0;
        let doublonHtml = '';
        let doublonText = '';
        if (doublonsForRow.length > 0) {
            doublonHtml = doublonsForRow.map(detail => `
                <span class="badge bg-danger shadow-sm mb-1 text-wrap" style="font-size: 0.78rem; line-height: 1.3; max-width: 240px; white-space: normal;"
                      title="Périodes examinées : ${detail.periods.join(' ; ').replace(/"/g, '&quot;')}">
                    <i class="fas fa-calendar-times"></i> ${detail.id}<br>
                    Matricule ${detail.matricule}<br>
                    Chevauchement : ${detail.overlapText}
                </span>`).join('<br>');
            doublonText = doublonsForRow.map(detail => `${detail.id} — Matricule ${detail.matricule} — Chevauchement : ${detail.overlapText}`).join(' ; ');
        } else if (duplicateIssuesForRow.length > 0) {
            doublonHtml = duplicateIssuesForRow.map(issue => {
                const datesAbsent = issue.startsWith('DATES ABSENTES DU JSON');
                const badgeClass = datesAbsent ? 'bg-secondary text-white' : 'bg-warning text-dark';
                const icon = datesAbsent ? 'fa-calendar-minus' : 'fa-calendar-exclamation';
                return `<span class="badge ${badgeClass} shadow-sm mb-1 text-wrap" style="font-size: 0.76rem; line-height: 1.25; max-width: 245px; white-space: normal;"><i class="fas ${icon}"></i> ${issue}</span>`;
            }).join('<br>');
            doublonText = duplicateIssuesForRow.join(' ; ');
        } else {
            doublonHtml = `<span class="badge bg-success shadow-sm" style="font-size: 0.82rem;"><i class="fas fa-check"></i> Mission distincte</span>`;
            doublonText = 'Mission distincte — aucune période chevauchante';
        }
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

        // Nouveaux champs de recherche KoboToolbox : dates de réalisation de la
        // sous-activité dans le groupe/répétition « om missionnaire ».
        // La lecture est récursive afin de fonctionner avec les objets imbriqués,
        // les répétitions Kobo et les chemins de champs aplatis.
        sData.omMissionnaireRealisationRanges = extractOmMissionnaireRealisationRanges(row);
        
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
    renderIntelligentAnalysisReport(submissionTimelineSourceData);
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

function pmaExportAdvancedPointCount(chart) {
    return (chart?.data?.datasets || []).reduce((sum, dataset) => sum + (Array.isArray(dataset.data) ? dataset.data.length : 0), 0);
}
function pmaExportParseCentroid(label, fallback) {
    const match = String(label || '').match(/centre\s*:\s*(-?\d+(?:[.,]\d+)?)/i);
    if (!match) return Number(fallback) || 0;
    return Number(String(match[1]).replace(',', '.')) || 0;
}
function pmaExportFlattenKMeansPoints(chart) {
    const points = [];
    (chart?.data?.datasets || []).forEach((dataset, datasetIndex) => {
        const clusterLabel = cleanSpaces(dataset.label || `Classe ${datasetIndex + 1}`);
        const color = Array.isArray(dataset.backgroundColor) ? dataset.backgroundColor[0] : (dataset.backgroundColor || dataset.borderColor || getSubmissionTimelineColor(datasetIndex, 1));
        const rawData = Array.isArray(dataset.data) ? dataset.data : [];
        const centroidFallback = rawData.length ? rawData.reduce((sum, point) => sum + (Number(point?.y) || 0), 0) / rawData.length : 0;
        const centroid = pmaExportParseCentroid(clusterLabel, centroidFallback);
        rawData.forEach((point, pointIndex) => {
            const label = cleanSpaces(point?.label || point?.name || `Entité ${pointIndex + 1}`);
            const value = Number(point?.y ?? point?.value ?? point) || 0;
            points.push({ label, value, clusterLabel, centroid, color, datasetIndex });
        });
    });
    return points.sort((a, b) => a.datasetIndex - b.datasetIndex || b.value - a.value || a.label.localeCompare(b.label, 'fr', { sensitivity: 'base', numeric: true }));
}
function pmaExportBuildKMeansMixedDescriptors(chart) {
    const points = pmaExportFlattenKMeansPoints(chart);
    if (!points.length) return [];
    const pageSize = 15;
    const pageCount = Math.ceil(points.length / pageSize);
    const descriptors = [];
    for (let page = 0; page < pageCount; page++) {
        const chunk = points.slice(page * pageSize, (page + 1) * pageSize);
        const labels = chunk.map(point => point.label);
        const barColors = chunk.map(point => point.color);
        const datasets = [{
            type: 'bar',
            label: 'Volume de soumissions',
            data: chunk.map(point => point.value),
            backgroundColor: barColors,
            borderColor: barColors,
            borderWidth: 1.5,
            borderRadius: 6,
            barPercentage: 0.72,
            categoryPercentage: 0.88,
            order: 2
        }];
        const clusters = [...new Map(chunk.map(point => [point.clusterLabel, point])).values()];
        clusters.forEach((cluster, clusterIndex) => {
            datasets.push({
                type: 'line',
                label: cluster.clusterLabel,
                data: chunk.map(point => point.clusterLabel === cluster.clusterLabel ? cluster.centroid : null),
                borderColor: cluster.color,
                backgroundColor: cluster.color,
                borderWidth: 2,
                borderDash: [8, 5],
                pointRadius: 4,
                pointHoverRadius: 4,
                pointStyle: 'rectRot',
                fill: false,
                tension: 0,
                spanGaps: false,
                order: 1
            });
        });
        const groupedLines = clusters.map(cluster => ({
            title: cluster.clusterLabel,
            lines: chunk.filter(point => point.clusterLabel === cluster.clusterLabel).map(point => `${point.label} : ${point.value} soumission${point.value > 1 ? 's' : ''}`)
        }));
        const suffix = pageCount > 1 ? ` — partie ${page + 1}/${pageCount}` : '';
        descriptors.push({
            kind: 'advanced',
            advancedAlgorithm: 'kmeans',
            level: chart.level,
            title: `${chart.title}${suffix}`,
            config: {
                type: 'bar',
                indexAxis: 'y',
                exportMode: 'kmeansMixed',
                data: { labels, datasets },
                scales: {
                    x: { beginAtZero: true, title: { display: true, text: 'Volume de soumissions', font: { weight: 'bold' } }, ticks: { precision: 0 } },
                    y: { title: { display: true, text: `Entités ${chart.level}`, font: { weight: 'bold' } }, ticks: { autoSkip: false, font: { size: 12 } } }
                }
            },
            entityCount: chunk.length,
            bucketCount: chunk.length,
            detailBlocks: [{
                title: 'Lecture du graphique mixte K-Means',
                lines: [
                    'Chaque barre horizontale représente le volume de soumissions de l’entité dont le nom est indiqué sur l’axe vertical.',
                    'La couleur de la barre indique la classe K-Means attribuée à l’entité.',
                    'Les losanges et traits discontinus indiquent le centre de gravité de chaque classe.'
                ]
            }, ...groupedLines]
        });
    }
    return descriptors;
}


function pmaExportBuildAdvancedDescriptorsFromChart(chart) {
    if (!chart) return [];
    const isKMeansScatter = /k-?means/i.test(String(chart.title || '')) && String(chart.chartType || '').toLowerCase() === 'scatter';
    if (isKMeansScatter) return pmaExportBuildKMeansMixedDescriptors(chart);
    const pointCount = pmaExportAdvancedPointCount(chart);
    return [{
        kind:'advanced',
        advancedAlgorithm: chart.algorithm || '',
        level:chart.level,
        title:chart.title,
        config:{type:chart.chartType || 'bar', data:chart.data || {labels:[],datasets:[]}, indexAxis:'x', scales:null},
        entityCount:Math.max((chart.data?.labels || []).length, pointCount),
        bucketCount:Math.max((chart.data?.labels || []).length, pointCount)
    }];
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
                pmaExportBuildAdvancedDescriptorsFromChart(chart).forEach(descriptor => descriptors.push(descriptor));
            });
        } catch (error) { console.warn('Graphiques avancés non préparés :', error); }
    }
    return {context, descriptors};
}

function pmaExportResolveAdvancedMeta(descriptor) {
    if (!descriptor || descriptor.kind !== 'advanced') return null;
    const title = String(descriptor.title || '');
    const level = String(descriptor.level || '').toUpperCase();
    let algo = null;
    if (/k-?means/i.test(title)) algo = 'kmeans';
    else if (/jenks/i.test(title)) algo = 'jenks';
    else if (/dbscan/i.test(title)) algo = 'dbscan';
    if (!algo || !level) return null;
    return {
        algo,
        level,
        rulesId: `rules-${algo}-${level.toLowerCase()}`,
        listId: `${algo}Lists${level}`
    };
}
function pmaExportExtractAdvancedDetails(descriptor) {
    const meta = pmaExportResolveAdvancedMeta(descriptor);
    if (!meta) return [];
    const blocks = [];
    const rulesEl = document.getElementById(meta.rulesId);
    const rulesText = cleanSpaces(rulesEl?.innerText || rulesEl?.textContent || '');
    if (rulesText) blocks.push({ title: 'Règles et interprétation', lines: rulesText.split(/\n+/).map(t => cleanSpaces(t)).filter(Boolean) });
    const listEl = document.getElementById(meta.listId);
    if (listEl) {
        const cards = Array.from(listEl.querySelectorAll('.card'));
        cards.forEach(card => {
            const header = cleanSpaces(card.querySelector('.card-header')?.innerText || card.querySelector('.card-header')?.textContent || 'Catégorie');
            const items = Array.from(card.querySelectorAll('li')).map(li => cleanSpaces(li.innerText || li.textContent || '')).filter(Boolean);
            if (items.length) blocks.push({ title: header, lines: items });
        });
    }
    return blocks;
}
function pmaExportExtractTimelineDetails(descriptor) {
    const blocks = [];
    if (descriptor.kind !== 'timeline') return blocks;
    if (descriptor.entity) {
        const points = Array.isArray(descriptor.config?.data?.labels) ? descriptor.config.data.labels : [];
        const values = Array.isArray(descriptor.config?.data?.datasets?.[0]?.data) ? descriptor.config.data.datasets[0].data : [];
        const lines = points.map((label, i) => `${label} : ${values[i] ?? 0}`).filter(Boolean);
        if (lines.length) blocks.push({ title: `Détail temporel — ${descriptor.entity}`, lines });
        return blocks;
    }
    const ranked = Array.isArray(descriptor.config?.ranked) ? descriptor.config.ranked : [];
    if (ranked.length) {
        blocks.push({ title: `Entités ${descriptor.level}`, lines: ranked.map(([name, total]) => `${name} : ${total} soumission${Number(total) > 1 ? 's' : ''}`) });
    }
    return blocks;
}
function pmaExportDescriptorDetails(descriptor) {
    if (!descriptor) return [];
    if (Array.isArray(descriptor.detailBlocks) && descriptor.detailBlocks.length) return descriptor.detailBlocks;
    if (descriptor.kind === 'advanced') return pmaExportExtractAdvancedDetails(descriptor);
    if (descriptor.kind === 'timeline') return pmaExportExtractTimelineDetails(descriptor);
    return [];
}
function pmaExportAiDetailBlocks() {
    const snapshot = intelligentAnalysisSnapshot;
    if (!snapshot || !snapshot.total_rows) return [];
    const quality = snapshot.data_quality || {};
    const executive = snapshot.executive_summary || {};
    const blocks = [{
        title: 'Synthèse du rapport d’analyse intelligente',
        lines: [
            `Formulaires analysés : ${snapshot.total_rows}`,
            `Qualité des données : ${quality.score ?? 0}/100 — ${quality.label || 'Non déterminée'}`,
            `Dernière période : ${executive.latest_period || 'Indisponible'} — ${executive.latest_total ?? 0} soumission(s)`,
            `Tendance globale : ${executive.overall_trend || 'Non déterminée'}`,
            `Entités en hausse : ${executive.rising_entities ?? 0} ; en baisse : ${executive.falling_entities ?? 0} ; stables : ${executive.stable_entities ?? 0}`,
            `Entités prioritaires à contrôler : ${executive.priority_entities ?? 0}`
        ]
    }];
    ['DREN','CISCO','ZAP'].forEach(level => {
        const info = snapshot.levels?.[level];
        if (!info) return;
        blocks.push({
            title: `Analyse exhaustive des ${level}`,
            lines: (info.entities || []).map(entity => `#${entity.rank} ${entity.name} — ${entity.submissions} soumission(s) ; ${entity.share_percent} % ; ${entity.relative_position} ; ${entity.trend}. Recommandation : ${entity.recommendation}`)
        });
    });
    return blocks;
}
function pmaExportDetailsToHtml(blocks) {
    if (!Array.isArray(blocks) || !blocks.length) return '';
    return `<div class="details">${blocks.map(block => `<div class="detail-block"><h3>${timelineEscapeHtml(block.title || 'Détails')}</h3><ul>${(block.lines || []).map(line => `<li>${timelineEscapeHtml(line)}</li>`).join('')}</ul></div>`).join('')}</div>`;
}
function pmaExportPdfAddDetailBlocks(pdf, detailBlocks, startY) {
    if (!Array.isArray(detailBlocks) || !detailBlocks.length) return;
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    let y = startY || 18;
    const margin = 12;
    const lineHeight = 4.8;
    const ensureSpace = needed => {
        if (y + needed <= pageH - 12) return;
        pdf.addPage('a4', 'landscape');
        y = 16;
    };
    detailBlocks.forEach(block => {
        const title = String(block.title || 'Détails');
        ensureSpace(10);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.text(title, margin, y);
        y += 5;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9.5);
        (block.lines || []).forEach(line => {
            const wrapped = pdf.splitTextToSize(`• ${line}`, pageW - margin * 2 - 2);
            ensureSpace(wrapped.length * lineHeight + 1);
            pdf.text(wrapped, margin + 2, y);
            y += wrapped.length * lineHeight;
        });
        y += 2;
    });
}

function pmaExportShouldDrawScatterLabels(descriptor) {
    return !!(descriptor && descriptor.kind === 'advanced' && String(descriptor.config?.type || '').toLowerCase() === 'scatter');
}
const pmaExportScatterLabelsPlugin = {
    id: 'pmaExportScatterLabelsPlugin',
    afterDatasetsDraw(chart, args, opts) {
        if (!opts || !opts.enabled) return;
        const ctx = chart.ctx;
        const items = [];
        chart.data.datasets.forEach((dataset, datasetIndex) => {
            const meta = chart.getDatasetMeta(datasetIndex);
            (meta.data || []).forEach((element, pointIndex) => {
                const raw = dataset.data?.[pointIndex];
                const label = cleanSpaces(raw?.label || raw?.name || dataset.label || '');
                if (!label) return;
                const props = element.getProps(['x','y'], true);
                items.push({
                    x: props.x,
                    y: props.y,
                    color: Array.isArray(dataset.borderColor) ? dataset.borderColor[pointIndex] : (dataset.borderColor || dataset.backgroundColor || '#1f4e78'),
                    label
                });
            });
        });
        if (!items.length) return;
        const area = chart.chartArea;
        const top = area.top + 8;
        const bottom = area.bottom - 8;
        const columnCount = Math.min(3, Math.max(1, Math.ceil(items.length / 16)));
        const columns = Array.from({length: columnCount}, () => []);
        items.sort((a,b) => a.y - b.y).forEach((item, index) => columns[index % columnCount].push(item));
        const baseX = area.right + 18;
        const columnWidth = Math.max(205, Math.floor((chart.width - baseX - 12) / columnCount));
        ctx.save();
        ctx.font = items.length > 36 ? '10px Arial' : (items.length > 18 ? '11px Arial' : '12px Arial');
        ctx.textBaseline = 'middle';
        columns.forEach((column, columnIndex) => {
            if (!column.length) return;
            column.sort((a,b) => a.y - b.y);
            const available = Math.max(1, bottom - top);
            const minGap = Math.min(18, Math.max(11, available / Math.max(1, column.length - 1)));
            column[0].targetY = Math.max(top, Math.min(bottom, column[0].y));
            for (let i=1;i<column.length;i++) column[i].targetY = Math.max(column[i].y, column[i-1].targetY + minGap);
            for (let i=column.length-2;i>=0;i--) column[i].targetY = Math.min(column[i].targetY, column[i+1].targetY - minGap);
            column.forEach(item => { item.targetY = Math.max(top, Math.min(bottom, item.targetY)); });
            const lineEndX = baseX + columnIndex * columnWidth;
            const textX = lineEndX + 7;
            const maxTextWidth = Math.max(90, columnWidth - 14);
            column.forEach(item => {
                ctx.strokeStyle = item.color;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(item.x + 5, item.y);
                ctx.lineTo(lineEndX, item.targetY);
                ctx.stroke();
                ctx.fillStyle = '#243447';
                let label = item.label;
                while (label.length > 8 && ctx.measureText(label).width > maxTextWidth) label = label.slice(0, -2);
                if (label !== item.label) label = `${label}…`;
                ctx.fillText(label, textX, item.targetY);
            });
        });
        ctx.restore();
    }
};

function pmaExportChartDimensions(descriptor) {
    const type = descriptor.config.type;
    const entityCount = Math.max(1, Number(descriptor.entityCount) || 1);
    let width = 1500, height = 850;
    if (descriptor.config?.exportMode === 'kmeansMixed') {
        width = Math.min(2800, Math.max(1800, 1450 + entityCount * 35));
        height = Math.min(2100, Math.max(900, 250 + entityCount * 58));
        return { width, height };
    }
    if (type === 'line' || type === 'bar') width = Math.min(3400, Math.max(1500, 350 + (descriptor.bucketCount || 0) * 75));
    if (type === 'scatter') {
        const columnCount = Math.min(3, Math.max(1, Math.ceil(entityCount / 16)));
        width = Math.min(4200, 1550 + columnCount * 330 + Math.min(900, entityCount * 18));
        height = Math.min(3000, Math.max(900, 340 + Math.ceil(entityCount / columnCount) * 34));
    }
    if (descriptor.config.indexAxis === 'y') height = Math.min(2800, Math.max(height, 220 + entityCount * 52));
    if (type === 'line') height = Math.min(2500, Math.max(850, 250 + entityCount * 34));
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
        const scatterLabels = pmaExportShouldDrawScatterLabels(descriptor);
        chart = new Chart(canvas.getContext('2d'), {
            type: config.type || 'bar', data,
            plugins:[whiteBackground, pmaExportScatterLabelsPlugin],
            options:{
                responsive:false, maintainAspectRatio:false, animation:false, normalized:true, devicePixelRatio:1,
                indexAxis:config.indexAxis || 'x',
                layout:{padding:{left:30,right:scatterLabels?320:(lineLabels?260:35),top:30,bottom:30}},
                plugins:{
                    legend:{display:true,position:'bottom',labels:{usePointStyle:true,boxWidth:18,padding:14,font:{size:12}}},
                    title:{display:true,text:descriptor.title,font:{size:21,weight:'bold'},padding:{top:8,bottom:20}},
                    timelineEndLabelsPlugin:{enabled:lineLabels},
                    pmaExportScatterLabelsPlugin:{enabled:scatterLabels},
                    tooltip:{enabled:false}
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
    for(let i=0;i<built.descriptors.length;i++){
        pmaExportStatus(`<span class="spinner-border spinner-border-sm me-2"></span>Rapport HTML : graphique ${i+1} / ${built.descriptors.length}`,'info');
        const descriptor = built.descriptors[i];
        const blob=await pmaExportRenderDescriptor(descriptor,'png');
        figures.push({title:descriptor.title,url:await pmaExportBlobToDataURL(blob),details:pmaExportDescriptorDetails(descriptor)});
    }
    const criteriaRows=Object.entries(criteria).map(([k,v])=>`<tr><th>${timelineEscapeHtml(k)}</th><td>${timelineEscapeHtml(v)}</td></tr>`).join('');
    const aiReport = pmaExportDetailsToHtml(pmaExportAiDetailBlocks());
    const body=figures.map(f=>`<section><h2>${timelineEscapeHtml(f.title)}</h2><img src="${f.url}" alt="${timelineEscapeHtml(f.title)}">${pmaExportDetailsToHtml(f.details)}</section>`).join('');
    return new Blob([`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Rapport Analyse</title><style>body{font-family:Arial;color:#243447;margin:25px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd5df;padding:7px;text-align:left}th{background:#eaf2f8}section{page-break-after:always;margin-top:28px}img{max-width:100%;height:auto;border:1px solid #ddd}h1,h2,h3{color:#1f4e78}.details{margin-top:16px}.detail-block{margin:12px 0;padding:12px;border:1px solid #d9e4ee;border-radius:10px;background:#f8fbfd}.detail-block ul{margin:8px 0 0 18px}.detail-block li{margin:4px 0}</style></head><body><h1>${timelineEscapeHtml(TITRE_PLATEFORME)}</h1><h2>Critères</h2><table>${criteriaRows}</table><section><h2>Rapport d’analyse intelligente exhaustive</h2>${aiReport}</section>${body}</body></html>`],{type:'text/html;charset=utf-8'});
}
async function pmaExportCreatePdf(scope) {
    if (!window.jspdf?.jsPDF) throw new Error('jsPDF n’est pas chargé.');
    const {jsPDF}=window.jspdf; const built=pmaExportBuildDescriptors(scope); if(!built.descriptors.length) throw new Error('Aucun graphique disponible.');
    const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    const aiBlocks = pmaExportAiDetailBlocks();
    let hasIntro = aiBlocks.length > 0;
    if (hasIntro) {
        pdf.setFont('helvetica','bold'); pdf.setFontSize(16); pdf.text('Rapport d’analyse intelligente exhaustive',12,12);
        pmaExportPdfAddDetailBlocks(pdf, aiBlocks, 20);
    }
    for(let i=0;i<built.descriptors.length;i++){
        const descriptor = built.descriptors[i];
        if(hasIntro || i>0) pdf.addPage('a4','landscape');
        pmaExportStatus(`<span class="spinner-border spinner-border-sm me-2"></span>PDF : graphique ${i+1} / ${built.descriptors.length}`,'info');
        const blob=await pmaExportRenderDescriptor(descriptor,'jpeg'); const url=await pmaExportBlobToDataURL(blob);
        pdf.setFont('helvetica','bold'); pdf.setFontSize(14); pdf.text(descriptor.title,12,12);
        const props=pdf.getImageProperties(url); const maxW=273,maxH=122; const ratio=Math.min(maxW/props.width,maxH/props.height); const w=props.width*ratio,h=props.height*ratio; pdf.addImage(url,'JPEG',12,18,w,h,undefined,'FAST');
        const details = pmaExportDescriptorDetails(descriptor);
        if (details.length) pmaExportPdfAddDetailBlocks(pdf, details, 18 + h + 8);
    }
    return pdf.output('blob');
}
function pmaXmlEscape(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
function pmaDataUrlBytes(url){const b=atob(String(url).split(',')[1]||'');const a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a;}
function pmaPngSize(bytes){if(bytes.length<24)return{width:1200,height:700};const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);return{width:v.getUint32(16),height:v.getUint32(20)};}
function pmaDocxParagraph(text,opt={}){return `<w:p><w:pPr>${opt.break?'<w:pageBreakBefore/>':''}<w:spacing w:after="${opt.after??120}"/>${opt.center?'<w:jc w:val="center"/>':''}</w:pPr><w:r><w:rPr>${opt.bold?'<w:b/>':''}<w:sz w:val="${opt.size||22}"/><w:szCs w:val="${opt.size||22}"/><w:color w:val="${opt.color||'243447'}"/></w:rPr><w:t xml:space="preserve">${pmaXmlEscape(text)}</w:t></w:r></w:p>`;}
async function pmaExportCreateDocx(scope, descriptorsOverride) {
    if(typeof JSZip==='undefined')throw new Error('JSZip n’est pas chargé.');
    const built=Array.isArray(descriptorsOverride) ? { descriptors: descriptorsOverride } : pmaExportBuildDescriptors(scope); if(!built.descriptors.length)throw new Error('Aucun graphique disponible.');
    const items=[];
    for(let i=0;i<built.descriptors.length;i++){
        const descriptor = built.descriptors[i];
        pmaExportStatus(`<span class="spinner-border spinner-border-sm me-2"></span>Word : graphique ${i+1} / ${built.descriptors.length}`,'info');
        const blob=await pmaExportRenderDescriptor(descriptor,'png');
        items.push({title:descriptor.title,bytes:pmaDataUrlBytes(await pmaExportBlobToDataURL(blob)),details:pmaExportDescriptorDetails(descriptor)});
    }
    const zip=new JSZip();
    const rels=items.map((_,i)=>`<Relationship Id="rIdImage${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${i+1}.png"/>`).join('');
    let body=pmaDocxParagraph(TITRE_PLATEFORME,{bold:true,size:34,color:'1F4E78'});
    Object.entries(pmaExportCriteria(scope)).forEach(([k,v])=>body+=pmaDocxParagraph(`${k} : ${v}`,{size:19,after:40}));
    const aiBlocks = pmaExportAiDetailBlocks();
    if (aiBlocks.length) {
        body += pmaDocxParagraph('Rapport d’analyse intelligente exhaustive',{bold:true,size:28,color:'1F4E78',break:true});
        aiBlocks.forEach(block => {
            body += pmaDocxParagraph(block.title || 'Analyse',{bold:true,size:23,color:'44546A',after:40});
            (block.lines || []).forEach(line => { body += pmaDocxParagraph(`• ${line}`,{size:18,after:22}); });
        });
    }
    items.forEach((img,i)=>{
        const dim=pmaPngSize(img.bytes),maxW=9.8,maxH=5.8;let wi=maxW,hi=wi*dim.height/Math.max(1,dim.width);if(hi>maxH){hi=maxH;wi=hi*dim.width/Math.max(1,dim.height);}const cx=Math.round(wi*914400),cy=Math.round(hi*914400);
        body+=pmaDocxParagraph(img.title,{bold:true,size:27,color:'2F5597',break:true});
        body+=`<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${i+1}" name="Graphique ${i+1}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${i+1}" name="image${i+1}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImage${i+1}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
        if (Array.isArray(img.details) && img.details.length) {
            img.details.forEach(block => {
                body += pmaDocxParagraph(block.title || 'Détails', { bold:true, size:22, color:'44546A', after:35 });
                (block.lines || []).forEach(line => { body += pmaDocxParagraph(`• ${line}`, { size:18, after:20 }); });
            });
        }
    });
    body+='<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="680" w:right="680" w:bottom="680" w:left="680"/></w:sectPr>';
    zip.file('[Content_Types].xml',`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
    zip.file('_rels/.rels',`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
    zip.file('word/_rels/document.xml.rels',`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`);
    zip.file('word/document.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body}</w:body></w:document>`);
    items.forEach((img,i)=>zip.file(`word/media/image${i+1}.png`,img.bytes));
    return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',compression:'DEFLATE'});
}
window.exportTimelineWord=async function(scope,entityName){try{if(entityName){const pkg=await pmaExportCreateImagePackage(scope,'png',entityName);pmaExportDownload(pkg.blob,pkg.filename);return;}const blob=await pmaExportCreateDocx(scope);const fn=`rapport_graphiques_${String(scope).toLowerCase()}_${pmaExportTimestamp()}.docx`;pmaExportDownload(blob,fn);pmaExportStatus(`<i class="fas fa-check-circle me-2"></i>Word créé : <strong>${fn}</strong>`,'success');}catch(error){console.error(error);pmaExportStatus(timelineEscapeHtml(error.message),'danger');alert(error.message);}};
window.exportAnalysisToPDF=async function(scope){try{const blob=await pmaExportCreatePdf(scope);const fn=`rapport_graphiques_${String(scope).toLowerCase()}_${pmaExportTimestamp()}.pdf`;pmaExportDownload(blob,fn);pmaExportStatus(`<i class="fas fa-check-circle me-2"></i>PDF créé : <strong>${fn}</strong>`,'success');return blob;}catch(error){console.error(error);pmaExportStatus(timelineEscapeHtml(error.message),'danger');alert(error.message);}};
window.exportTimelineScopeData=async function(scope,format){try{const rows=pmaExportFlattenRows(scope),criteria=pmaExportCriteria(scope),stamp=pmaExportTimestamp();if(format==='json'){pmaExportDownload(new Blob([JSON.stringify({criteria,rows},null,2)],{type:'application/json;charset=utf-8'}),`analyse_${String(scope).toLowerCase()}_${stamp}.json`);}else if(format==='csv'){const h=['Niveau','Entité','Période clé','Période','Soumissions détaillées','Soumissions cumulées','Total entité'];const lines=[h.map(pmaExportCsvCell).join(';'),...rows.map(r=>[r.niveau,r.entite,r.periode_cle,r.periode,r.soumissions_detaillees,r.soumissions_cumulees,r.total_entite].map(pmaExportCsvCell).join(';'))];pmaExportDownload(new Blob(['\uFEFF'+lines.join('\n')],{type:'text/csv;charset=utf-8'}),`analyse_${String(scope).toLowerCase()}_${stamp}.csv`);}else if(format==='html'){pmaExportDownload(await pmaExportCreateHtml(scope),`rapport_${String(scope).toLowerCase()}_${stamp}.html`);}else if(format==='xlsx'){if(typeof ExcelJS==='undefined')throw new Error('ExcelJS n’est pas chargé.');const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet('Données temporelles'),wc=wb.addWorksheet('Critères');wc.addRows([['Critère','Valeur'],...Object.entries(criteria)]);ws.addRow(['Niveau','Entité','Période clé','Période','Détaillé','Cumulé','Total']);rows.forEach(r=>ws.addRow([r.niveau,r.entite,r.periode_cle,r.periode,r.soumissions_detaillees,r.soumissions_cumulees,r.total_entite]));const buf=await wb.xlsx.writeBuffer();pmaExportDownload(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`analyse_${String(scope).toLowerCase()}_${stamp}.xlsx`);}pmaExportStatus('<i class="fas fa-check-circle me-2"></i>Export de données terminé.','success');}catch(error){console.error(error);pmaExportStatus(timelineEscapeHtml(error.message),'danger');alert(error.message);}};
window.shareTimelineExport=async function(scope,format,entityName){try{let result;if(format==='word'){const blob=await pmaExportCreateDocx(scope);result={blob,filename:`rapport_${String(scope).toLowerCase()}_${pmaExportTimestamp()}.docx`};}else if(format==='pdf'){const blob=await pmaExportCreatePdf(scope);result={blob,filename:`rapport_${String(scope).toLowerCase()}_${pmaExportTimestamp()}.pdf`};}else result=await pmaExportCreateImagePackage(scope,format||'png',entityName);const file=new File([result.blob],result.filename,{type:result.blob.type||'application/octet-stream'});if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]})))await navigator.share({title:'Graphiques KoboToolbox',files:[file]});else{pmaExportDownload(result.blob,result.filename);alert('Le partage direct n’est pas disponible. Le fichier a été téléchargé.');}}catch(error){if(error?.name==='AbortError')return;console.error(error);pmaExportStatus(timelineEscapeHtml(error.message),'danger');alert(error.message);}};
async function pmaExportCreateAdvancedImagePackage(chart, format) {
    const descriptors = pmaExportBuildAdvancedDescriptorsFromChart(chart);
    if (!descriptors.length) throw new Error('Aucun graphique avancé disponible.');
    const ext = format === 'jpeg' ? 'jpg' : 'png';
    const assets = [];
    for (let i = 0; i < descriptors.length; i++) {
        const descriptor = descriptors[i];
        pmaExportStatus(`<span class="spinner-border spinner-border-sm me-2"></span>Graphique avancé ${i + 1} / ${descriptors.length}`, 'info');
        assets.push({ descriptor, blob: await pmaExportRenderDescriptor(descriptor, format || 'png') });
    }
    if (assets.length === 1) {
        return { blob: assets[0].blob, filename: `${pmaExportSafeName(assets[0].descriptor.title)}_${pmaExportTimestamp()}.${ext}` };
    }
    if (typeof JSZip === 'undefined') throw new Error('JSZip n’est pas chargé.');
    const zip = new JSZip();
    assets.forEach((asset, index) => zip.file(`${String(index + 1).padStart(2, '0')}_${pmaExportSafeName(asset.descriptor.title)}.${ext}`, asset.blob));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    return { blob, filename: `${pmaExportSafeName(chart.title)}_${pmaExportTimestamp()}.zip` };
}
window.exportAdvancedSingleChart=async function(chartKey,format){
    try{
        const snap=window.getAdvancedAnalysisExportSnapshot?.();
        const chart=snap?.charts?.find(c=>c.key===chartKey);
        if(!chart)throw new Error('Ce graphique avancé n’est pas encore disponible.');
        const result=await pmaExportCreateAdvancedImagePackage(chart,format||'png');
        pmaExportDownload(result.blob,result.filename);
    }catch(error){console.error(error);alert(error.message);}
};
window.exportAdvancedSingleWord=async function(chartKey){
    try{
        const snap=window.getAdvancedAnalysisExportSnapshot?.();
        const chart=snap?.charts?.find(c=>c.key===chartKey);
        if(!chart)throw new Error('Ce graphique avancé n’est pas encore disponible.');
        const descriptors=pmaExportBuildAdvancedDescriptorsFromChart(chart);
        const blob=await pmaExportCreateDocx(chart.level||'ALL',descriptors);
        pmaExportDownload(blob,`${pmaExportSafeName(chart.title)}_${pmaExportTimestamp()}.docx`);
    }catch(error){console.error(error);alert(error.message);}
};
window.shareAdvancedSingleChart=async function(chartKey){
    try{
        const snap=window.getAdvancedAnalysisExportSnapshot?.();
        const chart=snap?.charts?.find(c=>c.key===chartKey);
        if(!chart)throw new Error('Ce graphique avancé n’est pas encore disponible.');
        const result=await pmaExportCreateAdvancedImagePackage(chart,'png');
        const file=new File([result.blob],result.filename,{type:result.blob.type||'application/octet-stream'});
        if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]})))await navigator.share({title:chart.title,files:[file]});
        else pmaExportDownload(result.blob,result.filename);
    }catch(error){if(error?.name!=='AbortError'){console.error(error);alert(error.message);}}
};

window.exportKoboBaseJSON=function(){if(!Array.isArray(allData)||!allData.length)return alert('Aucune donnée KoboToolbox disponible.');const payload={type:'kobotoolbox_offline_backup',version:1,exported_at:new Date().toISOString(),count:allData.length,results:allData};pmaExportDownload(new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'}),`base_kobotoolbox_${pmaExportTimestamp()}.json`);};

/* Import manuel de la base KoboToolbox au format JSON. */
function extractKoboRecordsFromPayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    for (const key of ['results', 'data', 'records', 'rows', 'base_kobo']) {
        if (Array.isArray(payload[key])) return payload[key];
    }
    return [];
}

window.importKoboRecords = function(records, sourceLabel) {
    const cleanRecords = (Array.isArray(records) ? records : [])
        .filter(row => row && typeof row === 'object' && !Array.isArray(row));
    if (!cleanRecords.length) throw new Error('La base JSON ne contient aucune ligne exploitable.');

    allData = cleanRecords;
    window.allData = allData;
    submissionTimelineSourceData = allData;

    $('#error-box').hide().empty();
    renderTable(allData);
    renderAnalysis(allData);

    const sourceText = timelineEscapeHtml(sourceLabel || 'Import manuel JSON');
    $('#sync-status').html(
        `<span class="badge bg-success sync-badge"><i class="fas fa-file-code"></i> JSON chargé : ${allData.length} ligne(s)</span>` +
        `<span class="badge bg-info text-dark ms-2">${sourceText}</span>`
    );

    if (typeof window.refreshAdvancedAnalysisFromMainData === 'function') {
        window.refreshAdvancedAnalysisFromMainData(allData);
    }
    return allData.length;
};

async function importKoboJSONFile(file) {
    if (!file) return;
    if (!/\.json$/i.test(file.name || '') && file.type !== 'application/json') {
        throw new Error('Veuillez sélectionner un fichier JSON valide.');
    }

    $('#loading-text').text('Importation et analyse de la base JSON…');
    $('#loading-box').show();
    $('#error-box').hide().empty();

    try {
        if (typeof loadDictionaryAutomatically === 'function') {
            try { await loadDictionaryAutomatically(); } catch (dictError) { console.warn('Dictionnaire non chargé pendant l’import JSON :', dictError); }
        }
        const text = await file.text();
        const payload = JSON.parse(text.replace(/^\uFEFF/, ''));
        const rows = extractKoboRecordsFromPayload(payload);
        const count = window.importKoboRecords(rows, file.name);
        return count;
    } catch (error) {
        console.error('Erreur d’importation JSON :', error);
        $('#error-box').html(`<strong>Erreur d’importation JSON :</strong> ${timelineEscapeHtml(error.message)}`).show();
        $('#sync-status').html('<span class="badge bg-danger sync-badge"><i class="fas fa-exclamation-triangle"></i> Échec import JSON</span>');
        throw error;
    } finally {
        $('#loading-box').hide();
        $('#loading-text').text('Synchronisation et modélisation des données…');
        const input = document.getElementById('json-file');
        if (input) input.value = '';
    }
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
        let missingDates = Math.max(0, item.count - temporal.allDatedCount);
        let dateCompleteness = item.count ? (temporal.allDatedCount / item.count) * 100 : 0;
        let recommendation = aiRecommendation(item.name, item.count, stats, trend, recent, missingDates);
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
            datedCount: temporal.allDatedCount,
            missingDates,
            dateCompleteness,
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
    const container = document.getElementById('ai-report-content');
    if (!container) return;

    const source = Array.isArray(data) ? data : [];
    const totalRows = source.length;
    if (!totalRows) {
        intelligentAnalysisSnapshot = { generated_at: getFormattedDateTime(), total_rows: 0, levels: {} };
        container.innerHTML = `
            <div class="alert alert-secondary mb-0">
                <h6 class="fw-bold"><i class="fas fa-database"></i> Aucune donnée à analyser</h6>
                <p class="mb-0">Chargez une base KoboToolbox ou importez une sauvegarde JSON, puis actualisez l’analyse.</p>
            </div>`;
        return;
    }

    const granularity = document.getElementById('timeline-granularity')?.value || 'day';
    const displayMode = document.getElementById('timeline-display-mode')?.value || 'detailed';
    const chartType = document.getElementById('timeline-chart-type')?.selectedOptions?.[0]?.text || 'Courbes';
    const layoutMode = selectedTimelineLayout() === 'individual' ? 'Affichage individuel' : 'Affichage groupé';
    const startValue = document.getElementById('timeline-date-start')?.value || '';
    const endValue = document.getElementById('timeline-date-end')?.value || '';
    const startDate = startValue ? parseSubmissionDate(startValue) : null;
    const endDate = endValue ? parseSubmissionDate(endValue) : null;

    const datedRowsAll = source
        .map(row => ({ row, date: parseSubmissionDate(row['_submission_time']) }))
        .filter(item => item.date);
    const datedRows = datedRowsAll.filter(item => (!startDate || item.date >= startDate) && (!endDate || item.date <= endDate));
    const globalBuckets = [...new Set(datedRows.map(item => aiBucketKey(item.date, granularity)).filter(Boolean))].sort();
    const allDates = datedRows.map(item => item.date).sort((a, b) => a - b);
    const dateRange = allDates.length
        ? `${allDates[0].toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })} au ${allDates[allDates.length - 1].toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })}`
        : 'aucune période exploitable';

    const freqs = frequencies || {
        DREN: source.reduce((acc, row) => { const v = aiEntityValue(row, 'DREN'); const k = aiIsMissingEntity(v) ? 'Non renseigné' : v; acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
        CISCO: source.reduce((acc, row) => { const v = aiEntityValue(row, 'CISCO'); const k = aiIsMissingEntity(v) ? 'Non renseigné' : v; acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
        ZAP: source.reduce((acc, row) => { const v = aiEntityValue(row, 'ZAP'); const k = aiIsMissingEntity(v) ? 'Non renseigné' : v; acc[k] = (acc[k] || 0) + 1; return acc; }, {})
    };

    const analyses = {
        DREN: buildAiLevelAnalysis('DREN', source, freqs.DREN, datedRows, globalBuckets, granularity, totalRows),
        CISCO: buildAiLevelAnalysis('CISCO', source, freqs.CISCO, datedRows, globalBuckets, granularity, totalRows),
        ZAP: buildAiLevelAnalysis('ZAP', source, freqs.ZAP, datedRows, globalBuckets, granularity, totalRows)
    };

    const levels = ['DREN', 'CISCO', 'ZAP'];
    const namedEntityCount = levels.reduce((sum, level) => sum + analyses[level].stats.entityCount, 0);
    const latestBucket = globalBuckets.length ? globalBuckets[globalBuckets.length - 1] : null;
    const previousBucket = globalBuckets.length > 1 ? globalBuckets[globalBuckets.length - 2] : null;
    const latestLabel = latestBucket ? aiBucketLabel(latestBucket, granularity) : 'Période indisponible';
    const previousLabel = previousBucket ? aiBucketLabel(previousBucket, granularity) : 'Période antérieure indisponible';

    const bucketTotals = {};
    datedRows.forEach(item => {
        const key = aiBucketKey(item.date, granularity);
        bucketTotals[key] = (bucketTotals[key] || 0) + 1;
    });
    const latestTotal = latestBucket ? (bucketTotals[latestBucket] || 0) : 0;
    const previousTotal = previousBucket ? (bucketTotals[previousBucket] || 0) : null;
    const overallTrend = aiTrendInfo(previousTotal, latestTotal, globalBuckets.length > 0);

    const dateCompleteness = totalRows ? (datedRowsAll.length / totalRows) * 100 : 0;
    const levelCompleteness = Object.fromEntries(levels.map(level => [level, totalRows ? (analyses[level].stats.namedTotal / totalRows) * 100 : 0]));
    const hierarchyCompleteness = levels.reduce((sum, level) => sum + levelCompleteness[level], 0) / levels.length;
    const qualityScore = Math.round(dateCompleteness * 0.4 + hierarchyCompleteness * 0.6);
    const qualityBand = qualityScore >= 90
        ? { label: 'Très bonne', cls: 'success', note: 'Les données permettent une lecture statistique relativement fiable.' }
        : qualityScore >= 75
            ? { label: 'Bonne avec réserves', cls: 'primary', note: 'Quelques champs incomplets doivent être contrôlés avant une décision définitive.' }
            : qualityScore >= 55
                ? { label: 'Moyenne', cls: 'warning', note: 'L’interprétation doit rester prudente en raison de données incomplètes.' }
                : { label: 'Faible', cls: 'danger', note: 'Une vérification de la base est nécessaire avant toute conclusion opérationnelle.' };

    const allEntityRows = levels.flatMap(level => analyses[level].rows.map(row => ({ level, row })));
    const risingCount = allEntityRows.filter(item => item.row.trend.label === 'Hausse récente').length;
    const fallingCount = allEntityRows.filter(item => item.row.trend.label === 'Baisse récente').length;
    const stableCount = allEntityRows.filter(item => item.row.trend.label === 'Stabilité récente').length;
    const noRecentCount = allEntityRows.filter(item => globalBuckets.length && item.row.recent === 0).length;
    const missingDateEntityCount = allEntityRows.filter(item => item.row.missingDates > 0).length;

    const topEntityText = levels.map(level => {
        const top = analyses[level].rows[0];
        return top ? `<strong>${level}</strong> : ${aiEscapeHtml(top.name)} (${aiFormatNumber(top.count)})` : `<strong>${level}</strong> : aucune entité renseignée`;
    }).join(' · ');

    const comparativeRows = levels.map(level => {
        const s = analyses[level].stats;
        return `<tr>
            <th scope="row">${level}</th>
            <td>${aiFormatNumber(s.entityCount)}</td>
            <td>${aiFormatNumber(s.namedTotal)} / ${aiFormatNumber(totalRows)}</td>
            <td><div class="ai-progress"><span style="width:${Math.min(100, levelCompleteness[level])}%"></span></div><small>${aiFormatNumber(levelCompleteness[level], 1)} %</small></td>
            <td>${aiFormatNumber(s.missing)}</td>
            <td>${aiFormatNumber(s.mean, 1)}</td>
            <td>${aiFormatNumber(s.median, 1)}</td>
            <td>${aiFormatNumber(s.top1Share, 1)} %</td>
            <td>${aiFormatNumber(s.top3Share, 1)} %</td>
        </tr>`;
    }).join('');

    const levelSections = levels.map(level => {
        const analysis = analyses[level];
        const s = analysis.stats;
        const coverage = levelCompleteness[level];
        if (!analysis.rows.length) {
            return `<section class="ai-level-section mb-4" data-ai-level="${level}">
                <h5 class="ai-section-title"><i class="fas fa-building text-secondary"></i> Analyse exhaustive des ${level}</h5>
                <div class="alert alert-warning mb-0">Aucune entité ${level} renseignée dans le périmètre analysé. ${aiFormatNumber(s.missing)} ligne(s) doivent être vérifiée(s).</div>
            </section>`;
        }

        const top = analysis.rows[0];
        const low = analysis.rows[analysis.rows.length - 1];
        const activeLatest = analysis.rows.filter(row => row.recent > 0).length;
        const rowsHtml = analysis.rows.map(row => {
            const dateClass = row.dateCompleteness >= 90 ? 'success' : row.dateCompleteness >= 70 ? 'warning' : 'danger';
            return `<tr data-ai-entity="${aiEscapeHtml(row.name)}">
                <td class="text-center fw-bold">${row.rank}</td>
                <td><strong>${aiEscapeHtml(row.name)}</strong><div class="small text-muted">${level}</div></td>
                <td class="text-center"><span class="badge bg-primary">${aiFormatNumber(row.count)}</span><div class="small text-muted mt-1">${aiFormatNumber(row.share, 1)} % du périmètre</div></td>
                <td><span class="badge ${row.relative.badge}">${aiEscapeHtml(row.relative.label)}</span><div class="small text-muted mt-1">${aiEscapeHtml(row.relative.detail)}</div></td>
                <td>${aiEscapeHtml(row.dateText)}<div class="small text-muted">${aiFormatNumber(row.activePeriods)} période(s) active(s)</div><div class="ai-mini-quality text-${dateClass}">${aiFormatNumber(row.dateCompleteness, 1)} % avec date${row.missingDates ? ` · ${aiFormatNumber(row.missingDates)} sans date` : ''}</div></td>
                <td class="text-center"><strong>${aiFormatNumber(row.recent)}</strong><div class="small text-muted">${aiEscapeHtml(latestLabel)}</div></td>
                <td><span class="badge ${row.trend.badge}"><i class="fas ${row.trend.icon}"></i> ${aiEscapeHtml(row.trend.label)}</span><div class="small mt-1">${aiEscapeHtml(row.trend.sentence)}</div></td>
                <td>${aiEscapeHtml(row.recommendation)}</td>
            </tr>`;
        }).join('');

        const concentrationSentence = s.entityCount === 1
            ? `Une seule entité est disponible : une comparaison interne au niveau ${level} n’est pas possible.`
            : s.top1Share >= 60
                ? `Les soumissions sont fortement concentrées : la première entité représente ${aiFormatNumber(s.top1Share, 1)} % du niveau.`
                : s.top3Share >= 75
                    ? `Les trois premières entités concentrent ${aiFormatNumber(s.top3Share, 1)} % des soumissions.`
                    : `La répartition est relativement diffuse entre les entités observées.`;

        return `<section class="ai-level-section mb-4" data-ai-level="${level}">
            <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
                <div>
                    <h5 class="ai-section-title mb-1"><i class="fas fa-building text-primary"></i> Analyse exhaustive des ${level}</h5>
                    <p class="mb-0 text-muted">Toutes les ${level} renseignées sont nommément analysées. ${concentrationSentence}</p>
                </div>
                <div class="d-flex flex-wrap gap-2">
                    <span class="badge bg-dark">${aiFormatNumber(analysis.rows.length)} / ${aiFormatNumber(analysis.rows.length)} mentionnée(s)</span>
                    <span class="badge bg-${coverage >= 90 ? 'success' : coverage >= 70 ? 'warning text-dark' : 'danger'}">Complétude ${aiFormatNumber(coverage, 1)} %</span>
                </div>
            </div>

            <div class="ai-level-stat-grid mb-3">
                <div><span>Plus représentée</span><strong>${aiEscapeHtml(top.name)}</strong><small>${aiFormatNumber(top.count)} soumission(s)</small></div>
                <div><span>Moins représentée</span><strong>${aiEscapeHtml(low.name)}</strong><small>${aiFormatNumber(low.count)} soumission(s)</small></div>
                <div><span>Moyenne / médiane</span><strong>${aiFormatNumber(s.mean, 1)} / ${aiFormatNumber(s.median, 1)}</strong><small>soumission(s) par entité</small></div>
                <div><span>Actives récemment</span><strong>${aiFormatNumber(activeLatest)} / ${aiFormatNumber(s.entityCount)}</strong><small>${aiEscapeHtml(latestLabel)}</small></div>
            </div>

            <div class="ai-table-toolbar mb-2">
                <label class="visually-hidden" for="ai-search-${level.toLowerCase()}">Rechercher une ${level}</label>
                <div class="input-group input-group-sm">
                    <span class="input-group-text"><i class="fas fa-search"></i></span>
                    <input type="search" class="form-control ai-entity-search" id="ai-search-${level.toLowerCase()}" data-level="${level}" placeholder="Rechercher une ${level} dans le rapport…">
                    <span class="input-group-text"><strong id="ai-visible-${level.toLowerCase()}">${aiFormatNumber(analysis.rows.length)}</strong>&nbsp;visible(s)</span>
                </div>
            </div>

            <details class="ai-details" open>
                <summary>Afficher le tableau détaillé de toutes les ${level}</summary>
                <div class="table-responsive border rounded ai-entity-scroll">
                    <table class="table table-sm table-striped table-hover align-middle mb-0 ai-entity-analysis-table">
                        <thead class="table-dark"><tr><th>Rang</th><th>Entité ${level}</th><th>Volume et part</th><th>Position relative</th><th>Couverture temporelle</th><th>Dernière période</th><th>Tendance récente</th><th>Interprétation et action proposée</th></tr></thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            </details>
        </section>`;
    }).join('');

    const priorityRows = [];
    allEntityRows.forEach(item => {
        const reasons = [];
        if (item.row.relative.label === 'Volume relatif faible') reasons.push('volume relatif faible');
        if (item.row.trend.label === 'Baisse récente') reasons.push('baisse récente');
        if (globalBuckets.length && item.row.recent === 0) reasons.push('aucune soumission dans la dernière période');
        if (item.row.missingDates > 0) reasons.push(`${item.row.missingDates} soumission(s) sans date`);
        if (reasons.length) priorityRows.push({ ...item, reasons });
    });
    priorityRows.sort((a, b) => b.reasons.length - a.reasons.length || a.row.count - b.row.count || a.level.localeCompare(b.level) || a.row.name.localeCompare(b.row.name, 'fr'));
    const priorityHtml = priorityRows.length
        ? `<div class="ai-priority-list">${priorityRows.map(item => `<article><div><strong>${item.level} — ${aiEscapeHtml(item.row.name)}</strong><span>${item.reasons.map(aiEscapeHtml).join(' · ')}</span></div><p>${aiEscapeHtml(item.row.recommendation)}</p></article>`).join('')}</div>`
        : `<p class="mb-0">Aucun signal prioritaire n’a été détecté à partir des volumes, de la complétude des dates et des deux dernières périodes disponibles. Cette absence d’alerte ne remplace pas la comparaison avec les objectifs officiels.</p>`;

    const qualityRows = [
        ['Dates de soumission', dateCompleteness],
        ['DREN renseignées', levelCompleteness.DREN],
        ['CISCO renseignées', levelCompleteness.CISCO],
        ['ZAP renseignées', levelCompleteness.ZAP]
    ].map(([label, value]) => `<div class="ai-quality-row"><span>${label}</span><div class="ai-quality-bar"><i style="width:${Math.min(100, value)}%"></i></div><strong>${aiFormatNumber(value, 1)} %</strong></div>`).join('');

    container.innerHTML = `
        <div class="ai-report-v2">
            <div class="ai-report-meta mb-3">
                <div><i class="fas fa-clock"></i> Généré le <strong>${aiEscapeHtml(getFormattedDateTime())}</strong></div>
                <div><i class="fas fa-filter"></i> Période : <strong>${aiEscapeHtml(dateRange)}</strong></div>
                <div><i class="fas fa-chart-line"></i> ${aiEscapeHtml(aiGranularityLabel(granularity))} · ${displayMode === 'cumulative' ? 'Données cumulées' : 'Données détaillées'} · ${aiEscapeHtml(chartType)} · ${aiEscapeHtml(layoutMode)}</div>
            </div>

            <div class="ai-report-summary-grid mb-3">
                <div class="ai-report-metric"><span>Formulaires analysés</span><strong>${aiFormatNumber(totalRows)}</strong><small>Base actuellement chargée</small></div>
                <div class="ai-report-metric"><span>Entités analysées</span><strong>${aiFormatNumber(namedEntityCount)}</strong><small>${aiFormatNumber(analyses.DREN.stats.entityCount)} DREN · ${aiFormatNumber(analyses.CISCO.stats.entityCount)} CISCO · ${aiFormatNumber(analyses.ZAP.stats.entityCount)} ZAP</small></div>
                <div class="ai-report-metric"><span>Qualité des données</span><strong class="text-${qualityBand.cls}">${aiFormatNumber(qualityScore)} / 100</strong><small>${qualityBand.label}</small></div>
                <div class="ai-report-metric"><span>Dernière période</span><strong>${aiFormatNumber(latestTotal)}</strong><small>${aiEscapeHtml(latestLabel)} · ${aiEscapeHtml(overallTrend.label)}</small></div>
                <div class="ai-report-metric"><span>Évolutions récentes</span><strong>${aiFormatNumber(risingCount)} ↑ · ${aiFormatNumber(fallingCount)} ↓</strong><small>${aiFormatNumber(stableCount)} stable(s)</small></div>
                <div class="ai-report-metric"><span>Points à contrôler</span><strong>${aiFormatNumber(priorityRows.length)}</strong><small>${aiFormatNumber(noRecentCount)} sans activité récente · ${aiFormatNumber(missingDateEntityCount)} avec dates incomplètes</small></div>
            </div>

            <div class="ai-report-callout mb-3">
                <h6><i class="fas fa-lightbulb"></i> Lecture exécutive</h6>
                <p>L’analyse porte sur <strong>${aiFormatNumber(totalRows)} soumission(s)</strong>. Elle couvre nommément <strong>${aiFormatNumber(analyses.DREN.stats.entityCount)} DREN</strong>, <strong>${aiFormatNumber(analyses.CISCO.stats.entityCount)} CISCO</strong> et <strong>${aiFormatNumber(analyses.ZAP.stats.entityCount)} ZAP</strong>. Les entités les plus représentées sont : ${topEntityText}.</p>
                <p class="mb-1">Pour l’ensemble du périmètre, la dernière période <strong>${aiEscapeHtml(latestLabel)}</strong> contient <strong>${aiFormatNumber(latestTotal)} soumission(s)</strong>${previousBucket ? ` contre <strong>${aiFormatNumber(previousTotal)}</strong> pendant ${aiEscapeHtml(previousLabel)}` : ''}. <span class="badge ${overallTrend.badge}">${aiEscapeHtml(overallTrend.label)}</span> ${aiEscapeHtml(overallTrend.sentence)}</p>
                <p class="mb-0"><strong>Niveau de confiance : ${qualityBand.label} (${aiFormatNumber(qualityScore)}/100).</strong> ${aiEscapeHtml(qualityBand.note)}</p>
            </div>

            <section class="ai-quality-section mb-4">
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
                    <h5 class="ai-section-title mb-0"><i class="fas fa-shield-halved text-success"></i> Qualité et complétude des données</h5>
                    <span class="badge bg-${qualityBand.cls}">${aiFormatNumber(qualityScore)} / 100 — ${qualityBand.label}</span>
                </div>
                ${qualityRows}
                <div class="small text-muted mt-2">Le score synthétique combine la présence des dates (40 %) et la complétude des champs DREN/CISCO/ZAP (60 %). Il mesure la fiabilité de lecture de la base, et non la performance des structures.</div>
            </section>

            <section class="ai-insight-grid mb-4">
                <article><i class="fas fa-arrow-trend-up text-success"></i><div><strong>${aiFormatNumber(risingCount)}</strong><span>entité(s) en hausse récente</span></div></article>
                <article><i class="fas fa-arrow-trend-down text-danger"></i><div><strong>${aiFormatNumber(fallingCount)}</strong><span>entité(s) en baisse récente</span></div></article>
                <article><i class="fas fa-equals text-primary"></i><div><strong>${aiFormatNumber(stableCount)}</strong><span>entité(s) stables</span></div></article>
                <article><i class="fas fa-calendar-xmark text-warning"></i><div><strong>${aiFormatNumber(noRecentCount)}</strong><span>sans soumission récente</span></div></article>
            </section>

            <section class="mb-4">
                <h5 class="ai-section-title"><i class="fas fa-scale-balanced text-success"></i> Comparaison globale des trois niveaux</h5>
                <div class="table-responsive border rounded">
                    <table class="table table-sm table-bordered align-middle mb-0 ai-comparison-table">
                        <thead class="table-light"><tr><th>Niveau</th><th>Entités</th><th>Données renseignées</th><th>Complétude</th><th>Non renseignées</th><th>Moyenne</th><th>Médiane</th><th>Part de la 1re</th><th>Part des 3 premières</th></tr></thead>
                        <tbody>${comparativeRows}</tbody>
                    </table>
                </div>
                <div class="small text-muted mt-2"><i class="fas fa-circle-info"></i> Les niveaux DREN, CISCO et ZAP sont trois lectures hiérarchiques des mêmes formulaires. Leurs totaux ne doivent pas être additionnés.</div>
            </section>

            ${levelSections}

            <section class="ai-priority-section mb-3">
                <h5 class="ai-section-title"><i class="fas fa-list-check text-danger"></i> Points de vigilance et actions ciblées</h5>
                ${priorityHtml}
            </section>

            <details class="ai-method-details" open>
                <summary><i class="fas fa-book-open"></i> Méthode d’interprétation et précautions</summary>
                <ul class="ai-method-list mt-3 mb-0">
                    <li><strong>Volume :</strong> nombre de formulaires KoboToolbox associés à une entité. Il ne mesure pas directement la qualité, l’efficacité ou le taux de réalisation.</li>
                    <li><strong>Position relative :</strong> comparaison avec la moyenne, la médiane et les quartiles des seules entités présentes dans la base.</li>
                    <li><strong>Tendance récente :</strong> comparaison des deux dernières périodes ${aiEscapeHtml(aiGranularityLabel(granularity).toLowerCase())} disponibles, à partir des volumes non cumulés.</li>
                    <li><strong>Concentration :</strong> part occupée par la première entité et les trois premières. Une forte concentration peut refléter un périmètre plus large, une activité réelle, un retard ailleurs ou des doublons.</li>
                    <li><strong>Recommandations :</strong> signaux de vérification, de relance et de contrôle. Toute décision doit être confrontée aux objectifs officiels, au calendrier de collecte et au contexte local.</li>
                </ul>
            </details>

            <div class="alert alert-warning mt-3 mb-0">
                <strong><i class="fas fa-triangle-exclamation"></i> Limite essentielle :</strong> un volume élevé ne signifie pas automatiquement une meilleure performance, et un volume faible ne signifie pas automatiquement une contre-performance. Le rapport analyse la disponibilité et la dynamique des soumissions, pas la qualité intrinsèque des activités réalisées.
            </div>
        </div>`;

    container.querySelectorAll('.ai-entity-search').forEach(input => {
        input.addEventListener('input', () => {
            const level = input.dataset.level;
            const query = cleanSpaces(input.value).toLowerCase();
            const section = container.querySelector(`.ai-level-section[data-ai-level="${level}"]`);
            let visible = 0;
            section?.querySelectorAll('tbody tr[data-ai-entity]').forEach(row => {
                const match = !query || cleanSpaces(row.textContent).toLowerCase().includes(query);
                row.style.display = match ? '' : 'none';
                if (match) visible++;
            });
            const counter = document.getElementById(`ai-visible-${String(level).toLowerCase()}`);
            if (counter) counter.textContent = visible.toLocaleString('fr-FR');
        });
    });

    intelligentAnalysisSnapshot = {
        generated_at: getFormattedDateTime(),
        total_rows: totalRows,
        dated_rows_all: datedRowsAll.length,
        dated_rows_in_temporal_filter: datedRows.length,
        data_quality: {
            score: qualityScore,
            label: qualityBand.label,
            date_completeness_percent: Number(dateCompleteness.toFixed(2)),
            hierarchy_completeness_percent: Number(hierarchyCompleteness.toFixed(2)),
            level_completeness_percent: Object.fromEntries(levels.map(level => [level, Number(levelCompleteness[level].toFixed(2))]))
        },
        executive_summary: {
            latest_period: latestLabel,
            previous_period: previousLabel,
            latest_total: latestTotal,
            previous_total: previousTotal,
            overall_trend: overallTrend.label,
            rising_entities: risingCount,
            falling_entities: fallingCount,
            stable_entities: stableCount,
            no_recent_submission_entities: noRecentCount,
            priority_entities: priorityRows.length
        },
        temporal_filter: {
            granularity,
            granularity_label: aiGranularityLabel(granularity),
            display_mode: displayMode,
            chart_type: chartType,
            layout_mode: layoutMode,
            start: startValue || null,
            end: endValue || null,
            latest_period: latestLabel,
            previous_period: previousLabel
        },
        methodology: {
            volume: 'Nombre de formulaires KoboToolbox associés à une entité ; ce volume ne constitue pas une mesure directe de performance.',
            share: 'Part calculée sur le nombre total de lignes analysées.',
            trend: 'Comparaison des deux dernières périodes disponibles avec des volumes non cumulés.',
            quality_score: '40 % complétude des dates et 60 % complétude moyenne des champs DREN, CISCO et ZAP.',
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
                dated_submissions: row.datedCount,
                undated_submissions: row.missingDates,
                date_completeness_percent: Number(row.dateCompleteness.toFixed(2)),
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
        dateDebutRealOmMissionnaire: $('#filter-date-debut-realisation-om-missionnaire').val(),
        dateFinRealOmMissionnaire: $('#filter-date-fin-realisation-om-missionnaire').val(),
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

    let dStartRealOmMissionnaire = f.dateDebutRealOmMissionnaire ? new Date(f.dateDebutRealOmMissionnaire) : null;
    if (dStartRealOmMissionnaire) dStartRealOmMissionnaire.setHours(0, 0, 0, 0);
    let dEndRealOmMissionnaire = f.dateFinRealOmMissionnaire ? new Date(f.dateFinRealOmMissionnaire) : null;
    if (dEndRealOmMissionnaire) dEndRealOmMissionnaire.setHours(23, 59, 59, 999);

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
        
        let omMissionnaireDateMatch = true;
        if (dStartRealOmMissionnaire || dEndRealOmMissionnaire) {
            const ranges = Array.isArray(s.omMissionnaireRealisationRanges) ? s.omMissionnaireRealisationRanges : [];
            omMissionnaireDateMatch = ranges.some(range => {
                const startOk = !dStartRealOmMissionnaire || (range.start && range.start >= dStartRealOmMissionnaire);
                const endOk = !dEndRealOmMissionnaire || (range.end && range.end <= dEndRealOmMissionnaire);
                return startOk && endOk;
            });
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

        if (mD && mC && mZ && mA && mP && mSA && mSP && dateMatch && dateRealMatch && omMissionnaireDateMatch && valRealMatch && doublonMatch && anomalyMatch && chkMatch) { $(this).show(); vC++; } else { $(this).hide(); }
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
        "Date début réalisation de la Sous Activité dans om missionnaire": $('#filter-date-debut-realisation-om-missionnaire').val() || "Toutes",
        "Date fin réalisation de la Sous Activité dans om missionnaire": $('#filter-date-fin-realisation-om-missionnaire').val() || "Toutes",
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
    const root = document.getElementById('ai-report-content');
    if (!root) return ['Aucune donnée.'];
    const lines = [];
    root.querySelectorAll('h5, h6, .ai-report-metric, .ai-level-stat-grid > div, p, li, .ai-quality-row').forEach(el => {
        const text = cleanSpaces(el.textContent || '');
        if (text && !lines.includes(text)) lines.push(text);
    });
    return lines.length ? lines : ['Aucune donnée.'];
}

function getAnalysisJSONData() {
    let fo = { "titre_plateforme": TITRE_PLATEFORME, "sous_titre": SOUS_TITRE_PLATEFORME, "date_exportation": getFormattedDateTime(), "criteres_locaux": getAnalysisFilters(), "analyse_ia": getAiInsightsArray(), "analyse_ia_structuree": intelligentAnalysisSnapshot, "analyse_dren": [], "analyse_cisco": [], "analyse_zap": [] };
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
    $('#json-file').on('change', async function(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        try {
            await importKoboJSONFile(file);
        } catch (error) {
            alert(`Impossible d’importer ce fichier JSON : ${error.message}`);
        }
    });
    let typingTimer;
    $('.filter-input').on('keyup', function () { clearTimeout(typingTimer); typingTimer = setTimeout(applyFilters, 300); });
    $('.filter-input').on('change', applyFilters);
    
    setupAnalysisTableSearch('search-dren-table', 'dren-summary-table');
    setupAnalysisTableSearch('search-cisco-table', 'cisco-summary-table');
    setupAnalysisTableSearch('search-zap-table', 'zap-summary-table');

    $('#timeline-refresh-btn').on('click', function() { renderSubmissionTimelineCharts(); renderIntelligentAnalysisReport(submissionTimelineSourceData); });
    $('#timeline-reset-btn').on('click', resetSubmissionTimelineControls);
    $('#timeline-granularity, #timeline-display-mode, #timeline-chart-type, #timeline-top-entities, #timeline-date-start, #timeline-date-end').on('change', function() { renderSubmissionTimelineCharts(); renderIntelligentAnalysisReport(submissionTimelineSourceData); });
    $(document).on('change', 'input[name="timeline-layout-mode"]', function() { renderSubmissionTimelineCharts(); renderIntelligentAnalysisReport(submissionTimelineSourceData); });

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
