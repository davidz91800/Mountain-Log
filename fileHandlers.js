// Dépend de app.js pour les fonctions d'UI et de geoUtils.js pour les calculs
// Note : Les variables globales `flightData`, `newPointCounter` etc. sont dans app.js

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        processFile(file);
    }
    event.target.value = '';
}

function processFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            newPointCounter = 1;
            processFlightPlan(decodeFileContent(e.target.result), file.name);
        } catch (error) {
            console.error(`Erreur de traitement : ${error.message}`);
            console.error(error);
            alert(`Import impossible : ${error.message}`);
        }
    };
    reader.readAsArrayBuffer(file);
}

function decodeFileContent(buffer) {
    if (typeof buffer === 'string') return buffer;

    const bytes = new Uint8Array(buffer || []);
    if (bytes.length >= 2) {
        if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes);
        if (bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes);
    }
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
        return new TextDecoder('utf-8').decode(bytes);
    }

    let evenNulls = 0;
    let oddNulls = 0;
    const sampleLength = Math.min(bytes.length, 512);
    for (let i = 0; i < sampleLength; i++) {
        if (bytes[i] === 0) {
            if (i % 2 === 0) evenNulls++;
            else oddNulls++;
        }
    }

    if (oddNulls > evenNulls * 2 && oddNulls > 4) return new TextDecoder('utf-16le').decode(bytes);
    if (evenNulls > oddNulls * 2 && evenNulls > 4) return new TextDecoder('utf-16be').decode(bytes);
    return new TextDecoder('utf-8').decode(bytes);
}

function processFlightPlan(fileContent, fileName) {
    flightData = { routeName: '', waypoints: [] };
    globalIsaDeviation = 0; // Réinitialiser

    if (fileName.toLowerCase().endsWith('.json')) {
        const data = JSON.parse(fileContent);

        if (!data || typeof data.routeName !== 'string' || !Array.isArray(data.waypoints)) {
            throw new Error("Fichier JSON invalide. Il doit contenir 'routeName' et 'waypoints'.");
        }
        
        // Pour les fichiers JSON, altFeet est déjà l'altitude VRAIE
        flightData = {
            routeName: data.routeName,
            waypoints: data.waypoints
        };
        globalIsaDeviation = data.globalIsaDeviation ?? 0;

        flightData.waypoints.forEach(wp => {
            wp.comment = wp.comment || '';
        });

    } else {
        const parsedPlan = parseFplXml(fileContent, fileName);
        flightData.routeName = parsedPlan.routeName;
        flightData.waypoints = parsedPlan.waypoints;
    }

    // Code commun après le parsing (affichage de l'éditeur)
    showEditor();
}

function parseFplXml(fileContent, fileName) {
    const parser = new DOMParser();
    const xmlSource = String(fileContent || '').replace(/^\uFEFF/, '').trim();
    const xmlDoc = parser.parseFromString(xmlSource, "application/xml");
    if (elementsByLocalName(xmlDoc, ['parsererror']).length) {
        throw new Error("Fichier XML invalide.");
    }

    const tableWaypoints = extractWaypointTable(xmlDoc);
    const resolver = createWaypointResolver(tableWaypoints);
    const routeResult = extractRoute(xmlDoc, resolver);
    const waypoints = routeResult.waypoints.length ? routeResult.waypoints : tableWaypoints.map(cloneWaypoint);

    if (waypoints.length < 2) {
        throw new Error("Une route doit contenir au moins 2 points avec coordonnées.");
    }

    const routeName = routeResult.routeName || firstTextByLocalName(xmlDoc, ['route-name']) || fileName.replace(/\.[^/.]+$/, "");
    return { routeName, waypoints };
}

function extractWaypointTable(xmlDoc) {
    const containers = elementsByLocalName(xmlDoc, ['waypoint-table', 'waypointtable', 'waypoints', 'waypoint-list', 'wpt-list']);
    const waypointElements = [];

    containers.forEach(container => {
        directChildrenByLocalName(container, ['waypoint', 'wpt', 'point']).forEach(wp => waypointElements.push(wp));
    });

    if (waypointElements.length === 0) {
        elementsByLocalName(xmlDoc, ['waypoint', 'wpt']).forEach(wp => {
            if (!isInsideLocalName(wp, ['route', 'rte'])) {
                waypointElements.push(wp);
            }
        });
    }

    return waypointElements
        .map((wp, index) => parseWaypointElement(wp, index))
        .filter(Boolean);
}

