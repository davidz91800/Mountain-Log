const FEET_TO_METERS = 0.3048;
const EARTH_RADIUS_NM = 3440.065;

// Constantes pour le calcul d'altitude
const ISA_TEMP_LAPSE_RATE_K_PER_FT = 0.0019812; // Gradient ISA en Kelvin par pied (approx 2°C/1000ft)
const ISA_SEA_LEVEL_TEMP_K = 288.15; // Température ISA au niveau de la mer en Kelvin (15°C)
const KELVIN_AT_ZERO_C = 273.15;

function toRad(deg) { return deg * Math.PI / 180; }
function toDeg(rad) { return rad * 180 / Math.PI; }

function escapeXml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function escapeHtml(value) {
    return escapeXml(value);
}

function normalizeCoordinateNumber(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;

    const text = String(value ?? '').trim();
    if (!text) return NaN;

    let normalized = text.replace(/\s+/g, '');
    if (normalized.includes(',') && !normalized.includes('.')) {
        normalized = normalized.replace(',', '.');
    }

    const number = Number(normalized);
    return Number.isFinite(number) ? number : NaN;
}

function isValidLatLon(lat, lon) {
    return Number.isFinite(lat) && Number.isFinite(lon) &&
        Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

function shouldSwapLikelyWesternEuropeCoordinates(lat, lon) {
    return Math.abs(lat) <= 20 && lon >= 35 && lon <= 72;
}

function normalizeLatLon(latValue, lonValue) {
    const lat = normalizeCoordinateNumber(latValue);
    const lon = normalizeCoordinateNumber(lonValue);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return { lat, lon, isValid: false, swapped: false };
    }

    if (isValidLatLon(lat, lon) && shouldSwapLikelyWesternEuropeCoordinates(lat, lon)) {
        return { lat: lon, lon: lat, isValid: true, swapped: true };
    }

    if (isValidLatLon(lat, lon)) {
        return { lat, lon, isValid: true, swapped: false };
    }

    if (isValidLatLon(lon, lat)) {
        return { lat: lon, lon: lat, isValid: true, swapped: true };
    }

    return { lat, lon, isValid: false, swapped: false };
}

function normalizeWaypointCoordinates(wp) {
    const normalized = normalizeLatLon(wp?.lat, wp?.lon);
    return {
        ...wp,
        lat: normalized.lat,
        lon: normalized.lon
    };
}

function parseDDM(str) {
    const value = String(str || '').trim();
    if (!value) return null;

    const coordinateChars = '[+\\-]?\\d[\\d\\s.,\\u00B0\\u00BA\\u0027\\u2019\\u2032\\u0022\\u2033?]*';
    const prefixMatch = value.match(new RegExp(`([NS])\\s*(${coordinateChars})\\s*([EW])\\s*(${coordinateChars})`, 'i'));
    const suffixMatch = value.match(new RegExp(`(${coordinateChars})\\s*([NS])\\s*(${coordinateChars})\\s*([EW])`, 'i'));

    let latComponent = '';
    let lonComponent = '';
    if (prefixMatch) {
        latComponent = `${prefixMatch[1]}${prefixMatch[2]}`;
        lonComponent = `${prefixMatch[3]}${prefixMatch[4]}`;
    } else if (suffixMatch) {
        latComponent = `${suffixMatch[1]}${suffixMatch[2]}`;
        lonComponent = `${suffixMatch[3]}${suffixMatch[4]}`;
    } else {
        latComponent = extractHemisphereCoordinate(value, 'NS');
        lonComponent = extractHemisphereCoordinate(value, 'EW');
    }

    if (!latComponent || !lonComponent) return null;

    const lat = parseCoordinateComponent(latComponent, true);
    const lon = parseCoordinateComponent(lonComponent, false);
    const normalized = normalizeLatLon(lat, lon);
    return normalized.isValid ? { lat: normalized.lat, lon: normalized.lon } : null;
}

function extractHemisphereCoordinate(value, hemispheres) {
    const coordinateChars = '[+\\-]?\\d[\\d\\s.,\\u00B0\\u00BA\\u0027\\u2019\\u2032\\u0022\\u2033?]*';
    const prefixMatch = String(value).match(new RegExp(`[${hemispheres}]\\s*${coordinateChars}`, 'i'));
    if (prefixMatch) return prefixMatch[0];

    const suffixMatch = String(value).match(new RegExp(`${coordinateChars}\\s*[${hemispheres}]`, 'i'));
    return suffixMatch ? suffixMatch[0] : '';
}

