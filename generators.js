// Les fonctions generateFPL, generateKML sont ici.
// Elles dépendent des fonctions dans geoUtils.js

function generateFPL(name, waypoints) {
    const createdTime = new Date().toISOString();
    const waypointTableXML = waypoints.map(wp => {
        const identifier = escapeXml(wp.identifier);
        const type = escapeXml(wp.type || 'USER WAYPOINT');
        return `\n    <waypoint>\n        <identifier>${identifier}</identifier>\n        <type>${type}</type>\n        <lat>${wp.lat}</lat>\n        <lon>${wp.lon}</lon>\n        <altitude-ft>${wp.altFeet > 0 ? wp.altFeet : ''}</altitude-ft>\n    </waypoint>`;
    }).join('');
    const routePointsXML = waypoints.map(wp => {
        const identifier = escapeXml(wp.identifier);
        const type = escapeXml(wp.type || 'USER WAYPOINT');
        return `\n    <route-point>\n        <waypoint-identifier>${identifier}</waypoint-identifier>\n        <waypoint-type>${type}</waypoint-type>\n    </route-point>`;
    }).join('');
    return `<?xml version="1.0" encoding="utf-8"?>\n<flight-plan xmlns="http://www8.garmin.com/xmlschemas/FlightPlan/v1">\n<created>${createdTime}</created>\n<waypoint-table>${waypointTableXML}\n</waypoint-table>\n<route>\n    <route-name>${escapeXml(name)}</route-name>\n    <flight-plan-index>1</flight-plan-index>${routePointsXML}\n</route>\n</flight-plan>`;
}

function generateKML(name, waypoints, isaDeviation = 0) {
    const updatedWaypoints = waypoints
        .map(normalizeWaypointCoordinates)
        .filter(wp => isValidLatLon(wp.lat, wp.lon))
        .map(wp => {
            const trueAltitudeFeet = Number(wp.altFeet) || 0;
            const { indicatedAltitude } = calculateIndicatedAltitude(trueAltitudeFeet, isaDeviation);
            return { ...wp, altFeet: trueAltitudeFeet, altMeters: trueAltitudeFeet * FEET_TO_METERS, indicatedAltFeet: indicatedAltitude };
        });
    const placemarksKML = updatedWaypoints.map(wp => {
        let desc = `Altitude indiquée: <strong>${wp.indicatedAltFeet.toLocaleString('fr-FR')} ft</strong>`;
        desc += `<br>Altitude vraie: ${wp.altFeet > 0 ? wp.altFeet.toLocaleString('fr-FR') + ' ft' : 'Non spécifiée'}`;
        if (wp.comment) {
            const safeComment = escapeHtml(wp.comment).replace(/\n/g, '<br>');
            desc += `<br><hr style="margin: 5px 0;"><strong>Commentaire:</strong><br>${safeComment}`;
        }
        return `<Placemark><name>${escapeXml(wp.identifier)}/${wp.indicatedAltFeet}I</name><styleUrl>#waypointStyle</styleUrl><description><![CDATA[${desc}]]></description><Point><altitudeMode>absolute</altitudeMode><coordinates>${wp.lon.toFixed(8)},${wp.lat.toFixed(8)},${wp.altMeters.toFixed(1)}</coordinates></Point></Placemark>`;
    }).join('');
    const coordsStr = updatedWaypoints.map(wp => `${wp.lon.toFixed(8)},${wp.lat.toFixed(8)},${wp.altMeters.toFixed(1)}`).join(' ');
    return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${escapeXml(name)}</name><Style id="flightPathStyle"><LineStyle><color>ff00ffff</color><width>9</width></LineStyle></Style><Style id="waypointStyle"><IconStyle><Icon><href>http://maps.google.com/mapfiles/kml/pushpin/ylw-pushpin.png</href></Icon><hotSpot x="20" y="2" xunits="pixels" yunits="pixels"/></IconStyle><LabelStyle><scale>0.8</scale></LabelStyle></Style><Folder><name>Trace du vol</name><Placemark><name>${escapeXml(name)}</name><styleUrl>#flightPathStyle</styleUrl><LineString><extrude>1</extrude><tessellate>1</tessellate><altitudeMode>absolute</altitudeMode><coordinates>${coordsStr}</coordinates></LineString></Placemark></Folder><Folder><name>Waypoints</name>${placemarksKML}</Folder></Document></kml>`;
}

