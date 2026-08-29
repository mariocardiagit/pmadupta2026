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
var submissionTimelineSourceData = [];
var submissionTimelineIndividualChartsRefs = { DREN: [], CISCO: [], ZAP: [] };
var submissionTimelineIndividualState = {
    DREN: { page: 1, pageSize: 6, search: '' },
    CISCO: { page: 1, pageSize: 6, search: '' },
    ZAP: { page: 1, pageSize: 6, search: '' }
};

function getSubmissionLineEndLabelLayout(canvas, datasets) {
    const ctx = canvas?.getContext?.('2d');
    const maxLabelWidth = 245;
    let longestWidth = 0;
    if (ctx) {
        ctx.save();
        ctx.font = '600 11px Arial';
        (datasets || []).forEach(dataset => {
            const label = String(dataset?.label || '').trim();
            if (label) longestWidth = Math.max(longestWidth, ctx.measureText(label).width);
        });
        ctx.restore();
    } else {
        longestWidth = (datasets || []).reduce((max, dataset) => {
            return Math.max(max, String(dataset?.label || '').trim().length * 6.7);
        }, 0);
    }
    const wrappedWidth = Math.min(maxLabelWidth, Math.max(150, longestWidth));
    return {
        rightPadding: Math.max(205, Math.min(330, Math.ceil(wrappedWidth + 44))),
        minGap: 7,
        maxLabelWidth,
        maxLines: 3,
        lineHeight: 14,
        fontSize: 11
    };
}

function wrapSubmissionEndLabel(ctx, text, maxWidth, maxLines) {
    const source = String(text || '').replace(/\s+/g, ' ').trim();
    if (!source) return [];
    const words = source.split(' ');
    const lines = [];
    let line = '';

    const pushLongWord = word => {
        let chunk = '';
        for (const char of word) {
            const candidate = chunk + char;
            if (chunk && ctx.measureText(candidate).width > maxWidth) {
                lines.push(chunk);
                chunk = char;
                if (lines.length >= maxLines) return '';
            } else {
                chunk = candidate;
            }
        }
        return chunk;
    };

    for (const word of words) {
        if (lines.length >= maxLines) break;
        const candidate = line ? `${line} ${word}` : word;
        if (ctx.measureText(candidate).width <= maxWidth) {
            line = candidate;
            continue;
        }
        if (line) {
            lines.push(line);
            line = '';
            if (lines.length >= maxLines) break;
        }
        if (ctx.measureText(word).width <= maxWidth) {
            line = word;
        } else {
            line = pushLongWord(word);
        }
    }
    if (line && lines.length < maxLines) lines.push(line);

    const rebuilt = lines.join(' ');
    if (rebuilt.length < source.length && lines.length) {
        let last = lines.length - 1;
        let shortened = lines[last];
        while (shortened && ctx.measureText(`${shortened}…`).width > maxWidth) {
            shortened = shortened.slice(0, -1);
        }
        lines[last] = `${shortened.trimEnd()}…`;
    }
    return lines.slice(0, maxLines);
}

const submissionLineEndLabelsPlugin = {
    id: 'submissionLineEndLabelsPlugin',
    afterDatasetsDraw(chart, args, pluginOptions) {
        if (!pluginOptions || pluginOptions.display === false) return;
        if (!chart || chart.config.type !== 'line') return;
        const datasets = (chart.data && Array.isArray(chart.data.datasets)) ? chart.data.datasets : [];
        if (!datasets.length) return;
        const { ctx, chartArea } = chart;
        if (!ctx || !chartArea) return;

        const fontSize = Math.max(10, Number(pluginOptions.fontSize) || 11);
        const lineHeight = Math.max(12, Number(pluginOptions.lineHeight) || 14);
        const maxLabelWidth = Math.max(120, Number(pluginOptions.maxLabelWidth) || 245);
        const maxLines = Math.max(1, Number(pluginOptions.maxLines) || 3);
        const minGap = Math.max(4, Number(pluginOptions.minGap) || 7);
        const desiredX = chartArea.right + 9;
        const labels = [];

        ctx.save();
        ctx.font = `600 ${fontSize}px Arial`;
        datasets.forEach((dataset, datasetIndex) => {
            const meta = chart.getDatasetMeta(datasetIndex);
            if (!meta || meta.hidden) return;
            const elements = Array.isArray(meta.data) ? meta.data : [];
            let point = null;
            for (let i = elements.length - 1; i >= 0; i--) {
                const el = elements[i];
                const value = Array.isArray(dataset.data) ? dataset.data[i] : null;
                if (!el || value === null || value === undefined || Number.isNaN(Number(value))) continue;
                point = { x: el.x, y: el.y, value: Number(value) };
                break;
            }
            if (!point) return;
            const fullText = String(dataset.label || '').trim();
            const lines = wrapSubmissionEndLabel(ctx, fullText, maxLabelWidth, maxLines);
            if (!lines.length) return;
            const widest = Math.max(...lines.map(line => ctx.measureText(line).width));
            const boxHeight = lines.length * lineHeight + 8;
            labels.push({
                text: fullText,
                lines,
                color: dataset.borderColor || '#333',
                desiredY: point.y,
                y: point.y,
                anchorX: point.x,
                anchorY: point.y,
                value: point.value,
                boxHeight,
                boxWidth: widest + 12
            });
        });

        if (!labels.length) {
            ctx.restore();
            return;
        }

        labels.sort((a, b) => a.desiredY - b.desiredY || a.text.localeCompare(b.text, 'fr'));
        const topBound = chartArea.top + 4;
        const bottomBound = chartArea.bottom - 4;

        for (let i = 0; i < labels.length; i++) {
            const item = labels[i];
            const half = item.boxHeight / 2;
            item.y = Math.max(item.desiredY, topBound + half);
            if (i > 0) {
                const prev = labels[i - 1];
                const required = prev.y + prev.boxHeight / 2 + half + minGap;
                item.y = Math.max(item.y, required);
            }
        }

        let overflow = labels[labels.length - 1].y + labels[labels.length - 1].boxHeight / 2 - bottomBound;
        if (overflow > 0) labels.forEach(item => { item.y -= overflow; });

        for (let i = labels.length - 2; i >= 0; i--) {
            const item = labels[i];
            const next = labels[i + 1];
            const maximumY = next.y - next.boxHeight / 2 - item.boxHeight / 2 - minGap;
            item.y = Math.min(item.y, maximumY);
        }

        const underflow = topBound - (labels[0].y - labels[0].boxHeight / 2);
        if (underflow > 0) labels.forEach(item => { item.y += underflow; });

        ctx.textBaseline = 'middle';
        labels.forEach(item => {
            const boxX = Math.min(desiredX, chart.width - item.boxWidth - 4);
            const elbowX = Math.max(item.anchorX + 7, chartArea.right + 4);

            ctx.strokeStyle = item.color;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(Math.min(item.anchorX + 4, chartArea.right), item.anchorY);
            ctx.lineTo(elbowX, item.anchorY);
            ctx.lineTo(boxX - 3, item.y);
            ctx.stroke();

            ctx.fillStyle = 'rgba(255,255,255,0.96)';
            ctx.fillRect(boxX, item.y - item.boxHeight / 2, item.boxWidth, item.boxHeight);
            ctx.strokeStyle = item.color;
            ctx.lineWidth = 1;
            ctx.strokeRect(boxX, item.y - item.boxHeight / 2, item.boxWidth, item.boxHeight);
            ctx.fillStyle = item.color;
            item.lines.forEach((line, lineIndex) => {
                const y = item.y - ((item.lines.length - 1) * lineHeight) / 2 + lineIndex * lineHeight;
                ctx.fillText(line, boxX + 6, y + 0.5);
            });
        });
        ctx.restore();
    }
};
Chart.register(submissionLineEndLabelsPlugin);


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

    // Cas Kobo fréquent : les champs s'appellent simplement date_debut/date_fin
    // à l'intérieur du même objet de répétition que le matricule.
    return !!localMatriculeContext && hasDate && hasBoundary;
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
        const entries = Object.entries(value);
        const hasLocalMatricule = entries.some(([key, child]) => {
            const fullPath = path ? `${path}/${key}` : key;
            return isKoboMatriculeKey(fullPath) && primitiveValues(child).map(normalizeMissionnaireMatricule).some(Boolean);
        });
        entries.forEach(([key, child]) => {
            const fullPath = path ? `${path}/${key}` : key;
            if (child && typeof child === 'object') {
                visit(child, fullPath);
                return;
            }
            const date = parseKoboSearchDate(child);
            if (!date) return;
            if (isOmMissionnaireRealisationDateKey(fullPath, 'start', hasLocalMatricule)) localStarts.push(date);
            if (isOmMissionnaireRealisationDateKey(fullPath, 'end', hasLocalMatricule)) localEnds.push(date);
        });

        const count = Math.max(localStarts.length, localEnds.length);
        for (let i = 0; i < count; i++) {
            ranges.push({
                start: localStarts[i] || localStarts[0] || null,
                end: localEnds[i] || localEnds[0] || null
            });
        }
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
        const nested = [];
        const entries = Object.entries(value);

        // Premier passage : repérer le ou les matricules présents dans cet objet.
        // Cette information permet ensuite de reconnaître des champs courts tels
        // que date_debut/date_fin dans une répétition Kobo.
        entries.forEach(([key, child]) => {
            const fullPath = path ? `${path}/${key}` : key;
            if (isKoboMatriculeKey(fullPath)) localMats.push(...primitiveValues(child));
        });
        const hasLocalMatricule = localMats.map(normalizeMissionnaireMatricule).some(Boolean);

        entries.forEach(([key, child]) => {
            const fullPath = path ? `${path}/${key}` : key;
            if (isKoboMatriculeKey(fullPath)) return;
            if (isOmMissionnaireRealisationDateKey(fullPath, 'start', hasLocalMatricule)) {
                localStarts.push(...primitiveValues(child));
                return;
            }
            if (isOmMissionnaireRealisationDateKey(fullPath, 'end', hasLocalMatricule)) {
                localEnds.push(...primitiveValues(child));
                return;
            }
            if (child && typeof child === 'object') nested.push([child, fullPath]);
        });
        addLocalAssignments(localMats, localStarts, localEnds, path);
        nested.forEach(([child, childPath]) => visit(child, childPath));
    };

    visit(row, '');

    // Repli pour les réponses Kobo aplaties ou les structures où les matricules
    // sont dans une répétition « personnes » alors que les dates OM sont au niveau
    // de la mission. Une période globale est alors appliquée à chaque matricule.
    const fallbackMats = extractMatricules(row).split(';').map(v => normalizeMissionnaireMatricule(v)).filter(Boolean);
    const fallbackRanges = extractOmMissionnaireRealisationRanges(row);

    if (fallbackMats.length && fallbackRanges.length) {
        if (fallbackRanges.length === 1) {
            const range = fallbackRanges[0];
            fallbackMats.forEach(matricule => assignments.push({
                matricule,
                start: range.start || null,
                end: range.end || null,
                sourcePath: 'fallback-global-range'
            }));
        } else {
            const count = Math.max(fallbackMats.length, fallbackRanges.length);
            for (let i = 0; i < count; i++) {
                const range = fallbackRanges[i] || fallbackRanges[0] || {};
                assignments.push({
                    matricule: fallbackMats[i] || fallbackMats[0] || '',
                    start: range.start || null,
                    end: range.end || null,
                    sourcePath: 'fallback-indexed-range'
                });
            }
        }
    } else if (fallbackMats.length && !assignments.some(a => a.matricule)) {
        fallbackMats.forEach(matricule => assignments.push({ matricule, start: null, end: null, sourcePath: 'fallback-matricule-only' }));
    }

    // Compléter les assignments partiels lorsque les informations sont séparées.
    assignments.forEach((assignment, i) => {
        if (!assignment.matricule && fallbackMats.length) assignment.matricule = fallbackMats[i] || fallbackMats[0] || '';
        if ((!assignment.start || !assignment.end) && fallbackRanges.length === 1 && assignment.matricule) {
            assignment.start = assignment.start || fallbackRanges[0].start || null;
            assignment.end = assignment.end || fallbackRanges[0].end || null;
        }
    });

    const completeMatricules = new Set(assignments
        .filter(item => item.matricule && item.start && item.end)
        .map(item => item.matricule));
    const seen = new Set();
    return assignments.filter(item => {
        if (!item.matricule && !item.start && !item.end) return false;
        if (item.matricule && !item.start && !item.end && completeMatricules.has(item.matricule)) return false;
        const key = `${item.matricule}|${item.start ? item.start.getTime() : ''}|${item.end ? item.end.getTime() : ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
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
            const hasEntity = [base.dren, base.cisco, base.zap].some(value => cleanSpaces(value) !== '');
            const requiredMissionFields = [base.activite, base.produit, base.sousActivite, assignment.matricule];
            const signatureComplete = hasEntity && requiredMissionFields.every(value => cleanSpaces(value) !== '');
            if (!hasEntity) missingFields.push('DREN/CISCO/ZAP');
            if (!base.activite) missingFields.push('activité');
            if (!base.produit) missingFields.push('produit');
            if (!base.sousActivite) missingFields.push('sous-activité');
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
                signatureComplete,
                invalidDateOrder,
                missingFields,
                duplicateGroupIds: []
            };
            records.push(record);

            if (missingFields.length) {
                if (!rowToIssues[rowIndex]) rowToIssues[rowIndex] = [];
                const type = invalidDateOrder ? 'ANOMALIE DE DATE' : 'VÉRIFICATION IMPOSSIBLE';
                rowToIssues[rowIndex].push(`${type} — ${missingFields.join(', ')}`);
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
        // v doit rester disponible après la boucle m pour renseigner mat2[l][1].
        // Une déclaration `let v` à l'intérieur de la boucle rendait la variable
        // hors portée et provoquait : ReferenceError: v is not defined.
        let v = 0;
        for (let m = 1; m <= l; m++) {
            let i3 = l - m + 1; let val = data[i3 - 1];
            s2 += val * val; s1 += val; w++;
            v = s2 - (s1 * s1) / w;
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


// ============================================================================
// V7.10 — AUTOCOMPLÉTION DYNAMIQUE DES FILTRES PRINCIPAUX
// DREN → CISCO → ZAP et Activité → Produit, à partir de la base Kobo active.
// La saisie libre et le moteur Fuzzy Search / Levenshtein restent disponibles.
// ============================================================================
const DASHBOARD_AUTOCOMPLETE_CONFIG = {
    'filter-dren': {
        label: 'DREN', keys: ['dren'], dependencies: []
    },
    'filter-cisco': {
        label: 'CISCO', keys: ['cisco'],
        dependencies: [{ inputId: 'filter-dren', keys: ['dren'] }]
    },
    'filter-zap': {
        label: 'ZAP', keys: ['zap'],
        dependencies: [
            { inputId: 'filter-dren', keys: ['dren'] },
            { inputId: 'filter-cisco', keys: ['cisco'] }
        ]
    },
    'filter-activite': {
        label: 'Activité', keys: ['activiteDren', 'activiteCisco', 'activiteZap'],
        dependencies: [
            { inputId: 'filter-dren', keys: ['dren'] },
            { inputId: 'filter-cisco', keys: ['cisco'] },
            { inputId: 'filter-zap', keys: ['zap'] }
        ]
    },
    'filter-produit': {
        label: 'Produit', keys: ['produitDren', 'produitCisco', 'produitZap'],
        dependencies: [
            { inputId: 'filter-dren', keys: ['dren'] },
            { inputId: 'filter-cisco', keys: ['cisco'] },
            { inputId: 'filter-zap', keys: ['zap'] },
            { inputId: 'filter-activite', keys: ['activiteDren', 'activiteCisco', 'activiteZap'] }
        ]
    }
};

function normalizeDashboardAutocomplete(value) {
    return cleanSpaces(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function getDashboardAutocompleteValuesFromRow(row, keys) {
    const values = [];
    (keys || []).forEach(key => {
        const col = baseColsInfo.find(c => c.key === key);
        if (!col) return;
        const raw = getKoboValue(row, col.matches, col.ex, col.mustMatch);
        const add = value => {
            const v = cleanSpaces(value);
            if (v && v.toLowerCase() !== 'non renseigné' && !values.includes(v)) values.push(v);
        };
        if (Array.isArray(raw)) raw.forEach(add); else add(raw);
    });
    return values;
}

function dashboardAutocompleteRowMatchesDependencies(row, dependencies) {
    return (dependencies || []).every(dep => {
        const input = document.getElementById(dep.inputId);
        const query = cleanSpaces(input?.value || '');
        if (!query) return true;
        const candidates = getDashboardAutocompleteValuesFromRow(row, dep.keys);
        return candidates.some(value => fuzzyMatch(query, value));
    });
}

function getDashboardAutocompleteDisplay(rawValue, config) {
    const raw = cleanSpaces(rawValue);
    if (!raw) return raw;
    // On enrichit seulement les valeurs ressemblant à des codes. Une valeur déjà
    // descriptive est conservée telle quelle afin d'éviter un libellé artificiel.
    const looksLikeCode = /^[A-Za-zÀ-ÖØ-öø-ÿ_-]{0,12}\d+[A-Za-z0-9._/-]*$/.test(raw) || /^\d{1,8}$/.test(raw);
    if (!looksLikeCode) return raw;
    const sampleKey = (config?.keys || [])[0] || '';
    const translated = cleanSpaces(getTranslatedValue(raw, sampleKey));
    if (!translated || normalizeDashboardAutocomplete(translated) === normalizeDashboardAutocomplete(raw)) return raw;
    return translated.replace(/\s*;\s*/g, ' ');
}

function scoreDashboardAutocomplete(query, value, display) {
    const q = normalizeDashboardAutocomplete(query);
    if (!q) return 50;
    const raw = normalizeDashboardAutocomplete(value);
    const shown = normalizeDashboardAutocomplete(display);
    if (raw === q || shown === q) return 0;
    if (raw.startsWith(q) || shown.startsWith(q)) return 1;
    if (raw.split(/\s+/).some(w => w.startsWith(q)) || shown.split(/\s+/).some(w => w.startsWith(q))) return 2;
    if (raw.includes(q) || shown.includes(q)) return 3;
    if (fuzzyMatch(q, raw) || fuzzyMatch(q, shown)) return 4;
    return Infinity;
}

function buildDashboardAutocompleteSuggestions(inputId) {
    const config = DASHBOARD_AUTOCOMPLETE_CONFIG[inputId];
    if (!config) return [];
    const input = document.getElementById(inputId);
    const query = cleanSpaces(input?.value || '');
    const counts = new Map();
    const source = Array.isArray(allData) ? allData : [];

    source.forEach(row => {
        if (!row || typeof row !== 'object' || !dashboardAutocompleteRowMatchesDependencies(row, config.dependencies)) return;
        getDashboardAutocompleteValuesFromRow(row, config.keys).forEach(value => {
            const display = getDashboardAutocompleteDisplay(value, config);
            const score = scoreDashboardAutocomplete(query, value, display);
            if (!Number.isFinite(score)) return;
            const norm = normalizeDashboardAutocomplete(value);
            const current = counts.get(norm);
            if (current) current.count += 1;
            else counts.set(norm, { value, display, score, count: 1 });
        });
    });

    return [...counts.values()]
        .sort((a, b) => a.score - b.score || b.count - a.count || a.display.localeCompare(b.display, 'fr', { sensitivity: 'base' }))
        .slice(0, 40);
}

function closeDashboardAutocomplete(exceptId = '') {
    document.querySelectorAll('.dashboard-autocomplete-menu.show').forEach(menu => {
        if (!exceptId || menu.id !== exceptId) menu.classList.remove('show');
    });
}

function renderDashboardAutocomplete(inputId) {
    const input = document.getElementById(inputId);
    const config = DASHBOARD_AUTOCOMPLETE_CONFIG[inputId];
    if (!input || !config) return;
    const menu = document.getElementById(`${inputId}-autocomplete`);
    if (!menu) return;
    const suggestions = buildDashboardAutocompleteSuggestions(inputId);
    menu.innerHTML = '';
    menu.dataset.activeIndex = '-1';

    if (!Array.isArray(allData) || !allData.length) {
        const empty = document.createElement('div');
        empty.className = 'dashboard-autocomplete-empty';
        empty.textContent = 'Aucune donnée Kobo chargée.';
        menu.appendChild(empty);
        menu.classList.add('show');
        return;
    }

    if (!suggestions.length) {
        const empty = document.createElement('div');
        empty.className = 'dashboard-autocomplete-empty';
        empty.innerHTML = '<i class="fas fa-search"></i> Aucune proposition — la saisie libre reste utilisable.';
        menu.appendChild(empty);
        menu.classList.add('show');
        return;
    }

    suggestions.forEach((item, index) => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'dashboard-autocomplete-option';
        option.setAttribute('role', 'option');
        option.dataset.index = String(index);
        option.dataset.value = item.value;

        const main = document.createElement('span');
        main.className = 'dashboard-autocomplete-main';
        main.textContent = item.display || item.value;
        option.appendChild(main);

        if ((item.display || '') !== item.value) {
            const raw = document.createElement('small');
            raw.className = 'dashboard-autocomplete-raw';
            raw.textContent = `Valeur Kobo : ${item.value}`;
            option.appendChild(raw);
        }
        const count = document.createElement('small');
        count.className = 'dashboard-autocomplete-count';
        count.textContent = `${item.count.toLocaleString('fr-FR')} ligne${item.count > 1 ? 's' : ''}`;
        option.appendChild(count);

        option.addEventListener('mousedown', event => {
            event.preventDefault();
            selectDashboardAutocomplete(inputId, item.value);
        });
        menu.appendChild(option);
    });
    closeDashboardAutocomplete(menu.id);
    menu.classList.add('show');
}

function selectDashboardAutocomplete(inputId, value) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.value = cleanSpaces(value);
    input.dataset.autocompleteValue = input.value;
    const menu = document.getElementById(`${inputId}-autocomplete`);
    if (menu) menu.classList.remove('show');
    // La sélection applique immédiatement les filtres existants.
    if (typeof applyFilters === 'function') applyFilters();
    // Les listes dépendantes seront recalculées à leur prochaine ouverture.
    input.dispatchEvent(new CustomEvent('dashboard-autocomplete-selected', { bubbles: true }));
}

function moveDashboardAutocompleteSelection(inputId, direction) {
    const menu = document.getElementById(`${inputId}-autocomplete`);
    if (!menu || !menu.classList.contains('show')) return false;
    const options = [...menu.querySelectorAll('.dashboard-autocomplete-option')];
    if (!options.length) return false;
    let index = Number(menu.dataset.activeIndex || -1);
    index = direction > 0 ? (index + 1) % options.length : (index <= 0 ? options.length - 1 : index - 1);
    options.forEach((option, i) => option.classList.toggle('active', i === index));
    menu.dataset.activeIndex = String(index);
    options[index].scrollIntoView({ block: 'nearest' });
    return true;
}

function setupDashboardAutocompleteFilters() {
    Object.entries(DASHBOARD_AUTOCOMPLETE_CONFIG).forEach(([inputId, config]) => {
        const input = document.getElementById(inputId);
        if (!input || input.dataset.autocompleteReady === '1') return;
        input.dataset.autocompleteReady = '1';
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-expanded', 'false');
        input.placeholder = `Rechercher / choisir ${config.label}…`;

        const parent = input.parentElement;
        if (!parent) return;
        parent.classList.add('dashboard-autocomplete-host');
        const menu = document.createElement('div');
        menu.id = `${inputId}-autocomplete`;
        menu.className = 'dashboard-autocomplete-menu';
        menu.setAttribute('role', 'listbox');
        menu.setAttribute('aria-label', `Suggestions ${config.label}`);
        parent.appendChild(menu);
        input.setAttribute('aria-controls', menu.id);

        input.addEventListener('focus', () => {
            renderDashboardAutocomplete(inputId);
            input.setAttribute('aria-expanded', 'true');
        });
        input.addEventListener('input', () => {
            delete input.dataset.autocompleteValue;
            renderDashboardAutocomplete(inputId);
            input.setAttribute('aria-expanded', 'true');
        });
        input.addEventListener('keydown', event => {
            if (event.key === 'ArrowDown') {
                if (!menu.classList.contains('show')) renderDashboardAutocomplete(inputId);
                if (moveDashboardAutocompleteSelection(inputId, 1)) event.preventDefault();
            } else if (event.key === 'ArrowUp') {
                if (moveDashboardAutocompleteSelection(inputId, -1)) event.preventDefault();
            } else if (event.key === 'Enter' && menu.classList.contains('show')) {
                const active = menu.querySelector('.dashboard-autocomplete-option.active');
                if (active) {
                    event.preventDefault();
                    selectDashboardAutocomplete(inputId, active.dataset.value || '');
                }
            } else if (event.key === 'Escape') {
                menu.classList.remove('show');
                input.setAttribute('aria-expanded', 'false');
            }
        });
        input.addEventListener('blur', () => {
            setTimeout(() => {
                menu.classList.remove('show');
                input.setAttribute('aria-expanded', 'false');
            }, 140);
        });
    });

    if (!document.body.dataset.dashboardAutocompleteOutsideHandler) {
        document.body.dataset.dashboardAutocompleteOutsideHandler = '1';
        document.addEventListener('mousedown', event => {
            if (!event.target.closest('.dashboard-autocomplete-host')) closeDashboardAutocomplete();
        });
    }
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


/* ======================================================================
   ONGLET 4 : COMPARAISON AVANCÉE DES RÉALISATIONS ENTRE LES STD
   Objectif : identifier, pour une même dimension choisie (Activité, Produit,
   Sous Activité ou Sous Produit), les DREN/CISCO/ZAP dont les valeurs de
   réalisation sont numériquement proches, tout en conservant les périodes
   de début et de fin.
   ====================================================================== */
const realisationComparisonCharts = {
    DREN: { scatter: null, scatterOriginal: null, timeline: null },
    CISCO: { scatter: null, scatterOriginal: null, timeline: null },
    ZAP: { scatter: null, scatterOriginal: null, timeline: null },
    STD: { scatter: null, scatterOriginal: null, timeline: null }
};

const REALISATION_COMPARISON_LEVEL_COLORS = {
    DREN: 'rgba(25, 135, 84, 0.82)',
    CISCO: 'rgba(13, 110, 253, 0.82)',
    ZAP: 'rgba(243, 156, 18, 0.86)'
};

const REALISATION_COMPARISON_GROUP_COLORS = [
    '#6f42c1', '#d63384', '#0d6efd', '#198754', '#fd7e14', '#dc3545',
    '#20c997', '#6610f2', '#0dcaf0', '#795548', '#607d8b', '#8bc34a'
];

function getRealisationComparisonScopeKey(scope) {
    return String(scope || 'STD').trim().toUpperCase();
}


const REALISATION_COMPARISON_DIMENSIONS = {
    activite: {
        label: 'Activité', plural: 'Activités', prop: 'activiteBase',
        emptyValues: ['Non spécifiée', 'Non spécifié', ''], icon: 'fa-tasks'
    },
    produit: {
        label: 'Produit', plural: 'Produits', prop: 'produit',
        emptyValues: ['Non spécifié', 'Non spécifiée', ''], icon: 'fa-box'
    },
    sousActivite: {
        label: 'Sous Activité', plural: 'Sous Activités', prop: 'sousActivite',
        emptyValues: ['Non spécifiée', 'Non spécifié', ''], icon: 'fa-stream'
    },
    sousProduit: {
        label: 'Sous Produit', plural: 'Sous Produits', prop: 'sousProduit',
        emptyValues: ['Non spécifié', 'Non spécifiée', ''], icon: 'fa-boxes'
    }
};

function getRealisationComparisonSelectedDimension(scope) {
    const scopeKey = getRealisationComparisonScopeKey(scope);
    const active = document.querySelector(`[data-real-compare-dimension-scope="${scopeKey}"].active`);
    const dimension = active?.dataset?.realCompareDimension || 'sousActivite';
    return REALISATION_COMPARISON_DIMENSIONS[dimension] ? dimension : 'sousActivite';
}

function getRealisationComparisonDimensionConfig(dimension) {
    return REALISATION_COMPARISON_DIMENSIONS[dimension] || REALISATION_COMPARISON_DIMENSIONS.sousActivite;
}

function getRealisationComparisonDimensionValue(record, dimension) {
    const config = getRealisationComparisonDimensionConfig(dimension);
    return cleanSpaces(record?.[config.prop] || '');
}

function isRealisationComparisonDimensionValueValid(value, dimension) {
    const config = getRealisationComparisonDimensionConfig(dimension);
    const normalized = cleanSpaces(value).toLowerCase();
    return !!normalized && !config.emptyValues.some(item => cleanSpaces(item).toLowerCase() === normalized);
}

function getRealisationComparisonDimensionKey(value) {
    return normalizeRealisationKey(cleanSpaces(value || 'Non spécifié')) || 'non_specifie';
}

function updateRealisationComparisonDimensionUi(scope) {
    const scopeKey = getRealisationComparisonScopeKey(scope);
    const key = scopeKey.toLowerCase();
    const dimension = getRealisationComparisonSelectedDimension(scopeKey);
    const config = getRealisationComparisonDimensionConfig(dimension);

    const label = document.querySelector(`label[for="real-compare-activity-${key}"]`);
    if (label) label.textContent = `Dimension comparée : ${config.label}`;

    const metricNode = document.getElementById(`real-compare-metric-activities-${key}`);
    if (metricNode?.previousElementSibling) metricNode.previousElementSibling.textContent = `${config.plural} comparables`;

    const tbody = document.getElementById(`real-compare-table-${key}`);
    const firstHeader = tbody?.closest('table')?.querySelector('thead th:first-child');
    if (firstHeader) firstHeader.textContent = config.label;

    const chartCard = document.getElementById(`real-compare-scatter-${key}`)?.closest('.real-comparison-chart-card');
    const chartSmall = chartCard?.querySelector('.real-comparison-chart-heading small');
    if (chartSmall) chartSmall.textContent = `Axe X : valeur numérique · Axe Y : ${config.label.toLowerCase()} · Point : entité responsable`;

    const timelineCard = document.getElementById(`real-compare-timeline-${key}`)?.closest('.real-comparison-chart-card');
    const timelineSmall = timelineCard?.querySelector('.real-comparison-chart-heading small');
    if (timelineSmall) timelineSmall.textContent = `Lecture : période de réalisation par ${config.label.toLowerCase()} et par entité.`;

    const problem = document.querySelector(`[data-comparison-scope="${scopeKey}"] .real-comparison-problem h5`);
    if (problem) problem.textContent = `Quels sont les ${scopeKey === 'STD' ? 'STD' : scopeKey} qui ont à peu près les mêmes réalisations pour une même valeur de la dimension « ${config.label} » ?`;
    const problemText = document.querySelector(`[data-comparison-scope="${scopeKey}"] .real-comparison-problem p`);
    if (problemText) problemText.innerHTML = `La cartographie utilise désormais <strong>Sentence-BERT</strong> pour reconnaître des formulations différentes appartenant à une même thématique de la dimension « ${config.label} ». À l’intérieur de chaque thématique sémantique, la proximité numérique des réalisations reste évaluée avec le seuil choisi. Les autres tableaux d’audit conservent la valeur originale de la dimension pour assurer la traçabilité.`;
}

function getRealisationComparisonActivityKey(value) {
    return getRealisationComparisonDimensionKey(value);
}

function getRealisationComparisonLabel(record, includeLevel = false) {
    const entity = cleanSpaces(record?.entite || 'Entité inconnue');
    return includeLevel ? `${record?.niveau || 'STD'} — ${entity}` : entity;
}

function formatRealisationComparisonDate(value) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return 'Non renseignée';
    return value.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

function formatRealisationComparisonPeriod(record) {
    return `${formatRealisationComparisonDate(record?.dateStart)} → ${formatRealisationComparisonDate(record?.dateEnd)}`;
}

function getRealisationComparisonSettings(scope) {
    const scopeKey = getRealisationComparisonScopeKey(scope);
    const key = scopeKey.toLowerCase();
    const dimension = getRealisationComparisonSelectedDimension(scopeKey);
    const dimensionConfig = getRealisationComparisonDimensionConfig(dimension);
    const toleranceInput = Number(document.getElementById(`real-compare-tolerance-${key}`)?.value);
    return {
        scope: scopeKey,
        dimension,
        dimensionLabel: dimensionConfig.label,
        dimensionPlural: dimensionConfig.plural,
        dimensionProp: dimensionConfig.prop,
        dimensionKey: document.getElementById(`real-compare-activity-${key}`)?.value || 'all',
        mode: document.getElementById(`real-compare-mode-${key}`)?.value || 'detailed',
        tolerance: Number.isFinite(toleranceInput) ? Math.max(0, Math.min(100, toleranceInput)) : 10,
        start: parseSubmissionDate(document.getElementById(`real-compare-start-${key}`)?.value || ''),
        end: parseSubmissionDate(document.getElementById(`real-compare-end-${key}`)?.value || '')
    };
}

function aggregateRealisationComparisonRecords(records, mode, settings) {
    const dimension = settings?.dimension || 'sousActivite';
    const config = getRealisationComparisonDimensionConfig(dimension);

    if (mode === 'detailed') {
        return records.map((record, index) => {
            const comparisonValue = getRealisationComparisonDimensionValue(record, dimension);
            const comparisonKey = getRealisationComparisonDimensionKey(comparisonValue);
            return {
                ...record,
                comparisonValue,
                comparisonKey,
                comparisonDimension: dimension,
                comparisonDimensionLabel: config.label,
                comparisonId: `${record.niveau}|${record.entite}|${dimension}|${comparisonKey}|${record.id || index}|${index}`,
                sourceCount: 1
            };
        });
    }

    const grouped = new Map();
    records.forEach(record => {
        const comparisonValue = getRealisationComparisonDimensionValue(record, dimension);
        const comparisonKey = getRealisationComparisonDimensionKey(comparisonValue);
        const key = `${record.niveau}|${normalizeRealisationKey(record.entite)}|${dimension}|${comparisonKey}`;
        if (!grouped.has(key)) {
            grouped.set(key, {
                niveau: record.niveau,
                entite: record.entite,
                comparisonValue,
                comparisonKey,
                comparisonDimension: dimension,
                comparisonDimensionLabel: config.label,
                values: [], starts: [], ends: [], sourceRecords: [],
                comparisonId: `${key}|aggregate`
            });
        }
        const item = grouped.get(key);
        item.values.push(Number(record.valeur || 0));
        if (record.dateStart instanceof Date && !Number.isNaN(record.dateStart.getTime())) item.starts.push(record.dateStart);
        if (record.dateEnd instanceof Date && !Number.isNaN(record.dateEnd.getTime())) item.ends.push(record.dateEnd);
        item.sourceRecords.push(record);
    });

    return [...grouped.values()].map(item => {
        const sum = item.values.reduce((total, value) => total + value, 0);
        const first = item.sourceRecords[0] || {};
        return {
            ...first,
            niveau: item.niveau,
            entite: item.entite,
            valeur: mode === 'sum' ? sum : (item.values.length ? sum / item.values.length : 0),
            dateStart: item.starts.length ? new Date(Math.min(...item.starts.map(date => date.getTime()))) : null,
            dateEnd: item.ends.length ? new Date(Math.max(...item.ends.map(date => date.getTime()))) : null,
            comparisonValue: item.comparisonValue,
            comparisonKey: item.comparisonKey,
            comparisonDimension: item.comparisonDimension,
            comparisonDimensionLabel: item.comparisonDimensionLabel,
            comparisonId: item.comparisonId,
            sourceCount: item.sourceRecords.length,
            sourceRecords: item.sourceRecords
        };
    });
}

function getRealisationComparisonRecords(settings) {
    let records = getRealisationsData().filter(record => {
        if (!record || !Number.isFinite(Number(record.valeur))) return false;
        if (settings.scope !== 'STD' && record.niveau !== settings.scope) return false;
        const dimensionValue = getRealisationComparisonDimensionValue(record, settings.dimension);
        if (!isRealisationComparisonDimensionValueValid(dimensionValue, settings.dimension)) return false;
        const dimensionKey = getRealisationComparisonDimensionKey(dimensionValue);
        if (settings.dimensionKey !== 'all' && dimensionKey !== settings.dimensionKey) return false;
        if (settings.start && (!record.dateStart || record.dateStart < settings.start)) return false;
        if (settings.end && (!record.dateEnd || record.dateEnd > settings.end)) return false;
        return true;
    });
    records = aggregateRealisationComparisonRecords(records, settings.mode, settings);
    return records.sort((a, b) => {
        const dimensionDiff = String(a.comparisonValue).localeCompare(String(b.comparisonValue), 'fr');
        if (dimensionDiff) return dimensionDiff;
        const valueDiff = Number(a.valeur) - Number(b.valeur);
        if (valueDiff) return valueDiff;
        return getRealisationComparisonLabel(a, true).localeCompare(getRealisationComparisonLabel(b, true), 'fr');
    });
}

function getRealisationSymmetricDifference(a, b) {
    const valueA = Number(a || 0);
    const valueB = Number(b || 0);
    const absolute = Math.abs(valueA - valueB);
    const denominator = Math.abs(valueA) + Math.abs(valueB);
    return {
        absolute,
        percentage: denominator === 0 ? 0 : (200 * absolute / denominator)
    };
}

function getRealisationPeriodOverlapPercentage(recordA, recordB) {
    const startA = recordA?.dateStart;
    const endA = recordA?.dateEnd;
    const startB = recordB?.dateStart;
    const endB = recordB?.dateEnd;
    if (![startA, endA, startB, endB].every(date => date instanceof Date && !Number.isNaN(date.getTime()))) return null;
    const day = 86400000;
    const durationA = Math.max(1, Math.floor((endA - startA) / day) + 1);
    const durationB = Math.max(1, Math.floor((endB - startB) / day) + 1);
    const intersectionStart = Math.max(startA.getTime(), startB.getTime());
    const intersectionEnd = Math.min(endA.getTime(), endB.getTime());
    if (intersectionEnd < intersectionStart) return 0;
    const intersection = Math.floor((intersectionEnd - intersectionStart) / day) + 1;
    return Math.min(100, intersection / Math.min(durationA, durationB) * 100);
}

function buildRealisationSimilarityAnalysis(records, tolerance) {
    const byDimension = new Map();
    records.forEach(record => {
        const key = record.comparisonKey || getRealisationComparisonDimensionKey(record.comparisonValue);
        if (!byDimension.has(key)) byDimension.set(key, []);
        byDimension.get(key).push(record);
    });

    const parent = new Map(records.map(record => [record.comparisonId, record.comparisonId]));
    const find = id => {
        let root = parent.get(id);
        while (root !== parent.get(root)) root = parent.get(root);
        let current = id;
        while (parent.get(current) !== root) {
            const next = parent.get(current);
            parent.set(current, root);
            current = next;
        }
        return root;
    };
    const union = (a, b) => {
        const rootA = find(a), rootB = find(b);
        if (rootA !== rootB) parent.set(rootB, rootA);
    };

    const pairs = [];
    const comparableDimensionKeys = [];
    byDimension.forEach((dimensionRecords, dimensionKey) => {
        const distinctEntities = new Set(dimensionRecords.map(record => `${record.niveau}|${normalizeRealisationKey(record.entite)}`));
        if (distinctEntities.size >= 2) comparableDimensionKeys.push(dimensionKey);
        for (let i = 0; i < dimensionRecords.length; i++) {
            for (let j = i + 1; j < dimensionRecords.length; j++) {
                const a = dimensionRecords[i], b = dimensionRecords[j];
                const entityA = `${a.niveau}|${normalizeRealisationKey(a.entite)}`;
                const entityB = `${b.niveau}|${normalizeRealisationKey(b.entite)}`;
                if (entityA === entityB) continue;
                const difference = getRealisationSymmetricDifference(a.valeur, b.valeur);
                const similar = difference.percentage <= tolerance;
                const pair = {
                    dimensionKey,
                    dimensionValue: a.comparisonValue,
                    dimensionLabel: a.comparisonDimensionLabel || 'Dimension',
                    a, b,
                    absoluteDifference: difference.absolute,
                    relativeDifference: difference.percentage,
                    overlap: getRealisationPeriodOverlapPercentage(a, b),
                    similar
                };
                pairs.push(pair);
                if (similar) union(a.comparisonId, b.comparisonId);
            }
        }
    });

    const components = new Map();
    records.forEach(record => {
        const root = find(record.comparisonId);
        if (!components.has(root)) components.set(root, []);
        components.get(root).push(record);
    });
    const validComponents = [...components.values()].filter(component => {
        const entities = new Set(component.map(record => `${record.niveau}|${normalizeRealisationKey(record.entite)}`));
        return component.length >= 2 && entities.size >= 2;
    });
    validComponents.sort((a, b) => b.length - a.length || String(a[0]?.comparisonValue).localeCompare(String(b[0]?.comparisonValue), 'fr'));
    const groupByRecord = new Map();
    validComponents.forEach((component, index) => component.forEach(record => groupByRecord.set(record.comparisonId, index + 1)));

    pairs.sort((left, right) => {
        if (left.similar !== right.similar) return left.similar ? -1 : 1;
        return left.relativeDifference - right.relativeDifference || left.absoluteDifference - right.absoluteDifference;
    });

    return {
        pairs,
        similarPairs: pairs.filter(pair => pair.similar),
        comparableDimensionKeys,
        // Alias conservé pour compatibilité avec d'éventuelles extensions.
        comparableActivities: comparableDimensionKeys,
        groups: validComponents,
        groupByRecord,
        byDimension,
        byActivity: byDimension
    };
}


// ================================================================
// CARTOGRAPHIE DES RÉALISATIONS PROCHES — SENTENCE-BERT (V7.7)
// 1) Sentence-BERT regroupe les formulations appartenant à une même thématique.
// 2) À l'intérieur d'une thématique, le seuil numérique de proximité reste appliqué.
// ================================================================
const realisationSemanticComparisonState = { DREN: null, CISCO: null, ZAP: null, STD: null };
const realisationSemanticComparisonRunToken = { DREN: 0, CISCO: 0, ZAP: 0, STD: 0 };

function waitForSentenceBertComparisonApi(timeoutMs = 12000) {
    if (typeof window.clusterTextsWithSentenceBert === 'function') return Promise.resolve(window.clusterTextsWithSentenceBert);
    return new Promise((resolve, reject) => {
        const started = Date.now();
        const timer = window.setInterval(() => {
            if (typeof window.clusterTextsWithSentenceBert === 'function') {
                window.clearInterval(timer); resolve(window.clusterTextsWithSentenceBert);
            } else if (Date.now() - started >= timeoutMs) {
                window.clearInterval(timer); reject(new Error('Le module Sentence-BERT n’est pas encore disponible. Vérifiez le chargement de semantic.js.'));
            }
        }, 120);
    });
}

function stripRealisationSemanticCode(text) {
    return cleanSpaces(String(text || '').replace(/^\s*[A-ZÀ-ÖØ-Ý]{1,8}\s*\d+[A-Z]?\s*[:\-–—]\s*/iu, ''));
}

function buildRealisationSemanticRecords(records, semanticResult) {
    const membership = new Map();
    (semanticResult?.clusters || []).forEach((cluster, clusterIndex) => {
        (cluster.items || []).forEach(item => membership.set(String(item.text), { cluster, clusterIndex, item }));
    });
    return (records || []).map(record => {
        const original = String(record.comparisonValue || 'Non renseigné');
        const match = membership.get(original);
        if (!match) return { ...record, semanticOriginal: original, semanticTheme: original, semanticSimilarity: 1 };
        return {
            ...record,
            semanticOriginal: original,
            semanticTheme: match.cluster.theme,
            semanticRepresentative: match.cluster.representative,
            semanticSimilarity: Number(match.item.similarityToRepresentative ?? 1),
            semanticClusterId: match.cluster.id,
            originalComparisonKey: record.comparisonKey,
            originalComparisonValue: original,
            comparisonKey: `sbert:${match.cluster.id}`,
            comparisonValue: match.cluster.theme
        };
    });
}

function renderRealisationSemanticSynthSummary(scope, semanticResult, semanticRecords, semanticAnalysis, settings) {
    const scopeKey = getRealisationComparisonScopeKey(scope), key = scopeKey.toLowerCase();
    const target = document.getElementById(`real-compare-semantic-synth-summary-${key}`);
    if (!target) return;
    const clusters = semanticResult?.clusters || [];
    const multi = clusters.filter(c => (c.items || []).length >= 2);
    const sample = multi.slice(0, 8).map((cluster, index) => {
        const clusterRecords = semanticRecords.filter(r => r.semanticClusterId === cluster.id);
        const entityCount = new Set(clusterRecords.map(r => `${r.niveau}|${normalizeRealisationKey(r.entite)}`)).size;
        const formulations = (cluster.items || []).slice(0, 4).map(item => `<li>${escapeRealisationHtml(item.text)}</li>`).join('');
        return `<div class="real-comparison-semantic-theme-mini">
            <div class="d-flex justify-content-between gap-2"><strong>Thématique ${index + 1} — ${escapeRealisationHtml(cluster.theme)}</strong><span class="badge bg-primary-subtle text-primary border">${cluster.items.length} formulation(s)</span></div>
            <div class="small text-muted mt-1">${clusterRecords.length} réalisation(s) · ${entityCount} entité(s) · cohésion SBERT moyenne ${(Number(cluster.cohesion || 0) * 100).toFixed(1)} %</div>
            <ul class="small mb-0 mt-2">${formulations}</ul>
        </div>`;
    }).join('');
    const engine = semanticResult?.engine || 'Sentence-BERT';
    target.innerHTML = `<div class="real-comparison-semantic-synthesis-head">
        <strong><i class="fas fa-layer-group"></i> Synthèse thématique Sentence-BERT</strong>
        <span class="badge bg-light text-dark border">${clusters.length} thématique(s)</span>
        <span class="badge bg-light text-dark border">${multi.length} regroupement(s) multi-formulations</span>
        <span class="badge bg-light text-dark border">Moteur : ${escapeRealisationHtml(engine)}</span>
    </div>${sample || '<div class="text-muted small mt-2">Aucune thématique multi-formulations n’a été détectée avec le seuil sémantique actuel.</div>'}`;
}

function renderRealisationSemanticDetailed(scope, semanticResult, semanticRecords, semanticAnalysis, settings) {
    const scopeKey = getRealisationComparisonScopeKey(scope), key = scopeKey.toLowerCase();
    const target = document.getElementById(`real-compare-semantic-detail-content-${key}`);
    if (!target) return;
    const clusters = semanticResult?.clusters || [];
    const pairs = (semanticResult?.pairSimilarities || []).filter(p => p.linked).sort((a,b)=>b.similarity-a.similarity);
    const cards = clusters.map((cluster, index) => {
        const clusterRecords = semanticRecords.filter(r => r.semanticClusterId === cluster.id);
        const values = clusterRecords.map(r => Number(r.valeur)).filter(Number.isFinite);
        const mean = values.length ? values.reduce((s,x)=>s+x,0)/values.length : 0;
        const entityCount = new Set(clusterRecords.map(r => `${r.niveau}|${normalizeRealisationKey(r.entite)}`)).size;
        const linkedPairs = pairs.filter(p => (cluster.items || []).some(i=>i.text===p.a) && (cluster.items || []).some(i=>i.text===p.b));
        const itemRows = (cluster.items || []).map(item => {
            const recs = clusterRecords.filter(r => String(r.semanticOriginal) === String(item.text));
            const entities = [...new Set(recs.map(r => getRealisationComparisonLabel(r, scopeKey === 'STD')))];
            return `<tr>
                <td>${escapeRealisationHtml(item.text)}</td>
                <td class="text-end">${(Number(item.similarityToRepresentative || 0)*100).toFixed(1)} %</td>
                <td>${escapeRealisationHtml(entities.join(' · ') || '—')}</td>
                <td class="text-end">${recs.length}</td>
                <td class="text-end">${recs.length ? (recs.reduce((s,r)=>s+Number(r.valeur||0),0)/recs.length).toLocaleString('fr-FR',{maximumFractionDigits:2}) : '—'}</td>
            </tr>`;
        }).join('');
        const pairRows = linkedPairs.slice(0, 20).map(p => `<tr><td>${escapeRealisationHtml(p.a)}</td><td>${escapeRealisationHtml(p.b)}</td><td class="text-end fw-bold">${(Number(p.similarity||0)*100).toFixed(1)} %</td><td>${escapeRealisationHtml(p.reason || 'Sentence-BERT')}</td></tr>`).join('');
        return `<article class="real-comparison-semantic-theme-card mb-3">
            <div class="real-comparison-semantic-theme-head">
                <div><strong>Thématique ${index+1} — ${escapeRealisationHtml(cluster.theme)}</strong><div class="small text-muted">Représentant : ${escapeRealisationHtml(cluster.representative)}</div></div>
                <div class="text-end small"><span class="badge bg-primary">${cluster.items.length} formulation(s)</span> <span class="badge bg-secondary">${entityCount} entité(s)</span><br><span class="text-muted">Cohésion ${(Number(cluster.cohesion||0)*100).toFixed(1)} % · Réalisation moyenne ${mean.toLocaleString('fr-FR',{maximumFractionDigits:2})}</span></div>
            </div>
            <div class="table-responsive mt-2"><table class="table table-sm table-bordered align-middle mb-2"><thead><tr><th>Formulation originale</th><th>Similarité au représentant</th><th>Entité(s)</th><th>Réalisation(s)</th><th>Valeur moyenne</th></tr></thead><tbody>${itemRows}</tbody></table></div>
            ${pairRows ? `<details class="mt-2"><summary class="fw-semibold">Pourquoi ces formulations ont-elles été rapprochées ?</summary><div class="table-responsive mt-2"><table class="table table-sm table-striped table-bordered"><thead><tr><th>Phrase A</th><th>Phrase B</th><th>Similarité SBERT</th><th>Motif</th></tr></thead><tbody>${pairRows}</tbody></table></div></details>` : ''}
        </article>`;
    }).join('');
    const fallback = semanticResult?.fallbackReason ? `<div class="alert alert-warning small"><strong>Mode de secours :</strong> Sentence-BERT n’a pas pu être chargé (${escapeRealisationHtml(semanticResult.fallbackReason)}). Le regroupement affiché utilise le moteur sémantique local de secours et les règles métier.</div>` : '';
    target.innerHTML = `${fallback}<div class="alert alert-light border small"><strong>Lecture :</strong> Sentence-BERT transforme chaque formulation en vecteur sémantique. Deux formulations peuvent donc être réunies même si leurs codes et leurs mots exacts diffèrent. Une consolidation métier conservatrice complète SBERT pour éviter de séparer artificiellement des formulations comme « contrôler », « vérifier » et « suivre » lorsqu'elles portent sur le même objet métier.</div>${cards || '<div class="text-muted text-center py-4">Aucun regroupement sémantique disponible.</div>'}`;
}

async function runRealisationSemanticComparison(scope, records, settings, force = false) {
    const scopeKey = getRealisationComparisonScopeKey(scope), key = scopeKey.toLowerCase();
    const status = document.getElementById(`real-compare-semantic-status-${key}`);
    const runToken = ++realisationSemanticComparisonRunToken[scopeKey];
    const values = [...new Set((records || []).map(r => String(r.comparisonValue || '').trim()).filter(Boolean))];
    if (!values.length) {
        if (status) { status.className='alert alert-warning py-2 px-3 small mb-3'; status.innerHTML='<i class="fas fa-info-circle"></i> Aucune formulation à analyser.'; }
        return;
    }
    if (status) { status.className='alert alert-info py-2 px-3 small mb-3'; status.innerHTML='<i class="fas fa-spinner fa-spin"></i> Chargement de Sentence-BERT et regroupement des formulations par thématique…'; }
    try {
        const clusterApi = await waitForSentenceBertComparisonApi();
        const semanticResult = await clusterApi(values, {
            threshold: 0.58,
            force,
            allowFallback: true,
            progressCallback: x => {
                if (runToken !== realisationSemanticComparisonRunToken[scopeKey] || !status) return;
                if (x?.status === 'progress' && Number.isFinite(Number(x.progress))) status.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Chargement Sentence-BERT : ${Math.round(Number(x.progress))} %…`;
            }
        });
        if (runToken !== realisationSemanticComparisonRunToken[scopeKey]) return;
        const semanticRecords = buildRealisationSemanticRecords(records, semanticResult);
        const semanticAnalysis = buildRealisationSimilarityAnalysis(semanticRecords, settings.tolerance);
        realisationSemanticComparisonState[scopeKey] = { semanticResult, semanticRecords, semanticAnalysis, settings: { ...settings } };
        renderRealisationComparisonLegend(scopeKey, semanticAnalysis);
        renderRealisationComparisonScatter(scopeKey, semanticRecords, semanticAnalysis);
        // Le titre général reste neutre car la carte propose désormais trois modes de lecture.
        renderRealisationComparisonScatterSummaryTable(scopeKey, semanticRecords, semanticAnalysis);
        renderRealisationSemanticSynthSummary(scopeKey, semanticResult, semanticRecords, semanticAnalysis, settings);
        renderRealisationSemanticDetailed(scopeKey, semanticResult, semanticRecords, semanticAnalysis, settings);
        if (status) {
            const multi = semanticResult.clusters.filter(c => c.items.length >= 2).length;
            const engineClass = semanticResult.engine === 'Sentence-BERT' ? 'success' : 'warning';
            status.className=`alert alert-${engineClass} py-2 px-3 small mb-3`;
            status.innerHTML = `<i class="fas fa-check-circle"></i> ${escapeRealisationHtml(semanticResult.engine)} : ${semanticResult.clusters.length} thématique(s), dont <strong>${multi}</strong> regroupement(s) réunissant plusieurs formulations. Seuil sémantique : ${(semanticResult.threshold*100).toFixed(0)} %. Le seuil numérique de proximité reste ${Number(settings.tolerance||0).toFixed(0)} %.`;
        }
    } catch (error) {
        if (runToken !== realisationSemanticComparisonRunToken[scopeKey]) return;
        if (status) { status.className='alert alert-danger py-2 px-3 small mb-3'; status.innerHTML=`<i class="fas fa-exclamation-triangle"></i> Analyse Sentence-BERT impossible : ${escapeRealisationHtml(error?.message || error)}`; }
    }
}

function scheduleRealisationSemanticComparison(scope, records, settings) {
    const scopeKey = getRealisationComparisonScopeKey(scope), key = scopeKey.toLowerCase();
    const pane = document.getElementById(`real-compare-${key}`);
    // Pour éviter de lancer quatre embeddings lourds en parallèle, on traite automatiquement le niveau visible.
    if (!pane || !pane.classList.contains('active')) return;
    window.setTimeout(() => runRealisationSemanticComparison(scopeKey, records, settings, false), 60);
}

function wrapRealisationComparisonCanvasText(ctx, text, maxWidth, maxLines = 2) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const lines = [];
    let current = '';
    words.forEach(word => {
        const candidate = current ? `${current} ${word}` : word;
        if (!current || ctx.measureText(candidate).width <= maxWidth) current = candidate;
        else { lines.push(current); current = word; }
    });
    if (current) lines.push(current);
    if (lines.length <= maxLines) return lines;
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last}…`;
    return kept;
}

const realisationComparisonPointLabelsPlugin = {
    id: 'realisationComparisonPointLabelsPlugin',
    afterDatasetsDraw(chart, args, options) {
        // Ce plug-in est enregistré globalement, mais il doit uniquement agir
        // sur la cartographie de comparaison lorsque display:true est explicite.
        // Sans ce test strict, il redessinait aussi des étiquettes sur le Gantt
        // principal « Réalisations des DREN/CISCO/ZAP », causant les doublons
        // visuels et les mots superposés.
        if (!options || options.display !== true || !chart.chartArea) return;
        const ctx = chart.ctx;
        const area = chart.chartArea;
        const items = [];
        const maxWidth = Number(options.maxWidth) || 145;
        const minGap = Number(options.minGap) || 4;
        ctx.save();
        ctx.font = '600 10px Arial';
        ctx.textBaseline = 'middle';
        (chart.data.datasets || []).forEach((dataset, datasetIndex) => {
            const meta = chart.getDatasetMeta(datasetIndex);
            if (!meta || meta.hidden) return;
            (meta.data || []).forEach((point, index) => {
                const raw = dataset.data?.[index];
                if (!raw || !raw.record || !point) return;
                const record = raw.record;
                const label = `${getRealisationComparisonLabel(record, options.includeLevel)} (${Number(record.valeur).toLocaleString('fr-FR')})`;
                const lines = wrapRealisationComparisonCanvasText(ctx, label, maxWidth, 2);
                const width = Math.min(maxWidth + 10, Math.max(70, ...lines.map(line => ctx.measureText(line).width)) + 10);
                const height = lines.length * 13 + 8;
                items.push({ pointX: point.x, pointY: point.y, lines, width, height, color: raw.groupColor || dataset.borderColor || '#34495e' });
            });
        });
        const placed = [];
        const collides = (a, b) => !(a.x + a.w + minGap < b.x || b.x + b.w + minGap < a.x || a.y + a.h + minGap < b.y || b.y + b.h + minGap < a.y);
        const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
        items.sort((a, b) => a.pointY - b.pointY || a.pointX - b.pointX);
        items.forEach((item, index) => {
            const candidates = [
                { x: item.pointX + 8, y: item.pointY - item.height - 7 },
                { x: item.pointX + 8, y: item.pointY + 7 },
                { x: item.pointX - item.width - 8, y: item.pointY - item.height - 7 },
                { x: item.pointX - item.width - 8, y: item.pointY + 7 }
            ];
            let chosen = null;
            for (const candidate of candidates) {
                const box = {
                    x: clamp(candidate.x, area.left + 2, area.right - item.width - 2),
                    y: clamp(candidate.y, area.top + 2, area.bottom - item.height - 2),
                    w: item.width,
                    h: item.height
                };
                if (!placed.some(other => collides(box, other))) { chosen = box; break; }
            }
            if (!chosen) {
                const row = index % Math.max(1, Math.floor((area.bottom - area.top) / (item.height + minGap)));
                chosen = {
                    x: clamp(item.pointX + 8, area.left + 2, area.right - item.width - 2),
                    y: clamp(area.top + row * (item.height + minGap), area.top + 2, area.bottom - item.height - 2),
                    w: item.width,
                    h: item.height
                };
            }
            placed.push(chosen);
            item.box = chosen;
        });
        items.forEach(item => {
            const box = item.box;
            const targetX = clamp(item.pointX, box.x, box.x + box.w);
            const targetY = clamp(item.pointY, box.y, box.y + box.h);
            ctx.strokeStyle = item.color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(item.pointX, item.pointY);
            ctx.lineTo(targetX, targetY);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,.96)';
            ctx.fillRect(box.x, box.y, box.w, box.h);
            ctx.strokeStyle = item.color;
            ctx.strokeRect(box.x, box.y, box.w, box.h);
            ctx.fillStyle = item.color;
            ctx.textAlign = 'left';
            item.lines.forEach((line, lineIndex) => ctx.fillText(line, box.x + 5, box.y + 7 + lineIndex * 13));
        });
        ctx.restore();
    }
};

const realisationComparisonTimelineLabelsPlugin = {
    id: 'realisationComparisonTimelineLabelsPlugin',
    beforeDatasetsDraw(chart, args, options) {
        // Activation explicite obligatoire : ce plug-in global ne doit jamais
        // modifier les autres diagrammes de périodes du tableau de bord.
        if (!options || options.display !== true || !chart.chartArea) return;
        const ctx = chart.ctx;
        const area = chart.chartArea;
        const yScale = chart.scales?.y;
        if (!yScale) return;
        ctx.save();
        const labels = chart.data?.labels || [];
        labels.forEach((label, index) => {
            const y = yScale.getPixelForValue(index);
            const nextY = index + 1 < labels.length ? yScale.getPixelForValue(index + 1) : y + 62;
            const previousY = index > 0 ? yScale.getPixelForValue(index - 1) : y - 62;
            const halfHeight = Math.max(24, Math.min(Math.abs(nextY - y), Math.abs(y - previousY)) / 2);
            if (index % 2 === 0) {
                ctx.fillStyle = 'rgba(25, 135, 84, 0.035)';
                ctx.fillRect(area.left, y - halfHeight, area.right - area.left, halfHeight * 2);
            }
        });
        ctx.restore();
    },
    afterDatasetsDraw(chart, args, options) {
        // Activation explicite obligatoire. Cela empêche le double dessin des
        // dates et des valeurs dans « Réalisations des DREN/CISCO/ZAP ».
        if (!options || options.display !== true || !chart.chartArea) return;
        const ctx = chart.ctx;
        const area = chart.chartArea;
        const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
        ctx.save();
        ctx.textBaseline = 'middle';
        chart.data.datasets.forEach((dataset, datasetIndex) => {
            const meta = chart.getDatasetMeta(datasetIndex);
            if (!meta || meta.hidden) return;
            (meta.data || []).forEach((bar, index) => {
                const record = dataset._records?.[index];
                if (!record || !bar) return;
                const left = Math.min(bar.base, bar.x);
                const right = Math.max(bar.base, bar.x);
                const width = Math.max(1, right - left);
                const color = dataset.borderColor || '#245c3e';
                const startText = formatRealisationComparisonDate(record.dateStart);
                const endText = formatRealisationComparisonDate(record.dateEnd);
                const valueText = `Valeur : ${Number(record.valeur).toLocaleString('fr-FR')}`;

                // Repères visuels exacts de début et de fin.
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(left, bar.y - 16);
                ctx.lineTo(left, bar.y + 16);
                ctx.moveTo(right, bar.y - 16);
                ctx.lineTo(right, bar.y + 16);
                ctx.stroke();

                // Date de début au-dessus du bord gauche, date de fin sous le bord droit.
                ctx.font = '600 9px Arial';
                const startWidth = ctx.measureText(startText).width + 8;
                const endWidth = ctx.measureText(endText).width + 8;
                const startX = clamp(left, area.left + 2, area.right - startWidth - 2);
                const endX = clamp(right - endWidth, area.left + 2, area.right - endWidth - 2);

                ctx.fillStyle = 'rgba(255,255,255,.96)';
                ctx.fillRect(startX, bar.y - 28, startWidth, 15);
                ctx.strokeStyle = color;
                ctx.strokeRect(startX, bar.y - 28, startWidth, 15);
                ctx.fillStyle = '#34495e';
                ctx.textAlign = 'left';
                ctx.fillText(startText, startX + 4, bar.y - 20.5);

                ctx.fillStyle = 'rgba(255,255,255,.96)';
                ctx.fillRect(endX, bar.y + 13, endWidth, 15);
                ctx.strokeStyle = color;
                ctx.strokeRect(endX, bar.y + 13, endWidth, 15);
                ctx.fillStyle = '#34495e';
                ctx.textAlign = 'left';
                ctx.fillText(endText, endX + 4, bar.y + 20.5);

                // Valeur dans la barre si elle tient ; sinon dans une boîte séparée.
                ctx.font = '700 10px Arial';
                const valueWidth = ctx.measureText(valueText).width;
                if (width >= valueWidth + 18) {
                    ctx.fillStyle = '#fff';
                    ctx.textAlign = 'center';
                    ctx.fillText(valueText, left + width / 2, bar.y);
                } else {
                    const boxWidth = valueWidth + 10;
                    const boxX = clamp(right + 7, area.left + 2, area.right - boxWidth - 2);
                    ctx.fillStyle = 'rgba(255,255,255,.97)';
                    ctx.fillRect(boxX, bar.y - 9, boxWidth, 18);
                    ctx.strokeStyle = color;
                    ctx.strokeRect(boxX, bar.y - 9, boxWidth, 18);
                    ctx.fillStyle = color;
                    ctx.textAlign = 'left';
                    ctx.fillText(valueText, boxX + 5, bar.y);
                }
            });
        });
        ctx.restore();
    }
};

if (typeof Chart !== 'undefined' && typeof Chart.register === 'function' && !Chart.$realisationComparisonPluginsRegistered) {
    Chart.register(realisationComparisonPointLabelsPlugin, realisationComparisonTimelineLabelsPlugin);
    Chart.$realisationComparisonPluginsRegistered = true;
}

function setRealisationComparisonStageSize(stage, scroll, width, height) {
    if (!stage || !scroll) return;
    const availableWidth = Math.max(300, Math.floor(scroll.clientWidth || scroll.parentElement?.clientWidth || 900));
    const availableHeight = Math.max(340, Math.min(650, Math.floor((window.innerHeight || 900) * .68)));
    const targetWidth = Math.max(availableWidth, Math.ceil(width));
    const targetHeight = Math.max(380, Math.ceil(height));
    stage.style.width = `${targetWidth}px`;
    stage.style.minWidth = `${targetWidth}px`;
    stage.style.height = `${targetHeight}px`;
    stage.style.minHeight = `${targetHeight}px`;
    scroll.style.overflowX = targetWidth > availableWidth + 8 ? 'auto' : 'hidden';
    scroll.style.overflowY = targetHeight > availableHeight + 8 ? 'auto' : 'hidden';
    scroll.style.maxHeight = targetHeight > availableHeight + 8 ? `${availableHeight}px` : 'none';
}

function destroyRealisationComparisonChart(scope, kind) {
    const key = getRealisationComparisonScopeKey(scope);
    const chart = realisationComparisonCharts[key]?.[kind];
    if (chart) chart.destroy();
    if (realisationComparisonCharts[key]) realisationComparisonCharts[key][kind] = null;
}

function renderRealisationComparisonScatter(scope, records, analysis, targetMode = 'semantic') {
    const scopeKey = getRealisationComparisonScopeKey(scope);
    const key = scopeKey.toLowerCase();
    const settings = getRealisationComparisonSettings(scopeKey);
    const config = getRealisationComparisonDimensionConfig(settings.dimension);
    const semanticMode = Array.isArray(records) && records.some(record => !!record.semanticClusterId);
    const originalTarget = targetMode === 'original';
    const idMiddle = originalTarget ? '-original' : '';
    const chartKind = originalTarget ? 'scatterOriginal' : 'scatter';
    const canvas = document.getElementById(`real-compare-scatter${idMiddle}-${key}`);
    const stage = document.getElementById(`real-compare-scatter-stage${idMiddle}-${key}`);
    const scroll = document.getElementById(`real-compare-scatter-scroll${idMiddle}-${key}`);
    if (!canvas || !stage || !scroll) return;
    destroyRealisationComparisonChart(scopeKey, chartKind);

    const dimensions = [...new Map(records.map(record => [record.comparisonKey, record.comparisonValue])).entries()]
        .sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'fr'));
    const dimensionIndex = new Map(dimensions.map(([dimensionKey], index) => [dimensionKey, index]));
    const maxPerDimension = Math.max(1, ...dimensions.map(([dimensionKey]) => records.filter(record => record.comparisonKey === dimensionKey).length));
    const width = Math.min(14000, Math.max(920, 480 + maxPerDimension * 165));
    const height = Math.min(12000, Math.max(430, 150 + dimensions.length * 86));
    setRealisationComparisonStageSize(stage, scroll, width, height);

    const datasets = [];
    const levels = scopeKey === 'STD' ? ['DREN', 'CISCO', 'ZAP'] : [scopeKey];
    levels.forEach(level => {
        const levelRecords = records.filter(record => record.niveau === level);
        if (!levelRecords.length) return;
        datasets.push({
            label: `${level} — réalisations`,
            data: levelRecords.map(record => {
                const groupNumber = analysis.groupByRecord.get(record.comparisonId) || 0;
                return {
                    x: Number(record.valeur),
                    y: dimensionIndex.get(record.comparisonKey),
                    record,
                    groupNumber,
                    groupColor: groupNumber ? REALISATION_COMPARISON_GROUP_COLORS[(groupNumber - 1) % REALISATION_COMPARISON_GROUP_COLORS.length] : '#6c757d'
                };
            }),
            backgroundColor: levelRecords.map(() => REALISATION_COMPARISON_LEVEL_COLORS[level]),
            borderColor: levelRecords.map(record => {
                const groupNumber = analysis.groupByRecord.get(record.comparisonId) || 0;
                return groupNumber ? REALISATION_COMPARISON_GROUP_COLORS[(groupNumber - 1) % REALISATION_COMPARISON_GROUP_COLORS.length] : '#6c757d';
            }),
            pointRadius: 7, pointHoverRadius: 10, pointBorderWidth: 3
        });
    });

    const values = records.map(record => Number(record.valeur));
    const minValue = Math.min(...values, 0), maxValue = Math.max(...values, 1);
    const padding = Math.max(1, (maxValue - minValue) * .08);

    realisationComparisonCharts[scopeKey][chartKind] = new Chart(canvas.getContext('2d'), {
        type: 'scatter', data: { datasets },
        options: {
            responsive: true, maintainAspectRatio: false, normalized: true,
            layout: { padding: { left: 10, right: 165, top: 18, bottom: 18 } },
            interaction: { mode: 'nearest', intersect: true },
            plugins: {
                title: { display: true, text: semanticMode ? `Comparaison numérique des réalisations — ${scopeKey} — Thématiques Sentence-BERT de ${config.label}` : `Comparaison numérique des réalisations — ${scopeKey} — ${config.label}`, font: { size: 15, weight: 'bold' } },
                legend: { display: true, position: 'top', labels: { usePointStyle: true, padding: 12 } },
                realisationComparisonPointLabelsPlugin: { display: true, includeLevel: scopeKey === 'STD', maxWidth: 150, minGap: 4 },
                tooltip: { callbacks: {
                    title: items => items?.[0]?.raw?.record?.comparisonValue || config.label,
                    label: context => {
                        const record = context.raw.record, groupNumber = context.raw.groupNumber;
                        return [
                            `Entité : ${getRealisationComparisonLabel(record, scopeKey === 'STD')}`,
                            `${config.label} : ${record.comparisonValue}`,
                            `Valeur : ${Number(record.valeur).toLocaleString('fr-FR')}`,
                            `Début : ${formatRealisationComparisonDate(record.dateStart)}`,
                            `Fin : ${formatRealisationComparisonDate(record.dateEnd)}`,
                            ...(semanticMode ? [`Formulation originale : ${record.semanticOriginal || record.comparisonValue}`, `Similarité au représentant SBERT : ${(Number(record.semanticSimilarity || 0) * 100).toFixed(1)} %`] : []),
                            `Groupe de proximité : ${groupNumber || 'Aucun'}`
                        ];
                    }
                }}
            },
            scales: {
                x: { type: 'linear', min: minValue < 0 ? minValue - padding : 0, max: maxValue + padding, title: { display: true, text: 'Valeur numérique de la réalisation', font: { weight: 'bold' } }, grid: { color: 'rgba(70, 100, 82, .12)' } },
                y: { type: 'linear', min: -.5, max: Math.max(.5, dimensions.length - .5), reverse: true, title: { display: true, text: semanticMode ? `Thématique Sentence-BERT — ${config.label}` : config.label, font: { weight: 'bold' } }, ticks: { stepSize: 1, autoSkip: false, callback: value => { const label = dimensions[Math.round(value)]?.[1] || ''; return label.length > 58 ? `${label.slice(0, 55)}…` : label; } }, grid: { color: 'rgba(70, 100, 82, .10)' } }
            }
        }
    });
}

function buildRealisationComparisonTimelineAxisLabel(record, includeLevel) {
    const dimensionValue = cleanSpaces(record?.comparisonValue || 'Élément non renseigné');
    const entity = getRealisationComparisonLabel(record, includeLevel);
    const short = dimensionValue.length > 54 ? `${dimensionValue.slice(0, 51)}…` : dimensionValue;
    return [short, entity];
}

function renderRealisationComparisonTimeline(scope, records) {
    const scopeKey = getRealisationComparisonScopeKey(scope);
    const key = scopeKey.toLowerCase();
    const settings = getRealisationComparisonSettings(scopeKey);
    const config = getRealisationComparisonDimensionConfig(settings.dimension);
    const canvas = document.getElementById(`real-compare-timeline-${key}`);
    const stage = document.getElementById(`real-compare-timeline-stage-${key}`);
    const scroll = document.getElementById(`real-compare-timeline-scroll-${key}`);
    if (!canvas || !stage || !scroll) return;
    destroyRealisationComparisonChart(scopeKey, 'timeline');

    const complete = records.filter(record => record.dateStart && record.dateEnd).sort((a, b) => {
        const dimensionDiff = String(a.comparisonValue).localeCompare(String(b.comparisonValue), 'fr');
        if (dimensionDiff) return dimensionDiff;
        return a.dateStart - b.dateStart || Number(a.valeur) - Number(b.valeur);
    });
    if (!complete.length) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setRealisationComparisonStageSize(stage, scroll, 900, 390);
        ctx.save(); ctx.fillStyle = '#6c757d'; ctx.font = '600 14px Arial'; ctx.textAlign = 'center';
        ctx.fillText(`Aucune réalisation de la dimension « ${config.label} » avec une date de début et une date de fin complètes.`, canvas.width / 2, canvas.height / 2);
        ctx.restore(); return;
    }

    const minDate = new Date(Math.min(...complete.map(record => record.dateStart.getTime())));
    const maxDate = new Date(Math.max(...complete.map(record => record.dateEnd.getTime())));
    const durationDays = Math.max(1, Math.ceil((maxDate - minDate) / 86400000) + 1);
    const pixelsPerDay = durationDays <= 90 ? 11 : (durationDays <= 365 ? 5 : 2.4);
    setRealisationComparisonStageSize(stage, scroll, Math.min(16000, Math.max(1100, 610 + durationDays * pixelsPerDay)), Math.min(16000, Math.max(480, 175 + complete.length * 72)));

    const fullLabels = complete.map(record => `${record.comparisonValue} — ${getRealisationComparisonLabel(record, scopeKey === 'STD')}`);
    const labels = complete.map(record => buildRealisationComparisonTimelineAxisLabel(record, scopeKey === 'STD'));
    const levels = scopeKey === 'STD' ? ['DREN', 'CISCO', 'ZAP'] : [scopeKey];
    const datasets = levels.map(level => ({
        label: level,
        data: complete.map(record => record.niveau === level ? [record.dateStart.getTime(), record.dateEnd.getTime()] : null),
        _records: complete.map(record => record.niveau === level ? record : null),
        backgroundColor: REALISATION_COMPARISON_LEVEL_COLORS[level],
        borderColor: REALISATION_COMPARISON_LEVEL_COLORS[level].replace(/0\.8\d\)/, '1)'),
        borderWidth: 1.3, borderSkipped: false, borderRadius: 4, minBarLength: 4, barPercentage: .48, categoryPercentage: .86
    })).filter(dataset => dataset.data.some(Boolean));

    realisationComparisonCharts[scopeKey].timeline = new Chart(canvas.getContext('2d'), {
        type: 'bar', data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false, normalized: true, indexAxis: 'y', layout: { padding: { right: 190, top: 24, bottom: 26 } },
            plugins: {
                title: { display: true, text: `Périodes début-fin des réalisations — ${scopeKey} — ${config.label}`, font: { size: 15, weight: 'bold' } },
                legend: { display: true, position: 'top', labels: { usePointStyle: true, padding: 12 } },
                realisationComparisonTimelineLabelsPlugin: { display: true },
                tooltip: { callbacks: { title: items => items?.[0] ? fullLabels[items[0].dataIndex] : 'Réalisation', label: context => { const record = context.dataset._records?.[context.dataIndex]; if (!record) return ''; return [`${config.label} : ${record.comparisonValue}`, `Valeur : ${Number(record.valeur).toLocaleString('fr-FR')}`, `Début : ${formatRealisationComparisonDate(record.dateStart)}`, `Fin : ${formatRealisationComparisonDate(record.dateEnd)}`]; } } }
            },
            scales: {
                x: { type: 'linear', min: minDate.getTime(), max: maxDate.getTime(), title: { display: true, text: 'Dates de début et de fin des réalisations', font: { weight: 'bold' } }, ticks: { maxTicksLimit: 13, maxRotation: 0, minRotation: 0, callback: value => formatRealisationGanttDate(value) }, grid: { color: 'rgba(70, 100, 82, .12)' } },
                y: { stacked: true, title: { display: true, text: `${config.label} et entité`, font: { weight: 'bold' } }, ticks: { autoSkip: false, padding: 10, font: { size: complete.length > 25 ? 8 : 9, weight: '600' }, callback: function(value) { return this.getLabelForValue(value); } }, grid: { display: false } }
            }
        }
    });
}

function renderRealisationComparisonLegend(scope, analysis, targetMode = 'semantic') {
    const key = getRealisationComparisonScopeKey(scope).toLowerCase();
    const originalTarget = targetMode === 'original';
    const target = document.getElementById(originalTarget ? `real-compare-group-legend-original-${key}` : `real-compare-group-legend-${key}`);
    if (!target) return;
    if (!analysis.groups.length) {
        target.innerHTML = '<span class="real-comparison-legend-chip"><i style="background:#6c757d"></i>Aucun groupe proche</span>';
        return;
    }
    target.innerHTML = analysis.groups.slice(0, 12).map((group, index) => {
        const color = REALISATION_COMPARISON_GROUP_COLORS[index % REALISATION_COMPARISON_GROUP_COLORS.length];
        return `<span class="real-comparison-legend-chip"><i style="background:${color}"></i>Groupe ${index + 1} · ${group.length} réalisation(s)</span>`;
    }).join('');
}


const realisationComparisonAlgorithmCharts = {
    DREN: { kmeans: null, jenks: null, dbscan: null },
    CISCO: { kmeans: null, jenks: null, dbscan: null },
    ZAP: { kmeans: null, jenks: null, dbscan: null }
};
const realisationComparisonAlgorithmState = { DREN: null, CISCO: null, ZAP: null };
const realisationComparisonPredictionCharts = {
    DREN: { linear: null, weighted: null, rna: null },
    CISCO: { linear: null, weighted: null, rna: null },
    ZAP: { linear: null, weighted: null, rna: null }
};
const realisationComparisonPredictionState = { DREN: null, CISCO: null, ZAP: null };

function getRealisationComparisonAlgorithmClassLabel(algorithm, assignment, maxAssignment) {
    if (algorithm === 'dbscan') {
        return assignment === -1 ? 'Bruit / anomalie' : `Groupe DBSCAN ${assignment + 1}`;
    }
    if (maxAssignment <= 0) return 'Groupe unique';
    if (assignment === 0) return 'Faible';
    if (assignment === maxAssignment) return 'Forte';
    return 'Moyenne';
}

function getRealisationComparisonAlgorithmColor(algorithm, assignment, maxAssignment) {
    if (algorithm === 'dbscan') {
        if (assignment === -1) return '#dc3545';
        return REALISATION_COMPARISON_GROUP_COLORS[assignment % REALISATION_COMPARISON_GROUP_COLORS.length];
    }
    if (maxAssignment <= 0) return '#6c757d';
    if (assignment === 0) return '#0d6efd';
    if (assignment === maxAssignment) return '#198754';
    return '#fd7e14';
}

function buildRealisationComparisonAlgorithmAnalysis(records, algorithm) {
    const source = (Array.isArray(records) ? records : []).filter(record => Number.isFinite(Number(record?.valeur)));
    const values = source.map(record => Number(record.valeur));
    if (!source.length) return { records: [], assignments: [], summary: 'Aucune valeur exploitable.', maxAssignment: -1, eps: null };

    let assignments = [];
    let summary = '';
    let eps = null;

    if (algorithm === 'kmeans') {
        assignments = perform1DKMeans(values, 3);
        const groups = new Map();
        assignments.forEach((cluster, index) => {
            if (!groups.has(cluster)) groups.set(cluster, []);
            groups.get(cluster).push(values[index]);
        });
        const centers = [...groups.entries()].sort((a,b) => a[0]-b[0]).map(([cluster, vals]) => {
            const mean = vals.reduce((sum, value) => sum + value, 0) / vals.length;
            return `Groupe ${cluster + 1} : centre ≈ ${mean.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}`;
        });
        summary = `K-Means répartit ${source.length.toLocaleString('fr-FR')} réalisation(s) en ${groups.size} groupe(s) selon la proximité de leurs valeurs numériques. ${centers.join(' · ')}`;
    } else if (algorithm === 'jenks') {
        assignments = performJenks(values, 3);
        const unique = [...new Set(values)].sort((a,b) => a-b);
        if (unique.length > 3) {
            const breaks = getJenksBreaks(values, 3);
            summary = `Jenks recherche les ruptures naturelles dans la distribution des réalisations. Bornes calculées : ${breaks.map(value => Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 2 })).join(' · ')}.`;
        } else {
            summary = `Jenks classe ${source.length.toLocaleString('fr-FR')} réalisation(s) à partir des ${unique.length} valeur(s) distincte(s) disponible(s).`;
        }
    } else {
        const result = performDBSCAN(values);
        assignments = result.assignments;
        eps = result.eps;
        const noiseCount = assignments.filter(value => value === -1).length;
        summary = `DBSCAN détecte les groupes denses et les valeurs isolées. ε = ±${Number(result.eps || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}, MinPts = 2, ${result.numClusters} groupe(s), ${noiseCount} bruit(s)/anomalie(s).`;
    }

    const nonNoise = assignments.filter(value => value >= 0);
    const maxAssignment = nonNoise.length ? Math.max(...nonNoise) : -1;
    return { records: source, assignments, summary, maxAssignment, eps };
}

function destroyRealisationComparisonAlgorithmChart(scope, algorithm) {
    const scopeKey = getRealisationComparisonScopeKey(scope);
    const chart = realisationComparisonAlgorithmCharts[scopeKey]?.[algorithm];
    if (chart) chart.destroy();
    if (realisationComparisonAlgorithmCharts[scopeKey]) realisationComparisonAlgorithmCharts[scopeKey][algorithm] = null;
}

function renderRealisationComparisonAlgorithm(scope, algorithm, records) {
    const scopeKey = getRealisationComparisonScopeKey(scope);
    if (!['DREN', 'CISCO', 'ZAP'].includes(scopeKey)) return;
    const key = scopeKey.toLowerCase();
    const settings = getRealisationComparisonSettings(scopeKey);
    const config = getRealisationComparisonDimensionConfig(settings.dimension);
    const canvas = document.getElementById(`real-compare-algo-chart-${algorithm}-${key}`);
    const stage = document.getElementById(`real-compare-algo-stage-${algorithm}-${key}`);
    const scroll = document.getElementById(`real-compare-algo-scroll-${algorithm}-${key}`);
    const summaryNode = document.getElementById(`real-compare-algo-summary-${algorithm}-${key}`);
    const tbody = document.getElementById(`real-compare-algo-table-${algorithm}-${key}`);
    if (!canvas || !stage || !scroll || !tbody) return;

    destroyRealisationComparisonAlgorithmChart(scopeKey, algorithm);
    const result = buildRealisationComparisonAlgorithmAnalysis(records, algorithm);
    if (summaryNode) summaryNode.innerHTML = `<i class="fas fa-info-circle"></i> ${escapeRealisationHtml(result.summary)}`;

    const header = tbody.closest('table')?.querySelector('thead th[data-real-compare-algo-dimension-header]');
    if (header) header.textContent = config.label;

    if (!result.records.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Aucune réalisation exploitable pour cet algorithme.</td></tr>';
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0,0,canvas.width,canvas.height);
        return;
    }

    const rows = result.records.map((record, index) => ({
        record,
        assignment: result.assignments[index],
        originalIndex: index
    })).sort((a,b) => Number(a.record.valeur) - Number(b.record.valeur) || String(a.record.entite).localeCompare(String(b.record.entite), 'fr'));

    const limited = rows.slice(0, 300);
    const labels = limited.map(({record}, index) => {
        const dimension = cleanSpaces(record.comparisonValue || config.label);
        const entity = cleanSpaces(record.entite || 'Entité inconnue');
        const shortDimension = dimension.length > 42 ? `${dimension.slice(0, 39)}…` : dimension;
        const shortEntity = entity.length > 32 ? `${entity.slice(0, 29)}…` : entity;
        return `${shortEntity} — ${shortDimension}`;
    });
    const chartValues = limited.map(({record}) => Number(record.valeur));
    const colors = limited.map(({assignment}) => getRealisationComparisonAlgorithmColor(algorithm, assignment, result.maxAssignment));

    const targetHeight = Math.min(12000, Math.max(420, 165 + limited.length * 34));
    const targetWidth = Math.max(960, Math.min(1600, 760 + Math.max(...labels.map(label => label.length), 20) * 5));
    setRealisationComparisonStageSize(stage, scroll, targetWidth, targetHeight);

    const algorithmTitle = algorithm === 'kmeans' ? 'K-Means' : (algorithm === 'jenks' ? 'Algorithme de Jenks' : 'DBSCAN');
    realisationComparisonAlgorithmCharts[scopeKey][algorithm] = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: `Valeur de réalisation — ${algorithmTitle}`,
                data: chartValues,
                backgroundColor: colors,
                borderColor: colors,
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            normalized: true,
            plugins: {
                title: { display: true, text: `${algorithmTitle} — ${scopeKey} — ${config.label}`, font: { size: 15, weight: 'bold' } },
                legend: { display: false },
                tooltip: { callbacks: {
                    title: items => {
                        const item = limited[items?.[0]?.dataIndex];
                        return item ? `${item.record.entite} — ${item.record.comparisonValue}` : algorithmTitle;
                    },
                    label: context => {
                        const item = limited[context.dataIndex];
                        if (!item) return '';
                        return [
                            `Valeur : ${Number(item.record.valeur).toLocaleString('fr-FR')}`,
                            `Classe : ${getRealisationComparisonAlgorithmClassLabel(algorithm, item.assignment, result.maxAssignment)}`,
                            `Période : ${formatRealisationComparisonPeriod(item.record)}`
                        ];
                    }
                }}
            },
            scales: {
                x: { beginAtZero: true, title: { display: true, text: 'Valeur numérique de la réalisation', font: { weight: 'bold' } } },
                y: { ticks: { autoSkip: false, font: { size: limited.length > 35 ? 8 : 9 } }, title: { display: true, text: `${scopeKey} — ${config.label}`, font: { weight: 'bold' } } }
            }
        }
    });

    const htmlRows = limited.map(({record, assignment}, index) => {
        const classLabel = getRealisationComparisonAlgorithmClassLabel(algorithm, assignment, result.maxAssignment);
        const color = getRealisationComparisonAlgorithmColor(algorithm, assignment, result.maxAssignment);
        return `<tr>
            <td class="text-center">${index + 1}</td>
            <td>${record.semanticOriginal && record.semanticOriginal !== record.comparisonValue ? `<strong>${escapeRealisationHtml(record.comparisonValue || 'Non renseignée')}</strong><br><small class="text-muted">${escapeRealisationHtml(record.semanticOriginal)}</small>` : escapeRealisationHtml(record.comparisonValue || 'Non renseignée')}</td>
            <td>${escapeRealisationHtml(record.entite || 'Non renseignée')}</td>
            <td class="text-end fw-bold">${Number(record.valeur).toLocaleString('fr-FR')}</td>
            <td><span class="badge" style="background:${color};color:#fff;">${escapeRealisationHtml(classLabel)}</span></td>
        </tr>`;
    });
    if (rows.length > 300) htmlRows.push(`<tr><td colspan="5" class="text-center text-muted">Affichage limité aux 300 premières réalisations sur ${rows.length.toLocaleString('fr-FR')}.</td></tr>`);
    tbody.innerHTML = htmlRows.join('');
}

function renderRealisationComparisonAlgorithms(scope, records) {
    const scopeKey = getRealisationComparisonScopeKey(scope);
    if (!['DREN', 'CISCO', 'ZAP'].includes(scopeKey)) return;
    realisationComparisonAlgorithmState[scopeKey] = { records: Array.isArray(records) ? records : [] };
    realisationComparisonPredictionState[scopeKey] = null;
    ['kmeans', 'jenks', 'dbscan'].forEach(algorithm => renderRealisationComparisonAlgorithm(scopeKey, algorithm, records));
}


/* ======================================================================
   V6.4 — PRÉDICTION TEMPORELLE DES RÉALISATIONS DREN / CISCO / ZAP
   Les variables explicatives sont dérivées exclusivement de la date de
   début, de la date de fin et de la durée inclusive de la réalisation.
   Trois modèles sont proposés : régression temporelle multiple, moyenne
   temporelle pondérée et réseau de neurones artificiels (RNA).
   ====================================================================== */
function realisationPredictionDayNumber(date) {
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() / 86400000 : NaN;
}

function realisationPredictionDurationDays(start, end) {
    if (!(start instanceof Date) || !(end instanceof Date) || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    if (end < start) return null;
    return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
}

function realisationPredictionMedian(values) {
    const sorted = (values || []).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
    if (!sorted.length) return 0;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function getRealisationPredictionValidRecords(records) {
    return (Array.isArray(records) ? records : []).filter(record =>
        record && Number.isFinite(Number(record.valeur)) &&
        record.dateStart instanceof Date && !Number.isNaN(record.dateStart.getTime()) &&
        record.dateEnd instanceof Date && !Number.isNaN(record.dateEnd.getTime()) &&
        record.dateEnd >= record.dateStart
    );
}

function getRealisationPredictionSeries(records) {
    const groups = new Map();
    getRealisationPredictionValidRecords(records).forEach(record => {
        const entity = cleanSpaces(record.entite || 'Entité non renseignée');
        const dimensionValue = cleanSpaces(record.comparisonValue || 'Non renseignée');
        const key = `${record.niveau || ''}|${normalizeRealisationKey(entity)}|${record.comparisonKey || normalizeRealisationKey(dimensionValue)}`;
        if (!groups.has(key)) groups.set(key, { key, entity, niveau: record.niveau, dimensionValue, records: [] });
        groups.get(key).records.push(record);
    });
    return [...groups.values()].map(series => {
        series.records.sort((a,b) => a.dateStart - b.dateStart || a.dateEnd - b.dateEnd);
        const values = series.records.map(record => Number(record.valeur));
        series.mean = values.reduce((sum,value)=>sum+value,0) / values.length;
        series.lastValue = Number(series.records[series.records.length - 1]?.valeur || 0);
        series.lastEnd = series.records[series.records.length - 1]?.dateEnd || null;
        return series;
    }).sort((a,b) => a.entity.localeCompare(b.entity,'fr') || a.dimensionValue.localeCompare(b.dimensionValue,'fr'));
}

function setRealisationPredictionAutomaticPeriod(scope, records, force = false) {
    const scopeKey = getRealisationComparisonScopeKey(scope);
    if (!['DREN','CISCO','ZAP'].includes(scopeKey)) return null;
    const key = scopeKey.toLowerCase();
    const startInput = document.getElementById(`real-compare-pred-start-${key}`);
    const endInput = document.getElementById(`real-compare-pred-end-${key}`);
    if (!startInput || !endInput) return null;
    if (!force && startInput.value && endInput.value) {
        return { start: parseSubmissionDate(startInput.value), end: parseSubmissionDate(endInput.value) };
    }
    const valid = getRealisationPredictionValidRecords(records);
    if (!valid.length) return null;
    const maxEnd = new Date(Math.max(...valid.map(record => record.dateEnd.getTime())));
    const durations = valid.map(record => realisationPredictionDurationDays(record.dateStart, record.dateEnd)).filter(Boolean);
    const medianDuration = Math.max(1, Math.round(realisationPredictionMedian(durations) || 1));
    const start = new Date(maxEnd.getTime() + 86400000);
    const end = new Date(start.getTime() + (medianDuration - 1) * 86400000);
    startInput.value = formatISODateUTC(start);
    endInput.value = formatISODateUTC(end);
    return { start, end };
}

function getRealisationPredictionTarget(scope, records) {
    const scopeKey = getRealisationComparisonScopeKey(scope);
    const key = scopeKey.toLowerCase();
    const startInput = document.getElementById(`real-compare-pred-start-${key}`);
    const endInput = document.getElementById(`real-compare-pred-end-${key}`);
    if (!startInput || !endInput) return { error: 'Champs de dates de prédiction introuvables.' };
    if (!startInput.value || !endInput.value) setRealisationPredictionAutomaticPeriod(scopeKey, records, false);
    const start = parseSubmissionDate(startInput.value || '');
    const end = parseSubmissionDate(endInput.value || '');
    if (!start || !end) return { error: 'Renseignez une date de début et une date de fin à prédire.' };
    if (end < start) return { error: 'La date de fin à prédire doit être postérieure ou égale à la date de début.' };
    const duration = realisationPredictionDurationDays(start, end);
    return { start, end, duration, startDay: realisationPredictionDayNumber(start), endDay: realisationPredictionDayNumber(end) };
}

function solveRealisationPredictionLinearSystem(matrix, vector) {
    const n = vector.length;
    const a = matrix.map((row,i) => row.slice().concat([vector[i]]));
    for (let col=0; col<n; col++) {
        let pivot = col;
        for (let row=col+1; row<n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
        if (Math.abs(a[pivot][col]) < 1e-10) return null;
        [a[col], a[pivot]] = [a[pivot], a[col]];
        const divisor = a[col][col];
        for (let j=col; j<=n; j++) a[col][j] /= divisor;
        for (let row=0; row<n; row++) {
            if (row === col) continue;
            const factor = a[row][col];
            for (let j=col; j<=n; j++) a[row][j] -= factor * a[col][j];
        }
    }
    return a.map(row => row[n]);
}

function predictRealisationByLinearRegression(series, target) {
    const rows = series.records.map(record => ({
        start: realisationPredictionDayNumber(record.dateStart),
        end: realisationPredictionDayNumber(record.dateEnd),
        duration: realisationPredictionDurationDays(record.dateStart, record.dateEnd),
        y: Number(record.valeur)
    })).filter(row => [row.start,row.end,row.duration,row.y].every(Number.isFinite));
    if (rows.length < 3) return { value: series.mean, fallback: true, detail: 'Historique insuffisant : moyenne historique utilisée.' };
    const names = ['start','end','duration'];
    const means = names.map(name => rows.reduce((sum,row)=>sum+row[name],0)/rows.length);
    const stds = names.map((name,i) => {
        const variance = rows.reduce((sum,row)=>sum + Math.pow(row[name]-means[i],2),0)/rows.length;
        return Math.sqrt(variance) || 1;
    });
    const X = rows.map(row => [1, ...names.map((name,i)=>(row[name]-means[i])/stds[i])]);
    const y = rows.map(row=>row.y);
    const p = 4;
    const xtx = Array.from({length:p},()=>Array(p).fill(0));
    const xty = Array(p).fill(0);
    X.forEach((row,r) => {
        for (let i=0;i<p;i++) {
            xty[i] += row[i] * y[r];
            for (let j=0;j<p;j++) xtx[i][j] += row[i] * row[j];
        }
    });
    const ridge = 0.35;
    for (let i=1;i<p;i++) xtx[i][i] += ridge;
    const beta = solveRealisationPredictionLinearSystem(xtx, xty);
    if (!beta) return { value: series.mean, fallback: true, detail: 'Régression instable : moyenne historique utilisée.' };
    const tx = [1,
        (target.startDay-means[0])/stds[0],
        (target.endDay-means[1])/stds[1],
        (target.duration-means[2])/stds[2]
    ];
    const value = tx.reduce((sum,x,i)=>sum+x*beta[i],0);
    return { value: Math.max(0, value), fallback: false, detail: 'Régression ridge sur date début, date fin et durée.' };
}

function predictRealisationByTemporalWeight(series, target) {
    const rows = series.records.map(record => ({
        midpoint: (realisationPredictionDayNumber(record.dateStart) + realisationPredictionDayNumber(record.dateEnd))/2,
        duration: realisationPredictionDurationDays(record.dateStart, record.dateEnd),
        y: Number(record.valeur)
    })).filter(row => [row.midpoint,row.duration,row.y].every(Number.isFinite));
    if (!rows.length) return { value: 0, fallback: true, detail: 'Aucune observation temporelle.' };
    const targetMidpoint = (target.startDay + target.endDay)/2;
    const midpoints = rows.map(row=>row.midpoint);
    const durations = rows.map(row=>row.duration);
    const span = Math.max(1, Math.max(...midpoints)-Math.min(...midpoints));
    const durationSpan = Math.max(1, Math.max(...durations)-Math.min(...durations));
    const tauTime = Math.max(14, span * .35);
    const tauDuration = Math.max(2, durationSpan * .75);
    let weighted = 0, totalWeight = 0;
    rows.forEach(row => {
        const timeWeight = Math.exp(-Math.abs(row.midpoint-targetMidpoint)/tauTime);
        const durationWeight = Math.exp(-Math.abs(row.duration-target.duration)/tauDuration);
        const recencyWeight = 1 + .20 * ((row.midpoint - Math.min(...midpoints))/span);
        const weight = timeWeight * durationWeight * recencyWeight;
        weighted += row.y * weight;
        totalWeight += weight;
    });
    return { value: Math.max(0, totalWeight ? weighted/totalWeight : series.mean), fallback: false, detail: 'Moyenne pondérée par proximité temporelle, durée et récence.' };
}

function realisationPredictionSeededRandom(seedText) {
    let seed = 2166136261 >>> 0;
    for (const ch of String(seedText || 'RNA')) { seed ^= ch.charCodeAt(0); seed = Math.imul(seed, 16777619); }
    return () => {
        seed += 0x6D2B79F5;
        let t = seed;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function trainRealisationPredictionRNA(seriesList, target, scopeKey) {
    const rows = [];
    seriesList.forEach(series => {
        series.records.forEach(record => {
            const duration = realisationPredictionDurationDays(record.dateStart, record.dateEnd);
            const y = Number(record.valeur);
            const start = realisationPredictionDayNumber(record.dateStart), end = realisationPredictionDayNumber(record.dateEnd);
            if (![duration,y,start,end,series.mean].every(Number.isFinite)) return;
            rows.push({ seriesKey: series.key, x: [start,end,duration,series.mean], y });
        });
    });
    if (rows.length < 8) return { model: null, rows, summary: `RNA non entraîné : ${rows.length} observation(s) seulement ; 8 minimum sont nécessaires.` };
    const featureCount = 4, hiddenCount = 8;
    const means = Array(featureCount).fill(0), stds = Array(featureCount).fill(0);
    rows.forEach(row => row.x.forEach((value,i)=>means[i]+=value));
    means.forEach((_,i)=>means[i]/=rows.length);
    rows.forEach(row => row.x.forEach((value,i)=>stds[i]+=Math.pow(value-means[i],2)));
    stds.forEach((_,i)=>stds[i]=Math.sqrt(stds[i]/rows.length)||1);
    const yMean = rows.reduce((sum,row)=>sum+row.y,0)/rows.length;
    const yStd = Math.sqrt(rows.reduce((sum,row)=>sum+Math.pow(row.y-yMean,2),0)/rows.length)||1;
    const train = rows.map(row => ({ x: row.x.map((v,i)=>(v-means[i])/stds[i]), y:(row.y-yMean)/yStd }));
    const rand = realisationPredictionSeededRandom(`${scopeKey}|${rows.length}|RNA-V6.4`);
    const W1 = Array.from({length:hiddenCount},()=>Array.from({length:featureCount},()=> (rand()-.5)*.35));
    const b1 = Array(hiddenCount).fill(0);
    const W2 = Array.from({length:hiddenCount},()=> (rand()-.5)*.35);
    let b2 = 0;
    const epochs = 140, learningRate = .028;
    let finalLoss = 0;
    for (let epoch=0; epoch<epochs; epoch++) {
        const gW1 = Array.from({length:hiddenCount},()=>Array(featureCount).fill(0));
        const gb1 = Array(hiddenCount).fill(0), gW2 = Array(hiddenCount).fill(0);
        let gb2 = 0, loss = 0;
        for (const sample of train) {
            const h = W1.map((weights,j)=>Math.tanh(weights.reduce((sum,w,i)=>sum+w*sample.x[i],b1[j])));
            const pred = h.reduce((sum,value,j)=>sum+value*W2[j],b2);
            const err = pred-sample.y;
            loss += err*err;
            gb2 += 2*err;
            for (let j=0;j<hiddenCount;j++) {
                gW2[j] += 2*err*h[j];
                const dh = 2*err*W2[j]*(1-h[j]*h[j]);
                gb1[j] += dh;
                for (let i=0;i<featureCount;i++) gW1[j][i] += dh*sample.x[i];
            }
        }
        const n = train.length;
        const clip = value => Math.max(-5, Math.min(5, value/n));
        for (let j=0;j<hiddenCount;j++) {
            W2[j] -= learningRate*clip(gW2[j]);
            b1[j] -= learningRate*clip(gb1[j]);
            for (let i=0;i<featureCount;i++) W1[j][i] -= learningRate*clip(gW1[j][i]);
        }
        b2 -= learningRate*clip(gb2);
        finalLoss = loss/n;
    }
    const predict = rawX => {
        const x = rawX.map((v,i)=>(v-means[i])/stds[i]);
        const h = W1.map((weights,j)=>Math.tanh(weights.reduce((sum,w,i)=>sum+w*x[i],b1[j])));
        const yn = h.reduce((sum,value,j)=>sum+value*W2[j],b2);
        return Math.max(0, yn*yStd+yMean);
    };
    return {
        model: { predict, hiddenCount, epochs, finalLoss, yMean, yStd }, rows,
        summary: `RNA entraîné sur ${rows.length.toLocaleString('fr-FR')} observation(s), 4 entrées temporelles/contextuelles, ${hiddenCount} neurones cachés et ${epochs} époques. Erreur quadratique normalisée d’entraînement ≈ ${Math.sqrt(Math.max(0,finalLoss)).toLocaleString('fr-FR',{maximumFractionDigits:3})}.`
    };
}

function getRealisationPredictionReliability(count) {
    if (count >= 8) return { label:'Meilleure base', cls:'bg-success' };
    if (count >= 4) return { label:'Moyenne', cls:'bg-warning text-dark' };
    if (count >= 2) return { label:'Faible', cls:'bg-danger' };
    return { label:'Très faible', cls:'bg-secondary' };
}

function destroyRealisationPredictionChart(scope, model) {
    const scopeKey = getRealisationComparisonScopeKey(scope);
    const chart = realisationComparisonPredictionCharts[scopeKey]?.[model];
    if (chart) chart.destroy();
    if (realisationComparisonPredictionCharts[scopeKey]) realisationComparisonPredictionCharts[scopeKey][model] = null;
}

function renderRealisationPredictionModel(scope, model, results, target, config, meta = {}) {
    const scopeKey = getRealisationComparisonScopeKey(scope), key = scopeKey.toLowerCase();
    const canvas = document.getElementById(`real-compare-pred-chart-${model}-${key}`);
    const stage = document.getElementById(`real-compare-pred-stage-${model}-${key}`);
    const scroll = document.getElementById(`real-compare-pred-scroll-${model}-${key}`);
    const tbody = document.getElementById(`real-compare-pred-table-${model}-${key}`);
    const summary = document.getElementById(`real-compare-pred-summary-${model}-${key}`);
    if (!canvas || !stage || !scroll || !tbody) return;
    destroyRealisationPredictionChart(scopeKey, model);
    const header = tbody.closest('table')?.querySelector('thead th[data-real-compare-pred-dimension-header]');
    if (header) header.textContent = config.label;
    const title = model === 'linear' ? 'Régression temporelle multiple' : (model === 'weighted' ? 'Moyenne temporelle pondérée' : 'RESEAUX DE NEURONES ARTIFICIELLES (RNA)');
    if (summary) {
        const extra = model === 'linear'
            ? 'Le modèle ajuste une régression ridge distincte pour chaque couple entité × dimension à partir de la date de début, de la date de fin et de la durée.'
            : (model === 'weighted'
                ? 'Le modèle privilégie les réalisations historiques dont la période et la durée ressemblent le plus à la période cible.'
                : (meta.rnaSummary || 'Le RNA apprend une relation temporelle non linéaire sur les observations retenues.'));
        summary.innerHTML = `<i class="fas fa-info-circle"></i> <strong>${escapeRealisationHtml(title)} :</strong> ${escapeRealisationHtml(extra)}`;
    }
    if (!results.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">Aucune série temporelle exploitable pour cette prédiction.</td></tr>';
        canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
        return;
    }
    const sorted = [...results].sort((a,b)=>b.predicted-a.predicted || a.entity.localeCompare(b.entity,'fr'));
    const limited = sorted.slice(0,100);
    const labels = limited.map(item => {
        const entity = item.entity.length>30 ? `${item.entity.slice(0,27)}…` : item.entity;
        const dim = item.dimensionValue.length>34 ? `${item.dimensionValue.slice(0,31)}…` : item.dimensionValue;
        return `${entity} — ${dim}`;
    });
    const targetHeight = Math.min(12000, Math.max(430, 175 + limited.length*36));
    setRealisationComparisonStageSize(stage, scroll, 1120, targetHeight);
    realisationComparisonPredictionCharts[scopeKey][model] = new Chart(canvas.getContext('2d'), {
        type:'bar',
        data:{ labels, datasets:[
            { label:'Moyenne historique', data:limited.map(item=>item.historicalMean), backgroundColor:'rgba(108,117,125,.55)', borderColor:'rgba(108,117,125,.9)', borderWidth:1, borderRadius:3 },
            { label:'Réalisation prédite', data:limited.map(item=>item.predicted), backgroundColor:'rgba(25,135,84,.72)', borderColor:'rgba(25,135,84,1)', borderWidth:1, borderRadius:3 }
        ]},
        options:{ responsive:true, maintainAspectRatio:false, indexAxis:'y', normalized:true,
            plugins:{
                title:{ display:true, text:`${title} — ${scopeKey} — ${config.label} — ${formatRealisationComparisonDate(target.start)} → ${formatRealisationComparisonDate(target.end)}`, font:{size:14,weight:'bold'} },
                legend:{position:'top'},
                tooltip:{callbacks:{ title:items=>labels[items?.[0]?.dataIndex]||title, afterBody:items=>{ const item=limited[items?.[0]?.dataIndex]; return item ? [`Historique : ${item.count} observation(s)`,`Dernière valeur : ${item.lastValue.toLocaleString('fr-FR',{maximumFractionDigits:2})}`,`Fiabilité : ${getRealisationPredictionReliability(item.count).label}`] : []; }}}
            },
            scales:{ x:{beginAtZero:true,title:{display:true,text:'Valeur de réalisation'}}, y:{ticks:{autoSkip:false,font:{size:limited.length>35?8:9}}} }
        }
    });
    const period = `${formatRealisationComparisonDate(target.start)} → ${formatRealisationComparisonDate(target.end)}`;
    const rows = sorted.slice(0,300).map((item,index) => {
        const reliability = getRealisationPredictionReliability(item.count);
        return `<tr><td class="text-center">${index+1}</td><td>${escapeRealisationHtml(item.dimensionValue)}</td><td>${escapeRealisationHtml(item.entity)}</td><td class="text-center">${item.count}</td><td class="text-end">${Number(item.lastValue).toLocaleString('fr-FR',{maximumFractionDigits:2})}</td><td>${escapeRealisationHtml(period)}</td><td class="text-end fw-bold">${Number(item.predicted).toLocaleString('fr-FR',{maximumFractionDigits:2})}${item.fallback?' <span class="badge bg-secondary ms-1">repli</span>':''}</td><td><span class="badge ${reliability.cls}">${reliability.label}</span></td></tr>`;
    });
    if (sorted.length>300) rows.push(`<tr><td colspan="8" class="text-center text-muted">Affichage limité aux 300 premières séries sur ${sorted.length.toLocaleString('fr-FR')}.</td></tr>`);
    tbody.innerHTML = rows.join('');
}

function runRealisationComparisonPrediction(scope, forceAutoPeriod = false) {
    const scopeKey = getRealisationComparisonScopeKey(scope);
    if (!['DREN','CISCO','ZAP'].includes(scopeKey)) return;
    const key = scopeKey.toLowerCase();
    const state = realisationComparisonAlgorithmState[scopeKey];
    const records = Array.isArray(state?.records) ? state.records : [];
    const validRecords = getRealisationPredictionValidRecords(records);
    const status = document.getElementById(`real-compare-pred-status-${key}`);
    if (forceAutoPeriod) setRealisationPredictionAutomaticPeriod(scopeKey, records, true);
    const target = getRealisationPredictionTarget(scopeKey, records);
    if (target.error) {
        if (status) { status.className='alert alert-danger small real-comparison-prediction-status'; status.innerHTML=`<i class="fas fa-exclamation-triangle"></i> ${escapeRealisationHtml(target.error)}`; }
        return;
    }
    const settings = getRealisationComparisonSettings(scopeKey);
    const config = getRealisationComparisonDimensionConfig(settings.dimension);
    const seriesList = getRealisationPredictionSeries(records);
    const rnaTraining = trainRealisationPredictionRNA(seriesList, target, scopeKey);
    const resultsByModel = { linear:[], weighted:[], rna:[] };
    seriesList.forEach(series => {
        const linear = predictRealisationByLinearRegression(series,target);
        const weighted = predictRealisationByTemporalWeight(series,target);
        const rnaValue = rnaTraining.model
            ? rnaTraining.model.predict([target.startDay,target.endDay,target.duration,series.mean])
            : weighted.value;
        const base = { key:series.key, entity:series.entity, dimensionValue:series.dimensionValue, count:series.records.length, lastValue:series.lastValue, historicalMean:series.mean };
        resultsByModel.linear.push({...base,predicted:linear.value,fallback:linear.fallback,detail:linear.detail});
        resultsByModel.weighted.push({...base,predicted:weighted.value,fallback:weighted.fallback,detail:weighted.detail});
        resultsByModel.rna.push({...base,predicted:Math.max(0,rnaValue),fallback:!rnaTraining.model,detail:rnaTraining.model?'RNA entraîné sur l’ensemble des séries retenues.':'Repli sur moyenne temporelle pondérée.'});
    });
    realisationComparisonPredictionState[scopeKey] = { target, settings, resultsByModel, rnaTraining, recordsCount:validRecords.length, seriesCount:seriesList.length };
    const metricRecords = document.getElementById(`real-compare-pred-metric-records-${key}`);
    const metricSeries = document.getElementById(`real-compare-pred-metric-series-${key}`);
    const metricDays = document.getElementById(`real-compare-pred-metric-days-${key}`);
    if (metricRecords) metricRecords.textContent=validRecords.length.toLocaleString('fr-FR');
    if (metricSeries) metricSeries.textContent=seriesList.length.toLocaleString('fr-FR');
    if (metricDays) metricDays.textContent=`${target.duration} j`;
    renderRealisationPredictionModel(scopeKey,'linear',resultsByModel.linear,target,config,{rnaSummary:rnaTraining.summary});
    renderRealisationPredictionModel(scopeKey,'weighted',resultsByModel.weighted,target,config,{rnaSummary:rnaTraining.summary});
    renderRealisationPredictionModel(scopeKey,'rna',resultsByModel.rna,target,config,{rnaSummary:rnaTraining.summary});
    if (status) {
        status.className = seriesList.length ? 'alert alert-success small real-comparison-prediction-status' : 'alert alert-warning small real-comparison-prediction-status';
        status.innerHTML = seriesList.length
            ? `<i class="fas fa-check-circle"></i> Prédiction terminée pour <strong>${seriesList.length.toLocaleString('fr-FR')} série(s) ${scopeKey}</strong>, période cible <strong>${formatRealisationComparisonDate(target.start)} → ${formatRealisationComparisonDate(target.end)}</strong>. Les résultats sont des estimations exploratoires fondées sur l’historique disponible.`
            : '<i class="fas fa-info-circle"></i> Aucune série ne possède à la fois une valeur de réalisation, une date de début et une date de fin valides.';
    }
}

function renderRealisationComparisonScatterSummaryTable(scope, records, analysis, targetMode = 'semantic') {
    const scopeKey = getRealisationComparisonScopeKey(scope);
    const key = scopeKey.toLowerCase();
    const settings = getRealisationComparisonSettings(scopeKey);
    const config = getRealisationComparisonDimensionConfig(settings.dimension);
    const originalTarget = targetMode === 'original';
    const tbody = document.getElementById(originalTarget ? `real-compare-scatter-table-original-${key}` : `real-compare-scatter-table-${key}`);
    const countNode = document.getElementById(originalTarget ? `real-compare-scatter-table-count-original-${key}` : `real-compare-scatter-table-count-${key}`);

    if (countNode) countNode.textContent = Number(records?.length || 0).toLocaleString('fr-FR');
    if (!tbody) return;

    const dimensionHeader = tbody.closest('table')?.querySelector('thead th[data-real-compare-scatter-dimension-header]');
    const semanticMode = Array.isArray(records) && records.some(record => !!record.semanticClusterId);
    if (dimensionHeader) dimensionHeader.textContent = semanticMode ? `Thématique Sentence-BERT / ${config.label}` : config.label;

    if (!Array.isArray(records) || !records.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">Aucune réalisation n’est actuellement affichée dans la cartographie.</td></tr>';
        return;
    }

    const sorted = [...records].sort((a, b) => {
        const dimDiff = String(a.comparisonValue || '').localeCompare(String(b.comparisonValue || ''), 'fr');
        if (dimDiff) return dimDiff;
        const entityDiff = String(a.entite || '').localeCompare(String(b.entite || ''), 'fr');
        if (entityDiff) return entityDiff;
        const valueDiff = Number(a.valeur || 0) - Number(b.valeur || 0);
        if (valueDiff) return valueDiff;
        return (a.dateStart?.getTime() || 0) - (b.dateStart?.getTime() || 0);
    });

    const rows = sorted.slice(0, 300).map((record, index) => {
        const groupNumber = analysis?.groupByRecord?.get(record.comparisonId) || 0;
        const groupColor = groupNumber
            ? REALISATION_COMPARISON_GROUP_COLORS[(groupNumber - 1) % REALISATION_COMPARISON_GROUP_COLORS.length]
            : '#6c757d';
        const startText = record.dateStart ? formatRealisationComparisonDate(record.dateStart) : 'Non renseignée';
        const endText = record.dateEnd ? formatRealisationComparisonDate(record.dateEnd) : 'Non renseignée';
        const periodText = record.dateStart && record.dateEnd ? formatRealisationComparisonPeriod(record) : 'Période incomplète';
        const groupBadge = groupNumber
            ? `<span class="badge" style="background:${groupColor}; color:#fff;">Groupe ${groupNumber}</span>`
            : '<span class="badge bg-light text-dark border">Aucun</span>';

        return `<tr>
            <td class="text-center">${index + 1}</td>
            <td>${escapeRealisationHtml(record.comparisonValue || 'Non renseignée')}</td>
            <td><span class="badge bg-secondary me-1">${escapeRealisationHtml(record.niveau || '')}</span>${escapeRealisationHtml(record.entite || 'Non renseignée')}</td>
            <td class="text-end fw-bold">${Number(record.valeur || 0).toLocaleString('fr-FR')}</td>
            <td>${escapeRealisationHtml(startText)}</td>
            <td>${escapeRealisationHtml(endText)}</td>
            <td>${escapeRealisationHtml(periodText)}</td>
            <td>${groupBadge}</td>
        </tr>`;
    });

    if (sorted.length > 300) {
        rows.push(`<tr><td colspan="8" class="text-center text-muted">Affichage limité aux 300 premières réalisations sur ${sorted.length.toLocaleString('fr-FR')}.</td></tr>`);
    }
    tbody.innerHTML = rows.join('');
}

function renderRealisationComparisonTable(scope, analysis) {
    const key = getRealisationComparisonScopeKey(scope).toLowerCase();
    const settings = getRealisationComparisonSettings(scope);
    const config = getRealisationComparisonDimensionConfig(settings.dimension);
    const tbody = document.getElementById(`real-compare-table-${key}`);
    const countNode = document.getElementById(`real-compare-table-count-${key}`);
    if (countNode) countNode.textContent = Number(analysis?.pairs?.length || 0).toLocaleString('fr-FR');
    if (!tbody) return;
    const firstHeader = tbody.closest('table')?.querySelector('thead th:first-child');
    if (firstHeader) firstHeader.textContent = config.label;
    if (!analysis.pairs.length) {
        tbody.innerHTML = `<tr><td colspan="11" class="text-center text-muted py-3">Aucune paire de deux entités différentes n’est disponible pour une même valeur de la dimension « ${escapeRealisationHtml(config.label)} ».</td></tr>`;
        return;
    }
    const rows = analysis.pairs.slice(0, 300).map(pair => {
        const overlapText = pair.overlap === null ? 'Non calculable' : `${pair.overlap.toFixed(1)} %`;
        const conclusion = pair.similar
            ? `<span class="real-comparison-conclusion-close"><i class="fas fa-check-circle"></i> Proches (≤ seuil)</span>`
            : `<span class="real-comparison-conclusion-far"><i class="fas fa-times-circle"></i> Écartées (> seuil)</span>`;
        return `<tr>
            <td>${escapeRealisationHtml(pair.dimensionValue)}</td>
            <td><span class="badge bg-secondary me-1">${escapeRealisationHtml(pair.a.niveau)}</span>${escapeRealisationHtml(pair.a.entite)}</td>
            <td class="text-end fw-bold">${Number(pair.a.valeur).toLocaleString('fr-FR')}</td>
            <td>${escapeRealisationHtml(formatRealisationComparisonPeriod(pair.a))}</td>
            <td><span class="badge bg-secondary me-1">${escapeRealisationHtml(pair.b.niveau)}</span>${escapeRealisationHtml(pair.b.entite)}</td>
            <td class="text-end fw-bold">${Number(pair.b.valeur).toLocaleString('fr-FR')}</td>
            <td>${escapeRealisationHtml(formatRealisationComparisonPeriod(pair.b))}</td>
            <td class="text-end">${pair.absoluteDifference.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}</td>
            <td class="text-end fw-bold">${pair.relativeDifference.toFixed(2)} %</td>
            <td class="text-end">${overlapText}</td>
            <td>${conclusion}</td>
        </tr>`;
    });
    if (analysis.pairs.length > 300) rows.push(`<tr><td colspan="11" class="text-center text-muted">Affichage limité aux 300 premières paires sur ${analysis.pairs.length.toLocaleString('fr-FR')}.</td></tr>`);
    tbody.innerHTML = rows.join('');
}

function calculateRealisationActivityDispersion(records) {
    const values = records.map(record => Number(record.valeur)).filter(Number.isFinite);
    if (!values.length) return { mean: 0, standardDeviation: 0, coefficient: 0 };
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
    const standardDeviation = Math.sqrt(variance);
    return { mean, standardDeviation, coefficient: mean === 0 ? 0 : Math.abs(standardDeviation / mean * 100) };
}

function renderRealisationComparisonInterpretation(scope, records, analysis, settings) {
    const key = getRealisationComparisonScopeKey(scope).toLowerCase();
    const target = document.getElementById(`real-compare-interpretation-${key}`);
    if (!target) return;
    const config = getRealisationComparisonDimensionConfig(settings.dimension);
    const singular = config.label.toLowerCase(), plural = config.plural.toLowerCase();
    const modeText = settings.mode === 'detailed' ? 'chaque soumission individuellement' : (settings.mode === 'sum' ? `la somme par entité et ${singular}` : `la moyenne par entité et ${singular}`);
    const paragraphs = [];
    paragraphs.push(`<p><strong>Dimension sélectionnée :</strong> ${escapeRealisationHtml(config.label)}. <strong>Méthode :</strong> l’analyse compare ${modeText}. Deux entités sont rapprochées uniquement lorsqu’elles partagent la <strong>même valeur de cette dimension</strong> et que leur écart relatif symétrique ne dépasse pas <strong>${settings.tolerance.toFixed(0)} %</strong>.</p>`);
    paragraphs.push(`<p><strong>Couverture :</strong> ${records.length.toLocaleString('fr-FR')} réalisation(s) ont été retenues. ${analysis.comparableDimensionKeys.length.toLocaleString('fr-FR')} valeur(s) distincte(s) de la dimension « ${escapeRealisationHtml(config.label)} » comportent au moins deux entités différentes et sont donc comparables.</p>`);

    if (analysis.similarPairs.length) {
        const closest = [...analysis.similarPairs].sort((a, b) => a.relativeDifference - b.relativeDifference)[0];
        const dimensionCounts = new Map();
        analysis.similarPairs.forEach(pair => dimensionCounts.set(pair.dimensionValue, (dimensionCounts.get(pair.dimensionValue) || 0) + 1));
        const strongest = [...dimensionCounts.entries()].sort((a, b) => b[1] - a[1])[0];
        paragraphs.push(`<p><strong>Résultat principal :</strong> ${analysis.similarPairs.length.toLocaleString('fr-FR')} paire(s) respectent le seuil, formant ${analysis.groups.length.toLocaleString('fr-FR')} groupe(s) de proximité. La paire la plus proche est <strong>${escapeRealisationHtml(getRealisationComparisonLabel(closest.a, settings.scope === 'STD'))}</strong> / <strong>${escapeRealisationHtml(getRealisationComparisonLabel(closest.b, settings.scope === 'STD'))}</strong> pour « ${escapeRealisationHtml(closest.dimensionValue)} », avec un écart relatif de <strong>${closest.relativeDifference.toFixed(2)} %</strong>.</p>`);
        if (strongest) paragraphs.push(`<p><strong>${escapeRealisationHtml(config.label)} présentant la plus forte convergence :</strong> « ${escapeRealisationHtml(strongest[0])} » rassemble ${strongest[1]} paire(s) proches.</p>`);
        const overlaps = analysis.similarPairs.map(pair => pair.overlap).filter(value => value !== null);
        if (overlaps.length) {
            const averageOverlap = overlaps.reduce((sum, value) => sum + value, 0) / overlaps.length;
            paragraphs.push(`<p><strong>Lecture temporelle :</strong> le chevauchement moyen des périodes au sein des paires proches est de <strong>${averageOverlap.toFixed(1)} %</strong>. Un chevauchement élevé signifie que des valeurs proches ont été produites sur des périodes comparables ; un chevauchement faible signifie que la proximité numérique a été observée à des moments différents.</p>`);
        }
    } else {
        paragraphs.push(`<p><strong>Conclusion :</strong> aucune paire ne respecte actuellement le seuil de ${settings.tolerance.toFixed(0)} % pour la dimension « ${escapeRealisationHtml(config.label)} ». Cela signifie que les valeurs numériques observées entre entités différentes restent trop éloignées selon la règle mathématique choisie, ou qu’aucune même valeur de cette dimension n’est partagée par au moins deux entités.</p>`);
    }

    const dispersionRows = [...analysis.byDimension.entries()].map(([dimensionKey, dimensionRecords]) => ({
        value: dimensionRecords[0]?.comparisonValue || dimensionKey,
        ...calculateRealisationActivityDispersion(dimensionRecords)
    })).filter(item => Number.isFinite(item.coefficient));
    if (dispersionRows.length) {
        const highest = dispersionRows.sort((a, b) => b.coefficient - a.coefficient)[0];
        paragraphs.push(`<p><strong>Hétérogénéité maximale :</strong> « ${escapeRealisationHtml(highest.value)} » présente le coefficient de variation le plus élevé (${highest.coefficient.toFixed(1)} %). C’est la valeur de la dimension « ${escapeRealisationHtml(config.label)} » où les niveaux de réalisation sont les plus dispersés entre les entités comparées.</p>`);
    }
    target.innerHTML = `<h6><i class="fas fa-brain"></i> Interprétation intelligente — ${escapeRealisationHtml(config.label)}</h6>${paragraphs.join('')}`;
}

function updateRealisationComparisonMetrics(scope, records, analysis) {
    const key = getRealisationComparisonScopeKey(scope).toLowerCase();
    const settings = getRealisationComparisonSettings(scope);
    const config = getRealisationComparisonDimensionConfig(settings.dimension);
    const setText = (suffix, value) => {
        const node = document.getElementById(`real-compare-metric-${suffix}-${key}`);
        if (node) node.textContent = Number(value || 0).toLocaleString('fr-FR');
    };
    setText('records', records.length);
    setText('activities', analysis.comparableDimensionKeys.length);
    setText('pairs', analysis.similarPairs.length);
    setText('groups', analysis.groups.length);
    const dimensionMetric = document.getElementById(`real-compare-metric-activities-${key}`);
    if (dimensionMetric?.previousElementSibling) dimensionMetric.previousElementSibling.textContent = `${config.plural} comparables`;
}

function populateRealisationComparisonActivities(scope) {
    const scopeKey = getRealisationComparisonScopeKey(scope);
    const key = scopeKey.toLowerCase();
    const dimension = getRealisationComparisonSelectedDimension(scopeKey);
    const config = getRealisationComparisonDimensionConfig(dimension);
    const select = document.getElementById(`real-compare-activity-${key}`);
    if (!select) return;
    const previous = select.dataset.dimension === dimension ? (select.value || 'all') : 'all';
    const records = getRealisationsData().filter(record => {
        if (scopeKey !== 'STD' && record.niveau !== scopeKey) return false;
        const value = getRealisationComparisonDimensionValue(record, dimension);
        return isRealisationComparisonDimensionValueValid(value, dimension);
    });
    const values = new Map();
    records.forEach(record => {
        const value = getRealisationComparisonDimensionValue(record, dimension);
        const valueKey = getRealisationComparisonDimensionKey(value);
        if (!values.has(valueKey)) values.set(valueKey, value);
    });
    select.dataset.dimension = dimension;
    select.innerHTML = `<option value="all">Tous les ${escapeRealisationHtml(config.plural.toLowerCase())}</option>` + [...values.entries()]
        .sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'fr'))
        .map(([valueKey, label]) => `<option value="${escapeRealisationHtml(valueKey)}">${escapeRealisationHtml(label)}</option>`).join('');
    if ([...select.options].some(option => option.value === previous)) select.value = previous;

    const starts = records.map(record => record.dateStart).filter(Boolean).sort((a, b) => a - b);
    const ends = records.map(record => record.dateEnd).filter(Boolean).sort((a, b) => a - b);
    const startInput = document.getElementById(`real-compare-start-${key}`), endInput = document.getElementById(`real-compare-end-${key}`);
    if (starts.length && startInput) { startInput.min = formatISODateUTC(starts[0]); startInput.max = formatISODateUTC(starts[starts.length - 1]); }
    if (ends.length && endInput) { endInput.min = formatISODateUTC(ends[0]); endInput.max = formatISODateUTC(ends[ends.length - 1]); }
    updateRealisationComparisonDimensionUi(scopeKey);
}

window.initializeRealisationComparisonControls = function() {
    ['DREN', 'CISCO', 'ZAP', 'STD'].forEach(scope => {
        updateRealisationComparisonDimensionUi(scope);
        populateRealisationComparisonActivities(scope);
    });
};

window.runRealisationComparison = function(scope) {
    const scopeKey = getRealisationComparisonScopeKey(scope);
    const key = scopeKey.toLowerCase();
    updateRealisationComparisonDimensionUi(scopeKey);
    populateRealisationComparisonActivities(scopeKey);
    const settings = getRealisationComparisonSettings(scopeKey);
    const config = getRealisationComparisonDimensionConfig(settings.dimension);
    const status = document.getElementById(`real-compare-status-${key}`);
    if (settings.start && settings.end && settings.start > settings.end) {
        if (status) {
            status.className = 'alert alert-danger small';
            status.innerHTML = '<i class="fas fa-exclamation-triangle"></i> La « Date debut realisation dans om missionnaire » doit être antérieure ou égale à la « Date fin realisation dans om missionnaire ».';
        }
        return;
    }
    const records = getRealisationComparisonRecords(settings);
    const analysis = buildRealisationSimilarityAnalysis(records, settings.tolerance);
    updateRealisationComparisonMetrics(scopeKey, records, analysis);
    renderRealisationComparisonLegend(scopeKey, analysis);
    renderRealisationComparisonScatter(scopeKey, records, analysis);
    renderRealisationComparisonScatterSummaryTable(scopeKey, records, analysis);
    // V7.8 : conservation permanente de l’ancienne cartographie sans IA sémantique
    // dans un troisième sous-onglet indépendant. Sentence-BERT ne peut donc plus
    // écraser cette vue historique.
    renderRealisationComparisonLegend(scopeKey, analysis, 'original');
    renderRealisationComparisonScatter(scopeKey, records, analysis, 'original');
    renderRealisationComparisonScatterSummaryTable(scopeKey, records, analysis, 'original');
    renderRealisationComparisonAlgorithms(scopeKey, records);
    renderRealisationComparisonTable(scopeKey, analysis);
    renderRealisationComparisonInterpretation(scopeKey, records, analysis, settings);
    renderRealisationComparisonTimeline(scopeKey, records);
    scheduleRealisationSemanticComparison(scopeKey, records, settings);

    if (status) {
        const selectedLabel = settings.dimensionKey === 'all'
            ? `tous les ${config.plural.toLowerCase()} disponibles`
            : (document.getElementById(`real-compare-activity-${key}`)?.selectedOptions?.[0]?.textContent || `le ${config.label.toLowerCase()} sélectionné`);
        status.className = records.length ? 'alert alert-success small' : 'alert alert-warning small';
        const periodText = !settings.start && !settings.end
            ? 'toutes les dates OM missionnaire'
            : `${settings.start ? `début ≥ ${formatRealisationComparisonDate(settings.start)}` : 'toutes les dates de début'} · ${settings.end ? `fin ≤ ${formatRealisationComparisonDate(settings.end)}` : 'toutes les dates de fin'}`;
        status.innerHTML = records.length
            ? `<i class="fas fa-check-circle"></i> Analyse <strong>${escapeRealisationHtml(config.label)}</strong> terminée pour <strong>${escapeRealisationHtml(selectedLabel)}</strong> : ${records.length.toLocaleString('fr-FR')} réalisation(s), seuil de proximité ${settings.tolerance.toFixed(0)} %, période : <strong>${escapeRealisationHtml(periodText)}</strong>.`
            : `<i class="fas fa-info-circle"></i> Aucune réalisation ne correspond aux critères choisis pour la dimension <strong>${escapeRealisationHtml(config.label)}</strong> (${escapeRealisationHtml(periodText)}).`;
    }
};

window.runAllRealisationComparisons = function() {
    window.initializeRealisationComparisonControls();
    ['DREN', 'CISCO', 'ZAP', 'STD'].forEach(scope => window.runRealisationComparison(scope));
};

function initializeRealisationComparisonEvents() {
    const comparisonTab = document.getElementById('real-comparison-tab');
    if (comparisonTab && comparisonTab.dataset.comparisonListener !== '1') {
        comparisonTab.dataset.comparisonListener = '1';
        comparisonTab.addEventListener('shown.bs.tab', () => window.setTimeout(() => window.runAllRealisationComparisons(), 40));
    }
    document.querySelectorAll('#realComparisonTabs button[data-bs-toggle="pill"]').forEach(button => {
        if (button.dataset.comparisonListener === '1') return;
        button.dataset.comparisonListener = '1';
        button.addEventListener('shown.bs.tab', event => {
            const target = String(event.target.getAttribute('data-bs-target') || '');
            const scope = target.split('-').pop().toUpperCase();
            if (['DREN', 'CISCO', 'ZAP', 'STD'].includes(scope)) window.setTimeout(() => window.runRealisationComparison(scope), 30);
        });
    });

    document.querySelectorAll('[data-real-compare-algo-tab]').forEach(button => {
        if (button.dataset.comparisonAlgorithmListener === '1') return;
        button.dataset.comparisonAlgorithmListener = '1';
        button.addEventListener('shown.bs.tab', () => {
            const scope = String(button.dataset.realCompareAlgoScope || '').toUpperCase();
            const algorithm = String(button.dataset.realCompareAlgo || '').toLowerCase();
            if (!['DREN', 'CISCO', 'ZAP'].includes(scope) || !['kmeans', 'jenks', 'dbscan', 'prediction'].includes(algorithm)) return;
            const state = realisationComparisonAlgorithmState[scope];
            if (algorithm === 'prediction') {
                if (state?.records) {
                    setRealisationPredictionAutomaticPeriod(scope, state.records, false);
                    if (!realisationComparisonPredictionState[scope]) runRealisationComparisonPrediction(scope, false);
                }
                window.setTimeout(() => {
                    const activeModel = document.querySelector(`[data-real-compare-pred-model-scope="${scope}"].active`)?.dataset?.realComparePredModel || 'linear';
                    realisationComparisonPredictionCharts[scope]?.[activeModel]?.resize?.();
                }, 30);
                return;
            }
            if (state?.records) renderRealisationComparisonAlgorithm(scope, algorithm, state.records);
            window.setTimeout(() => realisationComparisonAlgorithmCharts[scope]?.[algorithm]?.resize?.(), 30);
        });
    });

    document.querySelectorAll('[data-real-compare-pred-run]').forEach(button => {
        if (button.dataset.predictionListener === '1') return;
        button.dataset.predictionListener = '1';
        button.addEventListener('click', () => runRealisationComparisonPrediction(String(button.dataset.realComparePredScope || '').toUpperCase(), false));
    });
    document.querySelectorAll('[data-real-compare-pred-auto]').forEach(button => {
        if (button.dataset.predictionListener === '1') return;
        button.dataset.predictionListener = '1';
        button.addEventListener('click', () => runRealisationComparisonPrediction(String(button.dataset.realComparePredScope || '').toUpperCase(), true));
    });
    document.querySelectorAll('[data-real-compare-pred-model-tab]').forEach(button => {
        if (button.dataset.predictionModelListener === '1') return;
        button.dataset.predictionModelListener = '1';
        button.addEventListener('shown.bs.tab', () => {
            const scope = String(button.dataset.realComparePredModelScope || '').toUpperCase();
            const model = String(button.dataset.realComparePredModel || '').toLowerCase();
            if (!['DREN','CISCO','ZAP'].includes(scope) || !['linear','weighted','rna'].includes(model)) return;
            if (!realisationComparisonPredictionState[scope]) runRealisationComparisonPrediction(scope, false);
            window.setTimeout(() => realisationComparisonPredictionCharts[scope]?.[model]?.resize?.(), 30);
        });
    });

    document.querySelectorAll('[data-real-compare-semantic-run]').forEach(button => {
        if (button.dataset.semanticComparisonListener === '1') return;
        button.dataset.semanticComparisonListener = '1';
        button.addEventListener('click', () => {
            const scope = String(button.dataset.realCompareSemanticScope || '').toUpperCase();
            if (!['DREN','CISCO','ZAP','STD'].includes(scope)) return;
            const settings = getRealisationComparisonSettings(scope);
            const records = getRealisationComparisonRecords(settings);
            runRealisationSemanticComparison(scope, records, settings, true);
        });
    });

    document.querySelectorAll('[data-real-compare-dimension-scope]').forEach(button => {
        if (button.dataset.comparisonDimensionListener === '1') return;
        button.dataset.comparisonDimensionListener = '1';
        button.addEventListener('click', () => {
            const scope = String(button.dataset.realCompareDimensionScope || '').toUpperCase();
            if (!['DREN', 'CISCO', 'ZAP', 'STD'].includes(scope)) return;
            document.querySelectorAll(`[data-real-compare-dimension-scope="${scope}"]`).forEach(item => {
                const active = item === button;
                item.classList.toggle('active', active);
                item.setAttribute('aria-pressed', active ? 'true' : 'false');
            });
            const select = document.getElementById(`real-compare-activity-${scope.toLowerCase()}`);
            if (select) { select.value = 'all'; select.dataset.dimension = ''; }
            updateRealisationComparisonDimensionUi(scope);
            populateRealisationComparisonActivities(scope);
            window.runRealisationComparison(scope);
        });
    });

    ['dren', 'cisco', 'zap', 'std'].forEach(key => {
        ['activity', 'mode', 'tolerance', 'start', 'end'].forEach(control => {
            const node = document.getElementById(`real-compare-${control}-${key}`);
            if (!node || node.dataset.comparisonListener === '1') return;
            node.dataset.comparisonListener = '1';
            node.addEventListener('change', () => window.runRealisationComparison(key.toUpperCase()));
        });
    });
}



/* ======================================================================
   CHARGEMENT KOBO ROBUSTE — DIRECT D'ABORD, PUIS PROXYS CORS DE SECOURS
   ----------------------------------------------------------------------
   Cette stratégie reproduit la version qui fonctionnait auparavant :
   1) tentative directe vers kf.kobotoolbox.org ;
   2) CorsBridge ; 3) AllOrigins ; 4) CORS.lol.

   IMPORTANT : les proxys de secours sont des services tiers. Lorsqu'un
   proxy est utilisé, la réponse Kobo transite par ce service. Cette
   stratégie est donc à réserver aux données que vous acceptez de faire
   transiter par ces services. Aucun token Kobo n'est envoyé par ce code.
   ====================================================================== */
const KOBO_PUBLIC_PROXY_PROVIDERS = [
    {
        name: 'Direct KoboToolbox',
        buildUrl: target => target
    },
    {
        // CorsBridge est utilisé avant les autres proxys publics car CORSPROXY.io
        // peut désormais renvoyer HTTP 401 selon l'origine/compte. Aucun token
        // Kobo n'est ajouté à la requête côté navigateur.
        name: 'CorsBridge',
        buildUrl: target => 'https://api.cors.syrins.tech/?url=' + encodeURIComponent(target)
    },
    {
        name: 'AllOrigins',
        buildUrl: target => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(target)
    },
    {
        name: 'CORS.lol',
        buildUrl: target => 'https://api.cors.lol/?url=' + encodeURIComponent(target)
    }
];

async function fetchKoboJsonWithFallback(koboUrl) {
    const errors = [];
    for (const provider of KOBO_PUBLIC_PROXY_PROVIDERS) {
        const requestUrl = provider.buildUrl(koboUrl);
        try {
            console.log(`[Kobo] Tentative via ${provider.name}`);
            const response = await fetch(requestUrl, {
                method: 'GET',
                cache: 'no-store',
                headers: { 'Accept': 'application/json' }
            });
            if (!response.ok) {
                errors.push(`${provider.name}: HTTP ${response.status}`);
                continue;
            }
            let body;
            try {
                body = await response.json();
            } catch (jsonError) {
                errors.push(`${provider.name}: réponse non JSON`);
                continue;
            }
            return { body, provider: provider.name };
        } catch (error) {
            errors.push(`${provider.name}: ${error?.message || error}`);
            console.warn(`[Kobo] Échec via ${provider.name}:`, error);
        }
    }
    throw new Error(`Toutes les méthodes de connexion KoboToolbox ont échoué. ${errors.join(' | ')}`);
}

function normalizeKoboNextUrl(nextUrl) {
    if (!nextUrl) return null;
    try {
        return new URL(String(nextUrl), 'https://kf.kobotoolbox.org').href;
    } catch (_) {
        return null;
    }
}

async function fetchAllKoboPagesWithFallback(initialUrl, maxPages = 100) {
    const rows = [];
    const providers = [];
    let url = initialUrl;
    let page = 0;

    while (url && page < maxPages) {
        const result = await fetchKoboJsonWithFallback(url);
        if (!providers.includes(result.provider)) providers.push(result.provider);
        const body = result.body;
        const pageRows = Array.isArray(body) ? body : (Array.isArray(body?.results) ? body.results : []);
        rows.push(...pageRows);
        page += 1;

        if (Array.isArray(body)) {
            url = null;
        } else {
            url = normalizeKoboNextUrl(body?.next);
        }
    }

    if (url && page >= maxPages) {
        throw new Error(`Pagination Kobo interrompue après ${maxPages} pages par sécurité.`);
    }
    return { rows, providers, pages: page };
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

    // Détection correcte des doublons : même signature stricte ET chevauchement
    // inclusif des périodes [date début, date fin] dans OM missionnaire.
    const duplicateAnalysis = buildMissionnaireDuplicateAnalysis(data);
    const rowToDuplicateDetails = duplicateAnalysis.rowToDuplicateDetails;
    const rowToDuplicateIssues = duplicateAnalysis.rowToIssues;

    gHeaderTr.append(`<th class="group-header-survey" colspan="3" style="background-color: #f39c12 !important;"><i class="fas fa-bolt"></i> Statut & Action</th>`);
    if (baseColsInfo.length + exKeys.length > 0) gHeaderTr.append(`<th colspan="${baseColsInfo.length + exKeys.length}" class="group-header-survey"><i class="fas fa-edit"></i> Matrice Complète</th>`);
    if (mtKeys.length > 0) gHeaderTr.append(`<th colspan="${mtKeys.length}" class="group-header-meta"><i class="fas fa-cogs"></i> Métadonnées</th>`);

    sHeaderTr.append(`<th class="sub-header-survey" style="background-color: #8e44ad !important; color: white; width: 150px;">Anomalie Colonne Sous activite finale</th>`);
    sHeaderTr.append(`<th class="sub-header-survey" style="background-color: #c0392b !important; color: white; width: 100px;">DOUBLON / STATUT TEMPOREL</th>`);
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


        const doublonsForRow = rowToDuplicateDetails[idx] || [];
        const duplicateIssuesForRow = [...new Set(rowToDuplicateIssues[idx] || [])];
        sData.isDoublon = doublonsForRow.length > 0;
        sData.duplicateStatus = sData.isDoublon
            ? 'doublon'
            : (duplicateIssuesForRow.some(issue => issue.startsWith('ANOMALIE DE DATE')) ? 'anomalie-date'
                : (duplicateIssuesForRow.length ? 'verification-impossible' : 'mission-distincte'));

        let doublonHtml = '';
        let doublonText = '';
        if (doublonsForRow.length > 0) {
            doublonHtml = doublonsForRow.map(detail => `
                <span class="badge bg-danger shadow-sm mb-1 text-wrap" style="font-size: 0.76rem; line-height: 1.25; max-width: 255px; white-space: normal;">
                    <i class="fas fa-exclamation-triangle"></i> ${detail.id}<br>
                    Matricule : ${detail.matricule}<br>
                    Chevauchement : ${detail.overlapText}
                </span>
            `).join('<br>');
            doublonText = doublonsForRow.map(detail => `${detail.id} — Matricule ${detail.matricule} — Chevauchement : ${detail.overlapText}`).join(' ; ');
        } else if (duplicateIssuesForRow.length > 0) {
            doublonHtml = duplicateIssuesForRow.map(issue => {
                const isDateAnomaly = issue.startsWith('ANOMALIE DE DATE');
                const badgeClass = isDateAnomaly ? 'bg-danger text-white' : 'bg-warning text-dark';
                const icon = isDateAnomaly ? 'fa-calendar-times' : 'fa-calendar-exclamation';
                return `<span class="badge ${badgeClass} shadow-sm mb-1 text-wrap" style="font-size: 0.76rem; line-height: 1.25; max-width: 255px; white-space: normal;"><i class="fas ${icon}"></i> ${issue}</span>`;
            }).join('<br>');
            doublonText = duplicateIssuesForRow.join(' ; ');
        } else {
            doublonHtml = `<span class="badge bg-success shadow-sm text-wrap" style="font-size: 0.82rem; white-space: normal;"><i class="fas fa-check"></i> Mission distincte</span>`;
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

    const endLabelLayout = getSubmissionLineEndLabelLayout(canvas, datasets);
    const timelineStage = document.getElementById(`timeline-stage-${level.toLowerCase()}`);
    if (timelineStage) {
        const estimatedLabelHeight = Math.min(3, Math.max(1, Math.ceil(Math.max(...datasets.map(dataset => String(dataset.label || '').length), 1) / 28))) * endLabelLayout.lineHeight + 8;
        const requiredHeight = Math.max(380, Math.min(760, 185 + datasets.length * (estimatedLabelHeight + endLabelLayout.minGap)));
        timelineStage.style.height = `${requiredHeight}px`;
        timelineStage.style.minHeight = `${requiredHeight}px`;
    }

    submissionTimelineChartsRefs[level] = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            normalized: true,
            interaction: { mode: 'index', intersect: false },
            layout: { padding: { right: endLabelLayout.rightPadding } },
            plugins: {
                submissionLineEndLabelsPlugin: {
                    display: true,
                    minGap: endLabelLayout.minGap,
                    maxLabelWidth: endLabelLayout.maxLabelWidth,
                    maxLines: endLabelLayout.maxLines,
                    lineHeight: endLabelLayout.lineHeight,
                    fontSize: endLabelLayout.fontSize
                },
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


/* ========================================================================== */
/* V7.9 — CORRECTION COMPLÈTE DES CONTRÔLES DE L'ANALYSE TEMPORELLE          */
/* - Toutes les périodes Jour → Année sont effectives.                       */
/* - Type de données détaillées / cumulées réellement appliqué.              */
/* - Tous les types de graphique du menu sont réellement rendus.             */
/* - Affichage groupé / individuel, recherche et pagination opérationnels.   */
/* - Zoom temporel + / -, bannière et badges synchronisés.                    */
/* ========================================================================== */
const SUBMISSION_TIMELINE_ZOOM_LEVELS = ['day', 'week', 'month', 'quarter', 'semester', 'year'];
const SUBMISSION_TIMELINE_GRANULARITY_LABELS = {
    day: 'Jour', week: 'Semaine', month: 'Mois', quarter: 'Trimestre', semester: 'Semestre', year: 'Année'
};
const SUBMISSION_TIMELINE_CHART_LABELS = {
    line: 'Courbes', bar: 'Diagrammes en barres', stackedBar: 'Barres empilées', area: 'Aires',
    horizontalBar: 'Barres horizontales (totaux)', pie: 'Diagrammes circulaires', doughnut: 'Diagrammes en anneau',
    histogram: 'Histogramme des volumes', radar: 'Diagramme radar'
};
const SUBMISSION_TIMELINE_DESCRIPTIONS = {
    line: 'Chaque point montre le nombre de soumissions de la période ; les lignes facilitent la comparaison des tendances entre entités.',
    bar: 'Chaque barre compare le nombre de soumissions des entités pour chaque période sélectionnée.',
    stackedBar: 'Les contributions des entités sont empilées afin de visualiser à la fois le total de la période et sa composition.',
    area: 'La surface sous chaque courbe met davantage en évidence le volume et l’évolution des soumissions dans le temps.',
    horizontalBar: 'Les entités sont classées horizontalement selon leur nombre total de soumissions sur la période filtrée.',
    pie: 'Le diagramme montre la part de chaque entité dans le total des soumissions de la période filtrée.',
    doughnut: 'L’anneau montre la répartition du total des soumissions entre les entités affichées.',
    histogram: 'L’histogramme montre comment les volumes totaux de soumissions se distribuent entre les entités.',
    radar: 'Le radar compare le profil temporel des entités sur les périodes affichées.'
};

function escapeSubmissionTimelineHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

// Remplace la version ancienne qui ne gérait réellement que Jour/Semaine/Mois.
function getSubmissionTimelineBucket(date, granularity) {
    let d = new Date(date.getTime());
    d.setUTCHours(0, 0, 0, 0);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    if (granularity === 'week') {
        const day = d.getUTCDay();
        const daysFromMonday = day === 0 ? 6 : day - 1;
        d.setUTCDate(d.getUTCDate() - daysFromMonday);
    } else if (granularity === 'month') {
        d = new Date(Date.UTC(y, m, 1));
    } else if (granularity === 'quarter') {
        d = new Date(Date.UTC(y, Math.floor(m / 3) * 3, 1));
    } else if (granularity === 'semester') {
        d = new Date(Date.UTC(y, m < 6 ? 0 : 6, 1));
    } else if (granularity === 'year') {
        d = new Date(Date.UTC(y, 0, 1));
    }
    return formatISODateUTC(d);
}

function formatSubmissionTimelineLabel(bucketKey, granularity) {
    const d = parseSubmissionDate(bucketKey);
    if (!d) return bucketKey;
    const year = d.getUTCFullYear();
    if (granularity === 'year') return String(year);
    if (granularity === 'semester') return `S${d.getUTCMonth() < 6 ? 1 : 2} ${year}`;
    if (granularity === 'quarter') return `T${Math.floor(d.getUTCMonth() / 3) + 1} ${year}`;
    if (granularity === 'month') return d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    const formatted = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
    return granularity === 'week' ? `Sem. du ${formatted}` : formatted;
}

function getSubmissionTimelineSettings() {
    const granularity = document.getElementById('timeline-granularity')?.value || 'day';
    const mode = document.getElementById('timeline-display-mode')?.value || 'detailed';
    const chartType = document.getElementById('timeline-chart-type')?.value || 'line';
    const layout = document.querySelector('input[name="timeline-layout-mode"]:checked')?.value || 'grouped';
    const topLimit = document.getElementById('timeline-top-entities')?.value || '10';
    const startValue = document.getElementById('timeline-date-start')?.value || '';
    const endValue = document.getElementById('timeline-date-end')?.value || '';
    return { granularity, mode, chartType, layout, topLimit, startValue, endValue };
}

function getSubmissionTimelineChartProfile(chartType) {
    const profiles = {
        line: { type: 'line', line: true },
        bar: { type: 'bar', bar: true },
        stackedBar: { type: 'bar', bar: true, stacked: true },
        area: { type: 'line', line: true, area: true },
        horizontalBar: { type: 'bar', bar: true, horizontal: true, totals: true },
        pie: { type: 'pie', circular: true, totals: true },
        doughnut: { type: 'doughnut', circular: true, totals: true },
        histogram: { type: 'bar', bar: true, histogram: true, totals: true },
        radar: { type: 'radar', radar: true }
    };
    return profiles[chartType] || profiles.line;
}

function cumulativeSubmissionTimelineValues(values) {
    let sum = 0;
    return (values || []).map(v => (sum += Number(v) || 0));
}

function destroySubmissionTimelineIndividualCharts(level) {
    const key = String(level || '').toUpperCase();
    const refs = Array.isArray(submissionTimelineIndividualChartsRefs[key]) ? submissionTimelineIndividualChartsRefs[key] : [];
    refs.forEach(ref => {
        const chart = ref && ref.chart ? ref.chart : ref;
        if (chart && typeof chart.destroy === 'function') {
            try { chart.destroy(); } catch (error) { console.warn('Destruction graphique individuel impossible :', error); }
        }
    });
    submissionTimelineIndividualChartsRefs[key] = [];
}

function buildSubmissionTimelineLevelData(level, datedRows, bucketKeys, settings, applyTopLimit) {
    const entityTotals = {};
    const valuesByEntity = {};
    datedRows.forEach(item => {
        const entity = getSubmissionEntityValue(item.row, level);
        if (!entity || entity.toLowerCase() === 'non renseigné') return;
        const bucket = getSubmissionTimelineBucket(item.date, settings.granularity);
        entityTotals[entity] = (entityTotals[entity] || 0) + 1;
        if (!valuesByEntity[entity]) valuesByEntity[entity] = {};
        valuesByEntity[entity][bucket] = (valuesByEntity[entity][bucket] || 0) + 1;
    });
    let ranked = Object.entries(entityTotals).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'));
    if (applyTopLimit && settings.topLimit !== 'all') ranked = ranked.slice(0, Math.max(1, Number(settings.topLimit) || 10));
    const series = ranked.map(([entity, total], index) => {
        const detailed = bucketKeys.map(key => valuesByEntity[entity]?.[key] || 0);
        const values = settings.mode === 'cumulative' ? cumulativeSubmissionTimelineValues(detailed) : detailed;
        return { entity, total, index, detailed, values };
    });
    return { entityTotals, valuesByEntity, ranked, series };
}

function buildSubmissionHistogram(values, preferredBins = 8) {
    const nums = (values || []).map(Number).filter(Number.isFinite);
    if (!nums.length) return { labels: [], counts: [] };
    const min = Math.min(...nums), max = Math.max(...nums);
    if (min === max) return { labels: [String(min)], counts: [nums.length] };
    const bins = Math.max(2, Math.min(preferredBins, Math.ceil(Math.sqrt(nums.length)) + 1));
    const step = (max - min) / bins;
    const counts = Array(bins).fill(0);
    nums.forEach(value => {
        const idx = Math.min(bins - 1, Math.floor((value - min) / step));
        counts[idx] += 1;
    });
    const labels = counts.map((_, index) => {
        const low = min + index * step;
        const high = index === bins - 1 ? max : min + (index + 1) * step;
        const f = n => Number.isInteger(n) ? String(n) : n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
        return `${f(low)}–${f(high)}`;
    });
    return { labels, counts };
}

function submissionTimelineDataset(entity, values, index, settings, profile) {
    const color = getSubmissionTimelineColor(index, 1);
    return {
        label: entity,
        data: values,
        borderColor: color,
        backgroundColor: getSubmissionTimelineColor(index, profile.area ? .22 : .56),
        pointBackgroundColor: color,
        pointBorderColor: '#fff',
        pointBorderWidth: 1,
        pointRadius: values.length > 45 ? 0 : 3,
        pointHoverRadius: 5,
        borderWidth: 2,
        tension: profile.line ? .22 : 0,
        fill: !!profile.area,
        spanGaps: true
    };
}

function buildSubmissionTimelineGroupedChartData(levelData, bucketLabels, settings, profile) {
    const series = levelData.series;
    if (profile.circular || profile.horizontal) {
        const colors = series.map(item => getSubmissionTimelineColor(item.index, .72));
        return {
            labels: series.map(item => item.entity),
            datasets: [{
                label: 'Total des soumissions',
                data: series.map(item => item.total),
                backgroundColor: colors,
                borderColor: series.map(item => getSubmissionTimelineColor(item.index, 1)),
                borderWidth: 1.4
            }]
        };
    }
    if (profile.histogram) {
        const hist = buildSubmissionHistogram(series.map(item => item.total));
        return {
            labels: hist.labels,
            datasets: [{
                label: `Nombre d’entités ${levelData.series.length ? '(' + levelData.series.length + ')' : ''}`,
                data: hist.counts,
                borderWidth: 1.4,
                backgroundColor: getSubmissionTimelineColor(0, .62),
                borderColor: getSubmissionTimelineColor(0, 1)
            }]
        };
    }
    return { labels: bucketLabels, datasets: series.map(item => submissionTimelineDataset(item.entity, item.values, item.index, settings, profile)) };
}

function buildSubmissionTimelineOptions(settings, profile, entityCount, individual = false) {
    const isCircular = !!profile.circular;
    const isRadar = !!profile.radar;
    const isHorizontal = !!profile.horizontal;
    const isHistogram = !!profile.histogram;
    const showEndLabels = !!profile.line && !individual && !isRadar;
    const yLabel = settings.mode === 'cumulative' ? 'Nombre cumulé de soumissions' : 'Nombre de soumissions';
    const options = {
        responsive: true,
        maintainAspectRatio: false,
        normalized: true,
        interaction: { mode: isCircular ? 'nearest' : 'index', intersect: false },
        layout: { padding: { right: showEndLabels ? 245 : 18, top: 8, bottom: 8, left: 6 } },
        plugins: {
            legend: { display: individual || isCircular || isRadar, position: 'bottom', labels: { usePointStyle: true, boxWidth: 18, padding: 12 } },
            submissionLineEndLabelsPlugin: { display: showEndLabels, minGap: 7, maxLabelWidth: 225, maxLines: 3, lineHeight: 14, fontSize: 11 },
            tooltip: {
                callbacks: {
                    label: context => {
                        const raw = context.raw;
                        const value = typeof raw === 'number' ? raw : (context.parsed?.y ?? context.parsed?.x ?? 0);
                        if (isHistogram) return `Entités : ${Number(value).toLocaleString('fr-FR')}`;
                        if (isCircular || isHorizontal) return `${context.label || context.dataset.label} : ${Number(value).toLocaleString('fr-FR')} soumission${Number(value) > 1 ? 's' : ''}`;
                        return `${context.dataset.label} : ${Number(value).toLocaleString('fr-FR')} soumission${Number(value) > 1 ? 's' : ''}`;
                    }
                }
            }
        }
    };
    if (isCircular) return options;
    if (isRadar) {
        options.scales = { r: { beginAtZero: true, ticks: { precision: 0, backdropColor: 'transparent' }, pointLabels: { font: { size: individual ? 10 : 9 } } } };
        return options;
    }
    options.indexAxis = isHorizontal ? 'y' : 'x';
    options.scales = {};
    if (isHorizontal) {
        options.scales.x = { beginAtZero: true, title: { display: true, text: 'Nombre total de soumissions', font: { weight: 'bold' } }, ticks: { precision: 0 } };
        options.scales.y = { title: { display: true, text: 'Entité', font: { weight: 'bold' } }, ticks: { autoSkip: false } };
    } else if (isHistogram) {
        options.scales.x = { title: { display: true, text: 'Volume total de soumissions par entité', font: { weight: 'bold' } }, ticks: { maxRotation: 35, minRotation: 0 } };
        options.scales.y = { beginAtZero: true, title: { display: true, text: 'Nombre d’entités', font: { weight: 'bold' } }, ticks: { precision: 0 } };
    } else {
        options.scales.x = {
            stacked: !!profile.stacked,
            title: { display: true, text: SUBMISSION_TIMELINE_GRANULARITY_LABELS[settings.granularity] + ' de soumission', font: { weight: 'bold' } },
            ticks: { autoSkip: true, maxTicksLimit: individual ? 12 : 16, maxRotation: profile.bar ? 35 : 0, minRotation: 0 },
            grid: { display: profile.bar }
        };
        options.scales.y = { stacked: !!profile.stacked, beginAtZero: true, title: { display: true, text: yLabel, font: { weight: 'bold' } }, ticks: { precision: 0 } };
    }
    return options;
}

function renderSubmissionTimelineLegend(level, levelData, chart, profile) {
    const legend = document.getElementById(`timeline-legend-${String(level).toLowerCase()}`);
    if (!legend) return;
    if (!chart || !levelData.series.length || profile.histogram) {
        legend.innerHTML = profile.histogram ? '<div class="timeline-legend-note">Histogramme de distribution des volumes.</div>' : '';
        return;
    }
    if (profile.circular || profile.horizontal) {
        legend.innerHTML = levelData.series.map((item, index) => `
            <button type="button" class="timeline-legend-item" data-index="${index}">
                <span class="timeline-legend-swatch" style="background:${getSubmissionTimelineColor(item.index, .78)}"></span>
                <span class="timeline-legend-name">${escapeSubmissionTimelineHtml(item.entity)}</span>
                <span class="timeline-legend-total">${Number(item.total).toLocaleString('fr-FR')}</span>
            </button>`).join('');
        legend.querySelectorAll('.timeline-legend-item').forEach(button => {
            button.addEventListener('click', () => {
                const index = Number(button.dataset.index);
                if (profile.circular && typeof chart.toggleDataVisibility === 'function') chart.toggleDataVisibility(index);
                else {
                    const meta = chart.getDatasetMeta(0);
                    if (meta?.data?.[index]) meta.data[index].hidden = !meta.data[index].hidden;
                }
                button.classList.toggle('is-muted');
                chart.update();
            });
        });
        return;
    }
    legend.innerHTML = levelData.series.map((item, index) => `
        <button type="button" class="timeline-legend-item" data-index="${index}">
            <span class="timeline-legend-swatch" style="background:${getSubmissionTimelineColor(item.index, 1)}"></span>
            <span class="timeline-legend-name">${escapeSubmissionTimelineHtml(item.entity)}</span>
            <span class="timeline-legend-total">${Number(item.total).toLocaleString('fr-FR')}</span>
        </button>`).join('');
    legend.querySelectorAll('.timeline-legend-item').forEach(button => {
        button.addEventListener('click', () => {
            const index = Number(button.dataset.index);
            if (typeof chart.setDatasetVisibility === 'function') chart.setDatasetVisibility(index, !chart.isDatasetVisible(index));
            button.classList.toggle('is-muted');
            chart.update();
        });
    });
}

function renderGroupedSubmissionTimelineChart(level, datedRows, bucketKeys, settings) {
    const lower = String(level).toLowerCase();
    const groupedView = document.getElementById(`timeline-grouped-view-${lower}`);
    const individualView = document.getElementById(`timeline-individual-view-${lower}`);
    const canvas = document.getElementById(`submissionTimelineChart${level}`);
    const emptyState = document.getElementById(`timeline-empty-${lower}`);
    const stage = document.getElementById(`timeline-stage-${lower}`);
    if (!canvas || !emptyState) return;
    if (groupedView) groupedView.style.display = '';
    if (individualView) individualView.style.display = 'none';
    destroySubmissionTimelineIndividualCharts(level);
    if (submissionTimelineChartsRefs[level]) {
        try { submissionTimelineChartsRefs[level].destroy(); } catch (error) { console.warn(error); }
        submissionTimelineChartsRefs[level] = null;
    }
    const profile = getSubmissionTimelineChartProfile(settings.chartType);
    const levelData = buildSubmissionTimelineLevelData(level, datedRows, bucketKeys, settings, true);
    if (!levelData.series.length || (!bucketKeys.length && !profile.totals)) {
        canvas.style.display = 'none';
        emptyState.style.display = 'flex';
        renderSubmissionTimelineLegend(level, levelData, null, profile);
        return;
    }
    canvas.style.display = 'block';
    emptyState.style.display = 'none';
    const labels = bucketKeys.map(key => formatSubmissionTimelineLabel(key, settings.granularity));
    const data = buildSubmissionTimelineGroupedChartData(levelData, labels, settings, profile);
    if (stage) {
        stage.style.minWidth = profile.horizontal ? `${Math.max(820, 520 + levelData.series.length * 70)}px` : (profile.circular || profile.radar ? '760px' : `${Math.max(900, 360 + Math.max(labels.length, 1) * 72)}px`);
        stage.style.height = profile.horizontal ? `${Math.min(950, Math.max(410, 180 + levelData.series.length * 32))}px` : '470px';
        stage.style.minHeight = stage.style.height;
    }
    submissionTimelineChartsRefs[level] = new Chart(canvas.getContext('2d'), {
        type: profile.type,
        data,
        options: buildSubmissionTimelineOptions(settings, profile, levelData.series.length, false)
    });
    renderSubmissionTimelineLegend(level, levelData, submissionTimelineChartsRefs[level], profile);
}

function buildIndividualSubmissionChartData(item, labels, settings, profile) {
    if (profile.circular) {
        const colors = labels.map((_, index) => getSubmissionTimelineColor(index, .7));
        return { labels, datasets: [{ label: item.entity, data: item.values, backgroundColor: colors, borderColor: labels.map((_, index) => getSubmissionTimelineColor(index, 1)), borderWidth: 1.2 }] };
    }
    if (profile.horizontal) {
        return { labels, datasets: [{ label: item.entity, data: item.values, backgroundColor: getSubmissionTimelineColor(item.index, .62), borderColor: getSubmissionTimelineColor(item.index, 1), borderWidth: 1.2 }] };
    }
    if (profile.histogram) {
        const hist = buildSubmissionHistogram(item.detailed, 7);
        return { labels: hist.labels, datasets: [{ label: item.entity, data: hist.counts, backgroundColor: getSubmissionTimelineColor(item.index, .62), borderColor: getSubmissionTimelineColor(item.index, 1), borderWidth: 1.2 }] };
    }
    return { labels, datasets: [submissionTimelineDataset(item.entity, item.values, item.index, settings, profile)] };
}

function renderIndividualSubmissionTimelineLevel(level, datedRows, bucketKeys, settings) {
    const lower = String(level).toLowerCase();
    const groupedView = document.getElementById(`timeline-grouped-view-${lower}`);
    const individualView = document.getElementById(`timeline-individual-view-${lower}`);
    const grid = document.getElementById(`timeline-individual-grid-${lower}`);
    const empty = document.getElementById(`timeline-empty-individual-${lower}`);
    const pageInfo = document.getElementById(`timeline-page-info-${lower}`);
    if (!individualView || !grid || !empty) return;
    if (groupedView) groupedView.style.display = 'none';
    individualView.style.display = '';
    if (submissionTimelineChartsRefs[level]) {
        try { submissionTimelineChartsRefs[level].destroy(); } catch (error) { console.warn(error); }
        submissionTimelineChartsRefs[level] = null;
    }
    destroySubmissionTimelineIndividualCharts(level);
    const profile = getSubmissionTimelineChartProfile(settings.chartType);
    const allData = buildSubmissionTimelineLevelData(level, datedRows, bucketKeys, settings, false);
    const state = submissionTimelineIndividualState[level] || (submissionTimelineIndividualState[level] = { page: 1, pageSize: 6, search: '' });
    const searchEl = document.getElementById(`timeline-search-${lower}`);
    const sizeEl = document.getElementById(`timeline-page-size-${lower}`);
    state.search = String(searchEl?.value || state.search || '').trim();
    state.pageSize = Math.max(1, Number(sizeEl?.value || state.pageSize || 6));
    const query = state.search.toLocaleLowerCase('fr');
    const filtered = allData.series.filter(item => !query || item.entity.toLocaleLowerCase('fr').includes(query));
    const totalPages = filtered.length ? Math.ceil(filtered.length / state.pageSize) : 0;
    if (totalPages === 0) state.page = 1;
    else state.page = Math.max(1, Math.min(state.page || 1, totalPages));
    const start = (state.page - 1) * state.pageSize;
    const pageItems = filtered.slice(start, start + state.pageSize);
    if (pageInfo) pageInfo.textContent = totalPages ? `Page ${state.page} / ${totalPages} · ${filtered.length} entité(s)` : 'Page 0 / 0';
    const prev = individualView.querySelector('.timeline-page-prev');
    const next = individualView.querySelector('.timeline-page-next');
    if (prev) prev.disabled = !totalPages || state.page <= 1;
    if (next) next.disabled = !totalPages || state.page >= totalPages;
    grid.innerHTML = '';
    empty.style.display = pageItems.length ? 'none' : 'block';
    const labels = bucketKeys.map(key => formatSubmissionTimelineLabel(key, settings.granularity));
    pageItems.forEach((item, pageIndex) => {
        const col = document.createElement('div');
        col.className = 'col-12 col-xl-6';
        col.innerHTML = `<article class="timeline-individual-card h-100">
            <div class="timeline-individual-heading"><strong>${escapeSubmissionTimelineHtml(item.entity)}</strong><span>Total : ${Number(item.total).toLocaleString('fr-FR')}</span></div>
            <div class="timeline-individual-canvas"><canvas aria-label="Soumissions de ${escapeSubmissionTimelineHtml(item.entity)}"></canvas></div>
        </article>`;
        grid.appendChild(col);
        const canvas = col.querySelector('canvas');
        const data = buildIndividualSubmissionChartData(item, labels, settings, profile);
        const localProfile = profile.horizontal ? { ...profile, totals: false } : profile;
        const chart = new Chart(canvas.getContext('2d'), {
            type: localProfile.type,
            data,
            options: buildSubmissionTimelineOptions(settings, localProfile, 1, true)
        });
        submissionTimelineIndividualChartsRefs[level].push({ chart, entity: item.entity, name: `${lower}_${start + pageIndex + 1}` });
    });
    const legend = document.getElementById(`timeline-legend-${lower}`);
    if (legend) legend.innerHTML = '';
}

function updateSubmissionTimelineSelectionUi(settings) {
    const periodLabel = SUBMISSION_TIMELINE_GRANULARITY_LABELS[settings.granularity] || settings.granularity;
    const modeLabel = settings.mode === 'cumulative' ? 'Données cumulées' : 'Données détaillées';
    const layoutLabel = settings.layout === 'individual' ? 'Affichage individuel' : 'Affichage groupé';
    const chartLabel = SUBMISSION_TIMELINE_CHART_LABELS[settings.chartType] || settings.chartType;
    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    setText('timeline-selected-period', periodLabel);
    setText('timeline-selected-mode', modeLabel);
    setText('timeline-selected-layout', layoutLabel);
    setText('timeline-selected-chart-type', chartLabel);
    setText('timeline-selection-explanation', SUBMISSION_TIMELINE_DESCRIPTIONS[settings.chartType] || SUBMISSION_TIMELINE_DESCRIPTIONS.line);
    ['DREN', 'CISCO', 'ZAP'].forEach(level => {
        const lower = level.toLowerCase();
        const badge = document.getElementById(`timeline-period-badge-${lower}`);
        if (badge) badge.textContent = `${periodLabel} · ${settings.mode === 'cumulative' ? 'Cumulé' : 'Détaillé'} · ${settings.layout === 'individual' ? 'Individuel' : 'Groupé'} · ${chartLabel}`;
        const desc = document.getElementById(`timeline-description-${lower}`);
        if (desc) desc.textContent = settings.layout === 'individual'
            ? `Un graphique distinct est créé pour chaque ${level}, avec recherche et pagination.`
            : `Les ${level} sélectionnées sont comparées dans un même graphique.`;
    });
    const top = document.getElementById('timeline-top-entities');
    if (top) {
        top.disabled = settings.layout === 'individual';
        top.title = settings.layout === 'individual' ? 'Ce réglage concerne uniquement l’affichage groupé.' : '';
    }
    updateSubmissionTimelineZoomButtons();
}

function updateSubmissionTimelineZoomButtons() {
    const select = document.getElementById('timeline-granularity');
    if (!select) return;
    const index = SUBMISSION_TIMELINE_ZOOM_LEVELS.indexOf(select.value);
    const zoomIn = document.getElementById('timeline-zoom-in-btn');
    const zoomOut = document.getElementById('timeline-zoom-out-btn');
    if (zoomIn) zoomIn.disabled = index <= 0;
    if (zoomOut) zoomOut.disabled = index < 0 || index >= SUBMISSION_TIMELINE_ZOOM_LEVELS.length - 1;
}

function shiftSubmissionTimelineGranularity(delta) {
    const select = document.getElementById('timeline-granularity');
    if (!select) return;
    let index = SUBMISSION_TIMELINE_ZOOM_LEVELS.indexOf(select.value);
    if (index < 0) index = 0;
    const next = Math.max(0, Math.min(SUBMISSION_TIMELINE_ZOOM_LEVELS.length - 1, index + delta));
    if (next === index) return;
    select.value = SUBMISSION_TIMELINE_ZOOM_LEVELS[next];
    renderSubmissionTimelineCharts();
}

// Remplace la version ancienne : tous les contrôles HTML sont désormais consommés.
function renderSubmissionTimelineCharts(data) {
    if (Array.isArray(data)) submissionTimelineSourceData = data;
    if (!document.getElementById('submissionTimelineChartDREN')) return;
    const settings = getSubmissionTimelineSettings();
    const source = Array.isArray(submissionTimelineSourceData) ? submissionTimelineSourceData : [];
    let startDate = settings.startValue ? parseSubmissionDate(settings.startValue) : null;
    let endDate = settings.endValue ? parseSubmissionDate(settings.endValue) : null;
    if (startDate) startDate.setUTCHours(0, 0, 0, 0);
    if (endDate) endDate.setUTCHours(23, 59, 59, 999);
    if (startDate && endDate && startDate > endDate) {
        const tmp = startDate; startDate = endDate; endDate = tmp;
        const startInput = document.getElementById('timeline-date-start');
        const endInput = document.getElementById('timeline-date-end');
        if (startInput && endInput) {
            const oldStart = startInput.value; startInput.value = endInput.value; endInput.value = oldStart;
            settings.startValue = startInput.value; settings.endValue = endInput.value;
        }
    }
    const allAvailableDates = source.map(row => parseSubmissionDate(row['_submission_time'])).filter(Boolean).sort((a, b) => a - b);
    if (allAvailableDates.length) {
        const minDate = formatISODateUTC(allAvailableDates[0]);
        const maxDate = formatISODateUTC(allAvailableDates[allAvailableDates.length - 1]);
        ['timeline-date-start', 'timeline-date-end'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.min = minDate; el.max = maxDate; }
        });
    }
    const datedRows = source
        .map(row => ({ row, date: parseSubmissionDate(row['_submission_time']) }))
        .filter(item => item.date)
        .filter(item => (!startDate || item.date >= startDate) && (!endDate || item.date <= endDate));
    const bucketKeys = [...new Set(datedRows.map(item => getSubmissionTimelineBucket(item.date, settings.granularity)))].sort();
    const uniqueEntities = new Set();
    datedRows.forEach(item => {
        ['DREN', 'CISCO', 'ZAP'].forEach(level => {
            const entity = getSubmissionEntityValue(item.row, level);
            if (entity && entity.toLowerCase() !== 'non renseigné') uniqueEntities.add(`${level}|||${entity}`);
        });
    });
    const datedCount = document.getElementById('timeline-dated-count');
    const entitiesCount = document.getElementById('timeline-entities-count');
    if (datedCount) datedCount.textContent = datedRows.length.toLocaleString('fr-FR');
    if (entitiesCount) entitiesCount.textContent = uniqueEntities.size.toLocaleString('fr-FR');
    const periodLabelEl = document.getElementById('timeline-period-label');
    if (periodLabelEl) {
        if (!datedRows.length) periodLabelEl.textContent = 'Aucune date';
        else {
            const sortedDates = datedRows.map(item => item.date).sort((a, b) => a - b);
            const fmt = d => d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
            const first = fmt(sortedDates[0]), last = fmt(sortedDates[sortedDates.length - 1]);
            periodLabelEl.textContent = first === last ? first : `${first} – ${last}`;
        }
    }
    updateSubmissionTimelineSelectionUi(settings);
    ['DREN', 'CISCO', 'ZAP'].forEach(level => {
        if (settings.layout === 'individual') renderIndividualSubmissionTimelineLevel(level, datedRows, bucketKeys, settings);
        else renderGroupedSubmissionTimelineChart(level, datedRows, bucketKeys, settings);
    });
    setTimeout(() => {
        try { if (typeof refreshUniversalChartScrollbars === 'function') refreshUniversalChartScrollbars(document); } catch (_) {}
    }, 40);
}

function resetSubmissionTimelineControls() {
    const setValue = (id, value) => { const el = document.getElementById(id); if (el) el.value = value; };
    setValue('timeline-granularity', 'day');
    setValue('timeline-display-mode', 'detailed');
    setValue('timeline-chart-type', 'line');
    setValue('timeline-top-entities', '10');
    setValue('timeline-date-start', '');
    setValue('timeline-date-end', '');
    const grouped = document.getElementById('timeline-layout-grouped');
    if (grouped) grouped.checked = true;
    ['DREN', 'CISCO', 'ZAP'].forEach(level => {
        const lower = level.toLowerCase();
        const search = document.getElementById(`timeline-search-${lower}`);
        const size = document.getElementById(`timeline-page-size-${lower}`);
        if (search) search.value = '';
        if (size) size.value = '6';
        submissionTimelineIndividualState[level] = { page: 1, pageSize: 6, search: '' };
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

const REALISATION_DIMENSION_CONFIG = {
    activite: { label: 'Activité', prop: 'activiteBase', empty: 'Activité non spécifiée' },
    produit: { label: 'Produit', prop: 'produit', empty: 'Produit non spécifié' },
    sousActivite: { label: 'Sous Activité', prop: 'sousActivite', empty: 'Sous Activité non spécifiée' },
    sousProduit: { label: 'Sous Produit', prop: 'sousProduit', empty: 'Sous Produit non spécifié' }
};

function getRealisationDimensionConfig(key) {
    return REALISATION_DIMENSION_CONFIG[key] || REALISATION_DIMENSION_CONFIG.sousActivite;
}

function getRealisationSelectedDimension(level) {
    const levelKey = String(level || '').toUpperCase();
    if (levelKey === 'DREN' || levelKey === 'CISCO' || levelKey === 'ZAP') {
        const active = document.querySelector(`[data-real-level-dimension="${levelKey}"].active`);
        const selected = active?.dataset?.realDimension || 'activite';
        return REALISATION_DIMENSION_CONFIG[selected] ? selected : 'activite';
    }
    return 'sousActivite';
}

function getRealisationDimensionValue(record, level) {
    const key = getRealisationSelectedDimension(level);
    const config = getRealisationDimensionConfig(key);
    const raw = cleanSpaces(record?.[config.prop] || '');
    return raw || config.empty;
}

function getRealisationStatusPhrases(record) {
    const phrases = [];
    if (record?.isDoublon) phrases.push('DOUBLON');
    if (record?.isAnomaly) phrases.push('Anomalies de liaison');
    return phrases;
}

function getRealisationStatusText(record, emptyText = 'Valide') {
    const phrases = getRealisationStatusPhrases(record);
    return phrases.length ? phrases.join(' — ') : emptyText;
}

function getRealisationAxisLabel(record, level) {
    const base = `${record?.entite || 'Entité inconnue'} - ${getRealisationDimensionValue(record, level)}`;
    const status = getRealisationStatusPhrases(record);
    // Les statuts sont placés en tête afin de rester visibles même lorsque le
    // libellé DREN/CISCO/ZAP est très long et doit être tronqué sur l'axe Y.
    return status.length ? `${status.join(' — ')} — ${base}` : base;
}

function getRealisationEntityStatusMap(records, level) {
    const map = {};
    (records || []).filter(record => record.niveau === level).forEach(record => {
        if (!map[record.entite]) map[record.entite] = { isDoublon: false, isAnomaly: false };
        if (record.isDoublon) map[record.entite].isDoublon = true;
        if (record.isAnomaly) map[record.entite].isAnomaly = true;
    });
    return map;
}

function getRealisationEntityDisplayLabel(entity, status) {
    const phrases = [];
    if (status?.isDoublon) phrases.push('DOUBLON');
    if (status?.isAnomaly) phrases.push('Anomalies de liaison');
    return phrases.length ? `${phrases.join(' — ')} — ${entity}` : entity;
}

function getRealisationYAxisTitle(level, individual = false) {
    const levelKey = String(level || '').toUpperCase();
    if (levelKey === 'DREN' || levelKey === 'CISCO' || levelKey === 'ZAP') {
        const config = getRealisationDimensionConfig(getRealisationSelectedDimension(levelKey));
        return individual ? `${config.label} des missions ${levelKey}` : `Code ${levelKey} : nom ${levelKey} - ${config.label}`;
    }
    return individual ? 'Missions de l’entité' : 'Entités et missions';
}

function updateRealisationDrenDimensionUi() {
    const dimension = getRealisationSelectedDimension('DREN');
    const config = getRealisationDimensionConfig(dimension);
    const caption = document.getElementById('real-dren-axis-caption');
    if (caption) caption.textContent = ['produit','activite'].includes(dimension)
        ? `${config.label} agrégé × somme des réalisations × somme des jours de réalisation × code DREN : nom DREN`
        : `Période début-fin × valeur de réalisation × code DREN : nom DREN - ${config.label}`;
    const heading = document.getElementById('real-detail-label-heading-dren');
    if (heading) heading.textContent = config.label;
    updateDrenAggregationModeUi();
}

function updateRealisationCiscoDimensionUi() {
    const dimension = getRealisationSelectedDimension('CISCO');
    const config = getRealisationDimensionConfig(dimension);
    const caption = document.getElementById('real-cisco-axis-caption');
    if (caption) caption.textContent = ['produit','activite'].includes(dimension)
        ? `${config.label} agrégé × somme des réalisations × somme des jours de réalisation × code CISCO : nom CISCO`
        : `Période début-fin × valeur de réalisation × code CISCO : nom CISCO - ${config.label}`;
    const heading = document.getElementById('real-detail-label-heading-cisco');
    if (heading) heading.textContent = config.label;
    updateCiscoAggregationModeUi();
}

function updateRealisationZapDimensionUi() {
    const dimension = getRealisationSelectedDimension('ZAP');
    const config = getRealisationDimensionConfig(dimension);
    const caption = document.getElementById('real-zap-axis-caption');
    if (caption) caption.textContent = ['produit','activite'].includes(dimension)
        ? `${config.label} agrégé × somme des réalisations × somme des jours de réalisation × code ZAP : nom ZAP`
        : `Période début-fin × valeur de réalisation × code ZAP : nom ZAP - ${config.label}`;
    const heading = document.getElementById('real-detail-label-heading-zap');
    if (heading) heading.textContent = config.label;
    updateZapAggregationModeUi();
}

function initRealisationDrenDimensionTabs() {
    const buttons = Array.from(document.querySelectorAll('[data-real-level-dimension="DREN"]'));
    if (!buttons.length) return;
    buttons.forEach(button => {
        if (button.dataset.realDimension === 'activite') {
            button.classList.add('active');
            button.setAttribute('aria-pressed', 'true');
        }
        button.addEventListener('click', () => {
            buttons.forEach(btn => {
                const active = btn === button;
                btn.classList.toggle('active', active);
                btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            });
            updateRealisationDrenDimensionUi();
            if (typeof window.runRealisationTemporel === 'function') window.runRealisationTemporel();
        });
    });
    updateRealisationDrenDimensionUi();
}

function initRealisationCiscoDimensionTabs() {
    const buttons = Array.from(document.querySelectorAll('[data-real-level-dimension="CISCO"]'));
    if (!buttons.length) return;
    buttons.forEach(button => {
        if (button.dataset.realDimension === 'activite') {
            button.classList.add('active');
            button.setAttribute('aria-pressed', 'true');
        }
        button.addEventListener('click', () => {
            buttons.forEach(btn => {
                const active = btn === button;
                btn.classList.toggle('active', active);
                btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            });
            updateRealisationCiscoDimensionUi();
            if (typeof window.runRealisationTemporel === 'function') window.runRealisationTemporel();
        });
    });
    updateRealisationCiscoDimensionUi();
}

function initRealisationZapDimensionTabs() {
    const buttons = Array.from(document.querySelectorAll('[data-real-level-dimension="ZAP"]'));
    if (!buttons.length) return;
    buttons.forEach(button => {
        if (button.dataset.realDimension === 'activite') {
            button.classList.add('active');
            button.setAttribute('aria-pressed', 'true');
        }
        button.addEventListener('click', () => {
            buttons.forEach(btn => {
                const active = btn === button;
                btn.classList.toggle('active', active);
                btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            });
            updateRealisationZapDimensionUi();
            if (typeof window.runRealisationTemporel === 'function') window.runRealisationTemporel();
        });
    });
    updateRealisationZapDimensionUi();
}

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
    const actCol = baseColsInfo.find(col => col.key === `activite${suffix}`);
    const prodCol = baseColsInfo.find(col => col.key === `produit${suffix}`);
    const subActCol = baseColsInfo.find(col => col.key === `sousActivite${suffix}`);
    const subProdCol = baseColsInfo.find(col => col.key === `sousProduit${suffix}`);
    const activiteBase = actCol ? cleanSpaces(getKoboValue(row, actCol.matches, actCol.ex, actCol.mustMatch)) : '';
    const produit = prodCol ? cleanSpaces(getKoboValue(row, prodCol.matches, prodCol.ex, prodCol.mustMatch)) : '';
    const sousActivite = subActCol ? cleanSpaces(getKoboValue(row, subActCol.matches, subActCol.ex, subActCol.mustMatch)) : '';
    const sousProduit = subProdCol ? cleanSpaces(getKoboValue(row, subProdCol.matches, subProdCol.ex, subProdCol.mustMatch)) : '';
    const validAct = valid(activiteBase);
    const validProd = valid(produit);
    const validSubAct = valid(sousActivite);
    const validSubProd = valid(sousProduit);
    return {
        niveau,
        entite,
        activiteBase: validAct ? activiteBase : 'Non spécifiée',
        produit: validProd ? produit : 'Non spécifié',
        sousActivite: validSubAct ? sousActivite : 'Non spécifiée',
        sousProduit: validSubProd ? sousProduit : 'Non spécifié',
        // Compatibilité avec le module de comparaison existant.
        activite: validSubAct ? sousActivite : (validAct ? activiteBase : 'Non spécifiée'),
        isAnomaly: !validSubAct
    };
}

function getRealisationsData() {

    const sourceRows = Array.isArray(allData) ? allData : [];
    // Une seule source de vérité pour les doublons : signature stricte +
    // chevauchement inclusif des périodes OM missionnaire.
    const duplicateAnalysis = buildMissionnaireDuplicateAnalysis(sourceRows);
    const rowToDuplicateDetails = duplicateAnalysis.rowToDuplicateDetails || {};
    const rowToDuplicateIssues = duplicateAnalysis.rowToIssues || {};
    const realData = [];
    sourceRows.forEach((row, rowIndex) => {
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
            activiteBase: entity.activiteBase,
            produit: entity.produit,
            sousActivite: entity.sousActivite,
            sousProduit: entity.sousProduit,
            valeur,
            // Les mêmes statuts que dans le tableau principal sont transportés
            // jusque dans les graphiques et tableaux de l'analyse des réalisations.
            isAnomaly: entity.isAnomaly,
            isDoublon: Array.isArray(rowToDuplicateDetails[rowIndex]) && rowToDuplicateDetails[rowIndex].length > 0,
            duplicateDetails: rowToDuplicateDetails[rowIndex] || [],
            duplicateIssues: rowToDuplicateIssues[rowIndex] || [],
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

function getRealisationSeries(byEntity, ranked, periodKeys, settings, profile, entityStatusMap = {}) {
    return ranked.map(([entity, total], index) => {
        const detailed = periodKeys.map(key => byEntity[entity]?.[key] || 0);
        const values = settings.mode === 'cumulative' ? cumulativeRealisationValues(detailed) : detailed;
        const displayEntity = getRealisationEntityDisplayLabel(entity, entityStatusMap[entity]);
        return { entity, displayEntity, total, values, dataset: createRealisationDataset(displayEntity, values, total, index, settings, profile), index };
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
            labels: series.map(item => item.displayEntity || item.entity),
            datasets: [{
                label: settings.mode === 'cumulative' ? 'Réalisations cumulées finales' : 'Total des réalisations',
                data: series.map(item => item.total),
                backgroundColor: colors,
                borderColor: series.map(item => getSubmissionTimelineColor(item.index, 1)),
                borderWidth: 1.5
            }]
        };
        legendItems = series.map((item, index) => ({ label: item.displayEntity || item.entity, color: colors[index], total: chartData.datasets[0].data[index] }));
        legendKind = 'data';
    } else {
        chartData = { labels, datasets: series.map(item => item.dataset) };
        legendItems = series.map(item => ({ label: item.displayEntity || item.entity, color: item.dataset.borderColor, total: item.total }));
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
        card.innerHTML = `<div class="realisation-individual-heading"><strong>${escapeRealisationHtml(item.displayEntity || item.entity)}</strong><span>Total : ${Number(item.total).toLocaleString('fr-FR')}</span></div>${getRealisationAxisBoundaryHtml(settings.axisStart, settings.axisEnd)}<div class="realisation-individual-canvas"><canvas></canvas></div>`;
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
        const area = chart.chartArea;
        const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
        const drawTag = (text, x, y, color, align = 'left', font = '600 9px Segoe UI') => {
            ctx.font = font;
            const paddingX = 4;
            const height = 15;
            const width = ctx.measureText(text).width + paddingX * 2;
            let left = align === 'right' ? x - width : (align === 'center' ? x - width / 2 : x);
            left = clamp(left, area.left + 2, chart.width - width - 4);
            const top = clamp(y - height / 2, area.top + 1, area.bottom - height - 1);
            ctx.fillStyle = 'rgba(255,255,255,.94)';
            ctx.fillRect(left, top, width, height);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.strokeRect(left, top, width, height);
            ctx.fillStyle = color;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.fillText(text, left + paddingX, top + height / 2 + .5);
        };

        ctx.save();
        chart.data.datasets.forEach((dataset, datasetIndex) => {
            if (!chart.isDatasetVisible(datasetIndex)) return;
            const meta = chart.getDatasetMeta(datasetIndex);
            meta.data.forEach((bar, dataIndex) => {
                const record = dataset._records?.[dataIndex];
                if (!record || !bar) return;
                const left = Math.min(bar.base, bar.x);
                const right = Math.max(bar.base, bar.x);
                const width = Math.max(0, right - left);
                const barHeight = Math.max(12, Number(bar.height) || 20);
                const color = dataset.borderColor || '#2c3e50';
                const startText = formatRealisationGanttDate(record.dateStart);
                const endText = formatRealisationGanttDate(record.dateEnd);
                const valueText = `Valeur : ${Number(record.valeur).toLocaleString('fr-FR')}`;

                // Les deux dates sont volontairement séparées verticalement afin
                // d'éviter leur superposition lorsque la période est courte.
                drawTag(startText, left, bar.y - barHeight / 2 - 10, color, 'left');
                drawTag(endText, right, bar.y + barHeight / 2 + 10, color, 'right');

                ctx.font = '700 11px Segoe UI';
                const valueWidth = ctx.measureText(valueText).width;
                if (width >= valueWidth + 18) {
                    ctx.fillStyle = '#ffffff';
                    ctx.textBaseline = 'middle';
                    ctx.textAlign = 'center';
                    ctx.fillText(valueText, left + width / 2, bar.y);
                } else {
                    const targetX = Math.min(chart.width - valueWidth - 12, right + 8);
                    drawTag(valueText, targetX, bar.y, color, 'left', '700 10px Segoe UI');
                }

                // Affichage explicite des statuts demandé pour les graphiques.
                // Ils sont positionnés sur une ligne propre, au-dessus de la date
                // de début, afin d'éviter toute superposition avec valeur/dates.
                const statusPhrases = getRealisationStatusPhrases(record);
                if (statusPhrases.length) {
                    const statusText = statusPhrases.join(' — ');
                    drawTag(statusText, left, bar.y - barHeight / 2 - 30, '#b42318', 'left', '700 10px Segoe UI');
                }
            });
        });
        ctx.restore();
    }
};


function getRealisationInclusiveDuration(record) {
    if (!(record?.dateStart instanceof Date) || !(record?.dateEnd instanceof Date)) return null;
    if (Number.isNaN(record.dateStart.getTime()) || Number.isNaN(record.dateEnd.getTime())) return null;
    return Math.max(1, Math.floor((record.dateEnd.getTime() - record.dateStart.getTime()) / 86400000) + 1);
}



function getRealisationAggregationCompositionItems(record, dimension) {
    if (!record) return [];
    if (dimension === 'produit') {
        return (Array.isArray(record.components) ? record.components : []).map((item, index) => ({
            index: index + 1,
            type: 'Sous Activité',
            label: cleanSpaces(item?.sousActivite || item?.activite || 'Sous Activité non spécifiée'),
            valeur: Number(item?.valeur || 0),
            jours: Number(getRealisationInclusiveDuration(item) || 0),
            status: getRealisationStatusPhrases(item)
        }));
    }
    return (Array.isArray(record.products) ? record.products : []).map((item, index) => ({
        index: index + 1,
        type: 'Produit',
        label: cleanSpaces(item?.produit || 'Produit non spécifié'),
        valeur: Number(item?.valeur || 0),
        jours: Number(item?.totalDays || 0),
        sourceCount: Array.isArray(item?.components) ? item.components.length : 0,
        status: getRealisationStatusPhrases(item),
        subActivities: (Array.isArray(item?.components) ? item.components : []).map((source, subIndex) => ({
            index: `${index + 1}.${subIndex + 1}`,
            label: cleanSpaces(source?.sousActivite || source?.activite || 'Sous Activité non spécifiée'),
            valeur: Number(source?.valeur || 0),
            jours: Number(getRealisationInclusiveDuration(source) || 0),
            status: getRealisationStatusPhrases(source)
        }))
    }));
}

function getRealisationAggregationCompositionText(record, dimension) {
    const items = getRealisationAggregationCompositionItems(record, dimension);
    const typeLabel = dimension === 'produit' ? 'Sous Activité' : 'Produit';
    const plural = items.length > 1 ? `${typeLabel}s` : typeLabel;
    if (!items.length) return `Aucun ${typeLabel} source identifié`;

    if (dimension === 'activite') {
        const detail = items.map(item => {
            const statusNote = item.status?.length ? ` ; ${item.status.join(' / ')}` : '';
            const sourceLabel = `${item.sourceCount} Sous Activité${item.sourceCount > 1 ? 's' : ''}`;
            const nested = (item.subActivities || []).map(sub => {
                const subStatus = sub.status?.length ? ` ; ${sub.status.join(' / ')}` : '';
                return `${sub.index}. ${sub.label} = ${sub.valeur.toLocaleString('fr-FR')} · ${sub.jours} jour${sub.jours > 1 ? 's' : ''}${subStatus}`;
            }).join(' ; ');
            return `${item.index}. ${item.label} = ${item.valeur.toLocaleString('fr-FR')} · ${item.jours} jour${item.jours > 1 ? 's' : ''} · ${sourceLabel}${statusNote}${nested ? ` : ${nested}` : ''}`;
        }).join(' ; ');
        return `${items.length} ${plural} réellement additionné${items.length > 1 ? 's' : ''} : ${detail}`;
    }

    const detail = items.map(item => {
        const statusNote = item.status?.length ? ` ; ${item.status.join(' / ')}` : '';
        return `${item.index}. ${item.label} = ${item.valeur.toLocaleString('fr-FR')} · ${item.jours} jour${item.jours > 1 ? 's' : ''}${statusNote}`;
    }).join(' ; ');
    return `${items.length} ${plural} réellement additionné${items.length > 1 ? 's' : ''} : ${detail}`;
}

function getRealisationAggregationCompositionHtml(record, dimension) {
    const items = getRealisationAggregationCompositionItems(record, dimension);
    const typeLabel = dimension === 'produit' ? 'Sous Activité' : 'Produit';
    const plural = items.length > 1 ? `${typeLabel}s` : typeLabel;
    if (!items.length) return `<span class="text-muted">Aucun ${escapeRealisationHtml(typeLabel)} source identifié</span>`;

    if (dimension === 'activite') {
        const details = items.map(item => {
            const status = item.status?.length
                ? ` · <strong class="text-danger">${escapeRealisationHtml(item.status.join(' / '))}</strong>`
                : '';
            const nested = (item.subActivities || []).map(sub => {
                const subStatus = sub.status?.length
                    ? ` · <strong class="text-danger">${escapeRealisationHtml(sub.status.join(' / '))}</strong>`
                    : '';
                return `<div class="realisation-composition-subitem"><strong>${escapeRealisationHtml(sub.index)}.</strong> ${escapeRealisationHtml(sub.label)} <span>= <strong>${sub.valeur.toLocaleString('fr-FR')}</strong> · ${sub.jours} jour${sub.jours > 1 ? 's' : ''}</span>${subStatus}</div>`;
            }).join('');
            return `<div class="realisation-composition-item realisation-composition-product"><strong>${item.index}.</strong> ${escapeRealisationHtml(item.label)} <span>= <strong>${item.valeur.toLocaleString('fr-FR')}</strong> · ${item.jours} jour${item.jours > 1 ? 's' : ''} · ${item.sourceCount} Sous Activité${item.sourceCount > 1 ? 's' : ''}</span>${status}${nested ? `<div class="realisation-composition-subitems">${nested}</div>` : ''}</div>`;
        }).join('');
        return `<div class="realisation-composition-detail"><div class="fw-bold mb-1">${items.length} ${escapeRealisationHtml(plural)} réellement additionné${items.length > 1 ? 's' : ''} :</div>${details}</div>`;
    }

    const details = items.map(item => {
        const status = item.status?.length
            ? ` · <strong class="text-danger">${escapeRealisationHtml(item.status.join(' / '))}</strong>`
            : '';
        return `<div class="realisation-composition-item"><strong>${item.index}.</strong> ${escapeRealisationHtml(item.label)} <span>= <strong>${item.valeur.toLocaleString('fr-FR')}</strong> · ${item.jours} jour${item.jours > 1 ? 's' : ''}</span>${status}</div>`;
    }).join('');
    return `<div class="realisation-composition-detail"><div class="fw-bold mb-1">${items.length} ${escapeRealisationHtml(plural)} réellement additionné${items.length > 1 ? 's' : ''} :</div>${details}</div>`;
}

const drenAggregationDetailStore = new Map();
let drenAggregationCurrentIds = [];
let drenLastRawDisplayedRecords = [];
let drenAggregationPopupCharts = [];

function destroyDrenAggregationPopupCharts() {
    (drenAggregationPopupCharts || []).forEach(chart => {
        try { chart?.destroy?.(); } catch (_) {}
    });
    drenAggregationPopupCharts = [];
}

function isDrenHierarchicalAggregationMode(level = 'DREN') {
    return String(level || '').toUpperCase() === 'DREN' && ['produit','activite'].includes(getRealisationSelectedDimension('DREN'));
}
function makeDrenAggregationId(prefix, entity, label) { return `${prefix}_${normalizeRealisationKey(entity).slice(0,60)}_${normalizeRealisationKey(label).slice(0,90)}`; }
function makeDrenProductAggregate(entity, activity, product, components) {
    const rows=[...components].sort((a,b)=>(a.dateStart?.getTime()||0)-(b.dateStart?.getTime()||0));
    return {id:makeDrenAggregationId('produit',entity,`${activity}|${product}`),niveau:'DREN',entite:entity,activiteBase:activity,produit:product,sousActivite:'Agrégation des Sous Activités',sousProduit:'—',activite:product,valeur:rows.reduce((s,r)=>s+Number(r.valeur||0),0),totalDays:sumRealisationDays(rows),isAggregate:true,aggregationDimension:'produit',components:rows,componentCount:rows.length,isAnomaly:rows.some(r=>r.isAnomaly),isDoublon:rows.some(r=>r.isDoublon)};
}
function aggregateDrenRealisationRecords(records, dimension) {
    const source=(records||[]).filter(r=>r.niveau==='DREN');
    const pg=new Map();
    source.forEach(r=>{const e=cleanSpaces(r.entite||'DREN inconnue'),a=cleanSpaces(r.activiteBase||'Activité non spécifiée'),p=cleanSpaces(r.produit||'Produit non spécifié'),k=`${e}\u241f${a}\u241f${p}`;if(!pg.has(k))pg.set(k,{e,a,p,rows:[]});pg.get(k).rows.push(r);});
    const products=[...pg.values()].map(g=>makeDrenProductAggregate(g.e,g.a,g.p,g.rows));
    if(dimension==='produit') return products;
    const ag=new Map();
    products.forEach(p=>{const k=`${p.entite}\u241f${p.activiteBase}`;if(!ag.has(k))ag.set(k,{e:p.entite,a:p.activiteBase,products:[]});ag.get(k).products.push(p);});
    return [...ag.values()].map(g=>{const leaves=g.products.flatMap(p=>p.components||[]);return {id:makeDrenAggregationId('activite',g.e,g.a),niveau:'DREN',entite:g.e,activiteBase:g.a,produit:'Agrégation des Produits',sousActivite:'Agrégation hiérarchique',sousProduit:'—',activite:g.a,valeur:g.products.reduce((s,p)=>s+Number(p.valeur||0),0),totalDays:g.products.reduce((s,p)=>s+Number(p.totalDays||0),0),isAggregate:true,aggregationDimension:'activite',products:g.products,components:leaves,componentCount:g.products.length,isAnomaly:leaves.some(r=>r.isAnomaly),isDoublon:leaves.some(r=>r.isDoublon)};});
}
function getDrenAggregateLabel(r) { const label=r.aggregationDimension==='activite'?r.activiteBase:r.produit,status=getRealisationStatusPhrases(r),base=`${r.entite} - ${label}`; return status.length?`${status.join(' — ')} — ${base}`:base; }
function getDrenAggregateFormulaText(r) { if(!r)return'';if(r.aggregationDimension==='produit'){const t=(r.components||[]).map(x=>Number(x.valeur||0).toLocaleString('fr-FR'));return `Réalisations du PRODUIT = ${t.join(' + ')} = ${Number(r.valeur||0).toLocaleString('fr-FR')}`;}const t=(r.products||[]).map(x=>Number(x.valeur||0).toLocaleString('fr-FR'));return `Réalisations de l’ACTIVITÉ = ${t.join(' + ')} = ${Number(r.valeur||0).toLocaleString('fr-FR')}`; }
function registerDrenAggregationDetails(rows){drenAggregationDetailStore.clear();drenAggregationCurrentIds=[];(rows||[]).forEach(r=>{drenAggregationDetailStore.set(r.id,r);drenAggregationCurrentIds.push(r.id);});}
function formatDrenComponentDate(d){return d instanceof Date&&!Number.isNaN(d.getTime())?formatRealisationGanttDate(d):'Non renseignée';}
function getDrenPopupSourceRows(aggregate) {
    if (!aggregate) return [];
    const rows = Array.isArray(aggregate.components) ? aggregate.components : [];
    return rows
        .filter(row => row && row.dateStart instanceof Date && row.dateEnd instanceof Date && !Number.isNaN(row.dateStart.getTime()) && !Number.isNaN(row.dateEnd.getTime()))
        .sort((a, b) => (a.dateStart.getTime() - b.dateStart.getTime()) || String(a.sousActivite || '').localeCompare(String(b.sousActivite || ''), 'fr'));
}

function getDrenPopupRowLabel(row, aggregate, index) {
    const status = getRealisationStatusPhrases(row);
    const product = cleanSpaces(row?.produit || aggregate?.produit || 'Produit non spécifié');
    const subActivity = cleanSpaces(row?.sousActivite || row?.activite || 'Sous Activité non spécifiée');
    const prefix = status.length ? `${status.join(' — ')} — ` : '';
    return `${prefix}${row?.entite || aggregate?.entite || 'DREN inconnue'} — ${product} — ${subActivity} — Mission ${index + 1}`;
}

function buildDrenPopupChartHtml(r, popupIndex) {
    const sourceRows = getDrenPopupSourceRows(r);
    if (!sourceRows.length) return '<div class="alert alert-warning">Aucune période début-fin complète n’est disponible pour dessiner le graphique détaillé.</div>';
    const starts = sourceRows.map(row => row.dateStart.getTime());
    const ends = sourceRows.map(row => row.dateEnd.getTime());
    const minDate = new Date(Math.min(...starts));
    const maxDate = new Date(Math.max(...ends));
    const totalValue = sourceRows.reduce((sum, row) => sum + Number(row.valeur || 0), 0);
    const totalDays = sourceRows.reduce((sum, row) => sum + Number(getRealisationInclusiveDuration(row) || 0), 0);
    return `<section class="dren-popup-chart-card" data-dren-popup-index="${popupIndex}">
        <div class="dren-popup-chart-heading">
            <div>
                <h6 class="mb-1"><i class="fas fa-chart-gantt"></i> Réalisations des DREN — Détail des réalisations sources</h6>
                <small>Axe X : dates de réalisation · Axe Y : code DREN : nom DREN - Produit - Sous Activité. Chaque barre correspond à une réalisation source.</small>
            </div>
        </div>
        <div class="dren-popup-metrics">
            <span><strong>Date de début minimale :</strong> ${formatRealisationGanttDate(minDate)}</span>
            <span><strong>Date de fin maximale :</strong> ${formatRealisationGanttDate(maxDate)}</span>
            <span><strong>Réalisation totale :</strong> ${Number(totalValue).toLocaleString('fr-FR')}</span>
            <span><strong>Jours cumulés :</strong> ${Number(totalDays).toLocaleString('fr-FR')} jour(s)</span>
        </div>
        <div class="dren-popup-chart-scroll">
            <div class="dren-popup-chart-stage" id="dren-popup-stage-${popupIndex}">
                <canvas id="dren-popup-chart-${popupIndex}"></canvas>
            </div>
        </div>
        <div class="small text-muted mt-2"><i class="fas fa-info-circle"></i> Les dates affichées ici sont celles des réalisations élémentaires. Elles servent à expliquer le calcul agrégé ; elles ne sont pas transformées en une fausse période continue.</div>
    </section>`;
}

function buildDrenAggregationDetailHtml(r, popupIndex = 0) {
    if (!r) return '<p>Détail indisponible.</p>';
    const label = r.aggregationDimension === 'activite' ? r.activiteBase : r.produit;
    const kind = r.aggregationDimension === 'activite' ? 'Activité' : 'Produit';
    const statusBadges = getRealisationStatusPhrases(r).map(status => `<span class="badge bg-danger me-1">${escapeRealisationHtml(status)}</span>`).join('');
    let h = `<article class="dren-popup-aggregate-block" data-aggregate-id="${escapeRealisationHtml(r.id)}">
        <div class="dren-aggregation-summary-card">
            <div class="d-flex flex-wrap align-items-center gap-2 mb-1"><span class="dren-aggregation-badge">${kind}</span>${statusBadges}</div>
            <h5 class="mt-2 mb-2">${escapeRealisationHtml(r.entite)} — ${escapeRealisationHtml(label)}</h5>
            <div class="row g-2 dren-popup-summary-grid">
                <div class="col-md-3"><strong>Réalisation totale :</strong><br><span class="dren-popup-big-number">${Number(r.valeur || 0).toLocaleString('fr-FR')}</span></div>
                <div class="col-md-3"><strong>Jours de réalisation :</strong><br><span class="dren-popup-big-number">${Number(r.totalDays || 0).toLocaleString('fr-FR')}</span></div>
                <div class="col-md-3"><strong>Sources élémentaires :</strong><br><span class="dren-popup-big-number">${Number(r.components?.length || 0).toLocaleString('fr-FR')}</span></div>
                <div class="col-md-3"><strong>Statut :</strong><br>${statusBadges || '<span class="badge bg-success">Valide</span>'}</div>
            </div>
            <div class="dren-aggregation-formula mt-3"><strong>Formule appliquée :</strong> ${escapeRealisationHtml(getDrenAggregateFormulaText(r))}</div>
        </div>
        ${buildDrenPopupChartHtml(r, popupIndex)}`;

    if (r.aggregationDimension === 'produit') {
        h += `<h6 class="mt-3"><i class="fas fa-list-ul"></i> Sous Activités composant ce Produit</h6>
        <div class="table-responsive dren-popup-table-scroll"><table class="table table-sm table-bordered table-striped dren-aggregation-component-table align-middle">
        <thead><tr><th>#</th><th>DREN</th><th>Produit</th><th>Sous Activité</th><th>Date début</th><th>Date fin</th><th>Jours</th><th>Réalisation</th><th>Anomalies de liaison</th><th>DOUBLON</th></tr></thead><tbody>`;
        (r.components || []).forEach((x, i) => {
            h += `<tr>
                <td>${i + 1}</td>
                <td>${escapeRealisationHtml(x.entite || r.entite)}</td>
                <td>${escapeRealisationHtml(x.produit || r.produit)}</td>
                <td>${escapeRealisationHtml(x.sousActivite || x.activite || 'Non spécifiée')}</td>
                <td class="text-nowrap">${formatDrenComponentDate(x.dateStart)}</td>
                <td class="text-nowrap">${formatDrenComponentDate(x.dateEnd)}</td>
                <td class="text-end">${Number(getRealisationInclusiveDuration(x) || 0)}</td>
                <td class="text-end fw-bold">${Number(x.valeur || 0).toLocaleString('fr-FR')}</td>
                <td>${x.isAnomaly ? '<span class="badge bg-danger">Anomalies de liaison</span>' : '<span class="badge bg-success">Aucune</span>'}</td>
                <td>${x.isDoublon ? '<span class="badge bg-danger">DOUBLON</span>' : '<span class="badge bg-success">Mission distincte</span>'}</td>
            </tr>`;
        });
        h += `</tbody><tfoot><tr class="fw-bold"><td colspan="6">TOTAL PRODUIT</td><td class="text-end">${Number(r.totalDays || 0)}</td><td class="text-end">${Number(r.valeur || 0).toLocaleString('fr-FR')}</td><td colspan="2"></td></tr></tfoot></table></div>`;
    } else {
        h += `<h6 class="mt-3"><i class="fas fa-boxes"></i> Produits composant cette Activité</h6>
        <div class="table-responsive dren-popup-table-scroll"><table class="table table-sm table-bordered table-striped dren-aggregation-component-table align-middle">
        <thead><tr><th>#</th><th>Produit</th><th>Sous Activités</th><th>Jours</th><th>Réalisation Produit</th><th>Formule</th><th>Statut</th></tr></thead><tbody>`;
        (r.products || []).forEach((p, i) => {
            h += `<tr><td>${i + 1}</td><td>${escapeRealisationHtml(p.produit)}</td><td class="text-end">${p.components?.length || 0}</td><td class="text-end">${Number(p.totalDays || 0)}</td><td class="text-end fw-bold">${Number(p.valeur || 0).toLocaleString('fr-FR')}</td><td><code>${escapeRealisationHtml(getDrenAggregateFormulaText(p))}</code></td><td>${escapeRealisationHtml(getRealisationStatusText(p, 'Valide'))}</td></tr>`;
        });
        h += `</tbody><tfoot><tr class="fw-bold"><td colspan="3">TOTAL ACTIVITÉ</td><td class="text-end">${Number(r.totalDays || 0)}</td><td class="text-end">${Number(r.valeur || 0).toLocaleString('fr-FR')}</td><td colspan="2"></td></tr></tfoot></table></div>
        <div class="alert alert-light border">Chaque Produit est lui-même calculé comme la somme de ses Sous Activités. Le graphique détaillé ci-dessus montre toutes les réalisations élémentaires qui expliquent le total de l’Activité.</div>`;
    }
    return `${h}</article>`;
}

function renderDrenAggregationPopupChart(aggregate, popupIndex) {
    const canvas = document.getElementById(`dren-popup-chart-${popupIndex}`);
    const stage = document.getElementById(`dren-popup-stage-${popupIndex}`);
    if (!canvas || !stage || !aggregate) return null;
    const rows = getDrenPopupSourceRows(aggregate);
    if (!rows.length) return null;
    const starts = rows.map(row => row.dateStart.getTime());
    const ends = rows.map(row => row.dateEnd.getTime());
    const axisStart = new Date(Math.min(...starts));
    const axisEnd = new Date(Math.max(...ends));
    const spanDays = Math.max(1, Math.ceil((axisEnd.getTime() - axisStart.getTime()) / 86400000) + 1);
    const stageWidth = Math.min(18000, Math.max(1180, 780 + spanDays * 34));
    const stageHeight = Math.min(18000, Math.max(470, 200 + rows.length * 96));
    stage.style.width = `${stageWidth}px`;
    stage.style.minWidth = `${stageWidth}px`;
    stage.style.height = `${stageHeight}px`;

    const dataset = {
        label: aggregate.entite || 'DREN',
        data: rows.map(row => [row.dateStart.getTime(), row.dateEnd.getTime()]),
        _records: rows,
        backgroundColor: 'rgba(243, 156, 18, .72)',
        borderColor: 'rgba(211, 84, 0, 1)',
        borderWidth: 1.5,
        borderSkipped: false,
        borderRadius: 5,
        minBarLength: 4,
        barPercentage: .46,
        categoryPercentage: .68
    };
    const boundaryValues = collectRealisationGanttBoundaryValues(rows, axisStart, axisEnd);
    const chart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: { labels: rows.map((row, index) => getDrenPopupRowLabel(row, aggregate, index)), datasets: [dataset] },
        plugins: [realisationGanttLabelsPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            normalized: true,
            indexAxis: 'y',
            interaction: { mode: 'nearest', axis: 'y', intersect: true },
            layout: { padding: { right: 220, top: 30, bottom: 48, left: 10 } },
            plugins: {
                legend: { display: true, position: 'top', labels: { usePointStyle: true, boxWidth: 10 } },
                realisationGanttLabelsPlugin: { enabled: true },
                tooltip: {
                    callbacks: {
                        title: items => {
                            const row = rows[items?.[0]?.dataIndex];
                            return row ? row.entite : 'Réalisation DREN';
                        },
                        label: context => {
                            const row = rows[context.dataIndex];
                            return row ? [
                                `Produit : ${row.produit || aggregate.produit || 'Non spécifié'}`,
                                `Sous Activité : ${row.sousActivite || row.activite || 'Non spécifiée'}`,
                                `Début : ${formatDrenComponentDate(row.dateStart)}`,
                                `Fin : ${formatDrenComponentDate(row.dateEnd)}`,
                                `Durée : ${Number(getRealisationInclusiveDuration(row) || 0)} jour(s)`,
                                `Réalisation : ${Number(row.valeur || 0).toLocaleString('fr-FR')}`,
                                `Statut : ${getRealisationStatusText(row, 'Valide')}`
                            ] : [];
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    min: axisStart.getTime(),
                    max: axisEnd.getTime(),
                    title: { display: true, text: 'Période de réalisation OM missionnaire (date début → date fin)', font: { weight: 'bold' } },
                    afterBuildTicks: scale => {
                        const values = new Set(boundaryValues.map(Number));
                        scale.ticks.forEach(tick => values.add(Number(tick.value)));
                        values.add(axisStart.getTime());
                        values.add(axisEnd.getTime());
                        scale.ticks = [...values].filter(Number.isFinite).sort((a, b) => a - b).map(value => ({ value }));
                    },
                    ticks: { autoSkip: false, maxRotation: 55, minRotation: 55, padding: 8, callback: value => formatRealisationGanttDate(value) },
                    grid: { color: 'rgba(67, 96, 78, .12)' }
                },
                y: {
                    title: { display: true, text: 'Code DREN : nom DREN - Produit - Sous Activité', font: { weight: 'bold' } },
                    ticks: { autoSkip: false, padding: 8, font: { size: rows.length > 16 ? 9 : 10, lineHeight: 1.15 }, callback: function(value) { return wrapRealisationGanttAxisLabel(this.getLabelForValue(value), false); } },
                    grid: { display: false }
                }
            }
        }
    });
    drenAggregationPopupCharts.push(chart);
    return chart;
}

function renderDrenAggregationPopupCharts(rows) {
    destroyDrenAggregationPopupCharts();
    (rows || []).forEach((aggregate, index) => renderDrenAggregationPopupChart(aggregate, index));
}

window.openDrenAggregationDetails = function(id = null) {
    const body = document.getElementById('drenAggregationDetailsModalBody');
    if (!body) return;
    const rows = id ? [drenAggregationDetailStore.get(id)].filter(Boolean) : drenAggregationCurrentIds.map(key => drenAggregationDetailStore.get(key)).filter(Boolean);
    destroyDrenAggregationPopupCharts();
    body.innerHTML = rows.length
        ? rows.map((row, index) => buildDrenAggregationDetailHtml(row, index)).join('')
        : '<p class="text-muted mb-0">Sélectionnez l’onglet Produit ou Activité afin d’afficher la décomposition de la formule.</p>';
    const element = document.getElementById('drenAggregationDetailsModal');
    if (element && window.bootstrap?.Modal) {
        const modal = bootstrap.Modal.getOrCreateInstance(element);
        modal.show();
        window.setTimeout(() => renderDrenAggregationPopupCharts(rows), 180);
    } else {
        renderDrenAggregationPopupCharts(rows);
    }
};

window.openDrenRawRealisationDetails = function(id, index) {
    const r = drenLastRawDisplayedRecords[Number(index)] || drenLastRawDisplayedRecords.find(x => String(x.id || '') === String(id || ''));
    const body = document.getElementById('drenAggregationDetailsModalBody');
    if (!body) return;
    destroyDrenAggregationPopupCharts();
    if (!r) {
        body.innerHTML = '<p>Détail indisponible.</p>';
    } else {
        const synthetic = {
            id: `raw_${r.id || index}`,
            aggregationDimension: 'produit',
            niveau: 'DREN',
            entite: r.entite,
            activiteBase: r.activiteBase,
            produit: r.produit,
            valeur: Number(r.valeur || 0),
            totalDays: Number(getRealisationInclusiveDuration(r) || 0),
            components: [r],
            isAnomaly: !!r.isAnomaly,
            isDoublon: !!r.isDoublon
        };
        body.innerHTML = `<div class="dren-aggregation-summary-card"><span class="dren-aggregation-badge">Réalisation élémentaire</span><h5 class="mt-2">${escapeRealisationHtml(r.entite)} — ${escapeRealisationHtml(getRealisationDimensionValue(r, 'DREN'))}</h5><div><strong>Début :</strong> ${formatDrenComponentDate(r.dateStart)} &nbsp; | &nbsp; <strong>Fin :</strong> ${formatDrenComponentDate(r.dateEnd)} &nbsp; | &nbsp; <strong>Durée :</strong> ${Number(getRealisationInclusiveDuration(r) || 0)} jour(s) &nbsp; | &nbsp; <strong>Réalisation :</strong> ${Number(r.valeur || 0).toLocaleString('fr-FR')}</div><div class="mt-2"><strong>Statut :</strong> ${escapeRealisationHtml(getRealisationStatusText(r, 'Valide'))}</div></div>${buildDrenPopupChartHtml(synthetic, 0)}`;
        const element = document.getElementById('drenAggregationDetailsModal');
        if (element && window.bootstrap?.Modal) {
            const modal = bootstrap.Modal.getOrCreateInstance(element);
            modal.show();
            window.setTimeout(() => { destroyDrenAggregationPopupCharts(); renderDrenAggregationPopupChart(synthetic, 0); }, 180);
            return;
        }
        renderDrenAggregationPopupChart(synthetic, 0);
    }
    const element = document.getElementById('drenAggregationDetailsModal');
    if (element && window.bootstrap?.Modal) bootstrap.Modal.getOrCreateInstance(element).show();
};

function restoreDrenDetailTableHeadings(){const d=getRealisationSelectedDimension('DREN'),h=document.getElementById('real-detail-label-heading-dren'),s=document.getElementById('real-detail-start-heading-dren'),e=document.getElementById('real-detail-end-heading-dren');if(h)h.textContent=getRealisationDimensionConfig(d).label;if(s)s.textContent='Date de début de la réalisation';if(e)e.textContent='Date de fin de la réalisation';}
function updateDrenAggregationModeUi(){const d=getRealisationSelectedDimension('DREN'),agg=['produit','activite'].includes(d),card=document.getElementById('real-scroll-dren')?.closest('.realisation-level-card'),btn=document.getElementById('real-dren-details-button'),help=document.getElementById('real-dren-aggregation-help'),bounds=document.getElementById('real-axis-boundaries-dren');if(card)card.classList.toggle('real-dren-aggregate-mode',agg);if(btn)btn.classList.toggle('d-none',!agg);if(help)help.classList.toggle('d-none',!agg);if(bounds){if(agg)bounds.innerHTML=`<span class="realisation-axis-boundary"><i class="fas fa-calculator"></i> <strong>${d==='produit'?'Produit = somme des Sous Activités':'Activité = somme des Produits'}</strong></span><span class="realisation-axis-boundary">Axe X : <strong>nombre total de jours de réalisation</strong></span>`;else if(!document.getElementById('real-axis-start-dren'))bounds.innerHTML=`<span class="realisation-axis-boundary realisation-axis-boundary-start"><i class="fas fa-play-circle"></i> Date de début minimale : <strong id="real-axis-start-dren">—</strong></span><span class="realisation-axis-boundary realisation-axis-boundary-end">Date de fin maximale : <strong id="real-axis-end-dren">—</strong> <i class="fas fa-flag-checkered"></i></span>`;}if(!agg)restoreDrenDetailTableHeadings();}
const drenAggregationLabelsPlugin={id:'drenAggregationLabelsPlugin',afterDatasetsDraw(chart){if(!chart?.chartArea)return;const meta=chart.getDatasetMeta(0),rows=chart.data?.datasets?.[0]?._aggregates||[],ctx=chart.ctx;ctx.save();meta.data.forEach((bar,i)=>{const r=rows[i];if(!r||!bar)return;const l=Math.min(bar.base,bar.x),rr=Math.max(bar.base,bar.x),v=`Réalisation totale : ${Number(r.valeur||0).toLocaleString('fr-FR')}`,days=`${Number(r.totalDays||0)} jour(s)`;ctx.font='700 11px Segoe UI';ctx.textBaseline='middle';const w=ctx.measureText(v).width;if(rr-l>w+18){ctx.fillStyle='#fff';ctx.textAlign='center';ctx.fillText(v,l+(rr-l)/2,bar.y);}else{ctx.fillStyle='#0f5132';ctx.textAlign='left';ctx.fillText(v,rr+8,bar.y-7);}ctx.font='700 10px Segoe UI';ctx.fillStyle='#0f5132';ctx.textAlign='left';ctx.fillText(days,rr+8,bar.y+9);});ctx.restore();}};
function createDrenAggregatedDurationChart(canvas,stage,aggregates){const rows=[...aggregates].sort((a,b)=>String(a.entite).localeCompare(String(b.entite),'fr')||getDrenAggregateLabel(a).localeCompare(getDrenAggregateLabel(b),'fr')),maxDays=Math.max(1,...rows.map(r=>Number(r.totalDays||0))),w=Math.max(1180,760+Math.min(80,rows.length)*26),h=Math.max(470,190+rows.length*72);stage.classList.add('realisation-gantt-stage');stage.style.width=`${w}px`;stage.style.minWidth=`${w}px`;stage.style.height=`${h}px`;const ds={label:'Jours de réalisation',data:rows.map(r=>r.totalDays),_aggregates:rows,backgroundColor:'rgba(25, 135, 84, .72)',borderColor:'rgba(25, 135, 84, 1)',borderWidth:1.5,borderRadius:5,borderSkipped:false,barPercentage:.52,categoryPercentage:.7},d=getRealisationSelectedDimension('DREN'),cfg=getRealisationDimensionConfig(d),chart=new Chart(canvas.getContext('2d'),{type:'bar',data:{labels:rows.map(getDrenAggregateLabel),datasets:[ds]},plugins:[drenAggregationLabelsPlugin],options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',layout:{padding:{right:230,top:20,bottom:25,left:10}},plugins:{legend:{display:false},tooltip:{callbacks:{title:items=>rows[items?.[0]?.dataIndex]?.entite||'DREN',label:ctx=>{const r=rows[ctx.dataIndex];return [`${cfg.label} : ${d==='activite'?r.activiteBase:r.produit}`,`Réalisation totale : ${Number(r.valeur||0).toLocaleString('fr-FR')}`,`Jours de réalisation : ${Number(r.totalDays||0)}`,getDrenAggregateFormulaText(r),getRealisationAggregationCompositionText(r, d),'Détails complets : bouton « Afficher les Détails »'];}}}},scales:{x:{beginAtZero:true,suggestedMax:Math.ceil(maxDays*1.2),title:{display:true,text:'Nombre total de jours de réalisation (somme des durées inclusives)',font:{weight:'bold'}},ticks:{precision:0}},y:{title:{display:true,text:`Code DREN : nom DREN - ${cfg.label}`,font:{weight:'bold'}},ticks:{autoSkip:false,font:{size:10},callback:function(v){return wrapRealisationGanttAxisLabel(this.getLabelForValue(v),false);}},grid:{display:false}}}}});realisationTimelineChartsRefs.DREN.push({chart,name:`dren_${d}_agregation_hierarchique`});return chart;}
function renderDrenAggregatedDetailTable(rows,d) {
    const section = document.getElementById('real-detail-section-dren');
    const tbody = document.getElementById('real-detail-table-dren');
    const count = document.getElementById('real-detail-count-dren');
    const total = document.getElementById('real-detail-total-dren');
    const cfg = getRealisationDimensionConfig(d);
    const h = document.getElementById('real-detail-label-heading-dren');
    const sh = document.getElementById('real-detail-start-heading-dren');
    const eh = document.getElementById('real-detail-end-heading-dren');
    if (!section || !tbody) return;
    section.classList.toggle('d-none', !rows.length);
    if (count) count.textContent = rows.length.toLocaleString('fr-FR');
    if (total) total.textContent = rows.reduce((s,r) => s + Number(r.valeur || 0), 0).toLocaleString('fr-FR');
    if (h) h.textContent = cfg.label;
    if (sh) sh.textContent = 'Type de calcul';
    if (eh) eh.textContent = 'Composition détaillée';
    tbody.innerHTML = rows.map((r,i) => {
        const label = d === 'activite' ? r.activiteBase : r.produit;
        const compositionHtml = getRealisationAggregationCompositionHtml(r, d);
        return `<tr>
            <td class="text-center fw-bold">${i+1}</td>
            <td class="text-center"><span class="badge bg-secondary">DREN</span></td>
            <td class="fw-semibold">${escapeRealisationHtml(r.entite)}</td>
            <td>${escapeRealisationHtml(label)}</td>
            <td class="text-center">Agrégation hiérarchique</td>
            <td class="realisation-composition-cell">${compositionHtml}</td>
            <td class="text-end fw-bold">${Number(r.totalDays||0)} jour(s)</td>
            <td class="text-end fw-bold text-success">${Number(r.valeur||0).toLocaleString('fr-FR')}</td>
            <td class="text-center">—</td>
            <td class="text-center">—</td>
            <td class="text-center">${r.components?.length||0} source(s)</td>
            <td class="text-center">${r.isAnomaly?'<span class="badge bg-danger">Anomalies de liaison</span>':'<span class="badge bg-success">Aucune</span>'}</td>
            <td class="text-center">${r.isDoublon?'<span class="badge bg-danger">DOUBLON</span>':'<span class="badge bg-success">Mission distincte</span>'}</td>
            <td class="text-center"><button type="button" class="btn btn-success btn-sm fw-bold" onclick="window.openDrenAggregationDetails('${escapeRealisationHtml(r.id)}')"><i class="fas fa-search-plus"></i> Afficher les Détails</button></td>
        </tr>`;
    }).join('');
}





const ciscoAggregationDetailStore = new Map();
let ciscoAggregationCurrentIds = [];
let ciscoLastRawDisplayedRecords = [];
let ciscoAggregationPopupCharts = [];

function destroyCiscoAggregationPopupCharts() {
    (ciscoAggregationPopupCharts || []).forEach(chart => {
        try { chart?.destroy?.(); } catch (_) {}
    });
    ciscoAggregationPopupCharts = [];
}

function isCiscoHierarchicalAggregationMode(level = 'CISCO') {
    return String(level || '').toUpperCase() === 'CISCO' && ['produit','activite'].includes(getRealisationSelectedDimension('CISCO'));
}
function sumRealisationDays(records) { return (records || []).reduce((s,r) => s + Number(getRealisationInclusiveDuration(r) || 0), 0); }
function makeCiscoAggregationId(prefix, entity, label) { return `${prefix}_${normalizeRealisationKey(entity).slice(0,60)}_${normalizeRealisationKey(label).slice(0,90)}`; }
function makeCiscoProductAggregate(entity, activity, product, components) {
    const rows=[...components].sort((a,b)=>(a.dateStart?.getTime()||0)-(b.dateStart?.getTime()||0));
    return {id:makeCiscoAggregationId('produit',entity,`${activity}|${product}`),niveau:'CISCO',entite:entity,activiteBase:activity,produit:product,sousActivite:'Agrégation des Sous Activités',sousProduit:'—',activite:product,valeur:rows.reduce((s,r)=>s+Number(r.valeur||0),0),totalDays:sumRealisationDays(rows),isAggregate:true,aggregationDimension:'produit',components:rows,componentCount:rows.length,isAnomaly:rows.some(r=>r.isAnomaly),isDoublon:rows.some(r=>r.isDoublon)};
}
function aggregateCiscoRealisationRecords(records, dimension) {
    const source=(records||[]).filter(r=>r.niveau==='CISCO');
    const pg=new Map();
    source.forEach(r=>{const e=cleanSpaces(r.entite||'CISCO inconnue'),a=cleanSpaces(r.activiteBase||'Activité non spécifiée'),p=cleanSpaces(r.produit||'Produit non spécifié'),k=`${e}\u241f${a}\u241f${p}`;if(!pg.has(k))pg.set(k,{e,a,p,rows:[]});pg.get(k).rows.push(r);});
    const products=[...pg.values()].map(g=>makeCiscoProductAggregate(g.e,g.a,g.p,g.rows));
    if(dimension==='produit') return products;
    const ag=new Map();
    products.forEach(p=>{const k=`${p.entite}\u241f${p.activiteBase}`;if(!ag.has(k))ag.set(k,{e:p.entite,a:p.activiteBase,products:[]});ag.get(k).products.push(p);});
    return [...ag.values()].map(g=>{const leaves=g.products.flatMap(p=>p.components||[]);return {id:makeCiscoAggregationId('activite',g.e,g.a),niveau:'CISCO',entite:g.e,activiteBase:g.a,produit:'Agrégation des Produits',sousActivite:'Agrégation hiérarchique',sousProduit:'—',activite:g.a,valeur:g.products.reduce((s,p)=>s+Number(p.valeur||0),0),totalDays:g.products.reduce((s,p)=>s+Number(p.totalDays||0),0),isAggregate:true,aggregationDimension:'activite',products:g.products,components:leaves,componentCount:g.products.length,isAnomaly:leaves.some(r=>r.isAnomaly),isDoublon:leaves.some(r=>r.isDoublon)};});
}
function getCiscoAggregateLabel(r) { const label=r.aggregationDimension==='activite'?r.activiteBase:r.produit,status=getRealisationStatusPhrases(r),base=`${r.entite} - ${label}`; return status.length?`${status.join(' — ')} — ${base}`:base; }
function getCiscoAggregateFormulaText(r) { if(!r)return'';if(r.aggregationDimension==='produit'){const t=(r.components||[]).map(x=>Number(x.valeur||0).toLocaleString('fr-FR'));return `Réalisations du PRODUIT = ${t.join(' + ')} = ${Number(r.valeur||0).toLocaleString('fr-FR')}`;}const t=(r.products||[]).map(x=>Number(x.valeur||0).toLocaleString('fr-FR'));return `Réalisations de l’ACTIVITÉ = ${t.join(' + ')} = ${Number(r.valeur||0).toLocaleString('fr-FR')}`; }
function registerCiscoAggregationDetails(rows){ciscoAggregationDetailStore.clear();ciscoAggregationCurrentIds=[];(rows||[]).forEach(r=>{ciscoAggregationDetailStore.set(r.id,r);ciscoAggregationCurrentIds.push(r.id);});}
function formatCiscoComponentDate(d){return d instanceof Date&&!Number.isNaN(d.getTime())?formatRealisationGanttDate(d):'Non renseignée';}
function getCiscoPopupSourceRows(aggregate) {
    if (!aggregate) return [];
    const rows = Array.isArray(aggregate.components) ? aggregate.components : [];
    return rows
        .filter(row => row && row.dateStart instanceof Date && row.dateEnd instanceof Date && !Number.isNaN(row.dateStart.getTime()) && !Number.isNaN(row.dateEnd.getTime()))
        .sort((a, b) => (a.dateStart.getTime() - b.dateStart.getTime()) || String(a.sousActivite || '').localeCompare(String(b.sousActivite || ''), 'fr'));
}

function getCiscoPopupRowLabel(row, aggregate, index) {
    const status = getRealisationStatusPhrases(row);
    const product = cleanSpaces(row?.produit || aggregate?.produit || 'Produit non spécifié');
    const subActivity = cleanSpaces(row?.sousActivite || row?.activite || 'Sous Activité non spécifiée');
    const prefix = status.length ? `${status.join(' — ')} — ` : '';
    return `${prefix}${row?.entite || aggregate?.entite || 'CISCO inconnue'} — ${product} — ${subActivity} — Mission ${index + 1}`;
}

function buildCiscoPopupChartHtml(r, popupIndex) {
    const sourceRows = getCiscoPopupSourceRows(r);
    if (!sourceRows.length) return '<div class="alert alert-warning">Aucune période début-fin complète n’est disponible pour dessiner le graphique détaillé.</div>';
    const starts = sourceRows.map(row => row.dateStart.getTime());
    const ends = sourceRows.map(row => row.dateEnd.getTime());
    const minDate = new Date(Math.min(...starts));
    const maxDate = new Date(Math.max(...ends));
    const totalValue = sourceRows.reduce((sum, row) => sum + Number(row.valeur || 0), 0);
    const totalDays = sourceRows.reduce((sum, row) => sum + Number(getRealisationInclusiveDuration(row) || 0), 0);
    return `<section class="cisco-popup-chart-card" data-cisco-popup-index="${popupIndex}">
        <div class="cisco-popup-chart-heading">
            <div>
                <h6 class="mb-1"><i class="fas fa-chart-gantt"></i> Réalisations des CISCO — Détail des réalisations sources</h6>
                <small>Axe X : dates de réalisation · Axe Y : code CISCO : nom CISCO - Produit - Sous Activité. Chaque barre correspond à une réalisation source.</small>
            </div>
        </div>
        <div class="cisco-popup-metrics">
            <span><strong>Date de début minimale :</strong> ${formatRealisationGanttDate(minDate)}</span>
            <span><strong>Date de fin maximale :</strong> ${formatRealisationGanttDate(maxDate)}</span>
            <span><strong>Réalisation totale :</strong> ${Number(totalValue).toLocaleString('fr-FR')}</span>
            <span><strong>Jours cumulés :</strong> ${Number(totalDays).toLocaleString('fr-FR')} jour(s)</span>
        </div>
        <div class="cisco-popup-chart-scroll">
            <div class="cisco-popup-chart-stage" id="cisco-popup-stage-${popupIndex}">
                <canvas id="cisco-popup-chart-${popupIndex}"></canvas>
            </div>
        </div>
        <div class="small text-muted mt-2"><i class="fas fa-info-circle"></i> Les dates affichées ici sont celles des réalisations élémentaires. Elles servent à expliquer le calcul agrégé ; elles ne sont pas transformées en une fausse période continue.</div>
    </section>`;
}

function buildCiscoAggregationDetailHtml(r, popupIndex = 0) {
    if (!r) return '<p>Détail indisponible.</p>';
    const label = r.aggregationDimension === 'activite' ? r.activiteBase : r.produit;
    const kind = r.aggregationDimension === 'activite' ? 'Activité' : 'Produit';
    const statusBadges = getRealisationStatusPhrases(r).map(status => `<span class="badge bg-danger me-1">${escapeRealisationHtml(status)}</span>`).join('');
    let h = `<article class="cisco-popup-aggregate-block" data-aggregate-id="${escapeRealisationHtml(r.id)}">
        <div class="cisco-aggregation-summary-card">
            <div class="d-flex flex-wrap align-items-center gap-2 mb-1"><span class="cisco-aggregation-badge">${kind}</span>${statusBadges}</div>
            <h5 class="mt-2 mb-2">${escapeRealisationHtml(r.entite)} — ${escapeRealisationHtml(label)}</h5>
            <div class="row g-2 cisco-popup-summary-grid">
                <div class="col-md-3"><strong>Réalisation totale :</strong><br><span class="cisco-popup-big-number">${Number(r.valeur || 0).toLocaleString('fr-FR')}</span></div>
                <div class="col-md-3"><strong>Jours de réalisation :</strong><br><span class="cisco-popup-big-number">${Number(r.totalDays || 0).toLocaleString('fr-FR')}</span></div>
                <div class="col-md-3"><strong>Sources élémentaires :</strong><br><span class="cisco-popup-big-number">${Number(r.components?.length || 0).toLocaleString('fr-FR')}</span></div>
                <div class="col-md-3"><strong>Statut :</strong><br>${statusBadges || '<span class="badge bg-success">Valide</span>'}</div>
            </div>
            <div class="cisco-aggregation-formula mt-3"><strong>Formule appliquée :</strong> ${escapeRealisationHtml(getCiscoAggregateFormulaText(r))}</div>
        </div>
        ${buildCiscoPopupChartHtml(r, popupIndex)}`;

    if (r.aggregationDimension === 'produit') {
        h += `<h6 class="mt-3"><i class="fas fa-list-ul"></i> Sous Activités composant ce Produit</h6>
        <div class="table-responsive cisco-popup-table-scroll"><table class="table table-sm table-bordered table-striped cisco-aggregation-component-table align-middle">
        <thead><tr><th>#</th><th>CISCO</th><th>Produit</th><th>Sous Activité</th><th>Date début</th><th>Date fin</th><th>Jours</th><th>Réalisation</th><th>Anomalies de liaison</th><th>DOUBLON</th></tr></thead><tbody>`;
        (r.components || []).forEach((x, i) => {
            h += `<tr>
                <td>${i + 1}</td>
                <td>${escapeRealisationHtml(x.entite || r.entite)}</td>
                <td>${escapeRealisationHtml(x.produit || r.produit)}</td>
                <td>${escapeRealisationHtml(x.sousActivite || x.activite || 'Non spécifiée')}</td>
                <td class="text-nowrap">${formatCiscoComponentDate(x.dateStart)}</td>
                <td class="text-nowrap">${formatCiscoComponentDate(x.dateEnd)}</td>
                <td class="text-end">${Number(getRealisationInclusiveDuration(x) || 0)}</td>
                <td class="text-end fw-bold">${Number(x.valeur || 0).toLocaleString('fr-FR')}</td>
                <td>${x.isAnomaly ? '<span class="badge bg-danger">Anomalies de liaison</span>' : '<span class="badge bg-success">Aucune</span>'}</td>
                <td>${x.isDoublon ? '<span class="badge bg-danger">DOUBLON</span>' : '<span class="badge bg-success">Mission distincte</span>'}</td>
            </tr>`;
        });
        h += `</tbody><tfoot><tr class="fw-bold"><td colspan="6">TOTAL PRODUIT</td><td class="text-end">${Number(r.totalDays || 0)}</td><td class="text-end">${Number(r.valeur || 0).toLocaleString('fr-FR')}</td><td colspan="2"></td></tr></tfoot></table></div>`;
    } else {
        h += `<h6 class="mt-3"><i class="fas fa-boxes"></i> Produits composant cette Activité</h6>
        <div class="table-responsive cisco-popup-table-scroll"><table class="table table-sm table-bordered table-striped cisco-aggregation-component-table align-middle">
        <thead><tr><th>#</th><th>Produit</th><th>Sous Activités</th><th>Jours</th><th>Réalisation Produit</th><th>Formule</th><th>Statut</th></tr></thead><tbody>`;
        (r.products || []).forEach((p, i) => {
            h += `<tr><td>${i + 1}</td><td>${escapeRealisationHtml(p.produit)}</td><td class="text-end">${p.components?.length || 0}</td><td class="text-end">${Number(p.totalDays || 0)}</td><td class="text-end fw-bold">${Number(p.valeur || 0).toLocaleString('fr-FR')}</td><td><code>${escapeRealisationHtml(getCiscoAggregateFormulaText(p))}</code></td><td>${escapeRealisationHtml(getRealisationStatusText(p, 'Valide'))}</td></tr>`;
        });
        h += `</tbody><tfoot><tr class="fw-bold"><td colspan="3">TOTAL ACTIVITÉ</td><td class="text-end">${Number(r.totalDays || 0)}</td><td class="text-end">${Number(r.valeur || 0).toLocaleString('fr-FR')}</td><td colspan="2"></td></tr></tfoot></table></div>
        <div class="alert alert-light border">Chaque Produit est lui-même calculé comme la somme de ses Sous Activités. Le graphique détaillé ci-dessus montre toutes les réalisations élémentaires qui expliquent le total de l’Activité.</div>`;
    }
    return `${h}</article>`;
}

function renderCiscoAggregationPopupChart(aggregate, popupIndex) {
    const canvas = document.getElementById(`cisco-popup-chart-${popupIndex}`);
    const stage = document.getElementById(`cisco-popup-stage-${popupIndex}`);
    if (!canvas || !stage || !aggregate) return null;
    const rows = getCiscoPopupSourceRows(aggregate);
    if (!rows.length) return null;
    const starts = rows.map(row => row.dateStart.getTime());
    const ends = rows.map(row => row.dateEnd.getTime());
    const axisStart = new Date(Math.min(...starts));
    const axisEnd = new Date(Math.max(...ends));
    const spanDays = Math.max(1, Math.ceil((axisEnd.getTime() - axisStart.getTime()) / 86400000) + 1);
    const stageWidth = Math.min(18000, Math.max(1180, 780 + spanDays * 34));
    const stageHeight = Math.min(18000, Math.max(470, 200 + rows.length * 96));
    stage.style.width = `${stageWidth}px`;
    stage.style.minWidth = `${stageWidth}px`;
    stage.style.height = `${stageHeight}px`;

    const dataset = {
        label: aggregate.entite || 'CISCO',
        data: rows.map(row => [row.dateStart.getTime(), row.dateEnd.getTime()]),
        _records: rows,
        backgroundColor: 'rgba(243, 156, 18, .72)',
        borderColor: 'rgba(211, 84, 0, 1)',
        borderWidth: 1.5,
        borderSkipped: false,
        borderRadius: 5,
        minBarLength: 4,
        barPercentage: .46,
        categoryPercentage: .68
    };
    const boundaryValues = collectRealisationGanttBoundaryValues(rows, axisStart, axisEnd);
    const chart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: { labels: rows.map((row, index) => getCiscoPopupRowLabel(row, aggregate, index)), datasets: [dataset] },
        plugins: [realisationGanttLabelsPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            normalized: true,
            indexAxis: 'y',
            interaction: { mode: 'nearest', axis: 'y', intersect: true },
            layout: { padding: { right: 220, top: 30, bottom: 48, left: 10 } },
            plugins: {
                legend: { display: true, position: 'top', labels: { usePointStyle: true, boxWidth: 10 } },
                realisationGanttLabelsPlugin: { enabled: true },
                tooltip: {
                    callbacks: {
                        title: items => {
                            const row = rows[items?.[0]?.dataIndex];
                            return row ? row.entite : 'Réalisation CISCO';
                        },
                        label: context => {
                            const row = rows[context.dataIndex];
                            return row ? [
                                `Produit : ${row.produit || aggregate.produit || 'Non spécifié'}`,
                                `Sous Activité : ${row.sousActivite || row.activite || 'Non spécifiée'}`,
                                `Début : ${formatCiscoComponentDate(row.dateStart)}`,
                                `Fin : ${formatCiscoComponentDate(row.dateEnd)}`,
                                `Durée : ${Number(getRealisationInclusiveDuration(row) || 0)} jour(s)`,
                                `Réalisation : ${Number(row.valeur || 0).toLocaleString('fr-FR')}`,
                                `Statut : ${getRealisationStatusText(row, 'Valide')}`
                            ] : [];
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    min: axisStart.getTime(),
                    max: axisEnd.getTime(),
                    title: { display: true, text: 'Période de réalisation OM missionnaire (date début → date fin)', font: { weight: 'bold' } },
                    afterBuildTicks: scale => {
                        const values = new Set(boundaryValues.map(Number));
                        scale.ticks.forEach(tick => values.add(Number(tick.value)));
                        values.add(axisStart.getTime());
                        values.add(axisEnd.getTime());
                        scale.ticks = [...values].filter(Number.isFinite).sort((a, b) => a - b).map(value => ({ value }));
                    },
                    ticks: { autoSkip: false, maxRotation: 55, minRotation: 55, padding: 8, callback: value => formatRealisationGanttDate(value) },
                    grid: { color: 'rgba(67, 96, 78, .12)' }
                },
                y: {
                    title: { display: true, text: 'Code CISCO : nom CISCO - Produit - Sous Activité', font: { weight: 'bold' } },
                    ticks: { autoSkip: false, padding: 8, font: { size: rows.length > 16 ? 9 : 10, lineHeight: 1.15 }, callback: function(value) { return wrapRealisationGanttAxisLabel(this.getLabelForValue(value), false); } },
                    grid: { display: false }
                }
            }
        }
    });
    ciscoAggregationPopupCharts.push(chart);
    return chart;
}

function renderCiscoAggregationPopupCharts(rows) {
    destroyCiscoAggregationPopupCharts();
    (rows || []).forEach((aggregate, index) => renderCiscoAggregationPopupChart(aggregate, index));
}

window.openCiscoAggregationDetails = function(id = null) {
    const body = document.getElementById('ciscoAggregationDetailsModalBody');
    if (!body) return;
    const rows = id ? [ciscoAggregationDetailStore.get(id)].filter(Boolean) : ciscoAggregationCurrentIds.map(key => ciscoAggregationDetailStore.get(key)).filter(Boolean);
    destroyCiscoAggregationPopupCharts();
    body.innerHTML = rows.length
        ? rows.map((row, index) => buildCiscoAggregationDetailHtml(row, index)).join('')
        : '<p class="text-muted mb-0">Sélectionnez l’onglet Produit ou Activité afin d’afficher la décomposition de la formule.</p>';
    const element = document.getElementById('ciscoAggregationDetailsModal');
    if (element && window.bootstrap?.Modal) {
        const modal = bootstrap.Modal.getOrCreateInstance(element);
        modal.show();
        window.setTimeout(() => renderCiscoAggregationPopupCharts(rows), 180);
    } else {
        renderCiscoAggregationPopupCharts(rows);
    }
};

window.openCiscoRawRealisationDetails = function(id, index) {
    const r = ciscoLastRawDisplayedRecords[Number(index)] || ciscoLastRawDisplayedRecords.find(x => String(x.id || '') === String(id || ''));
    const body = document.getElementById('ciscoAggregationDetailsModalBody');
    if (!body) return;
    destroyCiscoAggregationPopupCharts();
    if (!r) {
        body.innerHTML = '<p>Détail indisponible.</p>';
    } else {
        const synthetic = {
            id: `raw_${r.id || index}`,
            aggregationDimension: 'produit',
            niveau: 'CISCO',
            entite: r.entite,
            activiteBase: r.activiteBase,
            produit: r.produit,
            valeur: Number(r.valeur || 0),
            totalDays: Number(getRealisationInclusiveDuration(r) || 0),
            components: [r],
            isAnomaly: !!r.isAnomaly,
            isDoublon: !!r.isDoublon
        };
        body.innerHTML = `<div class="cisco-aggregation-summary-card"><span class="cisco-aggregation-badge">Réalisation élémentaire</span><h5 class="mt-2">${escapeRealisationHtml(r.entite)} — ${escapeRealisationHtml(getRealisationDimensionValue(r, 'CISCO'))}</h5><div><strong>Début :</strong> ${formatCiscoComponentDate(r.dateStart)} &nbsp; | &nbsp; <strong>Fin :</strong> ${formatCiscoComponentDate(r.dateEnd)} &nbsp; | &nbsp; <strong>Durée :</strong> ${Number(getRealisationInclusiveDuration(r) || 0)} jour(s) &nbsp; | &nbsp; <strong>Réalisation :</strong> ${Number(r.valeur || 0).toLocaleString('fr-FR')}</div><div class="mt-2"><strong>Statut :</strong> ${escapeRealisationHtml(getRealisationStatusText(r, 'Valide'))}</div></div>${buildCiscoPopupChartHtml(synthetic, 0)}`;
        const element = document.getElementById('ciscoAggregationDetailsModal');
        if (element && window.bootstrap?.Modal) {
            const modal = bootstrap.Modal.getOrCreateInstance(element);
            modal.show();
            window.setTimeout(() => { destroyCiscoAggregationPopupCharts(); renderCiscoAggregationPopupChart(synthetic, 0); }, 180);
            return;
        }
        renderCiscoAggregationPopupChart(synthetic, 0);
    }
    const element = document.getElementById('ciscoAggregationDetailsModal');
    if (element && window.bootstrap?.Modal) bootstrap.Modal.getOrCreateInstance(element).show();
};

function restoreCiscoDetailTableHeadings(){const d=getRealisationSelectedDimension('CISCO'),h=document.getElementById('real-detail-label-heading-cisco'),s=document.getElementById('real-detail-start-heading-cisco'),e=document.getElementById('real-detail-end-heading-cisco');if(h)h.textContent=getRealisationDimensionConfig(d).label;if(s)s.textContent='Date de début de la réalisation';if(e)e.textContent='Date de fin de la réalisation';}
function updateCiscoAggregationModeUi(){const d=getRealisationSelectedDimension('CISCO'),agg=['produit','activite'].includes(d),card=document.getElementById('real-scroll-cisco')?.closest('.realisation-level-card'),btn=document.getElementById('real-cisco-details-button'),help=document.getElementById('real-cisco-aggregation-help'),bounds=document.getElementById('real-axis-boundaries-cisco');if(card)card.classList.toggle('real-cisco-aggregate-mode',agg);if(btn)btn.classList.toggle('d-none',!agg);if(help)help.classList.toggle('d-none',!agg);if(bounds){if(agg)bounds.innerHTML=`<span class="realisation-axis-boundary"><i class="fas fa-calculator"></i> <strong>${d==='produit'?'Produit = somme des Sous Activités':'Activité = somme des Produits'}</strong></span><span class="realisation-axis-boundary">Axe X : <strong>nombre total de jours de réalisation</strong></span>`;else if(!document.getElementById('real-axis-start-cisco'))bounds.innerHTML=`<span class="realisation-axis-boundary realisation-axis-boundary-start"><i class="fas fa-play-circle"></i> Date de début minimale : <strong id="real-axis-start-cisco">—</strong></span><span class="realisation-axis-boundary realisation-axis-boundary-end">Date de fin maximale : <strong id="real-axis-end-cisco">—</strong> <i class="fas fa-flag-checkered"></i></span>`;}if(!agg)restoreCiscoDetailTableHeadings();}
const ciscoAggregationLabelsPlugin={id:'ciscoAggregationLabelsPlugin',afterDatasetsDraw(chart){if(!chart?.chartArea)return;const meta=chart.getDatasetMeta(0),rows=chart.data?.datasets?.[0]?._aggregates||[],ctx=chart.ctx;ctx.save();meta.data.forEach((bar,i)=>{const r=rows[i];if(!r||!bar)return;const l=Math.min(bar.base,bar.x),rr=Math.max(bar.base,bar.x),v=`Réalisation totale : ${Number(r.valeur||0).toLocaleString('fr-FR')}`,days=`${Number(r.totalDays||0)} jour(s)`;ctx.font='700 11px Segoe UI';ctx.textBaseline='middle';const w=ctx.measureText(v).width;if(rr-l>w+18){ctx.fillStyle='#fff';ctx.textAlign='center';ctx.fillText(v,l+(rr-l)/2,bar.y);}else{ctx.fillStyle='#084298';ctx.textAlign='left';ctx.fillText(v,rr+8,bar.y-7);}ctx.font='700 10px Segoe UI';ctx.fillStyle='#084298';ctx.textAlign='left';ctx.fillText(days,rr+8,bar.y+9);});ctx.restore();}};
function createCiscoAggregatedDurationChart(canvas,stage,aggregates){const rows=[...aggregates].sort((a,b)=>String(a.entite).localeCompare(String(b.entite),'fr')||getCiscoAggregateLabel(a).localeCompare(getCiscoAggregateLabel(b),'fr')),maxDays=Math.max(1,...rows.map(r=>Number(r.totalDays||0))),w=Math.max(1180,760+Math.min(80,rows.length)*26),h=Math.max(470,190+rows.length*72);stage.classList.add('realisation-gantt-stage');stage.style.width=`${w}px`;stage.style.minWidth=`${w}px`;stage.style.height=`${h}px`;const ds={label:'Jours de réalisation',data:rows.map(r=>r.totalDays),_aggregates:rows,backgroundColor:'rgba(13, 110, 253, .72)',borderColor:'rgba(13, 110, 253, 1)',borderWidth:1.5,borderRadius:5,borderSkipped:false,barPercentage:.52,categoryPercentage:.7},d=getRealisationSelectedDimension('CISCO'),cfg=getRealisationDimensionConfig(d),chart=new Chart(canvas.getContext('2d'),{type:'bar',data:{labels:rows.map(getCiscoAggregateLabel),datasets:[ds]},plugins:[ciscoAggregationLabelsPlugin],options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',layout:{padding:{right:230,top:20,bottom:25,left:10}},plugins:{legend:{display:false},tooltip:{callbacks:{title:items=>rows[items?.[0]?.dataIndex]?.entite||'CISCO',label:ctx=>{const r=rows[ctx.dataIndex];return [`${cfg.label} : ${d==='activite'?r.activiteBase:r.produit}`,`Réalisation totale : ${Number(r.valeur||0).toLocaleString('fr-FR')}`,`Jours de réalisation : ${Number(r.totalDays||0)}`,getCiscoAggregateFormulaText(r),getRealisationAggregationCompositionText(r, d),'Détails complets : bouton « Afficher les Détails »'];}}}},scales:{x:{beginAtZero:true,suggestedMax:Math.ceil(maxDays*1.2),title:{display:true,text:'Nombre total de jours de réalisation (somme des durées inclusives)',font:{weight:'bold'}},ticks:{precision:0}},y:{title:{display:true,text:`Code CISCO : nom CISCO - ${cfg.label}`,font:{weight:'bold'}},ticks:{autoSkip:false,font:{size:10},callback:function(v){return wrapRealisationGanttAxisLabel(this.getLabelForValue(v),false);}},grid:{display:false}}}}});realisationTimelineChartsRefs.CISCO.push({chart,name:`cisco_${d}_agregation_hierarchique`});return chart;}
function renderCiscoAggregatedDetailTable(rows,d) {
    const section = document.getElementById('real-detail-section-cisco');
    const tbody = document.getElementById('real-detail-table-cisco');
    const count = document.getElementById('real-detail-count-cisco');
    const total = document.getElementById('real-detail-total-cisco');
    const cfg = getRealisationDimensionConfig(d);
    const h = document.getElementById('real-detail-label-heading-cisco');
    const sh = document.getElementById('real-detail-start-heading-cisco');
    const eh = document.getElementById('real-detail-end-heading-cisco');
    if (!section || !tbody) return;
    section.classList.toggle('d-none', !rows.length);
    if (count) count.textContent = rows.length.toLocaleString('fr-FR');
    if (total) total.textContent = rows.reduce((s,r) => s + Number(r.valeur || 0), 0).toLocaleString('fr-FR');
    if (h) h.textContent = cfg.label;
    if (sh) sh.textContent = 'Type de calcul';
    if (eh) eh.textContent = 'Composition détaillée';
    tbody.innerHTML = rows.map((r,i) => {
        const label = d === 'activite' ? r.activiteBase : r.produit;
        const compositionHtml = getRealisationAggregationCompositionHtml(r, d);
        return `<tr>
            <td class="text-center fw-bold">${i+1}</td>
            <td class="text-center"><span class="badge bg-secondary">CISCO</span></td>
            <td class="fw-semibold">${escapeRealisationHtml(r.entite)}</td>
            <td>${escapeRealisationHtml(label)}</td>
            <td class="text-center">Agrégation hiérarchique</td>
            <td class="realisation-composition-cell">${compositionHtml}</td>
            <td class="text-end fw-bold">${Number(r.totalDays||0)} jour(s)</td>
            <td class="text-end fw-bold text-primary">${Number(r.valeur||0).toLocaleString('fr-FR')}</td>
            <td class="text-center">—</td>
            <td class="text-center">—</td>
            <td class="text-center">${r.components?.length||0} source(s)</td>
            <td class="text-center">${r.isAnomaly?'<span class="badge bg-danger">Anomalies de liaison</span>':'<span class="badge bg-success">Aucune</span>'}</td>
            <td class="text-center">${r.isDoublon?'<span class="badge bg-danger">DOUBLON</span>':'<span class="badge bg-success">Mission distincte</span>'}</td>
            <td class="text-center"><button type="button" class="btn btn-primary btn-sm fw-bold" onclick="window.openCiscoAggregationDetails('${escapeRealisationHtml(r.id)}')"><i class="fas fa-search-plus"></i> Afficher les Détails</button></td>
        </tr>`;
    }).join('');
}



const zapAggregationDetailStore = new Map();
let zapAggregationCurrentIds = [];
let zapLastRawDisplayedRecords = [];
let zapAggregationPopupCharts = [];

function destroyZapAggregationPopupCharts() {
    (zapAggregationPopupCharts || []).forEach(chart => {
        try { chart?.destroy?.(); } catch (_) {}
    });
    zapAggregationPopupCharts = [];
}

function isZapHierarchicalAggregationMode(level = 'ZAP') {
    return String(level || '').toUpperCase() === 'ZAP' && ['produit','activite'].includes(getRealisationSelectedDimension('ZAP'));
}
function sumRealisationDays(records) { return (records || []).reduce((s,r) => s + Number(getRealisationInclusiveDuration(r) || 0), 0); }
function makeZapAggregationId(prefix, entity, label) { return `${prefix}_${normalizeRealisationKey(entity).slice(0,60)}_${normalizeRealisationKey(label).slice(0,90)}`; }
function makeZapProductAggregate(entity, activity, product, components) {
    const rows=[...components].sort((a,b)=>(a.dateStart?.getTime()||0)-(b.dateStart?.getTime()||0));
    return {id:makeZapAggregationId('produit',entity,`${activity}|${product}`),niveau:'ZAP',entite:entity,activiteBase:activity,produit:product,sousActivite:'Agrégation des Sous Activités',sousProduit:'—',activite:product,valeur:rows.reduce((s,r)=>s+Number(r.valeur||0),0),totalDays:sumRealisationDays(rows),isAggregate:true,aggregationDimension:'produit',components:rows,componentCount:rows.length,isAnomaly:rows.some(r=>r.isAnomaly),isDoublon:rows.some(r=>r.isDoublon)};
}
function aggregateZapRealisationRecords(records, dimension) {
    const source=(records||[]).filter(r=>r.niveau==='ZAP');
    const pg=new Map();
    source.forEach(r=>{const e=cleanSpaces(r.entite||'ZAP inconnue'),a=cleanSpaces(r.activiteBase||'Activité non spécifiée'),p=cleanSpaces(r.produit||'Produit non spécifié'),k=`${e}\u241f${a}\u241f${p}`;if(!pg.has(k))pg.set(k,{e,a,p,rows:[]});pg.get(k).rows.push(r);});
    const products=[...pg.values()].map(g=>makeZapProductAggregate(g.e,g.a,g.p,g.rows));
    if(dimension==='produit') return products;
    const ag=new Map();
    products.forEach(p=>{const k=`${p.entite}\u241f${p.activiteBase}`;if(!ag.has(k))ag.set(k,{e:p.entite,a:p.activiteBase,products:[]});ag.get(k).products.push(p);});
    return [...ag.values()].map(g=>{const leaves=g.products.flatMap(p=>p.components||[]);return {id:makeZapAggregationId('activite',g.e,g.a),niveau:'ZAP',entite:g.e,activiteBase:g.a,produit:'Agrégation des Produits',sousActivite:'Agrégation hiérarchique',sousProduit:'—',activite:g.a,valeur:g.products.reduce((s,p)=>s+Number(p.valeur||0),0),totalDays:g.products.reduce((s,p)=>s+Number(p.totalDays||0),0),isAggregate:true,aggregationDimension:'activite',products:g.products,components:leaves,componentCount:g.products.length,isAnomaly:leaves.some(r=>r.isAnomaly),isDoublon:leaves.some(r=>r.isDoublon)};});
}
function getZapAggregateLabel(r) { const label=r.aggregationDimension==='activite'?r.activiteBase:r.produit,status=getRealisationStatusPhrases(r),base=`${r.entite} - ${label}`; return status.length?`${status.join(' — ')} — ${base}`:base; }
function getZapAggregateFormulaText(r) { if(!r)return'';if(r.aggregationDimension==='produit'){const t=(r.components||[]).map(x=>Number(x.valeur||0).toLocaleString('fr-FR'));return `Réalisations du PRODUIT = ${t.join(' + ')} = ${Number(r.valeur||0).toLocaleString('fr-FR')}`;}const t=(r.products||[]).map(x=>Number(x.valeur||0).toLocaleString('fr-FR'));return `Réalisations de l’ACTIVITÉ = ${t.join(' + ')} = ${Number(r.valeur||0).toLocaleString('fr-FR')}`; }
function registerZapAggregationDetails(rows){zapAggregationDetailStore.clear();zapAggregationCurrentIds=[];(rows||[]).forEach(r=>{zapAggregationDetailStore.set(r.id,r);zapAggregationCurrentIds.push(r.id);});}
function formatZapComponentDate(d){return d instanceof Date&&!Number.isNaN(d.getTime())?formatRealisationGanttDate(d):'Non renseignée';}
function getZapPopupSourceRows(aggregate) {
    if (!aggregate) return [];
    const rows = Array.isArray(aggregate.components) ? aggregate.components : [];
    return rows
        .filter(row => row && row.dateStart instanceof Date && row.dateEnd instanceof Date && !Number.isNaN(row.dateStart.getTime()) && !Number.isNaN(row.dateEnd.getTime()))
        .sort((a, b) => (a.dateStart.getTime() - b.dateStart.getTime()) || String(a.sousActivite || '').localeCompare(String(b.sousActivite || ''), 'fr'));
}

function getZapPopupRowLabel(row, aggregate, index) {
    const status = getRealisationStatusPhrases(row);
    const product = cleanSpaces(row?.produit || aggregate?.produit || 'Produit non spécifié');
    const subActivity = cleanSpaces(row?.sousActivite || row?.activite || 'Sous Activité non spécifiée');
    const prefix = status.length ? `${status.join(' — ')} — ` : '';
    return `${prefix}${row?.entite || aggregate?.entite || 'ZAP inconnue'} — ${product} — ${subActivity} — Mission ${index + 1}`;
}

function buildZapPopupChartHtml(r, popupIndex) {
    const sourceRows = getZapPopupSourceRows(r);
    if (!sourceRows.length) return '<div class="alert alert-warning">Aucune période début-fin complète n’est disponible pour dessiner le graphique détaillé.</div>';
    const starts = sourceRows.map(row => row.dateStart.getTime());
    const ends = sourceRows.map(row => row.dateEnd.getTime());
    const minDate = new Date(Math.min(...starts));
    const maxDate = new Date(Math.max(...ends));
    const totalValue = sourceRows.reduce((sum, row) => sum + Number(row.valeur || 0), 0);
    const totalDays = sourceRows.reduce((sum, row) => sum + Number(getRealisationInclusiveDuration(row) || 0), 0);
    return `<section class="zap-popup-chart-card" data-zap-popup-index="${popupIndex}">
        <div class="zap-popup-chart-heading">
            <div>
                <h6 class="mb-1"><i class="fas fa-chart-gantt"></i> Réalisations des ZAP — Détail des réalisations sources</h6>
                <small>Axe X : dates de réalisation · Axe Y : code ZAP : nom ZAP - Produit - Sous Activité. Chaque barre correspond à une réalisation source.</small>
            </div>
        </div>
        <div class="zap-popup-metrics">
            <span><strong>Date de début minimale :</strong> ${formatRealisationGanttDate(minDate)}</span>
            <span><strong>Date de fin maximale :</strong> ${formatRealisationGanttDate(maxDate)}</span>
            <span><strong>Réalisation totale :</strong> ${Number(totalValue).toLocaleString('fr-FR')}</span>
            <span><strong>Jours cumulés :</strong> ${Number(totalDays).toLocaleString('fr-FR')} jour(s)</span>
        </div>
        <div class="zap-popup-chart-scroll">
            <div class="zap-popup-chart-stage" id="zap-popup-stage-${popupIndex}">
                <canvas id="zap-popup-chart-${popupIndex}"></canvas>
            </div>
        </div>
        <div class="small text-muted mt-2"><i class="fas fa-info-circle"></i> Les dates affichées ici sont celles des réalisations élémentaires. Elles servent à expliquer le calcul agrégé ; elles ne sont pas transformées en une fausse période continue.</div>
    </section>`;
}

function buildZapAggregationDetailHtml(r, popupIndex = 0) {
    if (!r) return '<p>Détail indisponible.</p>';
    const label = r.aggregationDimension === 'activite' ? r.activiteBase : r.produit;
    const kind = r.aggregationDimension === 'activite' ? 'Activité' : 'Produit';
    const statusBadges = getRealisationStatusPhrases(r).map(status => `<span class="badge bg-danger me-1">${escapeRealisationHtml(status)}</span>`).join('');
    let h = `<article class="zap-popup-aggregate-block" data-aggregate-id="${escapeRealisationHtml(r.id)}">
        <div class="zap-aggregation-summary-card">
            <div class="d-flex flex-wrap align-items-center gap-2 mb-1"><span class="zap-aggregation-badge">${kind}</span>${statusBadges}</div>
            <h5 class="mt-2 mb-2">${escapeRealisationHtml(r.entite)} — ${escapeRealisationHtml(label)}</h5>
            <div class="row g-2 zap-popup-summary-grid">
                <div class="col-md-3"><strong>Réalisation totale :</strong><br><span class="zap-popup-big-number">${Number(r.valeur || 0).toLocaleString('fr-FR')}</span></div>
                <div class="col-md-3"><strong>Jours de réalisation :</strong><br><span class="zap-popup-big-number">${Number(r.totalDays || 0).toLocaleString('fr-FR')}</span></div>
                <div class="col-md-3"><strong>Sources élémentaires :</strong><br><span class="zap-popup-big-number">${Number(r.components?.length || 0).toLocaleString('fr-FR')}</span></div>
                <div class="col-md-3"><strong>Statut :</strong><br>${statusBadges || '<span class="badge bg-success">Valide</span>'}</div>
            </div>
            <div class="zap-aggregation-formula mt-3"><strong>Formule appliquée :</strong> ${escapeRealisationHtml(getZapAggregateFormulaText(r))}</div>
        </div>
        ${buildZapPopupChartHtml(r, popupIndex)}`;

    if (r.aggregationDimension === 'produit') {
        h += `<h6 class="mt-3"><i class="fas fa-list-ul"></i> Sous Activités composant ce Produit</h6>
        <div class="table-responsive zap-popup-table-scroll"><table class="table table-sm table-bordered table-striped zap-aggregation-component-table align-middle">
        <thead><tr><th>#</th><th>ZAP</th><th>Produit</th><th>Sous Activité</th><th>Date début</th><th>Date fin</th><th>Jours</th><th>Réalisation</th><th>Anomalies de liaison</th><th>DOUBLON</th></tr></thead><tbody>`;
        (r.components || []).forEach((x, i) => {
            h += `<tr>
                <td>${i + 1}</td>
                <td>${escapeRealisationHtml(x.entite || r.entite)}</td>
                <td>${escapeRealisationHtml(x.produit || r.produit)}</td>
                <td>${escapeRealisationHtml(x.sousActivite || x.activite || 'Non spécifiée')}</td>
                <td class="text-nowrap">${formatZapComponentDate(x.dateStart)}</td>
                <td class="text-nowrap">${formatZapComponentDate(x.dateEnd)}</td>
                <td class="text-end">${Number(getRealisationInclusiveDuration(x) || 0)}</td>
                <td class="text-end fw-bold">${Number(x.valeur || 0).toLocaleString('fr-FR')}</td>
                <td>${x.isAnomaly ? '<span class="badge bg-danger">Anomalies de liaison</span>' : '<span class="badge bg-success">Aucune</span>'}</td>
                <td>${x.isDoublon ? '<span class="badge bg-danger">DOUBLON</span>' : '<span class="badge bg-success">Mission distincte</span>'}</td>
            </tr>`;
        });
        h += `</tbody><tfoot><tr class="fw-bold"><td colspan="6">TOTAL PRODUIT</td><td class="text-end">${Number(r.totalDays || 0)}</td><td class="text-end">${Number(r.valeur || 0).toLocaleString('fr-FR')}</td><td colspan="2"></td></tr></tfoot></table></div>`;
    } else {
        h += `<h6 class="mt-3"><i class="fas fa-boxes"></i> Produits composant cette Activité</h6>
        <div class="table-responsive zap-popup-table-scroll"><table class="table table-sm table-bordered table-striped zap-aggregation-component-table align-middle">
        <thead><tr><th>#</th><th>Produit</th><th>Sous Activités</th><th>Jours</th><th>Réalisation Produit</th><th>Formule</th><th>Statut</th></tr></thead><tbody>`;
        (r.products || []).forEach((p, i) => {
            h += `<tr><td>${i + 1}</td><td>${escapeRealisationHtml(p.produit)}</td><td class="text-end">${p.components?.length || 0}</td><td class="text-end">${Number(p.totalDays || 0)}</td><td class="text-end fw-bold">${Number(p.valeur || 0).toLocaleString('fr-FR')}</td><td><code>${escapeRealisationHtml(getZapAggregateFormulaText(p))}</code></td><td>${escapeRealisationHtml(getRealisationStatusText(p, 'Valide'))}</td></tr>`;
        });
        h += `</tbody><tfoot><tr class="fw-bold"><td colspan="3">TOTAL ACTIVITÉ</td><td class="text-end">${Number(r.totalDays || 0)}</td><td class="text-end">${Number(r.valeur || 0).toLocaleString('fr-FR')}</td><td colspan="2"></td></tr></tfoot></table></div>
        <div class="alert alert-light border">Chaque Produit est lui-même calculé comme la somme de ses Sous Activités. Le graphique détaillé ci-dessus montre toutes les réalisations élémentaires qui expliquent le total de l’Activité.</div>`;
    }
    return `${h}</article>`;
}

function renderZapAggregationPopupChart(aggregate, popupIndex) {
    const canvas = document.getElementById(`zap-popup-chart-${popupIndex}`);
    const stage = document.getElementById(`zap-popup-stage-${popupIndex}`);
    if (!canvas || !stage || !aggregate) return null;
    const rows = getZapPopupSourceRows(aggregate);
    if (!rows.length) return null;
    const starts = rows.map(row => row.dateStart.getTime());
    const ends = rows.map(row => row.dateEnd.getTime());
    const axisStart = new Date(Math.min(...starts));
    const axisEnd = new Date(Math.max(...ends));
    const spanDays = Math.max(1, Math.ceil((axisEnd.getTime() - axisStart.getTime()) / 86400000) + 1);
    const stageWidth = Math.min(18000, Math.max(1180, 780 + spanDays * 34));
    const stageHeight = Math.min(18000, Math.max(470, 200 + rows.length * 96));
    stage.style.width = `${stageWidth}px`;
    stage.style.minWidth = `${stageWidth}px`;
    stage.style.height = `${stageHeight}px`;

    const dataset = {
        label: aggregate.entite || 'ZAP',
        data: rows.map(row => [row.dateStart.getTime(), row.dateEnd.getTime()]),
        _records: rows,
        backgroundColor: 'rgba(243, 156, 18, .72)',
        borderColor: 'rgba(211, 84, 0, 1)',
        borderWidth: 1.5,
        borderSkipped: false,
        borderRadius: 5,
        minBarLength: 4,
        barPercentage: .46,
        categoryPercentage: .68
    };
    const boundaryValues = collectRealisationGanttBoundaryValues(rows, axisStart, axisEnd);
    const chart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: { labels: rows.map((row, index) => getZapPopupRowLabel(row, aggregate, index)), datasets: [dataset] },
        plugins: [realisationGanttLabelsPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            normalized: true,
            indexAxis: 'y',
            interaction: { mode: 'nearest', axis: 'y', intersect: true },
            layout: { padding: { right: 220, top: 30, bottom: 48, left: 10 } },
            plugins: {
                legend: { display: true, position: 'top', labels: { usePointStyle: true, boxWidth: 10 } },
                realisationGanttLabelsPlugin: { enabled: true },
                tooltip: {
                    callbacks: {
                        title: items => {
                            const row = rows[items?.[0]?.dataIndex];
                            return row ? row.entite : 'Réalisation ZAP';
                        },
                        label: context => {
                            const row = rows[context.dataIndex];
                            return row ? [
                                `Produit : ${row.produit || aggregate.produit || 'Non spécifié'}`,
                                `Sous Activité : ${row.sousActivite || row.activite || 'Non spécifiée'}`,
                                `Début : ${formatZapComponentDate(row.dateStart)}`,
                                `Fin : ${formatZapComponentDate(row.dateEnd)}`,
                                `Durée : ${Number(getRealisationInclusiveDuration(row) || 0)} jour(s)`,
                                `Réalisation : ${Number(row.valeur || 0).toLocaleString('fr-FR')}`,
                                `Statut : ${getRealisationStatusText(row, 'Valide')}`
                            ] : [];
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    min: axisStart.getTime(),
                    max: axisEnd.getTime(),
                    title: { display: true, text: 'Période de réalisation OM missionnaire (date début → date fin)', font: { weight: 'bold' } },
                    afterBuildTicks: scale => {
                        const values = new Set(boundaryValues.map(Number));
                        scale.ticks.forEach(tick => values.add(Number(tick.value)));
                        values.add(axisStart.getTime());
                        values.add(axisEnd.getTime());
                        scale.ticks = [...values].filter(Number.isFinite).sort((a, b) => a - b).map(value => ({ value }));
                    },
                    ticks: { autoSkip: false, maxRotation: 55, minRotation: 55, padding: 8, callback: value => formatRealisationGanttDate(value) },
                    grid: { color: 'rgba(67, 96, 78, .12)' }
                },
                y: {
                    title: { display: true, text: 'Code ZAP : nom ZAP - Produit - Sous Activité', font: { weight: 'bold' } },
                    ticks: { autoSkip: false, padding: 8, font: { size: rows.length > 16 ? 9 : 10, lineHeight: 1.15 }, callback: function(value) { return wrapRealisationGanttAxisLabel(this.getLabelForValue(value), false); } },
                    grid: { display: false }
                }
            }
        }
    });
    zapAggregationPopupCharts.push(chart);
    return chart;
}

function renderZapAggregationPopupCharts(rows) {
    destroyZapAggregationPopupCharts();
    (rows || []).forEach((aggregate, index) => renderZapAggregationPopupChart(aggregate, index));
}

window.openZapAggregationDetails = function(id = null) {
    const body = document.getElementById('zapAggregationDetailsModalBody');
    if (!body) return;
    const rows = id ? [zapAggregationDetailStore.get(id)].filter(Boolean) : zapAggregationCurrentIds.map(key => zapAggregationDetailStore.get(key)).filter(Boolean);
    destroyZapAggregationPopupCharts();
    body.innerHTML = rows.length
        ? rows.map((row, index) => buildZapAggregationDetailHtml(row, index)).join('')
        : '<p class="text-muted mb-0">Sélectionnez l’onglet Produit ou Activité afin d’afficher la décomposition de la formule.</p>';
    const element = document.getElementById('zapAggregationDetailsModal');
    if (element && window.bootstrap?.Modal) {
        const modal = bootstrap.Modal.getOrCreateInstance(element);
        modal.show();
        window.setTimeout(() => renderZapAggregationPopupCharts(rows), 180);
    } else {
        renderZapAggregationPopupCharts(rows);
    }
};

window.openZapRawRealisationDetails = function(id, index) {
    const r = zapLastRawDisplayedRecords[Number(index)] || zapLastRawDisplayedRecords.find(x => String(x.id || '') === String(id || ''));
    const body = document.getElementById('zapAggregationDetailsModalBody');
    if (!body) return;
    destroyZapAggregationPopupCharts();
    if (!r) {
        body.innerHTML = '<p>Détail indisponible.</p>';
    } else {
        const synthetic = {
            id: `raw_${r.id || index}`,
            aggregationDimension: 'produit',
            niveau: 'ZAP',
            entite: r.entite,
            activiteBase: r.activiteBase,
            produit: r.produit,
            valeur: Number(r.valeur || 0),
            totalDays: Number(getRealisationInclusiveDuration(r) || 0),
            components: [r],
            isAnomaly: !!r.isAnomaly,
            isDoublon: !!r.isDoublon
        };
        body.innerHTML = `<div class="zap-aggregation-summary-card"><span class="zap-aggregation-badge">Réalisation élémentaire</span><h5 class="mt-2">${escapeRealisationHtml(r.entite)} — ${escapeRealisationHtml(getRealisationDimensionValue(r, 'ZAP'))}</h5><div><strong>Début :</strong> ${formatZapComponentDate(r.dateStart)} &nbsp; | &nbsp; <strong>Fin :</strong> ${formatZapComponentDate(r.dateEnd)} &nbsp; | &nbsp; <strong>Durée :</strong> ${Number(getRealisationInclusiveDuration(r) || 0)} jour(s) &nbsp; | &nbsp; <strong>Réalisation :</strong> ${Number(r.valeur || 0).toLocaleString('fr-FR')}</div><div class="mt-2"><strong>Statut :</strong> ${escapeRealisationHtml(getRealisationStatusText(r, 'Valide'))}</div></div>${buildZapPopupChartHtml(synthetic, 0)}`;
        const element = document.getElementById('zapAggregationDetailsModal');
        if (element && window.bootstrap?.Modal) {
            const modal = bootstrap.Modal.getOrCreateInstance(element);
            modal.show();
            window.setTimeout(() => { destroyZapAggregationPopupCharts(); renderZapAggregationPopupChart(synthetic, 0); }, 180);
            return;
        }
        renderZapAggregationPopupChart(synthetic, 0);
    }
    const element = document.getElementById('zapAggregationDetailsModal');
    if (element && window.bootstrap?.Modal) bootstrap.Modal.getOrCreateInstance(element).show();
};

function restoreZapDetailTableHeadings(){const d=getRealisationSelectedDimension('ZAP'),h=document.getElementById('real-detail-label-heading-zap'),s=document.getElementById('real-detail-start-heading-zap'),e=document.getElementById('real-detail-end-heading-zap');if(h)h.textContent=getRealisationDimensionConfig(d).label;if(s)s.textContent='Date de début de la réalisation';if(e)e.textContent='Date de fin de la réalisation';}
function updateZapAggregationModeUi(){const d=getRealisationSelectedDimension('ZAP'),agg=['produit','activite'].includes(d),card=document.getElementById('real-scroll-zap')?.closest('.realisation-level-card'),btn=document.getElementById('real-zap-details-button'),help=document.getElementById('real-zap-aggregation-help'),bounds=document.getElementById('real-axis-boundaries-zap');if(card)card.classList.toggle('real-zap-aggregate-mode',agg);if(btn)btn.classList.toggle('d-none',!agg);if(help)help.classList.toggle('d-none',!agg);if(bounds){if(agg)bounds.innerHTML=`<span class="realisation-axis-boundary"><i class="fas fa-calculator"></i> <strong>${d==='produit'?'Produit = somme des Sous Activités':'Activité = somme des Produits'}</strong></span><span class="realisation-axis-boundary">Axe X : <strong>nombre total de jours de réalisation</strong></span>`;else if(!document.getElementById('real-axis-start-zap'))bounds.innerHTML=`<span class="realisation-axis-boundary realisation-axis-boundary-start"><i class="fas fa-play-circle"></i> Date de début minimale : <strong id="real-axis-start-zap">—</strong></span><span class="realisation-axis-boundary realisation-axis-boundary-end">Date de fin maximale : <strong id="real-axis-end-zap">—</strong> <i class="fas fa-flag-checkered"></i></span>`;}if(!agg)restoreZapDetailTableHeadings();}
const zapAggregationLabelsPlugin={id:'zapAggregationLabelsPlugin',afterDatasetsDraw(chart){if(!chart?.chartArea)return;const meta=chart.getDatasetMeta(0),rows=chart.data?.datasets?.[0]?._aggregates||[],ctx=chart.ctx;ctx.save();meta.data.forEach((bar,i)=>{const r=rows[i];if(!r||!bar)return;const l=Math.min(bar.base,bar.x),rr=Math.max(bar.base,bar.x),v=`Réalisation totale : ${Number(r.valeur||0).toLocaleString('fr-FR')}`,days=`${Number(r.totalDays||0)} jour(s)`;ctx.font='700 11px Segoe UI';ctx.textBaseline='middle';const w=ctx.measureText(v).width;if(rr-l>w+18){ctx.fillStyle='#fff';ctx.textAlign='center';ctx.fillText(v,l+(rr-l)/2,bar.y);}else{ctx.fillStyle='#7a4e00';ctx.textAlign='left';ctx.fillText(v,rr+8,bar.y-7);}ctx.font='700 10px Segoe UI';ctx.fillStyle='#7a4e00';ctx.textAlign='left';ctx.fillText(days,rr+8,bar.y+9);});ctx.restore();}};
function createZapAggregatedDurationChart(canvas,stage,aggregates){const rows=[...aggregates].sort((a,b)=>String(a.entite).localeCompare(String(b.entite),'fr')||getZapAggregateLabel(a).localeCompare(getZapAggregateLabel(b),'fr')),maxDays=Math.max(1,...rows.map(r=>Number(r.totalDays||0))),w=Math.max(1180,760+Math.min(80,rows.length)*26),h=Math.max(470,190+rows.length*72);stage.classList.add('realisation-gantt-stage');stage.style.width=`${w}px`;stage.style.minWidth=`${w}px`;stage.style.height=`${h}px`;const ds={label:'Jours de réalisation',data:rows.map(r=>r.totalDays),_aggregates:rows,backgroundColor:'rgba(243, 156, 18, .72)',borderColor:'rgba(211, 84, 0, 1)',borderWidth:1.5,borderRadius:5,borderSkipped:false,barPercentage:.52,categoryPercentage:.7},d=getRealisationSelectedDimension('ZAP'),cfg=getRealisationDimensionConfig(d),chart=new Chart(canvas.getContext('2d'),{type:'bar',data:{labels:rows.map(getZapAggregateLabel),datasets:[ds]},plugins:[zapAggregationLabelsPlugin],options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',layout:{padding:{right:230,top:20,bottom:25,left:10}},plugins:{legend:{display:false},tooltip:{callbacks:{title:items=>rows[items?.[0]?.dataIndex]?.entite||'ZAP',label:ctx=>{const r=rows[ctx.dataIndex];return [`${cfg.label} : ${d==='activite'?r.activiteBase:r.produit}`,`Réalisation totale : ${Number(r.valeur||0).toLocaleString('fr-FR')}`,`Jours de réalisation : ${Number(r.totalDays||0)}`,getZapAggregateFormulaText(r),getRealisationAggregationCompositionText(r, d),'Détails complets : bouton « Afficher les Détails »'];}}}},scales:{x:{beginAtZero:true,suggestedMax:Math.ceil(maxDays*1.2),title:{display:true,text:'Nombre total de jours de réalisation (somme des durées inclusives)',font:{weight:'bold'}},ticks:{precision:0}},y:{title:{display:true,text:`Code ZAP : nom ZAP - ${cfg.label}`,font:{weight:'bold'}},ticks:{autoSkip:false,font:{size:10},callback:function(v){return wrapRealisationGanttAxisLabel(this.getLabelForValue(v),false);}},grid:{display:false}}}}});realisationTimelineChartsRefs.ZAP.push({chart,name:`zap_${d}_agregation_hierarchique`});return chart;}
function renderZapAggregatedDetailTable(rows,d) {
    const section = document.getElementById('real-detail-section-zap');
    const tbody = document.getElementById('real-detail-table-zap');
    const count = document.getElementById('real-detail-count-zap');
    const total = document.getElementById('real-detail-total-zap');
    const cfg = getRealisationDimensionConfig(d);
    const h = document.getElementById('real-detail-label-heading-zap');
    const sh = document.getElementById('real-detail-start-heading-zap');
    const eh = document.getElementById('real-detail-end-heading-zap');
    if (!section || !tbody) return;
    section.classList.toggle('d-none', !rows.length);
    if (count) count.textContent = rows.length.toLocaleString('fr-FR');
    if (total) total.textContent = rows.reduce((s,r) => s + Number(r.valeur || 0), 0).toLocaleString('fr-FR');
    if (h) h.textContent = cfg.label;
    if (sh) sh.textContent = 'Type de calcul';
    if (eh) eh.textContent = 'Composition détaillée';
    tbody.innerHTML = rows.map((r,i) => {
        const label = d === 'activite' ? r.activiteBase : r.produit;
        const compositionHtml = getRealisationAggregationCompositionHtml(r, d);
        return `<tr>
            <td class="text-center fw-bold">${i+1}</td>
            <td class="text-center"><span class="badge bg-secondary">ZAP</span></td>
            <td class="fw-semibold">${escapeRealisationHtml(r.entite)}</td>
            <td>${escapeRealisationHtml(label)}</td>
            <td class="text-center">Agrégation hiérarchique</td>
            <td class="realisation-composition-cell">${compositionHtml}</td>
            <td class="text-end fw-bold">${Number(r.totalDays||0)} jour(s)</td>
            <td class="text-end fw-bold text-warning">${Number(r.valeur||0).toLocaleString('fr-FR')}</td>
            <td class="text-center">—</td>
            <td class="text-center">—</td>
            <td class="text-center">${r.components?.length||0} source(s)</td>
            <td class="text-center">${r.isAnomaly?'<span class="badge bg-danger">Anomalies de liaison</span>':'<span class="badge bg-success">Aucune</span>'}</td>
            <td class="text-center">${r.isDoublon?'<span class="badge bg-danger">DOUBLON</span>':'<span class="badge bg-success">Mission distincte</span>'}</td>
            <td class="text-center"><button type="button" class="btn btn-warning btn-sm fw-bold" onclick="window.openZapAggregationDetails('${escapeRealisationHtml(r.id)}')"><i class="fas fa-search-plus"></i> Afficher les Détails</button></td>
        </tr>`;
    }).join('');
}

function getDisplayedRealisationRecords(level, records, settings, forcedEntities = null) {
    const levelKey = String(level || '').toUpperCase();
    const levelRecords = (records || []).filter(record => record.niveau === levelKey);
    let entityNames;
    if (Array.isArray(forcedEntities) && forcedEntities.length) {
        entityNames = forcedEntities;
    } else {
        entityNames = getRankedRealisationGanttEntities(levelRecords, settings?.top || 'all').map(([entity]) => entity);
    }
    const selected = new Set(entityNames);
    return levelRecords
        .filter(record => selected.has(record.entite))
        .sort((a, b) => {
            const startDiff = (a.dateStart?.getTime() || 0) - (b.dateStart?.getTime() || 0);
            if (startDiff) return startDiff;
            const entityDiff = String(a.entite || '').localeCompare(String(b.entite || ''), 'fr');
            if (entityDiff) return entityDiff;
            return String(getRealisationDimensionValue(a, levelKey) || '').localeCompare(String(getRealisationDimensionValue(b, levelKey) || ''), 'fr');
        });
}

function renderRealisationDetailTable(level, records, settings, forcedEntities = null) {
    const levelKey = String(level || '').toUpperCase();
    const levelLower = levelKey.toLowerCase();
    const section = document.getElementById(`real-detail-section-${levelLower}`);
    const tbody = document.getElementById(`real-detail-table-${levelLower}`);
    const countNode = document.getElementById(`real-detail-count-${levelLower}`);
    const totalNode = document.getElementById(`real-detail-total-${levelLower}`);
    if (!section || !tbody) return;

    const displayed = getDisplayedRealisationRecords(levelKey, records, settings, forcedEntities);
    if (levelKey === 'ZAP') { zapLastRawDisplayedRecords = displayed; restoreZapDetailTableHeadings(); }
    if (levelKey === 'CISCO') { ciscoLastRawDisplayedRecords = displayed; restoreCiscoDetailTableHeadings(); }
    section.classList.toggle('d-none', displayed.length === 0);
    if (!displayed.length) {
        tbody.innerHTML = `<tr><td colspan="${(['ZAP','CISCO','DREN'].includes(levelKey)) ? 14 : 13}" class="text-center text-muted py-3">Aucune réalisation à afficher dans le tableau.</td></tr>`;
        if (countNode) countNode.textContent = '0';
        if (totalNode) totalNode.textContent = '0';
        return;
    }

    const total = displayed.reduce((sum, record) => sum + Number(record.valeur || 0), 0);
    if (countNode) countNode.textContent = displayed.length.toLocaleString('fr-FR');
    if (totalNode) totalNode.textContent = total.toLocaleString('fr-FR');

    tbody.innerHTML = displayed.map((record, index) => {
        const duration = getRealisationInclusiveDuration(record);
        const startText = record.dateStart ? formatRealisationGanttDate(record.dateStart) : 'Non renseignée';
        const endText = record.dateEnd ? formatRealisationGanttDate(record.dateEnd) : 'Non renseignée';
        const followupText = record.dateFollowup ? formatRealisationGanttDate(record.dateFollowup) : '—';
        const submissionText = record.dateSubmission ? formatRealisationGanttDate(record.dateSubmission) : '—';
        const anomalyStatus = record.isAnomaly
            ? '<span class="badge bg-danger text-white">Anomalies de liaison</span>'
            : '<span class="badge bg-success">Aucune anomalie de liaison</span>';
        const duplicateStatus = record.isDoublon
            ? '<span class="badge bg-danger text-white">DOUBLON</span>'
            : '<span class="badge bg-success">Mission distincte</span>';
        return `<tr>
            <td class="text-center fw-bold">${index + 1}</td>
            <td class="text-center"><span class="badge bg-secondary">${escapeRealisationHtml(levelKey)}</span></td>
            <td class="fw-semibold" title="${escapeRealisationHtml(record.entite)}">${escapeRealisationHtml(record.entite)}</td>
            <td title="${escapeRealisationHtml(getRealisationDimensionValue(record, levelKey))}">${escapeRealisationHtml(getRealisationDimensionValue(record, levelKey))}</td>
            <td class="text-center text-nowrap">${startText}</td>
            <td class="text-center text-nowrap">${endText}</td>
            <td class="text-center fw-bold">${duration === null ? '—' : duration.toLocaleString('fr-FR')}</td>
            <td class="text-end fw-bold text-success">${Number(record.valeur || 0).toLocaleString('fr-FR')}</td>
            <td class="text-center text-nowrap">${followupText}</td>
            <td class="text-center text-nowrap">${submissionText}</td>
            <td class="text-center text-nowrap">${escapeRealisationHtml(record.id || '—')}</td>
            <td class="text-center">${anomalyStatus}</td>
            <td class="text-center">${duplicateStatus}</td>
            ${levelKey === 'ZAP' ? `<td class="text-center"><button type="button" class="btn btn-outline-warning btn-sm" onclick="window.openZapRawRealisationDetails('${escapeRealisationHtml(record.id || '')}', ${index})"><i class="fas fa-search-plus"></i> Afficher les Détails</button></td>` : ''}
            ${levelKey === 'CISCO' ? `<td class="text-center"><button type="button" class="btn btn-outline-primary btn-sm" onclick="window.openCiscoRawRealisationDetails('${escapeRealisationHtml(record.id || '')}', ${index})"><i class="fas fa-search-plus"></i> Afficher les Détails</button></td>` : ''}
            ${levelKey === 'DREN' ? `<td class="text-center"><button type="button" class="btn btn-outline-success btn-sm" onclick="window.openDrenRawRealisationDetails('${escapeRealisationHtml(record.id || '')}', ${index})"><i class="fas fa-search-plus"></i> Afficher les Détails</button></td>` : ''}
        </tr>`;
    }).join('');
}

function wrapRealisationGanttAxisLabel(label, individual = false) {
    const text = String(label || '').trim();
    if (!text) return [''];
    const maxChars = individual ? 44 : 38;
    const maxLines = individual ? 3 : 4;
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    words.forEach(word => {
        const candidate = current ? `${current} ${word}` : word;
        if (!current || candidate.length <= maxChars) current = candidate;
        else {
            lines.push(current);
            current = word;
        }
    });
    if (current) lines.push(current);
    if (lines.length <= maxLines) return lines;
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, Math.max(1, maxChars - 1))}…`;
    return kept;
}

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
    const base = individual ? 155 : 175;
    // Une ligne plus haute réserve des zones distinctes pour la date de début,
    // la barre, la valeur et la date de fin.
    const rowHeight = individual ? 90 : 96;
    return Math.min(26000, Math.max(individual ? 410 : 520, base + rows * rowHeight));
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


function buildRealisationGanttRows(records, level = 'DREN') {
    const counts = new Map();
    return [...records].sort((a, b) => {
        const dateDiff = (a.dateStart?.getTime() || 0) - (b.dateStart?.getTime() || 0);
        if (dateDiff) return dateDiff;
        const entityDiff = String(a.entite).localeCompare(String(b.entite), 'fr');
        if (entityDiff) return entityDiff;
        const labelDiff = String(getRealisationDimensionValue(a, level)).localeCompare(String(getRealisationDimensionValue(b, level)), 'fr');
        if (labelDiff) return labelDiff;
        return String(a.id).localeCompare(String(b.id), 'fr');
    }).map((record) => {
        const baseLabel = getRealisationAxisLabel(record, level);
        const next = (counts.get(baseLabel) || 0) + 1;
        counts.set(baseLabel, next);
        return {
            record,
            label: next > 1 ? `${baseLabel} — Mission ${next}` : baseLabel
        };
    });
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
            barPercentage: .48,
            categoryPercentage: .68
        };
    });
}

function buildRealisationGanttOptions(level, settings, axisStart, axisEnd, rowCount, individual = false, boundaryValues = []) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        normalized: true,
        indexAxis: 'y',
        interaction: { mode: 'nearest', axis: 'y', intersect: true },
        layout: { padding: { right: 210, top: 24, bottom: 44, left: 10 } },
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
                            `${getRealisationDimensionConfig(getRealisationSelectedDimension(level)).label} : ${getRealisationDimensionValue(record, level)}`,
                            `Statut : ${getRealisationStatusText(record)}`
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
                title: { display: true, text: getRealisationYAxisTitle(level, individual), font: { weight: 'bold' } },
                ticks: {
                    autoSkip: false,
                    padding: 8,
                    font: { size: rowCount > 24 ? 9 : 10, lineHeight: 1.15 },
                    callback: function(value) {
                        return wrapRealisationGanttAxisLabel(this.getLabelForValue(value), individual);
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
    const rows = buildRealisationGanttRows(records.filter(item => selected.has(item.entite)), level);
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
        options: buildRealisationGanttOptions(level, settings, axisStart, axisEnd, rows.length, false, boundaryValues)
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
        const entityRows = buildRealisationGanttRows(records.filter(item => item.entite === entity), level);
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
            barPercentage: .48,
            categoryPercentage: .68
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
            data: { labels: entityRows.map(row => row.label), datasets: [dataset] },
            plugins: [realisationGanttLabelsPlugin],
            options: buildRealisationGanttOptions(level, settings, axisStart, axisEnd, entityRows.length, true, boundaryValues)
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
    if (levelKey === 'DREN' && isDrenHierarchicalAggregationMode(levelKey)) {
        const dimension = getRealisationSelectedDimension('DREN');
        const allAggregates = aggregateDrenRealisationRecords(levelRecords, dimension);
        let ranked = Object.entries(allAggregates.reduce((acc,r)=>{acc[r.entite]=(acc[r.entite]||0)+Number(r.valeur||0);return acc;},{})).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'fr'));
        if (settings.top !== 'all') ranked = ranked.slice(0, Number(settings.top));
        const selected = new Set(ranked.map(([e])=>e));
        const aggregates = allAggregates.filter(r=>selected.has(r.entite));
        registerDrenAggregationDetails(aggregates);
        renderDrenAggregatedDetailTable(aggregates, dimension);
        empty.style.display = aggregates.length ? 'none' : 'flex';
        if (!aggregates.length) { canvas.style.display='none'; individualContainer.classList.add('d-none'); return; }
        scroll.classList.remove('d-none'); individualContainer.classList.add('d-none'); individualContainer.innerHTML=''; canvas.style.display='block';
        createDrenAggregatedDurationChart(canvas, stage, aggregates);
        renderRealisationLegend(levelKey, ranked.map(([entity,total],index)=>({label:entity,color:getSubmissionTimelineColor(index,1),total})), null);
        return;
    }
    if (levelKey === 'CISCO' && isCiscoHierarchicalAggregationMode(levelKey)) {
        const dimension = getRealisationSelectedDimension('CISCO');
        const allAggregates = aggregateCiscoRealisationRecords(levelRecords, dimension);
        let ranked = Object.entries(allAggregates.reduce((acc,r)=>{acc[r.entite]=(acc[r.entite]||0)+Number(r.valeur||0);return acc;},{})).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'fr'));
        if (settings.top !== 'all') ranked = ranked.slice(0, Number(settings.top));
        const selected = new Set(ranked.map(([e])=>e));
        const aggregates = allAggregates.filter(r=>selected.has(r.entite));
        registerCiscoAggregationDetails(aggregates);
        renderCiscoAggregatedDetailTable(aggregates, dimension);
        empty.style.display = aggregates.length ? 'none' : 'flex';
        if (!aggregates.length) { canvas.style.display='none'; individualContainer.classList.add('d-none'); return; }
        scroll.classList.remove('d-none'); individualContainer.classList.add('d-none'); individualContainer.innerHTML=''; canvas.style.display='block';
        createCiscoAggregatedDurationChart(canvas, stage, aggregates);
        renderRealisationLegend(levelKey, ranked.map(([entity,total],index)=>({label:entity,color:getSubmissionTimelineColor(index,1),total})), null);
        return;
    }
    if (levelKey === 'ZAP' && isZapHierarchicalAggregationMode(levelKey)) {
        const dimension = getRealisationSelectedDimension('ZAP');
        const allAggregates = aggregateZapRealisationRecords(levelRecords, dimension);
        let ranked = Object.entries(allAggregates.reduce((acc,r)=>{acc[r.entite]=(acc[r.entite]||0)+Number(r.valeur||0);return acc;},{})).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'fr'));
        if (settings.top !== 'all') ranked = ranked.slice(0, Number(settings.top));
        const selected = new Set(ranked.map(([e])=>e));
        const aggregates = allAggregates.filter(r=>selected.has(r.entite));
        registerZapAggregationDetails(aggregates);
        renderZapAggregatedDetailTable(aggregates, dimension);
        empty.style.display = aggregates.length ? 'none' : 'flex';
        if (!aggregates.length) { canvas.style.display='none'; individualContainer.classList.add('d-none'); return; }
        scroll.classList.remove('d-none'); individualContainer.classList.add('d-none'); individualContainer.innerHTML=''; canvas.style.display='block';
        createZapAggregatedDurationChart(canvas, stage, aggregates);
        renderRealisationLegend(levelKey, ranked.map(([entity,total],index)=>({label:entity,color:getSubmissionTimelineColor(index,1),total})), null);
        return;
    }
    if (!levelRecords.length) {
        scroll.classList.remove('d-none');
        individualContainer.classList.add('d-none');
        individualContainer.innerHTML = '';
        canvas.style.display = 'none';
        empty.style.display = 'flex';
        renderRealisationLegend(levelKey, [], null);
        renderRealisationDetailTable(levelKey, [], settings);
        return;
    }
    const starts = levelRecords.map(item => item.dateStart.getTime());
    const ends = levelRecords.map(item => item.dateEnd.getTime());
    const axisStart = settings.axisStart || new Date(Math.min(...starts));
    const axisEnd = settings.axisEnd || new Date(Math.max(...ends));
    renderRealisationDetailTable(levelKey, levelRecords, settings);
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
        renderRealisationDetailTable(levelKey, [], settings);
        return;
    }

    renderRealisationDetailTable(levelKey, records, settings, ranked.map(([entity]) => entity));
    const labels = periodKeys.map(key => formatRealisationPeriodLabel(key, settings.granularity));
    const profile = getRealisationChartProfile(settings.chartType);
    const entityStatusMap = getRealisationEntityStatusMap(records, levelKey);
    const series = getRealisationSeries(byEntity, ranked, periodKeys, settings, profile, entityStatusMap);
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
    updateRealisationDrenDimensionUi();
    updateRealisationCiscoDimensionUi();
    updateRealisationZapDimensionUi();
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
        if (String(row.getCell(12).value || '').toUpperCase().includes('DOUBLON')) {
            row.getCell(12).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE0E0' } };
            row.getCell(12).font = { bold: true, color: { argb: 'FFB42318' } };
        }
    }
}

function addRealisationExcelDataSheet(workbook, level, records) {
    const sheetName = getUniqueRealisationExcelSheetName(workbook, `Données ${level}`);
    const worksheet = workbook.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
    const fillArgb = getRealisationExcelArgb(level);
    worksheet.getCell('A1').value = `Réalisations ${level} — Données détaillées`;
    styleRealisationExcelTitle(worksheet, 'A1:L1', fillArgb);
    worksheet.getCell('A2').value = 'Les dates correspondent aux champs « Date debut realisation dans om missionnaire » et « Date fin realisation dans om missionnaire ».';
    worksheet.mergeCells('A2:L2');
    worksheet.getCell('A2').font = { italic: true, color: { argb: 'FF52606D' } };
    worksheet.getCell('A2').alignment = { wrapText: true };

    const headerRowNumber = 4;
    const headers = ['ID Kobo', 'Niveau', 'Entité responsable', 'Sous-activité concernée', 'Date début réalisation OM', 'Date fin réalisation OM', 'Durée (jours inclusifs)', 'Valeur de réalisation', 'Date de suivi', 'Date de soumission', 'Anomalies de liaison', 'DOUBLON'];
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
            record.isAnomaly ? 'Anomalies de liaison' : 'Aucune anomalie de liaison',
            record.isDoublon ? 'DOUBLON' : 'Mission distincte'
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

    const widths = [18, 11, 34, 48, 19, 19, 21, 20, 16, 18, 25, 18];
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


/* ======================================================================
   EXPORTS SYNCHRONISÉS — ONGLET 1 ÉVOLUTION TEMPORELLE DES RÉALISATIONS
   Les exports partent de la vue courante (tableaux DOM + graphiques actifs),
   afin de conserver Activité / Produit / Sous Activité / Sous Produit,
   agrégations hiérarchiques, compositions détaillées et statuts qualité.
   ====================================================================== */
function getRealisationExportLevels(scope) {
    const key = String(scope || 'STD').toUpperCase();
    return ['DREN','CISCO','ZAP'].includes(key) ? [key] : ['DREN','CISCO','ZAP'];
}

function realisationExportCleanText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function getRealisationCurrentTableData(level) {
    const key = String(level || '').toUpperCase();
    const lower = key.toLowerCase();
    const table = document.querySelector(`#real-detail-section-${lower} table`);
    const dimensionKey = getRealisationSelectedDimension(key);
    const dimension = getRealisationDimensionConfig(dimensionKey).label;
    if (!table) return { level:key, dimensionKey, dimension, headers:[], rows:[] };
    const headers = Array.from(table.querySelectorAll('thead th')).map(th => realisationExportCleanText(th.textContent));
    const rows = Array.from(table.querySelectorAll('tbody tr')).map(tr =>
        Array.from(tr.querySelectorAll('td')).map(td => realisationExportCleanText(td.textContent))
    ).filter(row => row.length && row.some(cell => cell && !/Aucune réalisation à afficher/i.test(cell)));
    return { level:key, dimensionKey, dimension, headers, rows };
}

function getRealisationCurrentCriteria(scope='STD') {
    const settings = getRealisationTimelineSettings();
    const levels = getRealisationExportLevels(scope);
    const granularityLabels = { day:'Jour', week:'Semaine', month:'Mois', quarter:'Trimestre', semester:'Semestre', year:'Année' };
    const modeLabels = { detailed:'Données détaillées', cumulative:'Données cumulées' };
    return {
        exporte_le: new Date().toISOString(),
        portee: String(scope || 'STD').toUpperCase(),
        niveaux: levels.join(', '),
        graduation_temporelle: granularityLabels[settings.granularity] || settings.granularity,
        type_donnees: modeLabels[settings.mode] || settings.mode,
        type_graphique: REALISATION_CHART_DESCRIPTIONS?.[settings.chartType]?.title || settings.chartType,
        organisation: settings.layout === 'individual' ? 'Affichage individuel' : 'Affichage groupé',
        entites_affichees: settings.top === 'all' ? 'Toutes' : `Top ${settings.top}`,
        date_debut_minimale_om: settings.start ? formatISODateUTC(settings.start) : '',
        date_fin_maximale_om: settings.end ? formatISODateUTC(settings.end) : '',
        dimension_dren: getRealisationDimensionConfig(getRealisationSelectedDimension('DREN')).label,
        dimension_cisco: getRealisationDimensionConfig(getRealisationSelectedDimension('CISCO')).label,
        dimension_zap: getRealisationDimensionConfig(getRealisationSelectedDimension('ZAP')).label
    };
}

function makeUniqueRealisationJsonKeys(headers) {
    const used = new Map();
    return headers.map((header,index) => {
        let base = normalizeRealisationKey(header || `colonne_${index+1}`) || `colonne_${index+1}`;
        const n = (used.get(base) || 0) + 1;
        used.set(base,n);
        return n === 1 ? base : `${base}_${n}`;
    });
}

function getRealisationPowerBiRows(scope='STD') {
    const criteria = getRealisationCurrentCriteria(scope);
    const output = [];
    getRealisationExportLevels(scope).forEach(level => {
        const table = getRealisationCurrentTableData(level);
        const keys = makeUniqueRealisationJsonKeys(table.headers);
        table.rows.forEach((row,rowIndex) => {
            const item = {
                exporte_le: criteria.exporte_le,
                portee_export: criteria.portee,
                niveau_export: level,
                dimension_affichee: table.dimension,
                type_graphique: criteria.type_graphique,
                graduation_temporelle: criteria.graduation_temporelle,
                type_donnees: criteria.type_donnees,
                organisation_graphique: criteria.organisation,
                ligne_export: rowIndex + 1
            };
            keys.forEach((key,index) => { item[key] = row[index] ?? ''; });
            output.push(item);
        });
    });
    return output;
}

function realisationCsvCell(value) {
    return `"${String(value ?? '').replace(/"/g,'""')}"`;
}

window.exportRealisationViewToJSON = function(scope='STD') {
    try {
        const rows = getRealisationPowerBiRows(scope);
        if (!rows.length) throw new Error('Aucune ligne actuellement affichée à exporter.');
        const stamp = new Date().toISOString().slice(0,19).replace(/[-:T]/g,'');
        // Tableau JSON plat : import direct et simple dans Power BI / Power Query.
        const blob = new Blob([JSON.stringify(rows, null, 2)], {type:'application/json;charset=utf-8'});
        downloadFile(blob, `realisations_${String(scope).toLowerCase()}_powerbi_${stamp}.json`);
    } catch(error) {
        console.error('Export JSON Réalisations impossible :', error);
        alert(`Export JSON impossible : ${error.message || error}`);
    }
};

window.exportRealisationViewToCSV = function(scope='STD') {
    try {
        const rows = getRealisationPowerBiRows(scope);
        if (!rows.length) throw new Error('Aucune ligne actuellement affichée à exporter.');
        const headers = [];
        rows.forEach(row => Object.keys(row).forEach(key => { if (!headers.includes(key)) headers.push(key); }));
        const lines = [headers.map(realisationCsvCell).join(';')];
        rows.forEach(row => lines.push(headers.map(header => realisationCsvCell(row[header] ?? '')).join(';')));
        const stamp = new Date().toISOString().slice(0,19).replace(/[-:T]/g,'');
        downloadFile(new Blob(['\uFEFF'+lines.join('\r\n')], {type:'text/csv;charset=utf-8'}), `realisations_${String(scope).toLowerCase()}_${stamp}.csv`);
    } catch(error) {
        console.error('Export CSV Réalisations impossible :', error);
        alert(`Export CSV impossible : ${error.message || error}`);
    }
};

async function getRealisationCurrentExportImages(scope='STD') {
    const images = [];
    for (const level of getRealisationExportLevels(scope)) {
        const refs = Array.isArray(realisationTimelineChartsRefs[level]) ? realisationTimelineChartsRefs[level].filter(ref => ref?.chart) : [];
        for (const ref of refs) {
            const generated = await buildRealisationHighResolutionImage(ref, 'png', level);
            images.push({
                level,
                title: getRealisationExportTitle(ref, level),
                dataUrl: generated.dataUrl,
                width: generated.width,
                height: generated.height,
                ref
            });
        }
    }
    return images;
}

window.exportRealisationViewToHTML = async function(scope='STD') {
    try {
        const levels = getRealisationExportLevels(scope);
        const criteria = getRealisationCurrentCriteria(scope);
        const images = await getRealisationCurrentExportImages(scope);
        if (!images.length) throw new Error('Aucun graphique disponible. Actualisez d’abord l’analyse.');
        let body = `<h1>Évolution des Réalisations sur la période OM missionnaire — ${escapeRealisationHtml(String(scope).toUpperCase())}</h1>`;
        body += '<h2>Critères appliqués</h2><table><tbody>' + Object.entries(criteria).map(([k,v]) => `<tr><th>${escapeRealisationHtml(k)}</th><td>${escapeRealisationHtml(v)}</td></tr>`).join('') + '</tbody></table>';
        for (const level of levels) {
            const table = getRealisationCurrentTableData(level);
            body += `<section class="level"><h2>Réalisations des ${level} — ${escapeRealisationHtml(table.dimension)}</h2>`;
            const levelImages = images.filter(image => image.level === level);
            for (const image of levelImages) body += `<figure><h3>${escapeRealisationHtml(image.title)}</h3><img src="${image.dataUrl}" alt="${escapeRealisationHtml(image.title)}"></figure>`;
            if (table.rows.length) {
                body += '<h3>Tableau détaillé actuellement affiché</h3><div class="table-wrap"><table><thead><tr>' + table.headers.map(h=>`<th>${escapeRealisationHtml(h)}</th>`).join('') + '</tr></thead><tbody>' + table.rows.map(row=>'<tr>'+row.map(v=>`<td>${escapeRealisationHtml(v)}</td>`).join('')+'</tr>').join('') + '</tbody></table></div>';
            }
            body += '</section>';
        }
        const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Export des Réalisations</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#203040;background:#fff}h1{color:#0b6b3a}h2{margin-top:32px;color:#174f78;border-bottom:2px solid #dfe8ec;padding-bottom:6px}figure{margin:20px 0 32px}img{display:block;max-width:100%;height:auto;border:1px solid #d8e0e5}.table-wrap{overflow:auto;max-width:100%}table{border-collapse:collapse;width:100%;font-size:12px;margin:12px 0 28px}th,td{border:1px solid #ccd6dc;padding:6px;vertical-align:top}th{background:#eaf4ef;font-weight:700}.level{page-break-before:auto}</style></head><body>${body}</body></html>`;
        const stamp = new Date().toISOString().slice(0,19).replace(/[-:T]/g,'');
        downloadFile(new Blob([html],{type:'text/html;charset=utf-8'}), `realisations_${String(scope).toLowerCase()}_graphiques_tableaux_${stamp}.html`);
    } catch(error) {
        console.error('Export HTML Réalisations impossible :', error);
        alert(`Export HTML impossible : ${error.message || error}`);
    }
};

async function exportRealisationExcelWorkbookCurrent(scope='STD') {
    if (typeof ExcelJS === 'undefined') throw new Error('La bibliothèque ExcelJS est indisponible.');
    const levels = getRealisationExportLevels(scope);
    const images = await getRealisationCurrentExportImages(scope);
    if (!images.length) throw new Error('Aucun graphique disponible. Actualisez d’abord l’analyse.');
    const criteria = getRealisationCurrentCriteria(scope);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Plateforme de Suivi du PMA';
    workbook.created = new Date();
    workbook.subject = 'Évolution temporelle des Réalisations des STD';

    const synth = workbook.addWorksheet('Synthèse');
    synth.addRow(['Évolution des Réalisations sur la période OM missionnaire']);
    synth.getRow(1).font={bold:true,size:18};
    synth.addRow([]);
    synth.addRow(['Niveau','Dimension actuellement affichée','Lignes du tableau','Valeur totale affichée']);
    synth.getRow(3).font={bold:true};
    levels.forEach(level => {
        const table=getRealisationCurrentTableData(level);
        const totalNode=document.getElementById(`real-detail-total-${level.toLowerCase()}`);
        synth.addRow([level,table.dimension,table.rows.length,realisationExportCleanText(totalNode?.textContent||'')]);
    });
    synth.columns=[{width:18},{width:30},{width:20},{width:24}];

    const crit = workbook.addWorksheet('Critères');
    crit.addRow(['Critère','Valeur']); crit.getRow(1).font={bold:true};
    Object.entries(criteria).forEach(([k,v])=>crit.addRow([k,v]));
    crit.columns=[{width:35},{width:70}];

    for (const level of levels) {
        const table=getRealisationCurrentTableData(level);
        const ws=workbook.addWorksheet(`Tableau_${level}`.slice(0,31));
        ws.addRow([`Réalisations des ${level} — ${table.dimension}`]);
        ws.getRow(1).font={bold:true,size:16};
        ws.addRow(table.headers); ws.getRow(2).font={bold:true};
        table.rows.forEach(row=>ws.addRow(row));
        const widths=table.headers.map((h,i)=>Math.min(80,Math.max(12, ...table.rows.slice(0,100).map(r=>String(r[i]||'').length+2), h.length+2)));
        ws.columns=widths.map(width=>({width}));
        ws.eachRow((row,rowNumber)=>{ if(rowNumber>=2) row.alignment={vertical:'top',wrapText:true}; });
        ws.views=[{state:'frozen',ySplit:2}];
    }

    const graphs=workbook.addWorksheet('Graphiques');
    let rowOffset=1;
    for (const image of images) {
        graphs.getCell(`A${rowOffset}`).value=`${image.level} — ${image.title}`;
        graphs.getCell(`A${rowOffset}`).font={bold:true,size:14};
        const imageId=workbook.addImage({base64:image.dataUrl,extension:'png'});
        const width=1250;
        const height=Math.min(820,Math.max(360,Math.round(width*image.height/image.width)));
        graphs.addImage(imageId,{tl:{col:0,row:rowOffset},ext:{width,height}});
        rowOffset += Math.ceil(height/20)+5;
    }
    const buffer=await workbook.xlsx.writeBuffer();
    const stamp=new Date().toISOString().slice(0,19).replace(/[-:T]/g,'');
    downloadFile(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`realisations_${String(scope).toLowerCase()}_vue_actuelle_${stamp}.xlsx`);
}

// Remplacement des wrappers Excel : le classeur suit désormais exactement les tableaux visibles.
window.exportRealisationChartToExcel = async function(level) {
    try { await exportRealisationExcelWorkbookCurrent(level); }
    catch(error){ console.error(error); alert(`Export Excel impossible : ${error.message || error}`); }
};
window.exportAllRealisationChartsToExcel = async function() {
    try { await exportRealisationExcelWorkbookCurrent('STD'); }
    catch(error){ console.error(error); alert(`Export Excel impossible : ${error.message || error}`); }
};

window.exportAllRealisationChartsToWord = async function() {
    try {
        const images=[];
        for (const level of ['DREN','CISCO','ZAP']) {
            const refs=Array.isArray(realisationTimelineChartsRefs[level])?realisationTimelineChartsRefs[level].filter(ref=>ref?.chart):[];
            const table=getRealisationWordTable(level);
            for(let index=0; index<refs.length; index+=1){
                const ref=refs[index];
                const generated=await buildRealisationHighResolutionImage(ref,'png',level);
                const item={blob:realisationDataUrlToBlob(generated.dataUrl),width:generated.width,height:generated.height,title:getRealisationExportTitle(ref,level),level};
                if(index===0 && table.rows.length){item.tableTitle=table.title;item.tableHeaders=table.headers;item.tableRows=table.rows;}
                images.push(item);
            }
        }
        if(!images.length) throw new Error('Aucun graphique disponible. Actualisez d’abord l’analyse.');
        const blob=await pmaFixedExportCreateDocx('Évolution des Réalisations des STD — DREN, CISCO et ZAP',images);
        const stamp=new Date().toISOString().slice(0,19).replace(/[-:T]/g,'');
        pmaFixedExportDownload(blob,`realisations_std_graphiques_tableaux_${stamp}.docx`);
    } catch(error){
        console.error('Export Word global impossible :',error);
        alert(`Export Word impossible : ${error.message || error}`);
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



function getRealisationWordTable(level) {
    const key = String(level || '').toUpperCase();
    const current = getRealisationCurrentTableData(key);
    return {
        headers: current.headers,
        rows: current.rows,
        title: `Tableau détaillé des réalisations affichées — ${key} — ${current.dimension}`
    };
}

window.exportRealisationChartToWord = async function(level) {
    const key = String(level || '').toUpperCase();
    const refs = Array.isArray(realisationTimelineChartsRefs[key]) ? realisationTimelineChartsRefs[key].filter(ref => ref?.chart) : [];
    if (!refs.length) return alert('Aucun graphique disponible pour ce niveau. Actualisez d’abord l’analyse.');
    try {
        const table = getRealisationWordTable(key);
        const images = [];
        for (let index = 0; index < refs.length; index += 1) {
            const ref = refs[index];
            const generated = await buildRealisationHighResolutionImage(ref, 'png', key);
            const item = {
                blob: realisationDataUrlToBlob(generated.dataUrl),
                width: generated.width,
                height: generated.height,
                title: getRealisationExportTitle(ref, key),
                level: key
            };
            if (index === 0 && table.rows.length) {
                item.tableTitle = table.title;
                item.tableHeaders = table.headers;
                item.tableRows = table.rows;
            }
            images.push(item);
        }
        const dimension = getRealisationDimensionConfig(getRealisationSelectedDimension(key)).label;
        const title = `Analyse des Réalisations ${key} — ${dimension}`;
        const blob = await pmaFixedExportCreateDocx(title, images);
        const stamp = new Date().toISOString().slice(0,19).replace(/[-:T]/g,'');
        pmaFixedExportDownload(blob, `realisations_${key.toLowerCase()}_${normalizeRealisationKey(dimension)}_${stamp}.docx`);
    } catch (error) {
        console.error('Export Word des réalisations impossible :', error);
        alert(`Export Word impossible : ${error.message || error}`);
    }
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

async function fetchDataLegacyPaginated() {
    $('#loading-box').show(); $('#error-box').hide();
    $('#table-body').empty(); $('#table-group-header-row').empty(); $('#table-sub-header-row').empty();
    $('#sync-status').html('<span class="badge bg-warning text-dark sync-badge"><i class="fas fa-spinner fa-spin"></i> Collecte en cours...</span>');

    await loadDictionaryAutomatically();

    try {
        const koboUrl = 'https://kf.kobotoolbox.org/api/v2/assets/ath6cv2NrXEUijffeKJqSf/data.json?limit=1000&_t=' + Date.now();
        const result = await fetchAllKoboPagesWithFallback(koboUrl);

        allData = result.rows.filter(row => row !== null && typeof row === 'object');

        renderTable(allData);
        renderAnalysis(allData);
        if (typeof window.initializeRealisationComparisonControls === 'function') {
            window.initializeRealisationComparisonControls();
            if (document.getElementById('real-comparison')?.classList.contains('active')) {
                window.setTimeout(() => window.runAllRealisationComparisons(), 0);
            }
        }
        if (document.getElementById('master-realisations')?.classList.contains('active')) {
            setTimeout(() => window.runRealisationTemporel(), 0);
        }

        const providerText = result.providers.join(' + ') || 'Direct KoboToolbox';
        const bEx = isExcelLoaded
            ? '<span class="badge bg-success ms-2"><i class="fas fa-check-circle"></i> Traduit</span>'
            : '<span class="badge bg-warning text-dark ms-2"><i class="fas fa-info-circle"></i> Brut</span>';
        $('#sync-status')
            .html(`<span class="badge bg-success sync-badge"><i class="fas fa-check-double"></i> Ok : ${allData.length} Lignes</span>`)
            .append(`<span class="badge bg-info text-dark ms-2"><i class="fas fa-route"></i> ${escapeRealisationHtml(providerText)} · ${result.pages} page(s)</span>`)
            .append(bEx);

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? 'Erreur inconnue');
        const isNetworkError = /connexion|réseau|network|fetch|bloque|cors|antivirus|adblock|ublock|proxy/i.test(message);
        const title = isNetworkError ? 'Erreur de connexion KoboToolbox' : 'Erreur interne de traitement';
        console.error(title + ' :', error);
        $('#error-box').html(`<strong>${title} :</strong> ${escapeRealisationHtml(message)}`).show();
        $('#sync-status').html(`<span class="badge bg-danger sync-badge">${isNetworkError ? 'Échec Kobo' : 'Erreur de traitement'}</span>`);
    } finally {
        $('#loading-box').hide();
    }
}


/* ================================================================
   GRAPHIQUES STABLES, DÉFILEMENT CONDITIONNEL ET LÉGENDES DE NIVEAU
   - Les graphiques simples restent fluides et occupent leur carte.
   - Les dimensions ne sont agrandies que lorsque la densité des
     catégories, séries ou missions le justifie réellement.
   - Les scrollbars X/Y sont activées séparément uniquement si le
     contenu dépasse effectivement la zone visible.
   - Les graphiques propres aux DREN, CISCO ou ZAP affichent ce niveau
     dans leurs légendes Chart.js, y compris les graphiques K-Means,
     Jenks et DBSCAN.
   ================================================================ */
const UNIVERSAL_CHART_SCROLL_HOST_SELECTOR = [
    '.global-chart-scroll',
    '.timeline-chart-scroll',
    '.realisation-chart-scroll',
    '.realisation-gantt-individual-canvas',
    '.realisation-individual-canvas',
    '.universal-chart-scroll-host'
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

function inferChartAdministrativeLevel(canvas) {
    const id = String(canvas?.id || '').toLowerCase();
    if (/(^|[-_])dren($|[-_])|dren/.test(id)) return 'DREN';
    if (/(^|[-_])cisco($|[-_])|cisco/.test(id)) return 'CISCO';
    if (/(^|[-_])zap($|[-_])|zap/.test(id)) return 'ZAP';

    const scope = canvas?.closest('.realisation-level-card, .timeline-chart-card, .analysis-card, .adv-analysis-card, article, .card');
    const text = String(scope?.querySelector('h1,h2,h3,h4,h5,h6,.card-title,.realisation-level-heading')?.textContent || '').toUpperCase();
    if (text.includes('DREN')) return 'DREN';
    if (text.includes('CISCO')) return 'CISCO';
    if (text.includes('ZAP')) return 'ZAP';
    return '';
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
    const horizontal = chart?.options?.indexAxis === 'y' || chart?.config?.options?.indexAxis === 'y';
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

function isRealisationTimelineCanvas(canvas) {
    return /^realisationtimelinechart/i.test(String(canvas?.id || ''));
}

function normalizeLevelInDatasetLabel(label, level) {
    const text = String(label ?? '').trim();
    if (!level) return text || 'Données';
    if (new RegExp(`(^|\\b)${level}(\\b|$)`, 'i').test(text)) return text;
    return text ? `${level} — ${text}` : level;
}

function configureStableChartLegend(chart, canvas, updateChart = true) {
    if (!chart || !canvas || !chart.config) return false;
    try {
        const profile = getAdaptiveChartProfile(chart);
        const level = inferChartAdministrativeLevel(canvas);
        const externalLegend = hasExternalChartLegend(canvas);
        const realisationTimeline = isRealisationTimelineCanvas(canvas);

        profile.datasets.forEach((dataset, index) => {
            const fallback = profile.datasetCount > 1 ? `Série ${index + 1}` : 'Données';
            const original = String(dataset.label ?? fallback).trim() || fallback;
            dataset.label = level && !realisationTimeline
                ? normalizeLevelInDatasetLabel(original, level)
                : original;
        });

        const shouldDisplay = !externalLegend && (
            profile.circular ||
            profile.radar ||
            profile.datasetCount > 1 ||
            Boolean(level)
        );
        const desiredPosition = profile.circular || profile.datasetCount > 4 ? 'bottom' : 'top';
        const sourceOptions = chart.config.options || (chart.config.options = {});
        sourceOptions.plugins = sourceOptions.plugins || {};
        const previousLegend = sourceOptions.plugins.legend;
        const legend = previousLegend && typeof previousLegend === 'object'
            ? Object.assign({}, previousLegend)
            : {};
        const previousLabels = legend.labels && typeof legend.labels === 'object'
            ? Object.assign({}, legend.labels)
            : {};

        const labelSignature = profile.datasets.map(dataset => String(dataset.label || '')).join('¦');
        const signature = [
            shouldDisplay ? '1' : '0',
            desiredPosition,
            labelSignature,
            externalLegend ? 'external' : 'canvas'
        ].join('|');
        if (chart.$stableLegendSignature === signature) return false;

        legend.display = shouldDisplay;
        if (shouldDisplay) {
            legend.position = desiredPosition;
            legend.align = 'center';
            legend.labels = Object.assign(previousLabels, {
                usePointStyle: true,
                pointStyleWidth: 13,
                boxWidth: 12,
                boxHeight: 8,
                padding: 12,
                font: { size: profile.datasetCount > 10 ? 9 : 10 }
            });
            canvas.classList.add('chartjs-legend-enabled');
        } else {
            canvas.classList.remove('chartjs-legend-enabled');
        }

        sourceOptions.plugins.legend = legend;
        chart.$stableLegendSignature = signature;
        if (updateChart && typeof chart.update === 'function') {
            chart.$stableLegendUpdateInProgress = true;
            try {
                chart.update('none');
            } finally {
                chart.$stableLegendUpdateInProgress = false;
            }
        }
        return true;
    } catch (error) {
        console.warn('Configuration de la légende ignorée :', error);
        return false;
    }
}

function canUseCanvasParentAsChartHost(parent, canvas) {
    if (!parent || !canvas) return false;
    const elementChildren = Array.from(parent.children || []);
    return elementChildren.length === 1 && elementChildren[0] === canvas;
}

function wrapCanvasInUniversalChartStage(canvas, host, stageClass = 'universal-chart-stage') {
    if (!canvas || !host || !canvas.parentElement) return null;
    const currentParent = canvas.parentElement;
    if (currentParent.classList.contains('universal-chart-stage') ||
        currentParent.classList.contains('universal-chart-existing-stage') ||
        currentParent.classList.contains('timeline-chart-stage') ||
        currentParent.classList.contains('realisation-chart-stage') ||
        currentParent.classList.contains('realisation-gantt-individual-stage') ||
        currentParent.classList.contains('global-chart-stage')) {
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

function getOriginalChartHeight(canvas, host) {
    const saved = Number(host?.dataset?.originalChartHeight || 0);
    if (saved > 0) return saved;
    const inline = parseFloat(host?.style?.height || '');
    const measured = Math.round(host?.getBoundingClientRect?.().height || 0);
    const canvasHeight = Number(canvas?.height || 0);
    const candidate = inline || measured || canvasHeight || 380;
    const normalized = Math.max(280, Math.min(520, candidate));
    if (host?.dataset) host.dataset.originalChartHeight = String(normalized);
    return normalized;
}

function calculateStableChartDimensions(chart, canvas, host, stage) {
    const profile = getAdaptiveChartProfile(chart);
    const measuredHostWidth = Math.floor(host.getBoundingClientRect?.().width || host.clientWidth || host.parentElement?.clientWidth || 900);
    const hostWidth = Math.max(280, measuredHostWidth);
    const viewportCap = Math.max(340, Math.min(680, Math.floor((window.innerHeight || 900) * 0.68)));
    const isGantt = stage.classList.contains('realisation-gantt-stage') || stage.classList.contains('realisation-gantt-individual-stage');

    if (isGantt) {
        const inlineWidth = parseFloat(stage.style.width) || stage.scrollWidth || hostWidth;
        const inlineHeight = parseFloat(stage.style.height) || stage.scrollHeight || 480;
        const width = Math.max(hostWidth, Math.ceil(inlineWidth));
        const height = Math.max(360, Math.ceil(inlineHeight));
        return { width, height, visibleHeight: Math.min(viewportCap, height) };
    }

    const baseHeight = getOriginalChartHeight(canvas, host);
    const sourceLegend = chart?.config?.options?.plugins?.legend;
    const legendVisible = Boolean(sourceLegend && typeof sourceLegend === 'object' && sourceLegend.display !== false);
    const legendQuantity = profile.circular ? profile.labelCount : profile.datasetCount;
    const itemsPerLegendRow = Math.max(1, Math.floor(hostWidth / 170));
    const legendRows = legendVisible ? Math.max(1, Math.ceil(Math.max(1, legendQuantity) / itemsPerLegendRow)) : 0;
    const legendHeight = legendRows * 23;

    let width = hostWidth;
    let height = Math.max(300, baseHeight + Math.min(110, legendHeight));

    if (profile.circular || profile.radar) {
        height = Math.max(340, Math.min(520, baseHeight + legendHeight + 35));
        if (profile.labelCount > 18) {
            height += Math.min(120, (profile.labelCount - 18) * 6);
        }
    } else if (profile.horizontal) {
        const denseRows = profile.labelCount > 11;
        if (denseRows) {
            height = Math.max(height, 115 + profile.labelCount * (profile.labelCount > 35 ? 25 : 30) + legendHeight);
        }
        const needsLabelWidth = profile.longestLabel > 38 || profile.datasetCount > 6;
        if (needsLabelWidth) {
            width = Math.max(hostWidth, 520 + Math.min(680, profile.longestLabel * 7) + Math.max(0, profile.datasetCount - 4) * 35);
        }
    } else if (profile.scatter) {
        height = Math.max(320, baseHeight + legendHeight);
        const entityLabelOptions = chart?.config?.options?.plugins?.advEntityPointLabelsPlugin;
        const entityLabelsEnabled = Boolean(entityLabelOptions && entityLabelOptions.display !== false);
        if (entityLabelsEnabled) {
            const lineHeight = Math.max(12, Number(entityLabelOptions.lineHeight) || 14);
            const minGap = Math.max(3, Number(entityLabelOptions.minGap) || 5);
            const reservedRight = Math.max(150, Number(chart?.config?.options?.layout?.padding?.right) || 190);
            height = Math.max(height, 190 + profile.pointCount * (lineHeight + minGap + 9) + legendHeight);
            width = Math.max(width, hostWidth + Math.min(360, reservedRight));
        } else if (profile.pointCount > 180 || profile.datasetCount > 9) {
            width = Math.max(hostWidth, 900 + Math.min(850, Math.max(0, profile.pointCount - 180) * 2));
        }
    } else {
        const horizontalDensity = profile.labelCount > 18 || profile.datasetCount > 8;
        if (horizontalDensity) {
            const pixelsPerLabel = profile.type === 'bar' ? 44 : 50;
            width = Math.max(
                hostWidth,
                220 + profile.labelCount * pixelsPerLabel + Math.max(0, profile.datasetCount - 5) * 42
            );
        }
        height = Math.max(320, baseHeight + legendHeight);
    }

    width = Math.min(12000, Math.ceil(width));
    height = Math.min(12000, Math.ceil(height));
    return {
        width,
        height,
        visibleHeight: Math.min(viewportCap, height)
    };
}

function applyStableChartOverflow(canvas) {
    if (!canvas || !canvas.isConnected) return;
    const host = canvas.closest(UNIVERSAL_CHART_SCROLL_HOST_SELECTOR);
    if (!host) return;
    const stage = getAdaptiveChartStage(canvas, host);
    if (!stage) return;

    const chart = getChartInstanceForCanvas(canvas);
    if (!chart) {
        window.setTimeout(() => applyStableChartOverflow(canvas), 100);
        return;
    }

    configureStableChartLegend(chart, canvas, true);

    const availableWidth = Math.floor(host.getBoundingClientRect?.().width || host.clientWidth || host.parentElement?.clientWidth || 0);
    if (availableWidth < 100 || host.offsetParent === null) return;

    const dimensions = calculateStableChartDimensions(chart, canvas, host, stage);
    const overflowX = dimensions.width > availableWidth + 12;
    const overflowY = dimensions.height > dimensions.visibleHeight + 12;

    const signature = `${dimensions.width}x${dimensions.height}|${overflowX ? 1 : 0}|${overflowY ? 1 : 0}`;
    if (canvas.dataset.stableChartSignature === signature) return;
    canvas.dataset.stableChartSignature = signature;

    stage.style.width = `${dimensions.width}px`;
    stage.style.minWidth = `${dimensions.width}px`;
    stage.style.height = `${dimensions.height}px`;
    stage.style.minHeight = `${dimensions.height}px`;

    host.style.height = `${overflowY ? dimensions.visibleHeight : dimensions.height}px`;
    host.style.maxHeight = overflowY ? `${dimensions.visibleHeight}px` : 'none';
    host.style.overflowX = overflowX ? 'auto' : 'hidden';
    host.style.overflowY = overflowY ? 'auto' : 'hidden';
    host.classList.toggle('chart-overflow-x', overflowX);
    host.classList.toggle('chart-overflow-y', overflowY);

    window.requestAnimationFrame(() => {
        try {
            if (typeof chart.resize === 'function') chart.resize();
        } catch (error) {
            console.warn('Redimensionnement du graphique impossible :', error);
        }
    });
}

const stableChartScheduled = new WeakSet();
function scheduleAdaptiveChartLayout(canvas, delay = 0) {
    if (!canvas || stableChartScheduled.has(canvas)) return;
    stableChartScheduled.add(canvas);
    window.setTimeout(() => {
        window.requestAnimationFrame(() => {
            stableChartScheduled.delete(canvas);
            applyStableChartOverflow(canvas);
        });
    }, delay);
}

let stableChartResizeObserver = null;
function observeAdaptiveChartHost(host, canvas) {
    if (typeof ResizeObserver === 'undefined' || !host || !canvas) return;
    if (!stableChartResizeObserver) {
        stableChartResizeObserver = new ResizeObserver(entries => {
            entries.forEach(entry => {
                const observedCanvas = entry.target.querySelector('canvas');
                if (observedCanvas) scheduleAdaptiveChartLayout(observedCanvas, 60);
            });
        });
    }
    if (host.dataset.adaptiveResizeObserved !== '1') {
        host.dataset.adaptiveResizeObserved = '1';
        stableChartResizeObserver.observe(host);
    }
}

function enhanceChartCanvasWithUniversalScrollbars(canvas) {
    if (!(canvas instanceof HTMLCanvasElement) || !canvas.isConnected) return;
    // Les neuf graphiques d'analyse avancée possèdent leur propre viewport adaptatif.
    // Ils ne doivent pas être enveloppés une seconde fois par le système universel.
    if (canvas.closest('.adv-analysis-card, .real-comparison-panel')) return;

    let host = canvas.closest(UNIVERSAL_CHART_SCROLL_HOST_SELECTOR);
    if (!host) {
        const parent = canvas.parentElement;
        if (!parent) return;

        if (canUseCanvasParentAsChartHost(parent, canvas)) {
            host = parent;
            const initialHeight = parseFloat(parent.style.height || '') || Math.round(parent.getBoundingClientRect().height || 0) || 360;
            host.dataset.originalChartHeight = String(Math.max(280, Math.min(520, initialHeight)));
            parent.style.height = '';
            host.classList.add('universal-chart-scroll-host', 'chart-native-host');
            getAdaptiveChartStage(canvas, host);
        } else {
            host = document.createElement('div');
            host.className = 'universal-chart-scroll-host';
            host.setAttribute('role', 'region');
            host.setAttribute('aria-label', ('Zone du graphique ' + (canvas.id || '')).trim());

            const stage = document.createElement('div');
            stage.className = 'universal-chart-stage universal-chart-scroll-stage';
            parent.insertBefore(host, canvas);
            host.appendChild(stage);
            stage.appendChild(canvas);
        }
    } else {
        host.classList.add('universal-chart-scroll-host');
        getAdaptiveChartStage(canvas, host);
    }

    canvas.dataset.universalScrollbars = '1';
    canvas.classList.add('universal-scrollable-chart-canvas');
    observeAdaptiveChartHost(host, canvas);
    scheduleAdaptiveChartLayout(canvas, 50);
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
    if (typeof Chart === 'undefined' || typeof Chart.register !== 'function' || Chart.$stableUiPluginRegistered) return;
    Chart.register({
        id: 'stableAdaptiveChartUiPlugin',
        afterInit(chart) {
            window.setTimeout(() => {
                try {
                    enhanceChartCanvasWithUniversalScrollbars(chart.canvas);
                    configureStableChartLegend(chart, chart.canvas, true);
                    scheduleAdaptiveChartLayout(chart.canvas, 60);
                } catch (error) {
                    console.warn('Initialisation stable du graphique ignorée :', error);
                }
            }, 0);
        },
        afterUpdate(chart) {
            if (!chart.$stableLegendUpdateInProgress) {
                scheduleAdaptiveChartLayout(chart.canvas, 50);
            }
        }
    });
    Chart.$stableUiPluginRegistered = true;
}

function resizeAllChartsAfterTabChange() {
    setTimeout(() => {
        initializeAllChartScrollbars(document);
        document.querySelectorAll('canvas').forEach(canvas => {
            delete canvas.dataset.stableChartSignature;
            scheduleAdaptiveChartLayout(canvas, 60);
        });
    }, 160);
}

registerAdaptiveChartUiPlugin();
window.addEventListener('resize', () => {
    document.querySelectorAll('canvas').forEach(canvas => {
        delete canvas.dataset.stableChartSignature;
        scheduleAdaptiveChartLayout(canvas, 120);
    });
});


/* ========================================================================== */
/* CORRECTION DES BOUTONS D'EXPORT ET DE PARTAGE                              */
/* ========================================================================== */
function pmaFixedExportSafeName(value) {
    return String(value || 'graphique')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 110) || 'graphique';
}

function pmaFixedExportTimestamp() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
}

function pmaFixedExportDownload(blob, filename) {
    if (!(blob instanceof Blob)) throw new Error('Le fichier à télécharger est invalide.');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function pmaFixedExportBlobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Lecture du fichier impossible.'));
        reader.readAsDataURL(blob);
    });
}

function pmaFixedExportCanvasBlob(canvas, mime, quality) {
    return new Promise((resolve, reject) => {
        try {
            canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('La conversion du graphique a échoué.')), mime, quality);
        } catch (error) {
            reject(error);
        }
    });
}

async function pmaFixedExportChartImage(chart, format, title) {
    if (!chart || !chart.canvas) throw new Error('Ce graphique n’est pas encore disponible.');
    const source = chart.canvas;
    const sourceWidth = Math.max(1, Number(source.width) || Math.round(source.clientWidth * (window.devicePixelRatio || 1)) || 1200);
    const sourceHeight = Math.max(1, Number(source.height) || Math.round(source.clientHeight * (window.devicePixelRatio || 1)) || 700);
    const scale = Math.max(1.4, Math.min(3, 2600 / sourceWidth));
    const headerHeight = 95;
    const width = Math.min(6000, Math.max(1800, Math.round(sourceWidth * scale)));
    const imageWidth = width - 80;
    const imageHeight = Math.round(sourceHeight * (imageWidth / sourceWidth));
    const height = Math.min(5000, Math.max(1050, imageHeight + headerHeight + 55));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#17365d';
    ctx.font = `700 ${Math.max(24, Math.round(width / 72))}px "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(title || 'Graphique'), width / 2, 42, width - 90);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const drawHeight = Math.min(imageHeight, height - headerHeight - 30);
    ctx.drawImage(source, 40, headerHeight, imageWidth, drawHeight);
    const isJpeg = String(format || '').toLowerCase() === 'jpeg' || String(format || '').toLowerCase() === 'jpg';
    const blob = await pmaFixedExportCanvasBlob(canvas, isJpeg ? 'image/jpeg' : 'image/png', isJpeg ? 0.96 : undefined);
    return { blob, width, height, extension: isJpeg ? 'jpg' : 'png', mime: isJpeg ? 'image/jpeg' : 'image/png' };
}

function pmaFixedExportXmlEscape(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function pmaFixedExportDocxTableCell(value, isHeader = false, width = 3000) {
    const shading = isHeader ? '<w:shd w:val="clear" w:color="auto" w:fill="D9EAF7"/>' : '';
    const bold = isHeader ? '<w:b/>' : '';
    return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${shading}<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:rPr>${bold}<w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${pmaFixedExportXmlEscape(value)}</w:t></w:r></w:p></w:tc>`;
}

function pmaFixedExportBuildDocxTable(headers, rows) {
    if (!Array.isArray(rows) || !rows.length) return '';
    const safeHeaders = Array.isArray(headers) && headers.length
        ? headers
        : rows[0].map((_, index) => `Colonne ${index + 1}`);
    const columnCount = Math.max(1, safeHeaders.length);
    let widths;
    if (columnCount === 3) widths = [7600, 3000, 4400];
    else if (columnCount === 2) widths = [10200, 4800];
    else widths = Array.from({ length: columnCount }, () => Math.floor(15000 / columnCount));
    const tableRows = [];
    tableRows.push(`<w:tr><w:trPr><w:tblHeader/></w:trPr>${safeHeaders.map((value, index) => pmaFixedExportDocxTableCell(value, true, widths[index])).join('')}</w:tr>`);
    rows.forEach(row => {
        const values = Array.isArray(row) ? row : [];
        tableRows.push(`<w:tr>${safeHeaders.map((_, index) => pmaFixedExportDocxTableCell(values[index] ?? '', false, widths[index])).join('')}</w:tr>`);
    });
    const grid = widths.map(width => `<w:gridCol w:w="${width}"/>`).join('');
    return `<w:tbl><w:tblPr><w:tblW w:w="15000" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="6" w:space="0" w:color="7F8C8D"/><w:left w:val="single" w:sz="6" w:space="0" w:color="7F8C8D"/><w:bottom w:val="single" w:sz="6" w:space="0" w:color="7F8C8D"/><w:right w:val="single" w:sz="6" w:space="0" w:color="7F8C8D"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="BFC9CA"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="BFC9CA"/></w:tblBorders><w:tblCellMar><w:top w:w="70" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="70" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${tableRows.join('')}</w:tbl>`;
}

async function pmaFixedExportCreateDocx(title, images) {
    if (typeof JSZip === 'undefined') throw new Error('La bibliothèque JSZip n’est pas chargée.');
    if (!Array.isArray(images) || !images.length) throw new Error('Aucun graphique disponible pour le document Word.');
    const zip = new JSZip();
    const relationships = [];
    const bodyParts = [];
    bodyParts.push(`<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>${pmaFixedExportXmlEscape(title)}</w:t></w:r></w:p>`);
    bodyParts.push(`<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:color w:val="666666"/><w:sz w:val="20"/></w:rPr><w:t>Généré le ${pmaFixedExportXmlEscape(new Date().toLocaleString('fr-FR'))}</w:t></w:r></w:p>`);

    for (let index = 0; index < images.length; index++) {
        const item = images[index];
        const relId = `rId${index + 1}`;
        const filename = `image${index + 1}.png`;
        const arrayBuffer = await item.blob.arrayBuffer();
        zip.file(`word/media/${filename}`, arrayBuffer);
        relationships.push(`<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${filename}"/>`);
        const maxCx = Math.round(9.45 * 914400);
        const maxCy = Math.round(5.6 * 914400);
        const ratio = Math.max(0.15, Number(item.height || 1) / Math.max(1, Number(item.width || 1)));
        let cx = maxCx;
        let cy = Math.round(cx * ratio);
        if (cy > maxCy) {
            cy = maxCy;
            cx = Math.round(cy / ratio);
        }
        bodyParts.push(`<w:p><w:pPr><w:pageBreakBefore/><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="26"/></w:rPr><w:t>${pmaFixedExportXmlEscape(item.title)}</w:t></w:r></w:p>`);
        bodyParts.push(`<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${index + 1}" name="${pmaFixedExportXmlEscape(item.title)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${index + 1}" name="${filename}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`);
        if (Array.isArray(item.tableRows) && item.tableRows.length) {
            bodyParts.push(`<w:p><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="100"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t>${pmaFixedExportXmlEscape(item.tableTitle || `Entités ${item.level || ''} représentées dans le graphique`)}</w:t></w:r></w:p>`);
            bodyParts.push(pmaFixedExportBuildDocxTable(item.tableHeaders, item.tableRows));
            bodyParts.push(`<w:p><w:pPr><w:spacing w:before="100"/></w:pPr><w:r><w:rPr><w:i/><w:color w:val="666666"/><w:sz w:val="18"/></w:rPr><w:t>Le nom de chaque entité est également affiché directement à côté de son point dans le graphique.</w:t></w:r></w:p>`);
        }
    }

    bodyParts.push(`<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr>`);
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
    zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
    zip.folder('word').folder('_rels').file('document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join('')}</Relationships>`);
    zip.folder('word').file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${bodyParts.join('')}</w:body></w:document>`);
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

function pmaFixedExportAdvancedMeta(chartKey) {
    const normalized = String(chartKey || '');
    const method = normalized.startsWith('kmeans') ? 'K-Means' : (normalized.startsWith('jenks') ? 'Jenks' : 'DBSCAN');
    const level = normalized.endsWith('DREN') ? 'DREN' : (normalized.endsWith('CISCO') ? 'CISCO' : 'ZAP');
    const methodSlug = method.toLowerCase().replace('-', '');
    const canvasId = `adv-${methodSlug}-${level.toLowerCase()}-chart`;
    const tableId = `adv-${methodSlug}-${level.toLowerCase()}-table`;
    return { chartKey: normalized, method, methodSlug, level, canvasId, tableId, title: `${method} — ${level}` };
}

function pmaFixedExportFindAdvancedChart(chartKey) {
    const meta = pmaFixedExportAdvancedMeta(chartKey);
    const canvas = document.getElementById(meta.canvasId);
    const chart = canvas && typeof Chart !== 'undefined' && typeof Chart.getChart === 'function' ? Chart.getChart(canvas) : null;
    if (!chart) throw new Error(`Le graphique ${meta.title} n’est pas encore disponible. Lancez d’abord l’analyse.`);
    return { chart, meta };
}

window.exportAdvancedSingleChart = async function(chartKey, format) {
    try {
        const { chart, meta } = pmaFixedExportFindAdvancedChart(chartKey);
        const image = await pmaFixedExportChartImage(chart, format || 'png', meta.title);
        pmaFixedExportDownload(image.blob, `${pmaFixedExportSafeName(meta.title)}_${image.width}x${image.height}_${pmaFixedExportTimestamp()}.${image.extension}`);
    } catch (error) {
        console.error('Export avancé impossible :', error);
        alert(error.message || 'L’export du graphique a échoué.');
    }
};

function pmaFixedExportReadAdvancedEntityTable(meta) {
    const table = document.getElementById(meta.tableId);
    const rows = [];
    if (table) {
        table.querySelectorAll('tr').forEach(tr => {
            const cells = Array.from(tr.querySelectorAll('td')).map(cell => String(cell.textContent || '').replace(/\s+/g, ' ').trim());
            if (cells.length) rows.push(cells);
        });
    }
    let headers;
    if (meta.method === 'DBSCAN') {
        headers = [`Entité ${meta.level}`, 'Nombre de soumissions'];
    } else {
        headers = [`Entité ${meta.level}`, 'Nombre de soumissions', 'Classification'];
    }
    return {
        headers,
        rows,
        title: `Identification des ${meta.level} représentées dans le graphique`
    };
}

window.exportAdvancedSingleWord = async function(chartKey) {
    try {
        const { chart, meta } = pmaFixedExportFindAdvancedChart(chartKey);
        const image = await pmaFixedExportChartImage(chart, 'png', meta.title);
        const entityTable = pmaFixedExportReadAdvancedEntityTable(meta);
        const blob = await pmaFixedExportCreateDocx(`Rapport ${meta.title}`, [{
            ...image,
            title: meta.title,
            level: meta.level,
            tableTitle: entityTable.title,
            tableHeaders: entityTable.headers,
            tableRows: entityTable.rows
        }]);
        pmaFixedExportDownload(blob, `${pmaFixedExportSafeName(meta.title)}_${pmaFixedExportTimestamp()}.docx`);
    } catch (error) {
        console.error('Export Word avancé impossible :', error);
        alert(error.message || 'L’export Word a échoué.');
    }
};

async function pmaFixedExportShareBlob(blob, filename, title) {
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: title || filename, files: [file] });
        return;
    }
    pmaFixedExportDownload(blob, filename);
    alert('Le partage direct n’est pas disponible dans ce navigateur. Le fichier a été téléchargé.');
}

window.shareAdvancedSingleChart = async function(chartKey) {
    try {
        const { chart, meta } = pmaFixedExportFindAdvancedChart(chartKey);
        const image = await pmaFixedExportChartImage(chart, 'png', meta.title);
        const filename = `${pmaFixedExportSafeName(meta.title)}_${pmaFixedExportTimestamp()}.png`;
        await pmaFixedExportShareBlob(image.blob, filename, meta.title);
    } catch (error) {
        if (error && error.name === 'AbortError') return;
        console.error('Partage avancé impossible :', error);
        alert(error.message || 'Le partage du graphique a échoué.');
    }
};

function pmaFixedExportTimelineItems(scope) {
    const target = String(scope || 'ALL').toUpperCase();
    const levels = target === 'ALL' ? ['DREN', 'CISCO', 'ZAP'] : [target];
    const layout = document.querySelector('input[name="timeline-layout-mode"]:checked')?.value || 'grouped';
    const items = [];
    levels.forEach(level => {
        if (layout === 'individual') {
            (submissionTimelineIndividualChartsRefs[level] || []).forEach((ref, index) => {
                const chart = ref?.chart || ref;
                if (chart?.canvas) items.push({
                    level,
                    title: `Soumissions — ${level} — ${ref?.entity || `entité ${index + 1}`}`,
                    chart
                });
            });
        } else {
            const chart = submissionTimelineChartsRefs && submissionTimelineChartsRefs[level];
            if (chart?.canvas) items.push({ level, title: `Soumissions par ${level} et par période`, chart });
        }
    });
    return items;
}

function pmaFixedExportTimelineCriteria(scope) {
    const value = id => document.getElementById(id)?.value || '';
    return {
        niveau: String(scope || 'ALL').toUpperCase(),
        granularite: value('timeline-granularity') || 'day',
        type_donnees: value('timeline-display-mode') || 'detailed',
        type_graphique: value('timeline-chart-type') || 'line',
        organisation: document.querySelector('input[name="timeline-layout-mode"]:checked')?.value || 'grouped',
        entites_affichees: value('timeline-top-entities') || '10',
        date_debut: value('timeline-date-start'),
        date_fin: value('timeline-date-end'),
        genere_le: new Date().toISOString()
    };
}

function pmaFixedExportTimelineRows(scope) {
    const settings = getSubmissionTimelineSettings();
    const target = String(scope || 'ALL').toUpperCase();
    const levels = target === 'ALL' ? ['DREN', 'CISCO', 'ZAP'] : [target];
    const source = Array.isArray(submissionTimelineSourceData) ? submissionTimelineSourceData : [];
    let startDate = settings.startValue ? parseSubmissionDate(settings.startValue) : null;
    let endDate = settings.endValue ? parseSubmissionDate(settings.endValue) : null;
    if (startDate) startDate.setUTCHours(0, 0, 0, 0);
    if (endDate) endDate.setUTCHours(23, 59, 59, 999);
    const datedRows = source
        .map(row => ({ row, date: parseSubmissionDate(row['_submission_time']) }))
        .filter(item => item.date)
        .filter(item => (!startDate || item.date >= startDate) && (!endDate || item.date <= endDate));
    const bucketKeys = [...new Set(datedRows.map(item => getSubmissionTimelineBucket(item.date, settings.granularity)))].sort();
    const rows = [];
    levels.forEach(level => {
        const levelData = buildSubmissionTimelineLevelData(level, datedRows, bucketKeys, settings, settings.layout === 'grouped');
        const lower = level.toLowerCase();
        const search = settings.layout === 'individual' ? String(document.getElementById(`timeline-search-${lower}`)?.value || '').trim().toLocaleLowerCase('fr') : '';
        levelData.series
            .filter(item => !search || item.entity.toLocaleLowerCase('fr').includes(search))
            .forEach(item => {
                bucketKeys.forEach((bucket, index) => {
                    rows.push({
                        niveau: level,
                        entite: item.entity,
                        periode: formatSubmissionTimelineLabel(bucket, settings.granularity),
                        soumissions: Number(item.values[index]) || 0
                    });
                });
            });
    });
    return rows;
}

async function pmaFixedExportTimelineImages(scope, format) {
    const items = pmaFixedExportTimelineItems(scope);
    if (!items.length) throw new Error('Aucun graphique temporel n’est disponible. Cliquez d’abord sur « Actualiser les graphiques ».' );
    const images = [];
    for (const item of items) {
        const image = await pmaFixedExportChartImage(item.chart, format || 'png', item.title);
        images.push({ ...image, title: item.title, level: item.level });
    }
    return images;
}

window.exportTimelineImages = async function(scope, format) {
    try {
        const images = await pmaFixedExportTimelineImages(scope, format || 'png');
        if (images.length === 1) {
            const item = images[0];
            pmaFixedExportDownload(item.blob, `${pmaFixedExportSafeName(item.title)}_${item.width}x${item.height}_${pmaFixedExportTimestamp()}.${item.extension}`);
            return;
        }
        if (typeof JSZip === 'undefined') throw new Error('La bibliothèque JSZip n’est pas chargée.');
        const zip = new JSZip();
        images.forEach((item, index) => zip.file(`${String(index + 1).padStart(2, '0')}_${pmaFixedExportSafeName(item.title)}.${item.extension}`, item.blob));
        zip.file('criteres.json', JSON.stringify(pmaFixedExportTimelineCriteria(scope), null, 2));
        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        pmaFixedExportDownload(blob, `graphiques_${String(scope || 'all').toLowerCase()}_${pmaFixedExportTimestamp()}.zip`);
    } catch (error) {
        console.error('Export temporel impossible :', error);
        alert(error.message || 'L’export des graphiques a échoué.');
    }
};

window.exportTimelineWord = async function(scope) {
    try {
        const images = await pmaFixedExportTimelineImages(scope, 'png');
        const title = `Rapport des soumissions Kobo — ${String(scope || 'ALL').toUpperCase()}`;
        const blob = await pmaFixedExportCreateDocx(title, images);
        pmaFixedExportDownload(blob, `rapport_soumissions_${String(scope || 'all').toLowerCase()}_${pmaFixedExportTimestamp()}.docx`);
    } catch (error) {
        console.error('Export Word temporel impossible :', error);
        alert(error.message || 'L’export Word a échoué.');
    }
};

async function pmaFixedExportCreatePdf(scope) {
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('La bibliothèque jsPDF n’est pas chargée.');
    const images = await pmaFixedExportTimelineImages(scope, 'png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    for (let index = 0; index < images.length; index++) {
        if (index > 0) pdf.addPage('a4', 'landscape');
        const image = images[index];
        const dataUrl = await pmaFixedExportBlobToDataUrl(image.blob);
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(15);
        pdf.text(image.title, pageWidth / 2, 12, { align: 'center' });
        const maxWidth = pageWidth - 18;
        const maxHeight = pageHeight - 24;
        const ratio = image.width / image.height;
        let drawWidth = maxWidth;
        let drawHeight = drawWidth / ratio;
        if (drawHeight > maxHeight) {
            drawHeight = maxHeight;
            drawWidth = drawHeight * ratio;
        }
        pdf.addImage(dataUrl, 'PNG', (pageWidth - drawWidth) / 2, 17, drawWidth, drawHeight, undefined, 'FAST');
    }
    return pdf.output('blob');
}

window.exportAnalysisToPDF = async function(scope) {
    try {
        const blob = await pmaFixedExportCreatePdf(scope);
        pmaFixedExportDownload(blob, `rapport_soumissions_${String(scope || 'all').toLowerCase()}_${pmaFixedExportTimestamp()}.pdf`);
        return blob;
    } catch (error) {
        console.error('Export PDF impossible :', error);
        alert(error.message || 'L’export PDF a échoué.');
        return null;
    }
};

function pmaFixedExportCsvCell(value) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

window.exportTimelineScopeData = async function(scope, format) {
    try {
        const rows = pmaFixedExportTimelineRows(scope);
        const criteria = pmaFixedExportTimelineCriteria(scope);
        if (!rows.length) throw new Error('Aucune donnée temporelle n’est disponible pour cet export.');
        const stamp = pmaFixedExportTimestamp();
        const prefix = `analyse_${String(scope || 'all').toLowerCase()}_${stamp}`;
        if (format === 'json') {
            pmaFixedExportDownload(new Blob([JSON.stringify({ criteria, rows }, null, 2)], { type: 'application/json;charset=utf-8' }), `${prefix}.json`);
            return;
        }
        if (format === 'csv') {
            const header = ['Niveau', 'Entité', 'Période', 'Nombre de soumissions'];
            const lines = [header.map(pmaFixedExportCsvCell).join(';')].concat(rows.map(row => [row.niveau, row.entite, row.periode, row.soumissions].map(pmaFixedExportCsvCell).join(';')));
            pmaFixedExportDownload(new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${prefix}.csv`);
            return;
        }
        if (format === 'html') {
            const images = await pmaFixedExportTimelineImages(scope, 'png');
            const figures = [];
            for (const image of images) figures.push(`<section><h2>${pmaFixedExportXmlEscape(image.title)}</h2><img src="${await pmaFixedExportBlobToDataUrl(image.blob)}" alt="${pmaFixedExportXmlEscape(image.title)}"></section>`);
            const tableRows = rows.map(row => `<tr><td>${pmaFixedExportXmlEscape(row.niveau)}</td><td>${pmaFixedExportXmlEscape(row.entite)}</td><td>${pmaFixedExportXmlEscape(row.periode)}</td><td>${row.soumissions}</td></tr>`).join('');
            const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${prefix}</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#233}h1,h2{color:#174f78}img{max-width:100%;height:auto;border:1px solid #ccd;margin-bottom:28px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #ccd;padding:6px}th{background:#eaf3f8}</style></head><body><h1>Analyse temporelle des soumissions</h1><pre>${pmaFixedExportXmlEscape(JSON.stringify(criteria, null, 2))}</pre>${figures.join('')}<h2>Données</h2><table><thead><tr><th>Niveau</th><th>Entité</th><th>Période</th><th>Soumissions</th></tr></thead><tbody>${tableRows}</tbody></table></body></html>`;
            pmaFixedExportDownload(new Blob([html], { type: 'text/html;charset=utf-8' }), `${prefix}.html`);
            return;
        }
        if (format === 'xlsx') {
            if (typeof ExcelJS === 'undefined') throw new Error('La bibliothèque ExcelJS n’est pas chargée.');
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'Tableau de bord KoboToolbox';
            workbook.created = new Date();
            const criteriaSheet = workbook.addWorksheet('Critères');
            criteriaSheet.addRow(['Critère', 'Valeur']);
            Object.entries(criteria).forEach(([key, value]) => criteriaSheet.addRow([key, value]));
            criteriaSheet.getRow(1).font = { bold: true };
            criteriaSheet.columns = [{ width: 30 }, { width: 55 }];
            const dataSheet = workbook.addWorksheet('Données');
            dataSheet.addRow(['Niveau', 'Entité', 'Période', 'Nombre de soumissions']);
            rows.forEach(row => dataSheet.addRow([row.niveau, row.entite, row.periode, row.soumissions]));
            dataSheet.getRow(1).font = { bold: true };
            dataSheet.columns = [{ width: 14 }, { width: 38 }, { width: 24 }, { width: 22 }];
            const graphSheet = workbook.addWorksheet('Graphiques');
            const images = await pmaFixedExportTimelineImages(scope, 'png');
            let rowOffset = 1;
            for (const image of images) {
                graphSheet.getCell(`A${rowOffset}`).value = image.title;
                graphSheet.getCell(`A${rowOffset}`).font = { bold: true, size: 14 };
                const dataUrl = await pmaFixedExportBlobToDataUrl(image.blob);
                const imageId = workbook.addImage({ base64: dataUrl, extension: 'png' });
                const exportWidth = 1250;
                const exportHeight = Math.min(760, Math.round(exportWidth * image.height / image.width));
                graphSheet.addImage(imageId, { tl: { col: 0, row: rowOffset }, ext: { width: exportWidth, height: exportHeight } });
                rowOffset += Math.max(28, Math.ceil(exportHeight / 20) + 4);
            }
            const buffer = await workbook.xlsx.writeBuffer();
            pmaFixedExportDownload(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${prefix}.xlsx`);
            return;
        }
        throw new Error(`Format d’export non reconnu : ${format}`);
    } catch (error) {
        console.error('Export des données impossible :', error);
        alert(error.message || 'L’export des données a échoué.');
    }
};

window.shareTimelineExport = async function(scope, format) {
    try {
        let blob;
        let filename;
        if (format === 'word') {
            const images = await pmaFixedExportTimelineImages(scope, 'png');
            blob = await pmaFixedExportCreateDocx(`Rapport des soumissions Kobo — ${String(scope || 'ALL').toUpperCase()}`, images);
            filename = `rapport_soumissions_${String(scope || 'all').toLowerCase()}_${pmaFixedExportTimestamp()}.docx`;
        } else if (format === 'pdf') {
            blob = await pmaFixedExportCreatePdf(scope);
            filename = `rapport_soumissions_${String(scope || 'all').toLowerCase()}_${pmaFixedExportTimestamp()}.pdf`;
        } else {
            const images = await pmaFixedExportTimelineImages(scope, format || 'png');
            if (images.length === 1) {
                blob = images[0].blob;
                filename = `${pmaFixedExportSafeName(images[0].title)}_${pmaFixedExportTimestamp()}.${images[0].extension}`;
            } else {
                if (typeof JSZip === 'undefined') throw new Error('La bibliothèque JSZip n’est pas chargée.');
                const zip = new JSZip();
                images.forEach((image, index) => zip.file(`${String(index + 1).padStart(2, '0')}_${pmaFixedExportSafeName(image.title)}.${image.extension}`, image.blob));
                blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
                filename = `graphiques_${String(scope || 'all').toLowerCase()}_${pmaFixedExportTimestamp()}.zip`;
            }
        }
        await pmaFixedExportShareBlob(blob, filename, 'Graphiques KoboToolbox');
    } catch (error) {
        if (error && error.name === 'AbortError') return;
        console.error('Partage impossible :', error);
        alert(error.message || 'Le partage a échoué.');
    }
};

window.exportKoboBaseJSON = function() {
    try {
        if (!Array.isArray(allData) || !allData.length) throw new Error('Aucune donnée KoboToolbox disponible.');
        const payload = { type: 'kobotoolbox_offline_backup', version: 1, exported_at: new Date().toISOString(), count: allData.length, results: allData };
        pmaFixedExportDownload(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }), `base_kobotoolbox_${pmaFixedExportTimestamp()}.json`);
    } catch (error) {
        console.error('Export JSON Kobo impossible :', error);
        alert(error.message || 'L’export de la base Kobo a échoué.');
    }
};


$(document).ready(function() {
    initializeAllChartScrollbars(document);
    observeDynamicChartScrollbars();
    document.addEventListener('shown.bs.tab', resizeAllChartsAfterTabChange);
    document.addEventListener('shown.bs.pill', resizeAllChartsAfterTabChange);
    setupDashboardDataSourceControls();
    setupDashboardAutocompleteFilters();
    window.reloadSelectedDataSource();
    let typingTimer;
    $('.filter-input').on('keyup', function () { clearTimeout(typingTimer); typingTimer = setTimeout(applyFilters, 300); });
    $('.filter-input').on('change', applyFilters);
    
    setupAnalysisTableSearch('search-dren-table', 'dren-summary-table');
    setupAnalysisTableSearch('search-cisco-table', 'cisco-summary-table');
    setupAnalysisTableSearch('search-zap-table', 'zap-summary-table');

    $('#timeline-refresh-btn').on('click', function() { renderSubmissionTimelineCharts(); });
    $('#timeline-reset-btn').on('click', resetSubmissionTimelineControls);
    $('#timeline-granularity, #timeline-display-mode, #timeline-chart-type, #timeline-top-entities, #timeline-date-start, #timeline-date-end').on('change', function() {
        if (this.id !== 'timeline-top-entities') {
            ['DREN','CISCO','ZAP'].forEach(level => { submissionTimelineIndividualState[level].page = 1; });
        }
        renderSubmissionTimelineCharts();
    });
    $('input[name="timeline-layout-mode"]').on('change', function() {
        ['DREN','CISCO','ZAP'].forEach(level => { submissionTimelineIndividualState[level].page = 1; });
        renderSubmissionTimelineCharts();
    });
    $('#timeline-zoom-in-btn').on('click', function() { shiftSubmissionTimelineGranularity(-1); });
    $('#timeline-zoom-out-btn').on('click', function() { shiftSubmissionTimelineGranularity(1); });
    $('.timeline-individual-search-input').on('input', function() {
        const level = String(this.dataset.level || '').toUpperCase();
        if (submissionTimelineIndividualState[level]) {
            submissionTimelineIndividualState[level].search = this.value || '';
            submissionTimelineIndividualState[level].page = 1;
        }
        renderSubmissionTimelineCharts();
    });
    $('.timeline-page-size-select').on('change', function() {
        const level = String(this.dataset.level || '').toUpperCase();
        if (submissionTimelineIndividualState[level]) {
            submissionTimelineIndividualState[level].pageSize = Math.max(1, Number(this.value) || 6);
            submissionTimelineIndividualState[level].page = 1;
        }
        renderSubmissionTimelineCharts();
    });
    $('.timeline-page-prev, .timeline-page-next').on('click', function() {
        const level = String(this.dataset.level || '').toUpperCase();
        const state = submissionTimelineIndividualState[level];
        if (!state) return;
        state.page = Math.max(1, state.page + (this.classList.contains('timeline-page-next') ? 1 : -1));
        renderSubmissionTimelineCharts();
    });
    $('.timeline-expand-level-btn').on('click', function() {
        const level = String(this.dataset.level || '').toLowerCase();
        const card = document.getElementById(`timeline-card-${level}`);
        if (!card) return;
        card.classList.toggle('timeline-card-expanded');
        const expanded = card.classList.contains('timeline-card-expanded');
        this.innerHTML = expanded ? '<i class="fas fa-compress-alt"></i> Réduire' : '<i class="fas fa-expand-alt"></i> Agrandir';
        setTimeout(() => {
            const upper = level.toUpperCase();
            submissionTimelineChartsRefs[upper]?.resize?.();
            (submissionTimelineIndividualChartsRefs[upper] || []).forEach(ref => ref.chart?.resize?.());
        }, 50);
    });
    updateSubmissionTimelineZoomButtons();

    const analyseTab = document.getElementById('analyse-tab');
    if (analyseTab) {
        analyseTab.addEventListener('shown.bs.tab', function() {
            setTimeout(function() {
                Object.values(submissionTimelineChartsRefs).forEach(chart => { if (chart) chart.resize(); });
                Object.values(submissionTimelineIndividualChartsRefs).forEach(refs => (refs || []).forEach(ref => ref.chart?.resize?.()));
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


$(document).ready(function() {
    initializeRealisationComparisonEvents();
    if (typeof window.initializeRealisationComparisonControls === 'function') window.initializeRealisationComparisonControls();
});


document.addEventListener('DOMContentLoaded', function(){ try { initRealisationDrenDimensionTabs(); initRealisationCiscoDimensionTabs(); initRealisationZapDimensionTabs(); } catch(e) { console.warn(e); } });


document.addEventListener('DOMContentLoaded', function(){ const modalEl=document.getElementById('zapAggregationDetailsModal'); if(modalEl){ modalEl.addEventListener('hidden.bs.modal', destroyZapAggregationPopupCharts); } });


document.addEventListener('DOMContentLoaded', function(){ const modalEl=document.getElementById('ciscoAggregationDetailsModal'); if(modalEl){ modalEl.addEventListener('hidden.bs.modal', destroyCiscoAggregationPopupCharts); } });


/* ========================================================================== */
/* SOURCE DE DONNEES KOBOTOOLBOX / FICHIER JSON + BACKUP COMPLET POWER BI    */
/* ========================================================================== */
const KOBO_SOURCE_ASSET_UID = 'ath6cv2NrXEUijffeKJqSf';

// =====================================================================
// CONTRÔLE DES SAUVEGARDES JSON : VALIDITÉ, INTÉGRITÉ ET AUTHENTICITÉ
// =====================================================================
// IMPORTANT : ce projet est hébergé côté client (GitHub Pages). Une clé
// privée de signature ne doit JAMAIS être intégrée ici. Les exports créés
// par le navigateur sont donc protégés par SHA-256 (intégrité), mais ne
// sont considérés « authentiques/certifiés » que si une signature externe
// vérifiable est présente. Pour activer la vérification de signature,
// renseigner uniquement la CLÉ PUBLIQUE JWK ci-dessous.
const KOBO_BACKUP_PUBLIC_KEY_JWK = null;
const KOBO_BACKUP_SIGNATURE_ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' };
const KOBO_VERIFIED_STANDARD_FORMAT = 'KOBOTOOLBOX_VERIFIED_STANDARD_BACKUP';
const KOBO_VERIFIED_COMPLETE_FORMAT = 'KOBOTOOLBOX_VERIFIED_COMPLETE_BASE64_BACKUP';
const KOBO_VERIFIED_PARTIAL_FORMAT = 'KOBOTOOLBOX_VERIFIED_PARTIAL_BASE64_BACKUP';
const KOBO_ATTACHMENT_FETCH_RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function utf8Bytes(text) {
    return new TextEncoder().encode(String(text ?? ''));
}

function bytesToHex(buffer) {
    return Array.from(new Uint8Array(buffer)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function base64ToBytes(base64) {
    const clean = String(base64 || '').replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

function bytesToBase64(bytes) {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    const chunk = 0x8000;
    let binary = '';
    for (let i = 0; i < arr.length; i += chunk) binary += String.fromCharCode.apply(null, arr.subarray(i, Math.min(i + chunk, arr.length)));
    return btoa(binary);
}

function canonicalizeJson(value) {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(canonicalizeJson);
    const result = {};
    Object.keys(value).sort().forEach(key => { result[key] = canonicalizeJson(value[key]); });
    return result;
}

function canonicalJsonStringify(value) {
    return JSON.stringify(canonicalizeJson(value));
}

async function sha256HexFromBytes(bytes) {
    if (!globalThis.crypto?.subtle) throw new Error('Web Crypto SHA-256 n’est pas disponible dans ce navigateur.');
    return bytesToHex(await crypto.subtle.digest('SHA-256', bytes));
}

async function sha256HexFromText(text) {
    return sha256HexFromBytes(utf8Bytes(text));
}

async function sha256CanonicalJson(value) {
    return sha256HexFromText(canonicalJsonStringify(value));
}

async function calculateRecordsMerkleHash(records, onProgress = null) {
    const rows = Array.isArray(records) ? records : [];
    const hashes = [];
    for (let i = 0; i < rows.length; i += 1) {
        hashes.push(await sha256CanonicalJson(rows[i]));
        if (onProgress && (i % 25 === 0 || i === rows.length - 1)) onProgress(i + 1, rows.length);
    }
    return sha256HexFromText(hashes.join('\n'));
}

async function calculateAttachmentRootHash(attachments) {
    const list = Array.isArray(attachments) ? attachments : [];
    const signatures = list.map(item => [
        item?.submission_id ?? '', item?.attachment_uid ?? '', item?.filename ?? '', item?.mimetype ?? '', item?.byte_length_original ?? '', item?.sha256 ?? ''
    ].join('|')).sort();
    return sha256HexFromText(signatures.join('\n'));
}

function getJsonVerificationNode(name) {
    return document.getElementById(`json-check-${name}`);
}

function resetJsonVerificationUi() {
    const panel = document.getElementById('json-import-verification');
    if (!panel) return;
    panel.classList.remove('d-none');
    ['syntax','structure','coherence','integrity','attachments','authenticity'].forEach(name => {
        const node = getJsonVerificationNode(name);
        if (!node) return;
        node.classList.remove('is-ok','is-warning','is-error','is-working');
        const icon = node.querySelector('.json-check-icon');
        if (icon) icon.textContent = '○';
    });
    const verdict = document.getElementById('json-verification-verdict');
    if (verdict) { verdict.className = 'badge bg-secondary'; verdict.textContent = 'Contrôle en cours'; }
    const summary = document.getElementById('json-verification-summary');
    if (summary) summary.innerHTML = 'Le fichier sera importé uniquement après la fin des contrôles.';
    clearJsonDateCoherenceDetails();
}

function setJsonVerificationCheck(name, state, detail = '') {
    const node = getJsonVerificationNode(name);
    if (!node) return;
    node.classList.remove('is-ok','is-warning','is-error','is-working');
    node.classList.add(state === 'ok' ? 'is-ok' : state === 'warning' ? 'is-warning' : state === 'error' ? 'is-error' : 'is-working');
    const icon = node.querySelector('.json-check-icon');
    if (icon) icon.textContent = state === 'ok' ? '✓' : state === 'warning' ? '!' : state === 'error' ? '✕' : '…';
    const small = node.querySelector('small');
    if (small && detail) small.textContent = detail;
}

function setJsonVerificationVerdict(state, title, html) {
    const verdict = document.getElementById('json-verification-verdict');
    if (verdict) {
        verdict.className = `badge ${state === 'ok' ? 'bg-success' : state === 'warning' ? 'bg-warning text-dark' : 'bg-danger'}`;
        verdict.textContent = title;
    }
    const summary = document.getElementById('json-verification-summary');
    if (summary) summary.innerHTML = html;
}

function getBackupRecords(payload) {
    return extractRowsFromKoboJsonPayload(payload).filter(row => row && typeof row === 'object' && !Array.isArray(row));
}

function getBackupFormat(payload) {
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? String(payload.backup_format || '') : '';
}

function isVerifiedBackupFormat(format) {
    return format === KOBO_VERIFIED_STANDARD_FORMAT || format === KOBO_VERIFIED_COMPLETE_FORMAT || format === KOBO_VERIFIED_PARTIAL_FORMAT;
}

function getJsonCoherenceRowIdentifier(row, index) {
    const id = row?._id ?? row?._uuid ?? row?._index ?? row?.id ?? '';
    const line = `Ligne ${Number(index) + 1}`;
    return id === '' || id === null || id === undefined ? line : `${line} · ID ${String(id)}`;
}

function getJsonDateFieldDisplay(path) {
    const rawPath = String(path || '');
    const leaf = rawPath.split('/').pop()?.replace(/\[\d+\]/g, '') || rawPath;
    let label = '';
    try {
        label = headerMap?.[leaf] || headerMap?.[leaf.toLowerCase()] || '';
        if (!label && typeof getTranslatedHeader === 'function') label = getTranslatedHeader(leaf) || '';
    } catch (_) {}
    if (label && normalizeRealisationKey(label) !== normalizeRealisationKey(leaf)) return `${rawPath} — ${label}`;
    return rawPath;
}

function isJsonGeospatialField(path) {
    const rawPath = String(path || '');
    const leaf = rawPath.split('/').pop()?.replace(/\[\d+\]/g, '') || rawPath;
    let label = '';
    try {
        label = headerMap?.[leaf] || headerMap?.[leaf.toLowerCase()] || '';
        if (!label && typeof getTranslatedHeader === 'function') label = getTranslatedHeader(leaf) || '';
    } catch (_) {}
    const key = normalizeRealisationKey(`${rawPath} ${leaf} ${label}`);

    // Les champs géographiques KoboToolbox peuvent contenir les mots "start" ou "end"
    // (ex. start-geopoint) sans être des dates. Ils doivent être exclus AVANT la détection
    // temporelle afin d'éviter des faux positifs de cohérence.
    const geoTokens = [
        'geopoint', 'geolocation', 'geo_location', 'gps', 'latitude', 'longitude',
        'altitude', 'accuracy', 'precision_gps', 'coordinates', 'coordonnees'
    ];
    return geoTokens.some(token => key.includes(token));
}

function isJsonDateLikeField(path) {
    const rawPath = String(path || '');
    const leaf = rawPath.split('/').pop()?.replace(/\[\d+\]/g, '') || rawPath;
    let label = '';
    try {
        label = headerMap?.[leaf] || headerMap?.[leaf.toLowerCase()] || '';
        if (!label && typeof getTranslatedHeader === 'function') label = getTranslatedHeader(leaf) || '';
    } catch (_) {}

    // Priorité absolue : un champ géospatial n'est jamais traité comme un champ de date.
    // Exemple KoboToolbox : start-geopoint = "-18.91723 47.517632 0.0 84".
    if (isJsonGeospatialField(rawPath)) return false;

    const key = normalizeRealisationKey(`${rawPath} ${leaf} ${label}`);
    return /(^|_)(date|dates|datetime|dateheure|date_heure|submission_time|submitted_at|submission_date|start|end|debut|fin|today)(_|$)/.test(key)
        || key.includes('date_debut') || key.includes('date_fin') || key.includes('date_realisation')
        || key.includes('date_soumission') || key.includes('heure_soumission');
}

function isStrictCalendarDate(year, month, day) {
    const y = Number(year), m = Number(month), d = Number(day);
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d) || y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return false;
    const probe = new Date(Date.UTC(y, m - 1, d));
    return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

function inspectJsonDateValue(value) {
    if (value === '' || value === null || value === undefined) return { ok: true, ignored: true };
    if (value instanceof Date) {
        return Number.isNaN(value.getTime())
            ? { ok: false, reason: 'Objet Date invalide (date JavaScript non interprétable).' }
            : { ok: true, format: 'Date JavaScript valide' };
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return { ok: false, reason: 'Valeur numérique non finie utilisée dans un champ de date.' };
        // Timestamps Unix en secondes ou millisecondes : acceptés quand ils correspondent à une date plausible.
        const milliseconds = value >= 946684800000 && value <= 7258118400000
            ? value
            : (value >= 946684800 && value <= 7258118400 ? value * 1000 : null);
        if (milliseconds !== null && !Number.isNaN(new Date(milliseconds).getTime())) return { ok: true, format: 'Timestamp Unix valide' };
        return { ok: false, reason: 'Valeur numérique ambiguë pour une date. Utiliser de préférence AAAA-MM-JJ ou un horodatage ISO KoboToolbox.' };
    }
    if (typeof value !== 'string') {
        return { ok: false, reason: `Type ${Array.isArray(value) ? 'tableau' : typeof value} inattendu pour un champ de date.` };
    }

    const text = value.trim();
    if (!text) return { ok: true, ignored: true };

    // Formats Kobo/ISO : AAAA-MM-JJ, avec éventuellement heure, millisecondes et fuseau.
    let match = text.match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/);
    if (match) {
        if (!isStrictCalendarDate(match[1], match[2], match[3])) {
            return { ok: false, reason: `Date calendrier impossible : ${match[3]}/${match[2]}/${match[1]} n’existe pas.` };
        }
        const suffix = match[4] || '';
        if (!suffix) return { ok: true, format: 'Date ISO AAAA-MM-JJ valide' };
        // Kobo renvoie couramment T10:22:33.123+03:00 ou T07:22:33.123Z.
        if (/^T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+\-]\d{2}:?\d{2})?$/.test(suffix)) {
            if (!Number.isNaN(Date.parse(text))) return { ok: true, format: 'Horodatage ISO/KoboToolbox valide' };
            return { ok: false, reason: 'La partie date est valide, mais l’heure ou le fuseau de l’horodatage ISO est invalide.' };
        }
        if (/^ \d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?$/.test(suffix)) {
            const isoCompatible = `${match[1]}-${match[2]}-${match[3]}T${suffix.trim()}`;
            if (!Number.isNaN(Date.parse(isoCompatible))) return { ok: true, format: 'Date et heure locale valides' };
            return { ok: false, reason: 'La date est valide, mais l’heure associée est invalide.' };
        }
        return { ok: false, reason: 'Le champ commence comme une date ISO, mais contient un suffixe/format d’heure non reconnu.' };
    }

    // Formats usuels francophones : JJ/MM/AAAA, JJ-MM-AAAA ou JJ.MM.AAAA, heure facultative.
    match = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (match) {
        if (!isStrictCalendarDate(match[3], match[2], match[1])) {
            return { ok: false, reason: `Date calendrier impossible : ${match[1]}/${match[2]}/${match[3]} n’existe pas.` };
        }
        if (match[4] !== undefined) {
            const hh = Number(match[4]), mm = Number(match[5]), ss = Number(match[6] || 0);
            if (hh > 23 || mm > 59 || ss > 59) return { ok: false, reason: 'La date est valide, mais l’heure associée est impossible (heure/minute/seconde hors limites).' };
        }
        return { ok: true, format: 'Date JJ/MM/AAAA valide' };
    }

    // Une chaîne parseable par le navigateur est tolérée, mais seulement lorsqu’elle
    // contient clairement une année à quatre chiffres. Cela évite de considérer un libellé comme une date.
    if (/\b(?:19|20|21)\d{2}\b/.test(text) && !Number.isNaN(Date.parse(text))) {
        return { ok: true, format: 'Date textuelle interprétable' };
    }

    if (!/\d/.test(text)) return { ok: false, reason: 'Valeur textuelle non reconnue comme une date : aucun composant numérique de date n’a été détecté.' };
    return { ok: false, reason: 'Format de date non reconnu ou incomplet. Formats recommandés : AAAA-MM-JJ, horodatage ISO KoboToolbox ou JJ/MM/AAAA.' };
}

function collectJsonDateCoherenceIssues(row, rowIndex) {
    const issues = [];
    const rowLabel = getJsonCoherenceRowIdentifier(row, rowIndex);
    const visit = (value, path) => {
        if (Array.isArray(value)) {
            value.forEach((child, index) => visit(child, `${path}[${index}]`));
            return;
        }
        if (value && typeof value === 'object' && !(value instanceof Date)) {
            Object.entries(value).forEach(([key, child]) => visit(child, path ? `${path}/${key}` : key));
            return;
        }
        if (!isJsonDateLikeField(path)) return;
        const check = inspectJsonDateValue(value);
        if (check.ok) return;
        issues.push({
            rowIndex,
            rowLabel,
            field: getJsonDateFieldDisplay(path),
            rawField: String(path || ''),
            value: value === undefined ? 'undefined' : value === null ? 'null' : String(value),
            reason: check.reason || 'Valeur de date atypique non expliquée.'
        });
    };
    Object.entries(row || {}).forEach(([key, value]) => visit(value, key));
    return issues;
}

function clearJsonDateCoherenceDetails() {
    const panel = document.getElementById('json-coherence-date-details');
    const body = document.getElementById('json-coherence-date-table-body');
    const count = document.getElementById('json-coherence-date-count');
    const wrap = document.getElementById('json-coherence-date-table-wrap');
    const toggle = document.getElementById('json-coherence-date-toggle');
    if (body) body.innerHTML = '';
    if (count) count.textContent = '0 anomalie';
    if (panel) panel.classList.add('d-none');
    if (wrap) wrap.classList.remove('d-none');
    if (toggle) {
        toggle.setAttribute('aria-expanded', 'true');
        toggle.innerHTML = '<i class="fas fa-chevron-up"></i> Masquer les détails';
    }
}

function renderJsonDateCoherenceDetails(issues) {
    const list = Array.isArray(issues) ? issues : [];
    const panel = document.getElementById('json-coherence-date-details');
    const body = document.getElementById('json-coherence-date-table-body');
    const count = document.getElementById('json-coherence-date-count');
    const wrap = document.getElementById('json-coherence-date-table-wrap');
    const toggle = document.getElementById('json-coherence-date-toggle');
    if (!panel || !body) return;
    if (!list.length) {
        clearJsonDateCoherenceDetails();
        return;
    }
    panel.classList.remove('d-none');
    if (count) count.textContent = `${list.length.toLocaleString('fr-FR')} anomalie${list.length > 1 ? 's' : ''}`;
    body.innerHTML = list.map((issue, index) => `
        <tr>
            <td>${index + 1}</td>
            <td><strong>${escapeRealisationHtml(issue.rowLabel)}</strong></td>
            <td>${escapeRealisationHtml(issue.field)}</td>
            <td>${escapeRealisationHtml(issue.value)}</td>
            <td><i class="fas fa-exclamation-triangle text-warning me-1"></i>${escapeRealisationHtml(issue.reason)}</td>
        </tr>`).join('');
    if (toggle && toggle.dataset.listener !== '1') {
        toggle.dataset.listener = '1';
        toggle.addEventListener('click', () => {
            const hidden = wrap?.classList.toggle('d-none');
            toggle.setAttribute('aria-expanded', hidden ? 'false' : 'true');
            toggle.innerHTML = hidden
                ? '<i class="fas fa-chevron-down"></i> Afficher les détails'
                : '<i class="fas fa-chevron-up"></i> Masquer les détails';
        });
    }
}

function inspectRecordCoherence(records) {
    const rows = Array.isArray(records) ? records : [];
    const warnings = [];
    const ids = new Map();
    let withId = 0;
    let invalidObjects = 0;
    const dateIssues = [];
    rows.forEach((row, index) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) { invalidObjects += 1; return; }
        const id = row._id ?? row._uuid ?? '';
        if (id !== '') {
            withId += 1;
            const key = String(id);
            ids.set(key, (ids.get(key) || 0) + 1);
        }
        dateIssues.push(...collectJsonDateCoherenceIssues(row, index));
    });
    const duplicateIds = [...ids.entries()].filter(([, count]) => count > 1);
    if (invalidObjects) warnings.push(`${invalidObjects} ligne(s) non objet détectée(s)`);
    if (duplicateIds.length) warnings.push(`${duplicateIds.length} identifiant(s) Kobo dupliqué(s)`);
    if (withId === 0) warnings.push('aucun _id / _uuid Kobo détecté (acceptable pour un JSON analytique externe)');
    if (dateIssues.length) warnings.push(`${dateIssues.length} valeur(s) de date nécessitant une vérification détaillée`);
    return { invalidObjects, duplicateIds, withId, suspiciousDates: dateIssues.length, dateIssues, warnings };
}

async function verifyBackupDigitalSignature(payload, manifestHash) {
    const signature = payload?.verification?.digital_signature || payload?.digital_signature || null;
    if (!signature) return { status: 'unsigned', detail: 'Aucune signature numérique : intégrité vérifiable, origine non certifiée cryptographiquement.' };
    if (!KOBO_BACKUP_PUBLIC_KEY_JWK) return { status: 'unverifiable', detail: 'Une signature est présente mais aucune clé publique officielle n’est configurée dans le tableau de bord.' };
    try {
        const publicKey = await crypto.subtle.importKey('jwk', KOBO_BACKUP_PUBLIC_KEY_JWK, KOBO_BACKUP_SIGNATURE_ALGORITHM, false, ['verify']);
        const signatureBytes = base64ToBytes(signature.value_base64 || signature.signature_base64 || '');
        const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, signatureBytes, utf8Bytes(manifestHash));
        return ok
            ? { status: 'verified', detail: 'Signature numérique officielle valide.' }
            : { status: 'invalid', detail: 'Signature numérique invalide : le fichier ne peut pas être authentifié.' };
    } catch (error) {
        return { status: 'invalid', detail: `Vérification de signature impossible : ${error.message || error}` };
    }
}

async function validateImportedKoboJson(payload, filename = '') {
    const rows = getBackupRecords(payload);
    const format = getBackupFormat(payload);
    const verifiedFormat = isVerifiedBackupFormat(format);
    const result = {
        ok: false,
        rows,
        format: format || (Array.isArray(payload) ? 'TABLEAU_JSON_STANDARD' : 'JSON_COMPATIBLE'),
        warnings: [],
        errors: [],
        integrity: 'unavailable',
        authenticity: 'unsigned',
        authenticityDetail: '',
        attachmentsChecked: 0,
        attachmentsErrors: 0,
        isPartialBackup: false,
        declaredAttachments: 0,
        embeddedAttachments: 0,
        failedAttachments: 0
    };

    setJsonVerificationCheck('syntax', 'ok', `JSON lisible : ${filename || 'fichier sélectionné'}.`);

    if (!rows.length) {
        setJsonVerificationCheck('structure', 'error', 'Aucun tableau d’enregistrements reconnu dans le fichier.');
        result.errors.push('Aucun enregistrement exploitable n’a été trouvé.');
        return result;
    }
    setJsonVerificationCheck('structure', 'ok', `${rows.length.toLocaleString('fr-FR')} enregistrement(s) exploitable(s) · format : ${result.format}.`);

    const coherence = inspectRecordCoherence(rows);
    renderJsonDateCoherenceDetails(coherence.dateIssues);
    if (coherence.invalidObjects) {
        setJsonVerificationCheck('coherence', 'error', `${coherence.invalidObjects} ligne(s) invalide(s).`);
        result.errors.push('Le fichier contient des lignes qui ne sont pas des objets JSON.');
    } else if (coherence.warnings.length) {
        const dateHint = coherence.dateIssues.length ? ` · Détails affichés ci-dessous : ligne/soumission, champ, valeur et raison.` : '';
        setJsonVerificationCheck('coherence', 'warning', coherence.warnings.join(' ; ') + dateHint);
        result.warnings.push(...coherence.warnings);
    } else {
        setJsonVerificationCheck('coherence', 'ok', `${rows.length.toLocaleString('fr-FR')} ligne(s) structurée(s) correctement ; identifiants Kobo cohérents.`);
    }

    const declaredCount = Number(payload?.verification?.records_count ?? payload?.statistics?.records_count ?? NaN);
    if (Number.isFinite(declaredCount) && declaredCount !== rows.length) {
        result.errors.push(`Nombre d’enregistrements incohérent : ${declaredCount} annoncé(s), ${rows.length} trouvé(s).`);
    }

    if (verifiedFormat) {
        setJsonVerificationCheck('integrity', 'working', 'Calcul de l’empreinte SHA-256 des enregistrements…');
        const calculatedRecordsHash = await calculateRecordsMerkleHash(rows, (done, total) => {
            setJsonVerificationCheck('integrity', 'working', `SHA-256 : ${done.toLocaleString('fr-FR')} / ${total.toLocaleString('fr-FR')} enregistrement(s) contrôlé(s)…`);
        });
        const expectedRecordsHash = String(payload?.verification?.records_sha256 || '').toLowerCase();
        if (!expectedRecordsHash) {
            result.errors.push('Sauvegarde vérifiée sans empreinte records_sha256.');
            setJsonVerificationCheck('integrity', 'error', 'Empreinte SHA-256 des enregistrements absente.');
        } else if (calculatedRecordsHash !== expectedRecordsHash) {
            result.errors.push('Empreinte SHA-256 des enregistrements non conforme.');
            setJsonVerificationCheck('integrity', 'error', 'SHA-256 NON CONFORME : le contenu des enregistrements a changé ou est corrompu.');
        } else {
            const declaredManifestHash = String(payload?.verification?.manifest_sha256 || '').toLowerCase();
            if (declaredManifestHash) {
                const manifestCore = {
                    backup_format: String(payload?.backup_format || ''),
                    backup_version: Number(payload?.backup_version || 0),
                    exported_at: String(payload?.exported_at || ''),
                    asset_uid: String(payload?.asset_uid || ''),
                    records_count: rows.length,
                    records_sha256: calculatedRecordsHash,
                    attachments_count: Number(payload?.verification?.attachments_count ?? (Array.isArray(payload?.attachments) ? payload.attachments.length : 0)),
                    attachments_sha256: String(payload?.verification?.attachments_sha256 || '')
                };
                const calculatedManifestHash = await sha256CanonicalJson(manifestCore);
                if (calculatedManifestHash !== declaredManifestHash) {
                    result.errors.push('Empreinte SHA-256 du manifeste non conforme.');
                    setJsonVerificationCheck('integrity', 'error', 'SHA-256 du manifeste NON CONFORME : les métadonnées de sauvegarde ont été modifiées.');
                } else {
                    result.integrity = 'verified';
                    setJsonVerificationCheck('integrity', 'ok', `SHA-256 conforme (données + manifeste) : ${calculatedRecordsHash.slice(0, 16)}…`);
                }
            } else {
                result.integrity = 'verified';
                setJsonVerificationCheck('integrity', 'ok', `SHA-256 des enregistrements conforme : ${calculatedRecordsHash.slice(0, 16)}…`);
            }
        }
    } else {
        setJsonVerificationCheck('integrity', 'warning', 'Aucune empreinte SHA-256 intégrée : fichier compatible mais intégrité historique non certifiable.');
        result.warnings.push('Empreinte SHA-256 absente (format JSON externe ou ancien).');
    }

    const attachments = Array.isArray(payload?.attachments) ? payload.attachments : [];
    const declaredAttachments = Number(payload?.statistics?.attachments_declared ?? payload?.verification?.attachments_count ?? attachments.length ?? 0);
    const failedAttachments = Number(payload?.statistics?.attachments_failed ?? (Array.isArray(payload?.attachment_errors) ? payload.attachment_errors.length : 0) ?? 0);
    const isPartialBackup = format === KOBO_VERIFIED_PARTIAL_FORMAT || (declaredAttachments > 0 && attachments.length < declaredAttachments) || failedAttachments > 0;
    result.isPartialBackup = isPartialBackup;
    result.declaredAttachments = declaredAttachments;
    result.embeddedAttachments = attachments.length;
    result.failedAttachments = failedAttachments;
    if (attachments.length) {
        let attachmentErrors = 0;
        for (let i = 0; i < attachments.length; i += 1) {
            const item = attachments[i] || {};
            if (!item.data_base64) { attachmentErrors += 1; continue; }
            try {
                const bytes = base64ToBytes(item.data_base64);
                if (item.sha256) {
                    const calculated = await sha256HexFromBytes(bytes);
                    if (calculated.toLowerCase() !== String(item.sha256).toLowerCase()) attachmentErrors += 1;
                }
            } catch (_) { attachmentErrors += 1; }
            if (i % 10 === 0 || i === attachments.length - 1) setJsonVerificationCheck('attachments', 'working', `${i + 1} / ${attachments.length} pièce(s) jointe(s) contrôlée(s)…`);
        }
        result.attachmentsChecked = attachments.length;
        result.attachmentsErrors = attachmentErrors;
        if (attachmentErrors) {
            result.errors.push(`${attachmentErrors} pièce(s) jointe(s) Base64 invalide(s) ou non conforme(s).`);
            setJsonVerificationCheck('attachments', 'error', `${attachmentErrors} / ${attachments.length} pièce(s) jointe(s) non conforme(s).`);
        } else {
            const expectedRoot = String(payload?.verification?.attachments_sha256 || '').toLowerCase();
            if (expectedRoot) {
                const calculatedRoot = await calculateAttachmentRootHash(attachments);
                if (calculatedRoot !== expectedRoot) {
                    result.errors.push('Empreinte globale des pièces jointes non conforme.');
                    setJsonVerificationCheck('attachments', 'error', 'Pièces jointes lisibles, mais empreinte globale non conforme.');
                } else if (isPartialBackup) {
                    result.warnings.push(`Sauvegarde Base64 partielle : ${attachments.length} / ${declaredAttachments || attachments.length} pièce(s) jointe(s) incorporée(s).`);
                    setJsonVerificationCheck('attachments', 'warning', `Sauvegarde PARTIELLE : ${attachments.length} / ${declaredAttachments || attachments.length} pièce(s) jointe(s) Base64 conformes · ${failedAttachments} échec(s) déclaré(s).`);
                } else setJsonVerificationCheck('attachments', 'ok', `${attachments.length} / ${declaredAttachments || attachments.length} pièce(s) jointe(s) Base64 conformes · SHA-256 global conforme · sauvegarde complète.`);
            } else if (isPartialBackup) {
                result.warnings.push(`Sauvegarde Base64 partielle : ${attachments.length} / ${declaredAttachments || attachments.length} pièce(s) jointe(s) incorporée(s).`);
                setJsonVerificationCheck('attachments', 'warning', `Sauvegarde PARTIELLE : ${attachments.length} / ${declaredAttachments || attachments.length} pièce(s) jointe(s) Base64 lisibles · ${failedAttachments} échec(s) déclaré(s).`);
            } else setJsonVerificationCheck('attachments', 'ok', `${attachments.length} / ${declaredAttachments || attachments.length} pièce(s) jointe(s) Base64 lisibles et contrôlées · sauvegarde complète.`);
        }
    } else {
        const completeOrPartial = verifiedFormat && (format === KOBO_VERIFIED_COMPLETE_FORMAT || format === KOBO_VERIFIED_PARTIAL_FORMAT);
        setJsonVerificationCheck('attachments', 'warning', completeOrPartial ? `Aucune pièce jointe Base64 incorporée alors que ${declaredAttachments || 0} pièce(s) étaient déclarée(s).` : 'Aucune pièce jointe Base64 à contrôler dans ce fichier.');
        if (completeOrPartial && declaredAttachments > 0) result.warnings.push('Aucune pièce jointe Base64 incorporée dans la sauvegarde annoncée.');
    }

    const manifestHash = String(payload?.verification?.manifest_sha256 || payload?.verification?.records_sha256 || '');
    const authenticity = await verifyBackupDigitalSignature(payload, manifestHash);
    result.authenticity = authenticity.status;
    result.authenticityDetail = authenticity.detail;
    if (authenticity.status === 'verified') setJsonVerificationCheck('authenticity', 'ok', authenticity.detail);
    else if (authenticity.status === 'invalid') {
        setJsonVerificationCheck('authenticity', 'error', authenticity.detail);
        result.errors.push('Signature numérique invalide.');
    } else setJsonVerificationCheck('authenticity', 'warning', authenticity.detail);

    result.ok = result.errors.length === 0;
    return result;
}

async function buildVerifiedBackupEnvelope(records, mode = 'standard', extra = {}) {
    const now = new Date();
    const rows = Array.isArray(records) ? records : [];
    const recordsHash = await calculateRecordsMerkleHash(rows);
    const attachments = Array.isArray(extra.attachments) ? extra.attachments : [];
    const attachmentsHash = attachments.length ? await calculateAttachmentRootHash(attachments) : '';
    const backupFormat = mode === 'complete'
        ? KOBO_VERIFIED_COMPLETE_FORMAT
        : mode === 'partial'
            ? KOBO_VERIFIED_PARTIAL_FORMAT
            : KOBO_VERIFIED_STANDARD_FORMAT;
    const manifestCore = {
        backup_format: backupFormat,
        backup_version: 3,
        exported_at: now.toISOString(),
        asset_uid: KOBO_SOURCE_ASSET_UID,
        records_count: rows.length,
        records_sha256: recordsHash,
        attachments_count: attachments.length,
        attachments_sha256: attachmentsHash
    };
    const manifestHash = await sha256CanonicalJson(manifestCore);
    return {
        backup_format: manifestCore.backup_format,
        backup_version: manifestCore.backup_version,
        exported_at: manifestCore.exported_at,
        asset_uid: KOBO_SOURCE_ASSET_UID,
        usage: extra.usage || {},
        statistics: extra.statistics || { records_count: rows.length },
        verification: {
            algorithm: 'SHA-256',
            canonicalization: 'recursive-key-sort-v1',
            records_count: rows.length,
            records_sha256: recordsHash,
            attachments_count: attachments.length,
            attachments_sha256: attachmentsHash,
            manifest_sha256: manifestHash,
            authenticity_status: 'UNSIGNED_BROWSER_EXPORT',
            authenticity_note: 'Export créé dans le navigateur : intégrité SHA-256 vérifiable, mais aucune clé privée de signature n’est stockée dans le site public. Une signature numérique externe peut être ajoutée pour certifier l’origine.'
        },
        records: rows,
        ...((mode === 'complete' || mode === 'partial') ? { attachments, attachment_errors: extra.attachment_errors || [] } : {})
    };
}
const KOBO_SOURCE_DATA_API = `https://kf.kobotoolbox.org/api/v2/assets/${KOBO_SOURCE_ASSET_UID}/data.json`;
var activeDashboardDataSource = 'kobo';
var lastImportedJsonRows = null;
var lastImportedJsonFilename = '';
var koboSourceFetchPromise = null;

function getSelectedDashboardDataSource() {
    return document.querySelector('input[name="data-source-mode"]:checked')?.value === 'json' ? 'json' : 'kobo';
}

function resolveKoboNextUrl(nextValue) {
    if (!nextValue) return '';
    try { return new URL(String(nextValue), 'https://kf.kobotoolbox.org').href; }
    catch (_) { return String(nextValue || ''); }
}

var lastKoboFetchMeta = { providers: [], pages: 0, expectedCount: null };

// Compatibilité historique : malgré son nom, cette fonction utilise désormais
// la chaîne robuste Direct KoboToolbox -> CorsBridge -> AllOrigins -> CORS.lol.
async function fetchKoboJsonDirect(url) {
    const cleanUrl = String(url || '').trim();
    if (!cleanUrl) throw new Error('URL KoboToolbox vide.');
    return await fetchKoboJsonWithFallback(cleanUrl);
}

async function fetchCompleteKoboDatabase() {
    const rows = [];
    const visited = new Set();
    const providers = [];
    let pageNumber = 0;
    let expectedCount = null;
    let nextUrl = `${KOBO_SOURCE_DATA_API}?limit=1000&_t=${Date.now()}`;

    while (nextUrl) {
        const normalizedUrl = resolveKoboNextUrl(nextUrl);
        if (!normalizedUrl || visited.has(normalizedUrl)) break;
        visited.add(normalizedUrl);
        pageNumber += 1;
        if (pageNumber > 10000) throw new Error('Pagination Kobo interrompue : nombre de pages anormalement élevé.');
        $('#loading-text').text(`Téléchargement de la base KoboToolbox — page ${pageNumber}…`);

        const fetched = await fetchKoboJsonDirect(normalizedUrl);
        if (fetched?.provider && !providers.includes(fetched.provider)) providers.push(fetched.provider);
        const payload = fetched?.body;
        const pageRows = Array.isArray(payload) ? payload : (Array.isArray(payload?.results) ? payload.results : []);
        pageRows.forEach(row => {
            if (row && typeof row === 'object' && !Array.isArray(row)) rows.push(row);
        });
        if (expectedCount === null && Number.isFinite(Number(payload?.count))) expectedCount = Number(payload.count);
        nextUrl = Array.isArray(payload) ? '' : resolveKoboNextUrl(payload?.next || '');
    }

    if (expectedCount !== null && rows.length < expectedCount) {
        throw new Error(`Sauvegarde Kobo incomplète : ${rows.length} enregistrement(s) récupéré(s) sur ${expectedCount}.`);
    }
    lastKoboFetchMeta = { providers, pages: pageNumber, expectedCount };
    return rows;
}

function extractRowsFromKoboJsonPayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    for (const key of ['results','data','records','base_kobo','rows']) {
        if (Array.isArray(payload[key])) return payload[key];
    }
    return [];
}

function updateDashboardDataSourceUi(mode, message = '') {
    const sourceMode = mode === 'json' ? 'json' : 'kobo';
    activeDashboardDataSource = sourceMode;
    document.querySelectorAll('.kobo-source-option').forEach(label => {
        const input = label.querySelector('input[name="data-source-mode"]');
        label.classList.toggle('active', input?.value === sourceMode);
    });
    const jsonInput = document.getElementById('json-file');
    const exportButton = document.getElementById('export-kobo-json-btn');
    const importZone = document.getElementById('json-import-zone');
    const exportZone = document.getElementById('json-export-zone');
    if (jsonInput) jsonInput.disabled = sourceMode !== 'json';
    if (exportButton) exportButton.disabled = sourceMode !== 'kobo';
    importZone?.classList.toggle('source-inactive', sourceMode !== 'json');
    exportZone?.classList.toggle('source-inactive', sourceMode !== 'kobo');
    const status = document.getElementById('data-source-status');
    if (status) {
        status.className = `alert ${sourceMode === 'kobo' ? 'alert-primary' : 'alert-success'} py-2 px-3 small text-start mb-3`;
        status.innerHTML = message || (sourceMode === 'kobo'
            ? '<i class="fas fa-cloud"></i> <strong>Source active :</strong> KoboToolbox. Tous les graphiques et tableaux utilisent les données téléchargées depuis le serveur.'
            : '<i class="fas fa-file-code"></i> <strong>Source sélectionnée :</strong> Fichier JSON — aucune donnée chargée. Importez un fichier pour remplir les graphiques et tableaux.');
    }
}

function refreshEveryDashboardView(rows) {
    renderTable(rows);
    renderAnalysis(rows);
    try { if (typeof window.refreshAdvancedAnalysisFromMainData === 'function') window.refreshAdvancedAnalysisFromMainData(rows); } catch (e) { console.warn(e); }
    try {
        if (typeof window.initializeRealisationComparisonControls === 'function') window.initializeRealisationComparisonControls();
        if (typeof window.runRealisationTemporel === 'function') window.setTimeout(() => window.runRealisationTemporel(), 0);
        if (typeof window.extractRealisationsTable === 'function') window.setTimeout(() => window.extractRealisationsTable(), 0);
        if (typeof window.runAllRealisationComparisons === 'function' && document.getElementById('real-comparison')?.classList.contains('active')) window.setTimeout(() => window.runAllRealisationComparisons(), 30);
    } catch (e) { console.warn(e); }
}


function clearDashboardForJsonSource() {
    // Le choix de la source JSON doit créer une frontière nette entre les sources :
    // aucune donnée Kobo ou ancien JSON ne reste affiché avant un nouvel import manuel.
    allData = [];
    window.allData = allData;
    submissionTimelineSourceData = [];

    try { refreshEveryDashboardView([]); } catch (error) { console.warn('Nettoyage des vues JSON :', error); }

    // Nettoyage renforcé des zones principales afin qu'aucune ligne antérieure
    // ne reste visible si un ancien module n'interprète pas correctement un tableau vide.
    try {
        $('#table-body').empty();
        $('#table-group-header-row').empty();
        $('#table-sub-header-row').empty();
        $('#row-count').text('0');
        $('#sync-status').html(`<span class="badge bg-secondary sync-badge"><i class="fas fa-file-import"></i> En attente d'un fichier JSON</span>`);
        $('#error-box').hide();
    } catch (_) {}

    const jsonInput = document.getElementById('json-file');
    if (jsonInput) jsonInput.value = '';
    const verificationPanel = document.getElementById('json-import-verification');
    if (verificationPanel) verificationPanel.classList.add('d-none');

    updateDashboardDataSourceUi('json', `<i class="fas fa-file-code"></i> <strong>Source sélectionnée :</strong> Fichier JSON — <strong>aucune donnée chargée</strong>. Importez maintenant un fichier avec « Importer manuellement la base Kobo (Fichier JSON) ». Les graphiques et tableaux resteront vides jusqu'à l'import.`);
}

window.importKoboRecords = function(rows, sourceLabel = 'Fichier JSON') {
    const cleanRows = (Array.isArray(rows) ? rows : []).filter(row => row && typeof row === 'object' && !Array.isArray(row));
    if (!cleanRows.length) throw new Error('Aucun enregistrement exploitable n’a été trouvé.');
    allData = cleanRows;
    window.allData = allData;
    submissionTimelineSourceData = allData;
    refreshEveryDashboardView(allData);
    $('#sync-status').html(`<span class="badge bg-success sync-badge"><i class="fas fa-check-double"></i> Ok : ${allData.length} Lignes</span><span class="badge bg-info ms-2"><i class="fas fa-file-code"></i> ${escapeRealisationHtml(sourceLabel)}</span>`);
    return allData;
};


async function importKoboJsonFile(file) {
    if (!file) return;

    // RÈGLE STRICTE : le précédent jeu de données est supprimé avant même
    // la lecture du nouveau fichier. Aucune donnée n'entre dans les vues
    // avant que TOUS les contrôles de validité/intégrité soient terminés.
    clearDashboardForJsonSource();
    lastImportedJsonRows = [];
    lastImportedJsonFilename = '';
    resetJsonVerificationUi();

    $('#loading-box').show();
    $('#loading-text').text(`Contrôle du fichier JSON avant importation : ${file.name}…`);
    $('#error-box').hide();
    updateDashboardDataSourceUi('json', `<i class="fas fa-shield-alt"></i> <strong>Contrôle en cours :</strong> ${escapeRealisationHtml(file.name)}. Les graphiques et tableaux restent vides jusqu’au verdict.`);

    try {
        await loadDictionaryAutomatically();
        let payload;
        try {
            payload = JSON.parse(await file.text());
            setJsonVerificationCheck('syntax', 'ok', `JSON valide : ${escapeRealisationHtml(file.name)}.`);
        } catch (parseError) {
            setJsonVerificationCheck('syntax', 'error', `JSON illisible : ${parseError.message || parseError}`);
            setJsonVerificationVerdict('error', 'REFUSÉ', '<strong>VERDICT : FICHIER NON IMPORTABLE.</strong> La syntaxe JSON est invalide.');
            throw new Error(`Syntaxe JSON invalide : ${parseError.message || parseError}`);
        }

        const verification = await validateImportedKoboJson(payload, file.name);
        if (!verification.ok) {
            setJsonVerificationVerdict('error', 'REFUSÉ', `<strong>VERDICT : FICHIER REFUSÉ.</strong> ${verification.errors.map(escapeRealisationHtml).join(' · ')}`);
            throw new Error(verification.errors.join(' | '));
        }

        const rows = verification.rows;
        lastImportedJsonRows = rows;
        lastImportedJsonFilename = file.name;

        const authText = verification.authenticity === 'verified'
            ? '<strong>Authenticité : CERTIFIÉE.</strong>'
            : '<strong>Authenticité : non certifiée.</strong> Le fichier reste importable car sa structure est valide et son intégrité disponible a été contrôlée.';
        const integrityText = verification.integrity === 'verified'
            ? '<strong>Intégrité SHA-256 : conforme.</strong>'
            : '<strong>Intégrité historique : non disponible.</strong>';
        const partialText = verification.isPartialBackup
            ? `<strong>Sauvegarde Base64 PARTIELLE :</strong> ${verification.embeddedAttachments.toLocaleString('fr-FR')} / ${verification.declaredAttachments.toLocaleString('fr-FR')} pièce(s) jointe(s) incorporée(s) · ${verification.failedAttachments.toLocaleString('fr-FR')} échec(s). Les données tabulaires restent importables, mais ce fichier n’est pas une sauvegarde autonome complète.`
            : '';
        const verdictState = verification.isPartialBackup ? 'warning' : (verification.authenticity === 'verified' ? 'ok' : 'warning');
        const verdictTitle = verification.isPartialBackup ? 'IMPORTABLE — PARTIEL' : (verification.authenticity === 'verified' ? 'CERTIFIÉ' : 'IMPORTABLE');
        setJsonVerificationVerdict(verdictState, verdictTitle, `<strong>VERDICT : FICHIER IMPORTABLE.</strong> ${rows.length.toLocaleString('fr-FR')} enregistrement(s). ${partialText} ${integrityText} ${authText}`);

        // Injection uniquement APRÈS le verdict.
        window.importKoboRecords(rows, `JSON vérifié : ${file.name}`);
        updateDashboardDataSourceUi('json', `<i class="fas fa-check-circle"></i> <strong>Source active :</strong> ${escapeRealisationHtml(file.name)} — ${rows.length.toLocaleString('fr-FR')} enregistrement(s). Contrôles terminés avant importation ; tous les graphiques et tableaux ont été recalculés uniquement depuis ce fichier.`);
    } catch (error) {
        console.error('Import JSON impossible :', error);
        $('#error-box').html(`<strong>Erreur d’import JSON :</strong> ${escapeRealisationHtml(error.message || String(error))}`).show();
        $('#sync-status').html('<span class="badge bg-danger sync-badge">Échec import JSON — tableau de bord maintenu vide</span>');
        updateDashboardDataSourceUi('json', `<i class="fas fa-exclamation-triangle"></i> <strong>Import impossible :</strong> ${escapeRealisationHtml(file.name)}. Le tableau de bord reste vide pour éviter tout mélange ou toute utilisation de données non validées.`);
    } finally {
        $('#loading-box').hide();
        $('#loading-text').text('Synchronisation et modélisation des données...');
    }
}

window.reloadSelectedDataSource = async function() {
    const mode = getSelectedDashboardDataSource();
    if (mode === 'json') {
        // En mode JSON, un rafraîchissement ne doit jamais ressusciter une ancienne source.
        // L'utilisateur choisit explicitement le fichier à importer.
        clearDashboardForJsonSource();
        document.getElementById('json-file')?.click();
        return;
    }
    return fetchData();
};

function setupDashboardDataSourceControls() {
    document.querySelectorAll('input[name="data-source-mode"]').forEach(input => {
        if (input.dataset.sourceListener === '1') return;
        input.dataset.sourceListener = '1';
        input.addEventListener('change', async () => {
            const mode = getSelectedDashboardDataSource();
            if (mode === 'kobo') {
                updateDashboardDataSourceUi('kobo');
                await fetchData();
            } else {
                // IMPORTANT : on n'affiche jamais automatiquement les données Kobo
                // ni un ancien fichier JSON lorsque l'utilisateur choisit la source JSON.
                // La page reste vide jusqu'au prochain import manuel.
                clearDashboardForJsonSource();
            }
        });
    });
    const jsonInput = document.getElementById('json-file');
    if (jsonInput && jsonInput.dataset.sourceListener !== '1') {
        jsonInput.dataset.sourceListener = '1';
        jsonInput.addEventListener('change', async event => {
            const file = event.target.files?.[0];
            if (file) await importKoboJsonFile(file);
            event.target.value = '';
        });
    }
    updateDashboardDataSourceUi(getSelectedDashboardDataSource());
}

// ======================================================================
// FONCTION KOBO DE RÉFÉRENCE — VERSION CONFIRMÉE FONCTIONNELLE
// ----------------------------------------------------------------------
// Cette fonction conserve volontairement la stratégie qui a été testée
// avec succès dans le navigateur :
//   1) KoboToolbox direct
//   2) CorsBridge
//   3) AllOrigins
//   4) CORS.lol
//
// Aucun token Kobo n'est intégré au navigateur.
// Le premier service qui renvoie une réponse HTTP valide est utilisé.
// ======================================================================
fetchData = window.fetchData = async function() {
    if (typeof getSelectedDashboardDataSource === 'function' && getSelectedDashboardDataSource() === 'json') {
        return window.reloadSelectedDataSource();
    }
    if (koboSourceFetchPromise) return koboSourceFetchPromise;

    koboSourceFetchPromise = (async () => {
        $('#loading-box').show();
        $('#error-box').hide();
        $('#table-body').empty();
        $('#table-group-header-row').empty();
        $('#table-sub-header-row').empty();
        $('#sync-status').html('<span class="badge bg-warning text-dark sync-badge"><i class="fas fa-spinner fa-spin"></i> Collecte en cours...</span>');
        if (typeof updateDashboardDataSourceUi === 'function') {
            updateDashboardDataSourceUi('kobo', '<i class="fas fa-cloud-download-alt"></i> <strong>Source active :</strong> KoboToolbox — récupération de tous les enregistrements en cours…');
        }

        await loadDictionaryAutomatically();

        try {
            const koboUrl = 'https://kf.kobotoolbox.org/api/v2/assets/ath6cv2NrXEUijffeKJqSf/data.json?limit=500&_t=' + Date.now();
            const result = await fetchAllKoboPagesWithFallback(koboUrl);

            allData = (result.rows || []).filter(row => row !== null && typeof row === 'object' && !Array.isArray(row));
            if (!allData.length) {
                throw new Error('KoboToolbox a répondu correctement, mais aucun enregistrement exploitable n’a été trouvé.');
            }

            window.allData = allData;
            submissionTimelineSourceData = allData;
            lastKoboFetchMeta = {
                providers: result.providers || [],
                pages: Number(result.pages || 0),
                expectedCount: allData.length
            };

            if (typeof refreshEveryDashboardView === 'function') {
                refreshEveryDashboardView(allData);
            } else {
                renderTable(allData);
                renderAnalysis(allData);
                if (typeof window.initializeRealisationComparisonControls === 'function') {
                    window.initializeRealisationComparisonControls();
                    if (document.getElementById('real-comparison')?.classList.contains('active')) {
                        window.setTimeout(() => window.runAllRealisationComparisons(), 0);
                    }
                }
                if (document.getElementById('master-realisations')?.classList.contains('active')) {
                    setTimeout(() => window.runRealisationTemporel(), 0);
                }
            }

            const dictionaryBadge = isExcelLoaded
                ? '<span class="badge bg-success ms-2"><i class="fas fa-check-circle"></i> Traduit</span>'
                : '<span class="badge bg-warning text-dark ms-2"><i class="fas fa-info-circle"></i> Brut</span>';
            const providerLabel = (result.providers || []).join(' → ') || 'Méthode inconnue';
            const pageLabel = `${Number(result.pages || 1)} page(s)`;

            $('#sync-status')
                .html(`<span class="badge bg-success sync-badge"><i class="fas fa-check-double"></i> Ok : ${allData.length} Lignes</span>`)
                .append(`<span class="badge bg-info text-dark ms-2"><i class="fas fa-route"></i> ${escapeRealisationHtml(providerLabel)} · ${pageLabel}</span>`)
                .append(dictionaryBadge)
                .append('<span class="badge bg-primary ms-2"><i class="fas fa-cloud"></i> KoboToolbox</span>');

            if (typeof updateDashboardDataSourceUi === 'function') {
                updateDashboardDataSourceUi('kobo', `<i class="fas fa-check-circle"></i> <strong>Source active :</strong> KoboToolbox — ${allData.length.toLocaleString('fr-FR')} enregistrement(s) récupéré(s) via <strong>${escapeRealisationHtml(providerLabel)}</strong>.`);
            }

            return allData;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error ?? 'Erreur inconnue');
            const isNetworkError = /connexion|réseau|network|fetch|bloque|cors|antivirus|adblock|ublock|proxy|allorigins|corsproxy|cors\.lol|méthodes/i.test(message);
            const title = isNetworkError ? 'Erreur de connexion KoboToolbox' : 'Erreur interne de traitement';
            console.error(title + ' :', error);
            $('#error-box').html(`<strong>${title} :</strong> ${escapeRealisationHtml(message)}`).show();
            $('#sync-status').html(`<span class="badge bg-danger sync-badge">${isNetworkError ? 'Échec Kobo' : 'Erreur de traitement'}</span>`);
            if (typeof updateDashboardDataSourceUi === 'function') {
                updateDashboardDataSourceUi('kobo', '<i class="fas fa-triangle-exclamation"></i> <strong>Source active :</strong> KoboToolbox — connexion impossible. Vous pouvez utiliser la sauvegarde JSON hors-ligne.');
            }
            throw error;
        } finally {
            $('#loading-box').hide();
            $('#loading-text').text('Synchronisation et modélisation des données...');
            koboSourceFetchPromise = null;
        }
    })();

    return koboSourceFetchPromise;
};

function sleepMs(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchKoboAttachmentResponse(url, options = {}, maxAttempts = 3) {
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            const response = await fetch(url, { cache: 'no-store', ...options });
            if (response.ok) return response;
            const error = new Error(`HTTP ${response.status}`);
            error.httpStatus = response.status;
            if (!KOBO_ATTACHMENT_FETCH_RETRY_STATUSES.has(response.status) || attempt >= maxAttempts) throw error;
            lastError = error;
        } catch (error) {
            lastError = error;
            const status = Number(error?.httpStatus || 0);
            if ((status && !KOBO_ATTACHMENT_FETCH_RETRY_STATUSES.has(status)) || attempt >= maxAttempts) throw error;
        }
        await sleepMs(400 * attempt);
    }
    throw lastError || new Error('Téléchargement impossible.');
}

function getSelectedKoboJsonExportMode() {
    return document.querySelector('input[name="kobo-json-export-mode"]:checked')?.value === 'complete' ? 'complete' : 'standard';
}

function updateKoboJsonExportModeUi() {
    const mode = getSelectedKoboJsonExportMode();
    document.querySelectorAll('.kobo-json-export-option').forEach(label => {
        const input = label.querySelector('input[name="kobo-json-export-mode"]');
        label.classList.toggle('active', input?.value === mode);
    });
    const progress = document.getElementById('kobo-json-export-progress');
    if (progress) progress.innerHTML = mode === 'complete'
        ? 'Mode sélectionné : <strong>JSON sauvegarde complète — données + pièces jointes Base64</strong>. Une sauvegarde n’est déclarée <strong>COMPLÈTE</strong> que si 100 % des pièces jointes sont incorporées.'
        : 'Mode sélectionné : <strong>JSON standard — données Kobo</strong>. Recommandé pour Power BI et l’analyse de données.';
}

function setupKoboJsonExportModeControls() {
    document.querySelectorAll('input[name="kobo-json-export-mode"]').forEach(input => {
        if (input.dataset.exportModeListener === '1') return;
        input.dataset.exportModeListener = '1';
        input.addEventListener('change', updateKoboJsonExportModeUi);
    });
    updateKoboJsonExportModeUi();
}

document.addEventListener('DOMContentLoaded', setupKoboJsonExportModeControls);

function getKoboAttachmentEntries(rows) {
    const entries = [];
    (Array.isArray(rows) ? rows : []).forEach(row => {
        const submissionId = row?._id ?? row?._uuid ?? '';
        const attachments = Array.isArray(row?._attachments) ? row._attachments : [];
        attachments.forEach((attachment, index) => {
            if (!attachment || attachment.is_deleted) return;
            const url = String(attachment.download_url || attachment.download_large_url || '').trim();
            if (!url) return;
            entries.push({ submissionId, attachment, index, url });
        });
    });
    return entries;
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)));
    }
    return btoa(binary);
}

async function fetchKoboAttachmentAsBase64(entry) {
    const directUrl = String(entry?.url || '').trim();
    if (!directUrl) throw new Error('URL de pièce jointe absente.');

    try {
        const response = await fetchKoboAttachmentResponse(directUrl, {
            mode: 'cors',
            credentials: 'omit',
            headers: { 'Accept': '*/*' }
        }, 3);
        const buffer = await response.arrayBuffer();
        const mimetype = entry.attachment?.mimetype || response.headers.get('content-type') || 'application/octet-stream';
        return {
            submission_id: entry.submissionId,
            attachment_uid: entry.attachment?.uid || '',
            question_xpath: entry.attachment?.question_xpath || '',
            filename: entry.attachment?.media_file_basename || entry.attachment?.filename || `attachment_${entry.index + 1}`,
            original_filename_path: entry.attachment?.filename || '',
            mimetype,
            original_download_url: directUrl,
            retrieval_method: 'accès direct KoboToolbox',
            encoding: 'base64',
            byte_length_original: buffer.byteLength,
            sha256: await sha256HexFromBytes(new Uint8Array(buffer)),
            data_base64: arrayBufferToBase64(buffer)
        };
    } catch (error) {
        const status = Number(error?.httpStatus || 0);
        if (status === 401 || status === 403) {
            const e = new Error(`HTTP ${status} — pièce jointe KoboToolbox non accessible anonymement par fetch() direct.`);
            e.httpStatus = status;
            throw e;
        }
        throw error;
    }
}

async function mapWithConcurrency(items, concurrency, worker) {
    const results = new Array(items.length);
    let nextIndex = 0;
    const runners = Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, async () => {
        while (true) {
            const index = nextIndex++;
            if (index >= items.length) break;
            results[index] = await worker(items[index], index);
        }
    });
    await Promise.all(runners);
    return results;
}



function getKoboBackupTimestamp(date = new Date()) {
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

async function exportKoboStandardJson() {
    const now = new Date();
    const stamp = getKoboBackupTimestamp(now);
    const progress = document.getElementById('kobo-json-export-progress');
    if (progress) progress.innerHTML = '<strong>Calcul de l’empreinte SHA-256 des enregistrements…</strong>';
    const payload = await buildVerifiedBackupEnvelope(allData, 'standard', {
        usage: {
            primary_role: 'JSON standard Kobo pour Power BI, Power Query, Excel, R, Python et réimportation dans le tableau de bord',
            power_bi_compatible: true,
            power_bi_note: 'Dans Power BI / Power Query, développez la propriété records pour obtenir la table des enregistrements Kobo.',
            attachments: 'Les pièces jointes restent référencées dans les enregistrements Kobo par leurs métadonnées et URL ; leur contenu binaire n’est pas incorporé.'
        },
        statistics: { records_count: allData.length }
    });
    pmaFixedExportDownload(
        new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }),
        `backup_database_KOBOTOOLBOX_${stamp}.json`
    );
    if (progress) progress.innerHTML = `<strong>JSON standard vérifiable généré :</strong> ${allData.length.toLocaleString('fr-FR')} enregistrement(s) · SHA-256 : <code>${payload.verification.records_sha256.slice(0,16)}…</code> · compatible Power BI via <code>records</code>.`;
}

async function exportKoboCompleteBase64Json() {
    const attachments = getKoboAttachmentEntries(allData);
    const answer = window.confirm(
        `SAUVEGARDE AUTONOME BASE64 — ACCÈS DIRECT KOBO\n\n` +
        `${allData.length.toLocaleString('fr-FR')} enregistrement(s) seront sauvegardés.\n` +
        `${attachments.length.toLocaleString('fr-FR')} pièce(s) jointe(s) seront téléchargée(s) directement depuis KoboToolbox et incorporée(s) en Base64.\n\n` +
        `IMPORTANT : cette version n’utilise aucun service externe ni proxy. Les pièces jointes non accessibles anonymement peuvent échouer avec HTTP 401/403 ; le fichier sera alors explicitement marqué PARTIAL_BASE64.\n\n` +
        `Une sauvegarde ne sera déclarée COMPLETE que si 100 % des pièces jointes sont incorporées. Continuer ?`
    );
    if (!answer) return;

    const button = document.getElementById('export-kobo-json-btn');
    const progress = document.getElementById('kobo-json-export-progress');
    const oldButtonHtml = button?.innerHTML || '';
    if (button) { button.disabled = true; button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sauvegarde Base64 en cours…'; }

    let completed = 0;
    let totalBytes = 0;
    const failures = [];
    try {
        if (progress) progress.innerHTML = `<strong>Préparation :</strong> ${attachments.length.toLocaleString('fr-FR')} pièce(s) jointe(s) à incorporer par accès direct…`;
        const attachmentResults = await mapWithConcurrency(attachments, 3, async (entry) => {
            try {
                const result = await fetchKoboAttachmentAsBase64(entry);
                totalBytes += Number(result.byte_length_original || 0);
                return result;
            } catch (error) {
                const failed = {
                    submission_id: entry.submissionId,
                    attachment_uid: entry.attachment?.uid || '',
                    filename: entry.attachment?.media_file_basename || entry.attachment?.filename || '',
                    original_download_url: entry.url,
                    http_status: Number(error?.httpStatus || 0) || null,
                    error: error?.message || String(error)
                };
                failures.push(failed);
                return null;
            } finally {
                completed += 1;
                if (progress) progress.innerHTML = `<strong>Téléchargement direct des pièces jointes :</strong> ${completed.toLocaleString('fr-FR')} / ${attachments.length.toLocaleString('fr-FR')} · échec(s) : ${failures.length.toLocaleString('fr-FR')}`;
            }
        });

        const embedded = attachmentResults.filter(Boolean);
        const isComplete = embedded.length === attachments.length && failures.length === 0;
        if (!isComplete) {
            const downloadPartial = window.confirm(
                `SAUVEGARDE NON COMPLÈTE\n\n` +
                `${embedded.length.toLocaleString('fr-FR')} / ${attachments.length.toLocaleString('fr-FR')} pièce(s) jointe(s) ont été incorporée(s).\n` +
                `${failures.length.toLocaleString('fr-FR')} pièce(s) jointe(s) sont absente(s).\n\n` +
                `Le fichier sera nommé PARTIAL_BASE64 et le détail des échecs sera conservé dans attachment_errors.\n\n` +
                `Voulez-vous télécharger malgré tout cette sauvegarde PARTIELLE ?`
            );
            if (!downloadPartial) {
                if (progress) progress.innerHTML = `<span class="text-warning"><strong>Export partiel annulé :</strong> ${embedded.length.toLocaleString('fr-FR')} / ${attachments.length.toLocaleString('fr-FR')} pièce(s) jointe(s) récupérée(s). Pour incorporer les fichiers protégés, ils doivent être rendus accessibles directement par KoboToolbox.</span>`;
                return;
            }
        }

        const mode = isComplete ? 'complete' : 'partial';
        const now = new Date();
        const stamp = getKoboBackupTimestamp(now);
        const payload = await buildVerifiedBackupEnvelope(allData, mode, {
            usage: {
                primary_role: isComplete
                    ? 'Sauvegarde autonome complète de la base KoboToolbox chargée dans le tableau de bord'
                    : 'Sauvegarde Base64 PARTIELLE : données Kobo complètes mais certaines pièces jointes binaires n’ont pas pu être incorporées par accès direct',
                power_bi_compatible: true,
                power_bi_note: 'Dans Power BI / Power Query, utilisez records pour les données tabulaires et attachments pour les pièces jointes Base64.',
                attachment_encoding: 'base64',
                attachment_retrieval: 'direct-kobotoolbox-fetch',
                completeness: isComplete ? 'COMPLETE' : 'PARTIAL'
            },
            statistics: {
                records_count: allData.length,
                attachments_declared: attachments.length,
                attachments_embedded: embedded.length,
                attachments_failed: failures.length,
                backup_completeness: isComplete ? 'COMPLETE' : 'PARTIAL',
                original_attachment_bytes_embedded: totalBytes,
                attachment_access_mode: 'DIRECT_KOBOTOOLBOX'
            },
            attachments: embedded,
            attachment_errors: failures
        });

        if (progress) progress.innerHTML = '<strong>Assemblage du fichier JSON Base64…</strong>';
        const filename = isComplete
            ? `backup_database_KOBOTOOLBOX_COMPLETE_BASE64_${stamp}.json`
            : `backup_database_KOBOTOOLBOX_PARTIAL_BASE64_${stamp}.json`;
        pmaFixedExportDownload(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }), filename);
        if (progress) {
            progress.innerHTML = isComplete
                ? `<span class="text-success"><strong>✅ SAUVEGARDE AUTONOME COMPLÈTE :</strong> ${embedded.length.toLocaleString('fr-FR')} / ${attachments.length.toLocaleString('fr-FR')} pièce(s) jointe(s) incorporée(s) en Base64 par accès direct KoboToolbox.</span>`
                : `<span class="text-danger"><strong>⚠️ SAUVEGARDE PARTIELLE :</strong> ${embedded.length.toLocaleString('fr-FR')} / ${attachments.length.toLocaleString('fr-FR')} pièce(s) jointe(s) incorporée(s), ${failures.length.toLocaleString('fr-FR')} absente(s). Les erreurs sont détaillées dans <code>attachment_errors</code>.</span>`;
        }
    } finally {
        if (button) { button.disabled = false; button.innerHTML = oldButtonHtml; }
    }
}

window.exportKoboBaseJSON = async function() {
    try {
        if (getSelectedDashboardDataSource() !== 'kobo') throw new Error('Sélectionnez « Source de données provenant de KOBOTOOLBOX » pour créer une sauvegarde de la base serveur.');
        if (!Array.isArray(allData) || !allData.length) throw new Error('Aucune donnée KoboToolbox disponible.');
        if (getSelectedKoboJsonExportMode() === 'complete') await exportKoboCompleteBase64Json();
        else await exportKoboStandardJson();
    } catch (error) {
        console.error('Export JSON Kobo impossible :', error);
        const progress = document.getElementById('kobo-json-export-progress');
        if (progress) progress.innerHTML = `<span class="text-danger"><strong>Échec de l’export :</strong> ${escapeRealisationHtml(error.message || String(error))}</span>`;
        alert(error.message || 'L’export de la base Kobo a échoué.');
    }
};


/* ========================================================================== */
/* V6.7 — TESTS STATISTIQUES AVANCÉS DES RÉALISATIONS                        */
/* Khi², Pearson, ANOVA, Spearman, Kruskal-Wallis                            */
/* ========================================================================== */
const realStatisticsCharts = { pearson: null, anova: null };

function realStatsMean(values) {
    return values.length ? values.reduce((s, v) => s + v, 0) / values.length : NaN;
}
function realStatsMedian(values) {
    if (!values.length) return NaN;
    const a = [...values].sort((x, y) => x - y), m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
function realStatsSampleSd(values) {
    if (values.length < 2) return 0;
    const m = realStatsMean(values);
    return Math.sqrt(values.reduce((s, v) => s + Math.pow(v - m, 2), 0) / (values.length - 1));
}
function realStatsClamp01(value) { return Math.max(0, Math.min(1, Number(value))); }

/* Fonctions numériques : Gamma/Bêta régularisées pour p-values */
function realStatsLogGamma(z) {
    const c = [676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
    if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - realStatsLogGamma(1 - z);
    z -= 1;
    let x = 0.99999999999980993;
    for (let i = 0; i < c.length; i++) x += c[i] / (z + i + 1);
    const t = z + c.length - 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
function realStatsGammaQ(a, x) {
    if (!(a > 0) || x < 0) return NaN;
    if (x === 0) return 1;
    const ITMAX = 200, EPS = 3e-14, FPMIN = 1e-300;
    if (x < a + 1) {
        let ap = a, sum = 1 / a, del = sum;
        for (let n = 1; n <= ITMAX; n++) {
            ap += 1; del *= x / ap; sum += del;
            if (Math.abs(del) < Math.abs(sum) * EPS) break;
        }
        const p = sum * Math.exp(-x + a * Math.log(x) - realStatsLogGamma(a));
        return realStatsClamp01(1 - p);
    }
    let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
    for (let i = 1; i <= ITMAX; i++) {
        const an = -i * (i - a);
        b += 2; d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
        c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
        d = 1 / d;
        const del = d * c; h *= del;
        if (Math.abs(del - 1) < EPS) break;
    }
    return realStatsClamp01(Math.exp(-x + a * Math.log(x) - realStatsLogGamma(a)) * h);
}
function realStatsBetaCF(a, b, x) {
    const MAXIT = 200, EPS = 3e-14, FPMIN = 1e-300;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d; let h = d;
    for (let m = 1; m <= MAXIT; m++) {
        const m2 = 2 * m;
        let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
        d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
        c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
        d = 1 / d; h *= d * c;
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
        d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
        c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
        d = 1 / d; const del = d * c; h *= del;
        if (Math.abs(del - 1) < EPS) break;
    }
    return h;
}
function realStatsBetaI(a, b, x) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(realStatsLogGamma(a + b) - realStatsLogGamma(a) - realStatsLogGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    const v = x < (a + 1) / (a + b + 2) ? bt * realStatsBetaCF(a, b, x) / a : 1 - bt * realStatsBetaCF(b, a, 1 - x) / b;
    return realStatsClamp01(v);
}
function realStatsTTwoSidedP(t, df) {
    if (!(df > 0) || !Number.isFinite(t)) return NaN;
    const x = df / (df + t * t);
    return realStatsBetaI(df / 2, 0.5, x);
}
function realStatsFUpperP(f, df1, df2) {
    if (!(f >= 0) || !(df1 > 0) || !(df2 > 0)) return NaN;
    const x = df2 / (df2 + df1 * f);
    return realStatsBetaI(df2 / 2, df1 / 2, x);
}
function realStatsChiUpperP(chi2, df) {
    return (chi2 >= 0 && df > 0) ? realStatsGammaQ(df / 2, chi2 / 2) : NaN;
}
function realStatsFormatP(p) {
    if (!Number.isFinite(p)) return 'Non calculable';
    if (p < 0.0001) return '< 0,0001';
    return p.toLocaleString('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}
function realStatsSignificanceClass(p) {
    return Number.isFinite(p) && p < 0.05 ? 'is-significant' : 'is-nonsignificant';
}
function realStatsConclusion(p) {
    if (!Number.isFinite(p)) return 'Conclusion statistique non calculable avec les données disponibles.';
    return p < 0.05
        ? 'Résultat statistiquement significatif au seuil de 5 % : les données apportent des éléments contre H₀.'
        : 'Résultat non significatif au seuil de 5 % : les données ne permettent pas de rejeter H₀.';
}
function realStatsCorrelationLabel(r) {
    if (!Number.isFinite(r)) return 'Non calculable';
    const a = Math.abs(r);
    const force = a < 0.10 ? 'négligeable' : a < 0.30 ? 'faible' : a < 0.50 ? 'modérée' : a < 0.70 ? 'forte' : 'très forte';
    return `${force}, ${r > 0 ? 'positive' : r < 0 ? 'négative' : 'nulle'}`;
}
function realStatsPearson(xs, ys) {
    const pairs = xs.map((x, i) => [Number(x), Number(ys[i])]).filter(p => p.every(Number.isFinite));
    const n = pairs.length;
    if (n < 3) return { n, r: NaN, p: NaN };
    const mx = realStatsMean(pairs.map(p => p[0])), my = realStatsMean(pairs.map(p => p[1]));
    let sxy = 0, sxx = 0, syy = 0;
    pairs.forEach(([x, y]) => { const dx = x - mx, dy = y - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; });
    if (sxx <= 0 || syy <= 0) return { n, r: NaN, p: NaN };
    const r = Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
    const t = Math.abs(r) >= 1 ? Infinity : r * Math.sqrt((n - 2) / Math.max(1e-15, 1 - r * r));
    return { n, r, p: Number.isFinite(t) ? realStatsTTwoSidedP(t, n - 2) : 0 };
}
function realStatsRanks(values) {
    const sorted = values.map((v, i) => ({ v: Number(v), i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(values.length); let k = 0;
    while (k < sorted.length) {
        let j = k + 1; while (j < sorted.length && sorted[j].v === sorted[k].v) j++;
        const rank = (k + 1 + j) / 2;
        for (let q = k; q < j; q++) ranks[sorted[q].i] = rank;
        k = j;
    }
    return ranks;
}
function realStatsSpearman(xs, ys) {
    const pairs = xs.map((x, i) => [Number(x), Number(ys[i])]).filter(p => p.every(Number.isFinite));
    if (pairs.length < 3) return { n: pairs.length, rho: NaN, p: NaN };
    const rx = realStatsRanks(pairs.map(p => p[0])), ry = realStatsRanks(pairs.map(p => p[1]));
    const base = realStatsPearson(rx, ry);
    return { n: base.n, rho: base.r, p: base.p };
}
function realStatsInclusiveDuration(record) {
    if (!record?.dateStart || !record?.dateEnd) return NaN;
    const d = Math.floor((record.dateEnd.getTime() - record.dateStart.getTime()) / 86400000) + 1;
    return d > 0 ? d : NaN;
}
function realStatsDateNumber(date) { return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() / 86400000 : NaN; }

function getRealStatisticsSettings() {
    return {
        scope: String(document.getElementById('real-stats-scope')?.value || 'DREN').toUpperCase(),
        dimension: document.getElementById('real-stats-dimension')?.value || 'sousActivite',
        element: document.getElementById('real-stats-element')?.value || 'all',
        start: parseSubmissionDate(document.getElementById('real-stats-start')?.value || ''),
        end: parseSubmissionDate(document.getElementById('real-stats-end')?.value || '')
    };
}
function getRealStatisticsRecords(settings = getRealStatisticsSettings(), ignoreElement = false) {
    return getRealisationsData().filter(record => {
        if (record.niveau !== settings.scope) return false;
        const dim = getRealisationComparisonDimensionValue(record, settings.dimension);
        if (!isRealisationComparisonDimensionValueValid(dim, settings.dimension)) return false;
        if (!ignoreElement && settings.element !== 'all' && getRealisationComparisonDimensionKey(dim) !== settings.element) return false;
        if (settings.start && (!record.dateStart || record.dateStart < settings.start)) return false;
        if (settings.end && (!record.dateEnd || record.dateEnd > settings.end)) return false;
        return Number.isFinite(Number(record.valeur));
    });
}
function populateRealStatisticsElements() {
    const settings = getRealStatisticsSettings();
    const select = document.getElementById('real-stats-element');
    if (!select) return;
    const previous = select.value || 'all';
    const config = getRealisationComparisonDimensionConfig(settings.dimension);
    const values = new Map();
    getRealStatisticsRecords(settings, true).forEach(record => {
        const label = getRealisationComparisonDimensionValue(record, settings.dimension);
        values.set(getRealisationComparisonDimensionKey(label), label);
    });
    select.innerHTML = `<option value="all">Tous les ${escapeRealisationHtml(config.plural.toLowerCase())}</option>` + [...values.entries()]
        .sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'fr'))
        .map(([key, label]) => `<option value="${escapeRealisationHtml(key)}">${escapeRealisationHtml(label)}</option>`).join('');
    if ([...select.options].some(o => o.value === previous)) select.value = previous;
}
function realStatsGroupByEntity(records, minN = 1) {
    const map = new Map();
    records.forEach(r => {
        const key = cleanSpaces(r.entite || 'Non renseignée');
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(Number(r.valeur));
    });
    return [...map.entries()].filter(([, values]) => values.length >= minN).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'fr'));
}
function realStatsTopBuckets(records, labelGetter, maxBuckets) {
    const counts = new Map(); records.forEach(r => { const x = labelGetter(r); counts.set(x, (counts.get(x) || 0) + 1); });
    const sorted = [...counts.entries()].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0],'fr'));
    if (sorted.length <= maxBuckets) return { labels: sorted.map(x=>x[0]), map: new Map(sorted.map(x=>[x[0],x[0]])), collapsed:false };
    const keep = sorted.slice(0, maxBuckets - 1).map(x=>x[0]);
    const map = new Map(sorted.map(([label])=>[label, keep.includes(label) ? label : 'Autres']));
    return { labels:[...keep,'Autres'], map, collapsed:true };
}

function renderRealStatisticsChi2(settings, recordsAll) {
    const summary = document.getElementById('real-stats-chi2-summary'), head = document.getElementById('real-stats-chi2-head'), body = document.getElementById('real-stats-chi2-body');
    if (!summary || !head || !body) return;
    if (settings.element !== 'all') {
        summary.className = 'real-statistics-result is-warning';
        summary.innerHTML = '<strong>Khi² non exécuté pour un élément unique.</strong> Sélectionnez « Tous les éléments » afin de construire une table de contingence Entité × Dimension comportant au moins deux catégories.';
        head.innerHTML=''; body.innerHTML='<tr><td class="text-muted">Sélection spécifique active.</td></tr>'; return;
    }
    const records = recordsAll;
    if (records.length < 5) { summary.className='real-statistics-result is-warning'; summary.textContent='Données insuffisantes pour le test du Khi².'; head.innerHTML=''; body.innerHTML=''; return; }
    const dimGetter = r => getRealisationComparisonDimensionValue(r, settings.dimension);
    const rowBuckets = realStatsTopBuckets(records, r => cleanSpaces(r.entite || 'Non renseignée'), 12);
    const colBuckets = realStatsTopBuckets(records, dimGetter, 15);
    if (rowBuckets.labels.length < 2 || colBuckets.labels.length < 2) { summary.className='real-statistics-result is-warning'; summary.textContent='Le Khi² exige au moins deux entités et deux catégories de dimension.'; head.innerHTML=''; body.innerHTML=''; return; }
    const ri = new Map(rowBuckets.labels.map((x,i)=>[x,i])), ci = new Map(colBuckets.labels.map((x,i)=>[x,i]));
    const table = rowBuckets.labels.map(()=>colBuckets.labels.map(()=>0));
    records.forEach(r=>{ const rr=rowBuckets.map.get(cleanSpaces(r.entite||'Non renseignée')), cc=colBuckets.map.get(dimGetter(r)); if(ri.has(rr)&&ci.has(cc)) table[ri.get(rr)][ci.get(cc)]++; });
    const rowTotals=table.map(row=>row.reduce((a,b)=>a+b,0)), colTotals=colBuckets.labels.map((_,j)=>table.reduce((s,row)=>s+row[j],0));
    const n=rowTotals.reduce((a,b)=>a+b,0); let chi2=0, below5=0, below1=0, cells=0;
    table.forEach((row,i)=>row.forEach((obs,j)=>{ const exp=rowTotals[i]*colTotals[j]/n; if(exp>0){chi2+=Math.pow(obs-exp,2)/exp; cells++; if(exp<5)below5++; if(exp<1)below1++;} }));
    const df=(rowBuckets.labels.length-1)*(colBuckets.labels.length-1), p=realStatsChiUpperP(chi2,df), v=Math.sqrt(chi2/(n*Math.max(1,Math.min(rowBuckets.labels.length-1,colBuckets.labels.length-1))));
    summary.className=`real-statistics-result ${realStatsSignificanceClass(p)}`;
    summary.innerHTML=`<strong>χ² = ${chi2.toLocaleString('fr-FR',{maximumFractionDigits:3})}</strong> · ddl = ${df} · p ${realStatsFormatP(p)} · V de Cramér = ${v.toLocaleString('fr-FR',{maximumFractionDigits:3})}. <strong>${realStatsConclusion(p)}</strong><br><small>${below5}/${cells} cellule(s) attendue(s) &lt; 5 ; ${below1} &lt; 1. ${rowBuckets.collapsed||colBuckets.collapsed?'Pour garder une table lisible, les catégories les moins fréquentes sont regroupées dans « Autres ».':''}</small>`;
    head.innerHTML='<tr><th>Entité</th>'+colBuckets.labels.map(x=>`<th>${escapeRealisationHtml(x)}</th>`).join('')+'<th>Total</th></tr>';
    body.innerHTML=table.map((row,i)=>`<tr><th>${escapeRealisationHtml(rowBuckets.labels[i])}</th>${row.map(v=>`<td class="text-end">${v}</td>`).join('')}<td class="text-end fw-bold">${rowTotals[i]}</td></tr>`).join('')+`<tr class="fw-bold"><th>Total</th>${colTotals.map(v=>`<td class="text-end">${v}</td>`).join('')}<td class="text-end">${n}</td></tr>`;
}

function getRealStatsCorrelationSeries(records) {
    const definitions=[
        {key:'start',label:'Date de début', x:r=>realStatsDateNumber(r.dateStart)},
        {key:'end',label:'Date de fin', x:r=>realStatsDateNumber(r.dateEnd)},
        {key:'duration',label:'Durée inclusive (jours)', x:r=>realStatsInclusiveDuration(r)}
    ];
    return definitions.map(d=>{ const pairs=records.map(r=>({record:r,x:d.x(r),y:Number(r.valeur)})).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)); return {...d,pairs}; });
}
function renderRealStatisticsPearson(records) {
    const summary=document.getElementById('real-stats-pearson-summary'), body=document.getElementById('real-stats-pearson-body'), canvas=document.getElementById('real-stats-pearson-chart');
    if (!summary||!body||!canvas) return;
    const series=getRealStatsCorrelationSeries(records).map(s=>({...s,result:realStatsPearson(s.pairs.map(p=>p.x),s.pairs.map(p=>p.y))}));
    const valid=series.filter(s=>Number.isFinite(s.result.r));
    body.innerHTML=series.map(s=>`<tr><td>${s.label}</td><td>${s.result.n}</td><td class="fw-bold">${Number.isFinite(s.result.r)?s.result.r.toFixed(3):'—'}</td><td>${realStatsFormatP(s.result.p)}</td><td>${escapeRealisationHtml(realStatsCorrelationLabel(s.result.r))}</td></tr>`).join('');
    if(!valid.length){summary.className='real-statistics-result is-warning';summary.textContent='Au moins 3 observations complètes et variables sont nécessaires.'; if(realStatisticsCharts.pearson){realStatisticsCharts.pearson.destroy();realStatisticsCharts.pearson=null;} return;}
    const strongest=[...valid].sort((a,b)=>Math.abs(b.result.r)-Math.abs(a.result.r))[0];
    summary.className=`real-statistics-result ${realStatsSignificanceClass(strongest.result.p)}`;
    summary.innerHTML=`Relation la plus marquée : <strong>${escapeRealisationHtml(strongest.label)}</strong> ↔ Réalisation, r = <strong>${strongest.result.r.toFixed(3)}</strong>, p ${realStatsFormatP(strongest.result.p)} (${escapeRealisationHtml(realStatsCorrelationLabel(strongest.result.r))}). ${realStatsConclusion(strongest.result.p)}`;
    if(realStatisticsCharts.pearson) realStatisticsCharts.pearson.destroy();
    const isDate=strongest.key!=='duration';
    realStatisticsCharts.pearson=new Chart(canvas.getContext('2d'),{type:'scatter',data:{datasets:[{label:`${strongest.label} × Réalisation`,data:strongest.pairs.map(p=>({x:p.x,y:p.y,label:p.record.entite})),pointRadius:5,pointHoverRadius:7}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},title:{display:true,text:`Nuage de points — ${strongest.label} et Réalisation`},tooltip:{callbacks:{label:c=>`${c.raw.label} : ${isDate?new Date(c.raw.x*86400000).toLocaleDateString('fr-FR'):c.raw.x.toLocaleString('fr-FR')} → ${c.raw.y.toLocaleString('fr-FR')}`}}},scales:{x:{title:{display:true,text:strongest.label},ticks:{callback:v=>isDate?new Date(Number(v)*86400000).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'2-digit'}):Number(v).toLocaleString('fr-FR')}},y:{title:{display:true,text:'Valeur de la réalisation'},beginAtZero:true}}}});
}

function renderRealStatisticsAnova(records) {
    const summary=document.getElementById('real-stats-anova-summary'), body=document.getElementById('real-stats-anova-body'), canvas=document.getElementById('real-stats-anova-chart');
    if(!summary||!body||!canvas)return;
    const groups=realStatsGroupByEntity(records,2), all=groups.flatMap(g=>g[1]);
    if(groups.length<2||all.length<=groups.length){summary.className='real-statistics-result is-warning';summary.textContent='ANOVA non calculable : au moins deux entités avec au moins deux observations chacune sont nécessaires.';body.innerHTML='<tr><td colspan="4" class="text-muted">Données insuffisantes.</td></tr>';if(realStatisticsCharts.anova){realStatisticsCharts.anova.destroy();realStatisticsCharts.anova=null;}return;}
    const grand=realStatsMean(all); let ssb=0,ssw=0;
    groups.forEach(([,vals])=>{const m=realStatsMean(vals);ssb+=vals.length*Math.pow(m-grand,2);ssw+=vals.reduce((s,v)=>s+Math.pow(v-m,2),0);});
    const df1=groups.length-1,df2=all.length-groups.length,msb=ssb/df1,msw=ssw/df2,F=msw===0?(msb>0?Infinity:0):msb/msw,p=Number.isFinite(F)?realStatsFUpperP(F,df1,df2):0,eta=(ssb+ssw)>0?ssb/(ssb+ssw):0;
    summary.className=`real-statistics-result ${realStatsSignificanceClass(p)}`;
    summary.innerHTML=`<strong>F(${df1}, ${df2}) = ${Number.isFinite(F)?F.toFixed(3):'∞'}</strong> · p ${realStatsFormatP(p)} · η² = ${eta.toFixed(3)}. <strong>${realStatsConclusion(p)}</strong> L'η² indique la proportion de variance de réalisation associée aux différences entre entités.`;
    body.innerHTML=groups.map(([name,vals])=>`<tr><td>${escapeRealisationHtml(name)}</td><td>${vals.length}</td><td>${realStatsMean(vals).toLocaleString('fr-FR',{maximumFractionDigits:2})}</td><td>${realStatsSampleSd(vals).toLocaleString('fr-FR',{maximumFractionDigits:2})}</td></tr>`).join('');
    if(realStatisticsCharts.anova) realStatisticsCharts.anova.destroy();
    const shown=groups.slice(0,30);
    realStatisticsCharts.anova=new Chart(canvas.getContext('2d'),{type:'bar',data:{labels:shown.map(g=>g[0]),datasets:[{label:'Moyenne des réalisations',data:shown.map(g=>realStatsMean(g[1]))}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},title:{display:true,text:`Moyennes par entité${groups.length>30?' — 30 premières entités':''}`}},scales:{x:{ticks:{autoSkip:false,maxRotation:70,minRotation:35}},y:{beginAtZero:true,title:{display:true,text:'Réalisation moyenne'}}}}});
}
function renderRealStatisticsSpearman(records) {
    const summary=document.getElementById('real-stats-spearman-summary'),body=document.getElementById('real-stats-spearman-body'); if(!summary||!body)return;
    const series=getRealStatsCorrelationSeries(records).map(s=>({...s,result:realStatsSpearman(s.pairs.map(p=>p.x),s.pairs.map(p=>p.y))}));
    body.innerHTML=series.map(s=>`<tr><td>${s.label}</td><td>${s.result.n}</td><td class="fw-bold">${Number.isFinite(s.result.rho)?s.result.rho.toFixed(3):'—'}</td><td>${realStatsFormatP(s.result.p)}</td><td>${escapeRealisationHtml(realStatsCorrelationLabel(s.result.rho))}</td></tr>`).join('');
    const valid=series.filter(s=>Number.isFinite(s.result.rho));
    if(!valid.length){summary.className='real-statistics-result is-warning';summary.textContent='Spearman nécessite au moins 3 observations complètes.';return;}
    const strongest=[...valid].sort((a,b)=>Math.abs(b.result.rho)-Math.abs(a.result.rho))[0];
    summary.className=`real-statistics-result ${realStatsSignificanceClass(strongest.result.p)}`;
    summary.innerHTML=`Relation monotone la plus marquée : <strong>${escapeRealisationHtml(strongest.label)}</strong> ↔ Réalisation, ρ = <strong>${strongest.result.rho.toFixed(3)}</strong>, p approx. ${realStatsFormatP(strongest.result.p)}. ${realStatsConclusion(strongest.result.p)}`;
}
function renderRealStatisticsKruskal(records) {
    const summary=document.getElementById('real-stats-kruskal-summary'),body=document.getElementById('real-stats-kruskal-body'); if(!summary||!body)return;
    const groups=realStatsGroupByEntity(records,1); if(groups.length<2){summary.className='real-statistics-result is-warning';summary.textContent='Kruskal-Wallis nécessite au moins deux entités.';body.innerHTML='';return;}
    const flat=[]; groups.forEach(([name,vals],gi)=>vals.forEach(v=>flat.push({name,gi,v:Number(v)}))); if(flat.length<3){summary.className='real-statistics-result is-warning';summary.textContent='Données insuffisantes.';return;}
    const ranks=realStatsRanks(flat.map(x=>x.v)); flat.forEach((x,i)=>x.rank=ranks[i]);
    const rankSums=groups.map(()=>0); flat.forEach(x=>rankSums[x.gi]+=x.rank);
    const N=flat.length,k=groups.length; let H=12/(N*(N+1))*groups.reduce((s,g,i)=>s+Math.pow(rankSums[i],2)/g[1].length,0)-3*(N+1);
    const counts=new Map(); flat.forEach(x=>counts.set(x.v,(counts.get(x.v)||0)+1)); const tieSum=[...counts.values()].reduce((s,t)=>s+(t>1?t*t*t-t:0),0); const C=1-tieSum/(N*N*N-N); if(C>0)H/=C;
    const df=k-1,p=realStatsChiUpperP(H,df),eps=Math.max(0,Math.min(1,(H-k+1)/Math.max(1,N-k)));
    summary.className=`real-statistics-result ${realStatsSignificanceClass(p)}`;
    summary.innerHTML=`<strong>H(${df}) = ${H.toFixed(3)}</strong> · p ${realStatsFormatP(p)} · ε² ≈ ${eps.toFixed(3)}. <strong>${realStatsConclusion(p)}</strong> Si le test est significatif, des comparaisons post-hoc sont nécessaires pour localiser les différences.`;
    body.innerHTML=groups.map(([name,vals],i)=>`<tr><td>${escapeRealisationHtml(name)}</td><td>${vals.length}</td><td>${realStatsMedian(vals).toLocaleString('fr-FR',{maximumFractionDigits:2})}</td><td>${(rankSums[i]/vals.length).toLocaleString('fr-FR',{maximumFractionDigits:2})}</td></tr>`).join('');
}

window.runRealStatisticsAnalysis=function(){
    const settings=getRealStatisticsSettings(), status=document.getElementById('real-stats-status');
    if(settings.start&&settings.end&&settings.start>settings.end){if(status){status.className='small text-danger mt-3';status.textContent='La date de début doit être antérieure ou égale à la date de fin.';}return;}
    populateRealStatisticsElements();
    const refreshed=getRealStatisticsSettings();
    const records=getRealStatisticsRecords(refreshed,false), recordsForChi=getRealStatisticsRecords({...refreshed,element:'all'},true);
    const config=getRealisationComparisonDimensionConfig(refreshed.dimension);
    renderRealStatisticsChi2(refreshed,recordsForChi);
    renderRealStatisticsPearson(records);
    renderRealStatisticsAnova(records);
    renderRealStatisticsSpearman(records);
    renderRealStatisticsKruskal(records);
    if(status){status.className=`small mt-3 ${records.length?'text-success':'text-warning'}`; const elem=document.getElementById('real-stats-element')?.selectedOptions?.[0]?.textContent||'Tous'; status.innerHTML=`<strong>${records.length.toLocaleString('fr-FR')} réalisation(s)</strong> analysée(s) · Niveau : <strong>${escapeRealisationHtml(refreshed.scope)}</strong> · Dimension : <strong>${escapeRealisationHtml(config.label)}</strong> · Élément : <strong>${escapeRealisationHtml(elem)}</strong>. Les p-values utilisent α = 5 % comme repère d'interprétation.`;}
};
function initializeRealStatisticsModule(){
    const tab=document.getElementById('real-statistics-tab'); if(!tab||tab.dataset.statsReady==='1')return; tab.dataset.statsReady='1';
    const scope=document.getElementById('real-stats-scope'),dim=document.getElementById('real-stats-dimension'),element=document.getElementById('real-stats-element'),start=document.getElementById('real-stats-start'),end=document.getElementById('real-stats-end'),run=document.getElementById('real-stats-run');
    const repop=()=>{populateRealStatisticsElements();window.runRealStatisticsAnalysis();};
    scope?.addEventListener('change',()=>{if(element)element.value='all';repop();});
    dim?.addEventListener('change',()=>{if(element)element.value='all';repop();});
    element?.addEventListener('change',()=>window.runRealStatisticsAnalysis());
    start?.addEventListener('change',()=>window.runRealStatisticsAnalysis()); end?.addEventListener('change',()=>window.runRealStatisticsAnalysis());
    run?.addEventListener('click',()=>window.runRealStatisticsAnalysis());
    tab.addEventListener('shown.bs.tab',()=>window.setTimeout(()=>{populateRealStatisticsElements();window.runRealStatisticsAnalysis();},40));
    document.querySelectorAll('#realStatisticsTabs button[data-bs-toggle="pill"]').forEach(btn=>btn.addEventListener('shown.bs.tab',()=>{if(realStatisticsCharts.pearson)realStatisticsCharts.pearson.resize();if(realStatisticsCharts.anova)realStatisticsCharts.anova.resize();}));
    populateRealStatisticsElements();
}
document.addEventListener('DOMContentLoaded', initializeRealStatisticsModule);