function extractRoute(xmlDoc, resolver) {
    const routeElements = elementsByLocalName(xmlDoc, ['route', 'rte']);
    for (const routeElement of routeElements) {
        const parsed = parseRouteElement(routeElement, resolver);
        if (parsed.waypoints.length >= 2) return parsed;
    }

    const looseRoutePoints = elementsByLocalName(xmlDoc, ['route-point', 'routepoint', 'rtept']);
    if (looseRoutePoints.length) {
        const waypoints = looseRoutePoints
            .map((rp, index) => parseRoutePointElement(rp, index, resolver))
            .filter(Boolean);
        return { routeName: firstTextByLocalName(xmlDoc, ['route-name']), waypoints };
    }

    return { routeName: '', waypoints: [] };
}

function parseRouteElement(routeElement, resolver) {
    const pointElements = directChildrenByLocalName(routeElement, ['route-point', 'routepoint', 'rtept', 'waypoint', 'wpt', 'point']);
    const waypoints = pointElements
        .map((pointElement, index) => parseRoutePointElement(pointElement, index, resolver))
        .filter(Boolean);
    const routeName = firstDirectTextByLocalName(routeElement, ['route-name', 'name']);
    return { routeName, waypoints };
}

function parseRoutePointElement(routePoint, index, resolver) {
    const identifier = firstTextByLocalName(routePoint, ['waypoint-identifier', 'identifier', 'ident', 'name', 'id']);
    const type = firstTextByLocalName(routePoint, ['waypoint-type', 'type', 'sym']);
    const directWaypoint = parseWaypointElement(routePoint, index, { identifier, type });

    if (directWaypoint && hasValidCoordinates(directWaypoint)) {
        return directWaypoint;
    }

    if (!identifier) return null;
    return resolver(identifier, type);
}

function parseWaypointElement(element, index, fallback = {}) {
    const coordinatePair = readCoordinatePair(element);
    if (!coordinatePair) return null;

    const identifier = cleanText(
        fallback.identifier ||
        firstTextByLocalName(element, ['identifier', 'waypoint-identifier', 'ident', 'name', 'id']) ||
        firstAttributeByLocalName(element, ['identifier', 'ident', 'name', 'id']) ||
        `WPT${index + 1}`
    );

    const type = cleanText(
        fallback.type ||
        firstTextByLocalName(element, ['type', 'waypoint-type', 'sym', 'category']) ||
        firstAttributeByLocalName(element, ['type', 'sym', 'category']) ||
        'USER WAYPOINT'
    );

    const indicatedAltitudeFt = readAltitudeFeet(element);
    const { trueAltitude } = calculateTrueAltitude(indicatedAltitudeFt, 0);

    return {
        identifier,
        type,
        lat: coordinatePair.lat,
        lon: coordinatePair.lon,
        altFeet: trueAltitude,
        comment: ''
    };
}

function readCoordinatePair(element) {
    const latValue = firstAttributeByLocalName(element, ['lat', 'latitude']) ||
        firstTextByLocalName(element, ['lat', 'latitude']);
    const lonValue = firstAttributeByLocalName(element, ['lon', 'lng', 'long', 'longitude']) ||
        firstTextByLocalName(element, ['lon', 'lng', 'long', 'longitude']);
    const lat = parseFlexibleNumber(latValue);
    const lon = parseFlexibleNumber(lonValue);

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return { lat, lon };
    }

    const positionText = firstTextByLocalName(element, ['world-position', 'worldposition', 'position', 'coordinates', 'coord']);
    return parseCoordinatePairText(positionText);
}

function parseCoordinatePairText(text) {
    const value = cleanText(text);
    if (!value) return null;

    const ddmCoords = parseDDM(value);
    if (ddmCoords) return ddmCoords;

    const numericParts = value
        .split(/[,\s;]+/)
        .map(parseFlexibleNumber)
        .filter(Number.isFinite);

    if (numericParts.length < 2) return null;

    const first = numericParts[0];
    const second = numericParts[1];
    if (numericParts.length >= 3 && value.includes(',') && Math.abs(first) <= 180 && Math.abs(second) <= 90) {
        return { lat: second, lon: first };
    }
    if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
        return { lat: first, lon: second };
    }
    if (Math.abs(second) <= 90 && Math.abs(first) <= 180) {
        return { lat: second, lon: first };
    }
    return null;
}