function parseCoordinateComponent(value, isLat) {
    const text = String(value ?? '').trim().toUpperCase().replace(/,/g, '.');
    if (!text) return NaN;

    const hemisphereMatch = text.match(/[NSEW]/);
    const hemisphere = hemisphereMatch ? hemisphereMatch[0] : '';
    if (hemisphere) {
        if (isLat && !/[NS]/.test(hemisphere)) return NaN;
        if (!isLat && !/[EW]/.test(hemisphere)) return NaN;
    }

    let sign = /[SW]/.test(hemisphere) ? -1 : 1;
    let numericText = text.replace(/[NSEW]/g, ' ');
    const explicitSign = numericText.match(/[+-]/);
    if (explicitSign && explicitSign[0] === '-') sign *= -1;

    numericText = numericText
        .replace(/[+-]/g, ' ')
        .replace(/[\u00B0\u00BA\u0027\u2019\u2032\u0022\u2033]/g, ' ')
        .replace(/[^\d.]+/g, ' ')
        .trim();

    const parts = numericText.match(/\d+(?:\.\d+)?/g) || [];
    if (parts.length === 0) return NaN;

    const decimal = parts.length >= 2
        ? parseDegreesMinutesSeconds(parts, isLat)
        : parseSingleCoordinateNumber(parts[0], isLat);

    return Number.isFinite(decimal) ? sign * decimal : NaN;
}

function parseSingleCoordinateNumber(rawValue, isLat) {
    const value = String(rawValue || '').replace(',', '.');
    const decimal = Number(value);
    if (!Number.isFinite(decimal)) return NaN;

    const maxDegrees = isLat ? 90 : 180;
    if (Math.abs(decimal) <= maxDegrees) return Math.abs(decimal);

    return parseCompactDdmNumber(value, isLat);
}

function parseCompactDdmNumber(rawValue, isLat) {
    const normalized = String(rawValue || '').replace(/[^\d.]/g, '');
    const [integerPart, fractionPart = ''] = normalized.split('.');
    if (!integerPart || integerPart.length < 3) return NaN;

    const degreeDigits = integerPart.length - 2;
    const degrees = Number(integerPart.slice(0, degreeDigits));
    const minutes = Number(integerPart.slice(degreeDigits) + (fractionPart ? `.${fractionPart}` : ''));
    return composeCoordinateDegrees(degrees, minutes, 0, isLat);
}

function parseDegreesMinutesSeconds(parts, isLat) {
    const degrees = Number(parts[0]);
    const minutes = Number(parts[1]);
    const seconds = parts.length >= 3 ? Number(parts[2]) : 0;
    return composeCoordinateDegrees(degrees, minutes, seconds, isLat);
}

function composeCoordinateDegrees(degrees, minutes, seconds, isLat) {
    const maxDegrees = isLat ? 90 : 180;
    if (!Number.isFinite(degrees) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return NaN;
    if (degrees < 0 || degrees > maxDegrees || minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) return NaN;

    const decimal = degrees + minutes / 60 + seconds / 3600;
    return decimal <= maxDegrees ? decimal : NaN;
}

/**
 * Calcule l'altitude vraie à partir de l'altitude indiquée et de l'écart ISA.
 * Utile pour l'importation de fichiers FPL.
 * @param {number} indicatedAltitudeFt - Altitude indiquée en pieds.
 * @param {number} isaDeviationC - Écart par rapport à l'ISA en degrés Celsius.
 * @returns {object} Un objet contenant l'altitude vraie et la température réelle.
 */
function calculateTrueAltitude(indicatedAltitudeFt, isaDeviationC = 0) {
    indicatedAltitudeFt = Number(indicatedAltitudeFt) || 0;
    isaDeviationC = Number(isaDeviationC) || 0;

    if (indicatedAltitudeFt <= 0) {
        return { 
            trueAltitude: indicatedAltitudeFt,
            airTempC: 15 + isaDeviationC
        };
    }
    
    // T_ISA en Kelvin à l'altitude indiquée
    const t_isa_k = ISA_SEA_LEVEL_TEMP_K - (ISA_TEMP_LAPSE_RATE_K_PER_FT * indicatedAltitudeFt);
    
    // T_air (température réelle) en Kelvin
    const t_air_k = t_isa_k + isaDeviationC;
    
    // Formule: H_vraie = H_indiquée * (T_air / T_ISA)
    const trueAltitude = (t_isa_k > 0) ? (indicatedAltitudeFt * (t_air_k / t_isa_k)) : indicatedAltitudeFt;
    
    return {
        trueAltitude: Math.round(trueAltitude),
        airTempC: t_air_k - KELVIN_AT_ZERO_C
    };
}

/**
 * NOUVELLE FONCTION : Calcule l'altitude indiquée à partir de l'altitude vraie et de l'écart ISA.
 * @param {number} trueAltitudeFt - Altitude VRAIE en pieds.
 * @param {number} isaDeviationC - Écart par rapport à l'ISA en degrés Celsius.
 * @returns {object} Un objet contenant l'altitude indiquée et la température réelle à cette altitude.
 */
function calculateIndicatedAltitude(trueAltitudeFt, isaDeviationC = 0) {
    trueAltitudeFt = Number(trueAltitudeFt) || 0;
    isaDeviationC = Number(isaDeviationC) || 0;

    if (trueAltitudeFt <= 0) {
        return {
            indicatedAltitude: trueAltitudeFt,
            airTempC: 15 + isaDeviationC
        };
    }

    // On utilise l'altitude vraie comme une première approximation pour calculer les températures.
    // L'erreur introduite est généralement négligeable pour des applications pratiques.
    const t_isa_at_true_alt_k = ISA_SEA_LEVEL_TEMP_K - (ISA_TEMP_LAPSE_RATE_K_PER_FT * trueAltitudeFt);
    const t_air_at_true_alt_k = t_isa_at_true_alt_k + isaDeviationC;

    // Formule inversée : H_indiquée = H_vraie * (T_ISA / T_air)
    const indicatedAltitude = (t_air_at_true_alt_k > 0) ? (trueAltitudeFt * (t_isa_at_true_alt_k / t_air_at_true_alt_k)) : trueAltitudeFt;

    return {
        // Les altitudes indiquées sont arrondies à la centaine de pieds.
        indicatedAltitude: Math.round(indicatedAltitude / 100) * 100,
        airTempC: t_air_at_true_alt_k - KELVIN_AT_ZERO_C
    };
}


function calculateDistanceNM(lat1, lon1, lat2, lon2) {
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_NM * c;
}

function calculateBearing(lat1, lon1, lat2, lon2) {
    const lat1Rad = toRad(lat1);
    const lon1Rad = toRad(lon1);
    const lat2Rad = toRad(lat2);
    const lon2Rad = toRad(lon2);
    const dLon = lon2Rad - lon1Rad;
    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    return Math.atan2(y, x);
}

function calculateDestinationPoint(lat1, lon1, bearing, distanceNm) {
    const lat1Rad = toRad(lat1);
    const lon1Rad = toRad(lon1);
    const angularDistance = distanceNm / EARTH_RADIUS_NM;
    const lat2Rad = Math.asin(Math.sin(lat1Rad) * Math.cos(angularDistance) +
                              Math.cos(lat1Rad) * Math.sin(angularDistance) * Math.cos(bearing));
    const lon2Rad = lon1Rad + Math.atan2(Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1Rad),
                                          Math.cos(angularDistance) - Math.sin(lat1Rad) * Math.sin(lat2Rad));
    return { lat: toDeg(lat2Rad), lon: toDeg(lon2Rad) };
}

