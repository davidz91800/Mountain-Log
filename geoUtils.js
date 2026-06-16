const FEET_TO_METERS = 0.3048;
const EARTH_RADIUS_NM = 3440.065;

// Constantes pour le calcul d'altitude
const ISA_TEMP_LAPSE_RATE_K_PER_FT = 0.0019812; // Gradient ISA en Kelvin par pied (approx 2°C/1000ft)
const ISA_SEA_LEVEL_TEMP_K = 288.15; // Température ISA au niveau de la mer en Kelvin (15°C)
const KELVIN_AT_ZERO_C = 273.15;

function toRad(deg) { return deg * Math.PI / 180; }
function toDeg(rad) { return rad * 180 / Math.PI; }

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

function parseDDM(str) { 
    const regex = /([NS])\s*(\d{1,3})[°\s]+([\d.]+)\s*([EW])\s*(\d{1,3})[°\s]+([\d.]+)/i; 
    const match = str.match(regex); 
    if (!match) return null; 
    let lat = parseFloat(match[2]) + parseFloat(match[3]) / 60; 
    if (match[1].toUpperCase() === 'S') lat = -lat; 
    let lon = parseFloat(match[5]) + parseFloat(match[6]) / 60; 
    if (match[4].toUpperCase() === 'W') lon = -lon; 
    return { lat, lon }; 
}

/**
 * Trouve les waypoints les plus au Nord, Sud, Est et Ouest d'une liste.
 * @param {Array<object>} waypoints - La liste des waypoints du vol.
 * @returns {Array<object>} Un tableau d'objets waypoint uniques représentant les extrêmes.
 */
function getExtremeWaypoints(waypoints) {
    if (!waypoints || waypoints.length === 0) {
        return [];
    }

    let north = waypoints[0], south = waypoints[0], east = waypoints[0], west = waypoints[0];

    for (const wp of waypoints) {
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