function readAltitudeFeet(element) {
    const feetText = firstAttributeByLocalName(element, ['altitude-ft', 'altitudeft', 'alt-ft', 'altft']) ||
        firstTextByLocalName(element, ['altitude-ft', 'altitudeft', 'alt-ft', 'altft']);
    const feetValue = parseFlexibleNumber(feetText);
    if (Number.isFinite(feetValue)) return feetValue;

    const meterText = firstAttributeByLocalName(element, ['altitude-m', 'altitudem', 'elevation-m', 'elevationm', 'ele']) ||
        firstTextByLocalName(element, ['altitude-m', 'altitudem', 'elevation-m', 'elevationm', 'ele']);
    const meterValue = parseFlexibleNumber(meterText);
    if (Number.isFinite(meterValue)) return meterValue / FEET_TO_METERS;

    const genericText = firstAttributeByLocalName(element, ['altitude', 'elevation', 'alt']) ||
        firstTextByLocalName(element, ['altitude', 'elevation', 'alt']);
    const genericValue = parseFlexibleNumber(genericText);
    if (!Number.isFinite(genericValue)) return 0;

    return /\bm\b/i.test(genericText) && !/\bft\b|\bfeet\b/i.test(genericText)
        ? genericValue / FEET_TO_METERS
        : genericValue;
}

function createWaypointResolver(waypoints) {
    const byIdentifier = new Map();
    const byIdentifierAndType = new Map();
    const cursors = new Map();

    waypoints.forEach(wp => {
        addWaypointToIndex(byIdentifier, normalizeIdentifier(wp.identifier), wp);
        addWaypointToIndex(byIdentifierAndType, `${normalizeIdentifier(wp.identifier)}|${normalizeIdentifier(wp.type)}`, wp);
    });

    return (identifier, type) => {
        const idKey = normalizeIdentifier(identifier);
        const typedKey = `${idKey}|${normalizeIdentifier(type)}`;
        const candidates = byIdentifierAndType.get(typedKey) || byIdentifier.get(idKey);
        if (!candidates || candidates.length === 0) return null;

        const cursorKey = candidates === byIdentifierAndType.get(typedKey) ? typedKey : idKey;
        const cursor = cursors.get(cursorKey) || 0;
        const waypoint = candidates[Math.min(cursor, candidates.length - 1)];
        cursors.set(cursorKey, cursor + 1);
        return cloneWaypoint(waypoint);
    };
}

function addWaypointToIndex(index, key, waypoint) {
    if (!key) return;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(waypoint);
}

function cloneWaypoint(waypoint) {
    return { ...waypoint, comment: waypoint.comment || '' };
}

function hasValidCoordinates(waypoint) {
    return waypoint && Number.isFinite(waypoint.lat) && Number.isFinite(waypoint.lon);
}

function elementsByLocalName(root, localNames) {
    const wanted = new Set(localNames.map(normalizeLocalName));
    return Array.from(root.getElementsByTagName('*')).filter(el => wanted.has(normalizeLocalName(el.localName || el.nodeName)));
}

function directChildrenByLocalName(root, localNames) {
    const wanted = new Set(localNames.map(normalizeLocalName));
    return Array.from(root.children || []).filter(el => wanted.has(normalizeLocalName(el.localName || el.nodeName)));
}

function firstTextByLocalName(root, localNames) {
    const directText = firstDirectTextByLocalName(root, localNames);
    if (directText) return directText;

    const found = elementsByLocalName(root, localNames).find(el => cleanText(el.textContent));
    return found ? cleanText(found.textContent) : '';
}

function firstDirectTextByLocalName(root, localNames) {
    const found = directChildrenByLocalName(root, localNames).find(el => cleanText(el.textContent));
    return found ? cleanText(found.textContent) : '';
}

function firstAttributeByLocalName(element, localNames) {
    const wanted = new Set(localNames.map(normalizeLocalName));
    const found = Array.from(element.attributes || []).find(attr => wanted.has(normalizeLocalName(attr.localName || attr.name)));
    return found ? cleanText(found.value) : '';
}

function isInsideLocalName(element, localNames) {
    const wanted = new Set(localNames.map(normalizeLocalName));
    let parent = element.parentElement;
    while (parent) {
        if (wanted.has(normalizeLocalName(parent.localName || parent.nodeName))) return true;
        parent = parent.parentElement;
    }
    return false;
}

function normalizeLocalName(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeIdentifier(value) {
    return cleanText(value).toUpperCase();
}

function cleanText(value) {
    return String(value ?? '').trim();
}

function parseFlexibleNumber(value) {
    const text = cleanText(value);
    if (!text) return NaN;

    let normalized = text.replace(/[^\d.,+\-eE]/g, '');
    if (!normalized) return NaN;

    if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(normalized)) {
        normalized = normalized.replace(/,/g, '');
    } else if (/^[+-]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(normalized)) {
        normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else if (normalized.includes(',') && !normalized.includes('.')) {
        normalized = normalized.replace(',', '.');
    }

    const number = Number(normalized);
    return Number.isFinite(number) ? number : NaN;
}