function decimalToDDM(lat, lon) { 
    const normalized = normalizeLatLon(lat, lon);
    lat = normalized.lat;
    lon = normalized.lon;
    if (!isValidLatLon(lat, lon)) return '';

    const formatPart = (deg, isLat) => { 
        const hemisphere = deg >= 0 ? (isLat ? 'N' : 'E') : (isLat ? 'S' : 'W'); 
        deg = Math.abs(deg); 
        const d = Math.floor(deg); 
        const m = ((deg - d) * 60).toFixed(2); 
        const padding = isLat ? 2 : 3; 
        return `${hemisphere}${d.toString().padStart(padding, '0')}°${m.padStart(5, '0')}`; 
    }; 
    return `${formatPart(lat, true)} ${formatPart(lon, false)}`; 
}

function decimalToDDMMSS_CRD(lat, lon) {
    const formatPart = (deg, isLat) => {
        const hemisphere = deg >= 0 ? (isLat ? 'N' : 'E') : (isLat ? 'S' : 'W');
        deg = Math.abs(deg);
        const d = Math.floor(deg);
        const m_decimal = (deg - d) * 60;
        const m = Math.floor(m_decimal);
        const s = (m_decimal - m) * 60;
        
        const d_pad = isLat ? 2 : 3;
        
        const degreesStr = d.toString().padStart(d_pad, '0');
        const minutesStr = m.toString().padStart(2, '0');
        
        let secondsStr = s.toFixed(3);
        if (s < 10) {
            secondsStr = '0' + secondsStr;
        }

        return `${hemisphere}${degreesStr}${minutesStr}${secondsStr}`;
    };
    return { lat: formatPart(lat, true), lon: formatPart(lon, false) };
}

/**
 * Trouve les waypoints les plus au Nord, Sud, Est et Ouest d'une liste.
 * @param {Array<object>} waypoints - La liste des waypoints du vol.
 * @returns {Array<object>} Un tableau d'objets waypoint uniques représentant les extrêmes.
 */
function getExtremeWaypoints(waypoints) {
    const validWaypoints = (waypoints || [])
        .map(normalizeWaypointCoordinates)
        .filter(wp => isValidLatLon(wp.lat, wp.lon));

    if (validWaypoints.length === 0) {
        return [];
    }

    let north = validWaypoints[0], south = validWaypoints[0], east = validWaypoints[0], west = validWaypoints[0];

    for (const wp of validWaypoints) {
        if (wp.lat > north.lat) north = wp;
        if (wp.lat < south.lat) south = wp;
        if (wp.lon > east.lon) east = wp;
        if (wp.lon < west.lon) west = wp;
    }

    // Utilise un Map pour garantir que chaque point extrême est unique
    // (ex: le point le plus au nord peut aussi être le plus à l'ouest).
    const extremeMap = new Map();
    extremeMap.set(north.identifier, north);
    extremeMap.set(south.identifier, south);
    extremeMap.set(east.identifier, east);
    extremeMap.set(west.identifier, west);

    return Array.from(extremeMap.values());
}