function generateCRD(name, waypoints) {
    const isICAO = (ident) => /^[A-Z]{4}$/i.test(ident);

    const pointListXML = waypoints.map((wp, index) => {
        const crdCoords = decimalToDDMMSS_CRD(wp.lat, wp.lon);
        const description = escapeXml(wp.identifier); // Les exemples valides utilisent l'identifiant ici
        const isAirport = isICAO(wp.identifier);

        let pointXML = `\n<POINT>\n<ID>${index + 1}</ID>`;
        if (isAirport) {
             pointXML += `\n<DATABASE_LOOKUP_STRING>FR${Math.floor(Math.random()*90000) + 10000}</DATABASE_LOOKUP_STRING>`;
        }
        pointXML += `\n<DESCRIPTION>${description}</DESCRIPTION>\n<ELEVATION>\n<SOURCE>${isAirport ? 'DAFIF' : 'DTED'}</SOURCE>\n<VALUE>${wp.altFeet || 0}</VALUE>\n</ELEVATION>\n<INPUT_DATUM>WGE</INPUT_DATUM>\n<MAGNETIC_VARIATION>0.0</MAGNETIC_VARIATION>`;
        if (isAirport) {
            pointXML += `\n<NAME>${escapeXml(wp.identifier.toUpperCase())}/A</NAME>`;
        }
        pointXML += `\n<SOURCE>${isAirport ? 'AIRPORT' : 'USER'}</SOURCE>\n<WGS84_POSITION>\n<LATITUDE>${crdCoords.lat}</LATITUDE>\n<LONGITUDE>${crdCoords.lon}</LONGITUDE>\n</WGS84_POSITION>\n</POINT>`;
        return pointXML;
    }).join('');

    const routePointListXML = waypoints.map((wp, index) => `\n<ROUTE_POINT>\n<ID>${100 + index}</ID>\n<POINT_REFERENCE>${index + 1}</POINT_REFERENCE>\n</ROUTE_POINT>`).join('');

    const intentListXML = waypoints.slice(0, -1).map((wp, index) => {
        const takeOffBlock = index === 0 ? `<TAKEOFF_INTENT><TIME_DISTANCE_AND_FUEL><DISTANCE>6076.12</DISTANCE><FUEL>1000</FUEL><TIME>120</TIME></TIME_DISTANCE_AND_FUEL><TRUE_HEADING>39</TRUE_HEADING></TAKEOFF_INTENT>` : '';

        return `
<INTENT>
    <ID>${4001 + index}</ID>
    <COMMANDED_ENTRY_ROUTE_POINT_REFERENCE>${100 + index}</COMMANDED_ENTRY_ROUTE_POINT_REFERENCE>
    <WEAPONS_RELEASE_INTENT><CONFIGURATION_ITEM_REFERENCE>2</CONFIGURATION_ITEM_REFERENCE></WEAPONS_RELEASE_INTENT>
    <RESET_HACK_TIME_FLAG>FALSE</RESET_HACK_TIME_FLAG>
    <TEMPERATURE><VALUE>-34.4709</VALUE><TEMPERATURE_TYPE>C</TEMPERATURE_TYPE></TEMPERATURE>
    <DELTA_CARGO_WEIGHT>0</DELTA_CARGO_WEIGHT>
    <DELTA_STORE_WEIGHT>0</DELTA_STORE_WEIGHT>
    <DELTA_DRAG>0</DELTA_DRAG>
    <COMMANDED_ALTITUDE><ALTITUDE><ALTITUDE_TYPE>MSL</ALTITUDE_TYPE><VALUE>${wp.altFeet || 25000}</VALUE><ALTITUDE_RESTRICTION>NONE</ALTITUDE_RESTRICTION></ALTITUDE></COMMANDED_ALTITUDE>
    <CLIMB_STYLE>START_AT_START</CLIMB_STYLE>
    <DESCENT_STYLE>END_AT_END</DESCENT_STYLE>
    <COMMANDED_LEG_AIRSPEED><AIRSPEED><INPUT_TYPE>KTAS</INPUT_TYPE><VALUE>320</VALUE></AIRSPEED></COMMANDED_LEG_AIRSPEED>
    <CLIMB_DIFFERENTIAL>2000</CLIMB_DIFFERENTIAL>
    <DESCENT_DIFFERENTIAL>2000</DESCENT_DIFFERENTIAL>
    <FPM_INTENT><MANUAL_CLIMB_AIRSPEED><AIRSPEED><INPUT_TYPE>KTAS</INPUT_TYPE><VALUE>320</VALUE></AIRSPEED></MANUAL_CLIMB_AIRSPEED><MANUAL_CLIMB_RATE>0</MANUAL_CLIMB_RATE><CLIMB_FPM_MODE_INTENT><FPM_MODE_INTENT><FLAG>4</FLAG><ID>2067</ID><INPUT_LIST><FPM_INPUT_PAIR><ID>419</ID><VALUE>0</VALUE></FPM_INPUT_PAIR><FPM_INPUT_PAIR><ID>417</ID><VALUE>20000</VALUE></FPM_INPUT_PAIR></INPUT_LIST><MANUAL_FUELFLOW>0</MANUAL_FUELFLOW></FPM_MODE_INTENT></CLIMB_FPM_MODE_INTENT><CRUISE_FPM_MODE_INTENT><FPM_MODE_INTENT><FLAG>2</FLAG><ID>3004</ID><INPUT_LIST><FPM_INPUT_PAIR><ID>417</ID><VALUE>20000</VALUE></FPM_INPUT_PAIR><FPM_INPUT_PAIR><ID>1099</ID><VALUE>270</VALUE></FPM_INPUT_PAIR></INPUT_LIST><MANUAL_FUELFLOW>0</MANUAL_FUELFLOW></FPM_MODE_INTENT></CRUISE_FPM_MODE_INTENT><MANUAL_DESCENT_AIRSPEED><AIRSPEED><INPUT_TYPE>KTAS</INPUT_TYPE><VALUE>320</VALUE></AIRSPEED></MANUAL_DESCENT_AIRSPEED><MANUAL_DESCENT_RATE>0</MANUAL_DESCENT_RATE><DESCENT_FPM_MODE_INTENT><FPM_MODE_INTENT><FLAG>4</FLAG><ID>4037</ID><INPUT_LIST><FPM_INPUT_PAIR><ID>419</ID><VALUE>20000</VALUE></FPM_INPUT_PAIR><FPM_INPUT_PAIR><ID>417</ID><VALUE>10000</VALUE></FPM_INPUT_PAIR></INPUT_LIST><MANUAL_FUELFLOW>0</MANUAL_FUELFLOW></FPM_MODE_INTENT></DESCENT_FPM_MODE_INTENT></FPM_INTENT>
    ${takeOffBlock}
    <TURN_INTENT><TURN_TYPE>TURN_SHORTEST</TURN_TYPE><TURN_SETTING><TURN_SETTING_TYPE>TURN_BANK</TURN_SETTING_TYPE><VALUE>30</VALUE></TURN_SETTING></TURN_INTENT>
    <COMMANDED_EXIT_ROUTE_POINT_REFERENCE>${100 + index + 1}</COMMANDED_EXIT_ROUTE_POINT_REFERENCE>
</INTENT>`;
    }).join('');

    const transitionListXML = waypoints.slice(0, -1).map((wp, index) => `
<TRANSITION>
    <ID>${index + 1}</ID>
    <CALCULATION_FLAG>FALSE</CALCULATION_FLAG>
    <MINIMUM_SAFE_ALTITUDE><ALTITUDE><ALTITUDE_TYPE>MSL</ALTITUDE_TYPE><VALUE>500</VALUE></ALTITUDE></MINIMUM_SAFE_ALTITUDE>
    <INTENT_REFERENCE>${4001 + index}</INTENT_REFERENCE>
</TRANSITION>`).join('');
    
    const creationTime = new Date().toISOString().replace(/[-:T.Z]/g, "").substring(0, 14);
    
    const staticBoilerplate = `<?xml version="1.0" encoding="UTF-8"?>
<CRD xmlns="https://metadata.ces.mil/dse/namespaces/CRD" xmlns:ism="urn:us:gov:ic:ism" xmlns:ntk="urn:us:gov:ic:ntk" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ICD_VERSION="2.1.3" ism:DESVersion="9" ism:classification="U" ism:createDate="2011-12-01" ism:ownerProducer="USA" ism:resourceElement="true" ntk:DESVersion="7" xsi:schemaLocation="https://metadata.ces.mil/dse/namespaces/CRD CRDXMLSchema.xsd">
<MISSION_LIST>
<MISSION>
<ROUTE_LIST>
<ROUTE>
<NAME>${escapeXml(name)}</NAME>
<ID>1</ID>
<RECOVERY_FUEL>10000</RECOVERY_FUEL>
<TIME_ZONE_DESIGNATION>+0.00</TIME_ZONE_DESIGNATION>
<VEHICLE_REFERENCE>1</VEHICLE_REFERENCE>
<POINT_LIST>${pointListXML}
</POINT_LIST>
<ROUTE_POINT_LIST>${routePointListXML}
</ROUTE_POINT_LIST>
<INTENT_LIST>${intentListXML}
</INTENT_LIST>
<PATH_LIST>
<PATH>
<INITIAL_STATE_INTENT>
    <ALTITUDE><ALTITUDE_TYPE>MSL</ALTITUDE_TYPE><VALUE>${waypoints[0].altFeet || 0}</VALUE><ALTITUDE_RESTRICTION>NONE</ALTITUDE_RESTRICTION></ALTITUDE>
    <TEMPERATURE><TEMPERATURE_TYPE>C</TEMPERATURE_TYPE><VALUE>14.0</VALUE></TEMPERATURE>
    <WIND><SPEED>0</SPEED><DIRECTION>0</DIRECTION></WIND>
</INITIAL_STATE_INTENT>
<ID>1</ID>
<BINGO_FUEL>10000</BINGO_FUEL>
<EMERGENCY_SAFE_MSL_ALTITUDE>1000</EMERGENCY_SAFE_MSL_ALTITUDE>
<HEADING_CALCULATION_OPTION>GREAT_CIRCLE</HEADING_CALCULATION_OPTION>
<MAGNETIC_HEADING_CALCULATION_OPTION>START</MAGNETIC_HEADING_CALCULATION_OPTION>
<PATH_TYPE>PRIMARY</PATH_TYPE>
<INS_XREF_POINT_REFERENCE>1</INS_XREF_POINT_REFERENCE>
<TRANSITION_LIST>${transitionListXML}
</TRANSITION_LIST>
<CALCULATION_LEVEL>CALCULATION_NONE</CALCULATION_LEVEL>
</PATH>
</PATH_LIST>
<CUSTOM_DATA_LIST><CUSTOM URISTRING="CRDTerminalProcedure"><CRDCustomTag><SID/><STAR/></CRDCustomTag></CUSTOM></CUSTOM_DATA_LIST>
</ROUTE>
</ROUTE_LIST>
<VEHICLE_LIST>
<VEHICLE>
<ID>1</ID>
<FPM_VERSION>4.430</FPM_VERSION>
<FPM_VEHICLE_ID>241</FPM_VEHICLE_ID>
<FUEL_TYPE>A</FUEL_TYPE>
<MINIMUM_FUEL>6000</MINIMUM_FUEL>
<CONFIGURATION>
    <ID>1</ID>
    <TOTAL_WEIGHT>133235</TOTAL_WEIGHT>
    <STATION_LIST><CONFIGURATION_ITEM><ID>2</ID><NAME/><WEIGHT>133235</WEIGHT></CONFIGURATION_ITEM></STATION_LIST>
</CONFIGURATION>
</VEHICLE>
</VEHICLE_LIST>
<DAFIF_DATE_TIME>19800101120000</DAFIF_DATE_TIME>
<CREATION_DATE_TIME>${creationTime}</CREATION_DATE_TIME>
<MISSION_NAME>MISSION_EDITED</MISSION_NAME>
<ID>1</ID>
</MISSION>
</MISSION_LIST>
<SOURCE>JMPS</SOURCE>
</CRD>`;

    return staticBoilerplate;
}

// MODIFIÉ pour ne plus inclure l'écart ISA spécifique par point
function generateJSON(flightData, globalIsaDeviation) {
    // On s'assure que les waypoints n'ont plus la propriété isaDeviationC
    const waypointsToSave = flightData.waypoints.map(({ isaDeviationC, ...rest }) => rest);

    const dataToSave = {
        routeName: flightData.routeName,
        waypoints: waypointsToSave,
        globalIsaDeviation: globalIsaDeviation
    };
    return JSON.stringify(dataToSave, null, 2); 
}
