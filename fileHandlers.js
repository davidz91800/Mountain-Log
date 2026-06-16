// Dépend de app.js pour les fonctions d'UI et de geoUtils.js pour les calculs
// Note : Les variables globales `flightData`, `newPointCounter` etc. sont dans app.js

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        processFile(file);
    }
}

function processFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            newPointCounter = 1;
            processFlightPlan(e.target.result, file.name);
        } catch (error) {
            console.error(`Erreur de traitement : ${error.message}`);
            console.error(error);
        }
    };
    reader.readAsText(file);
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

    } else { // Traitement FPL/XML (logique MODIFIÉE pour conversion d'altitude)
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(fileContent, "application/xml");
        if (xmlDoc.getElementsByTagName("parsererror").length) {
            throw new Error("Fichier XML invalide.");
        }

        const waypointData = new Map();
        for (const wp of xmlDoc.getElementsByTagName('waypoint')) {
            const identifier = wp.getElementsByTagName('identifier')[0].textContent;
            
            // On suppose que l'altitude du FPL est INDIQUÉE
            const indicatedAltitudeFt = parseFloat(wp.getElementsByTagName('altitude-ft')[0]?.textContent || 0);
            
            // On la convertit en VRAIE pour notre usage interne (en supposant ISA+0)
            const { trueAltitude } = calculateTrueAltitude(indicatedAltitudeFt, 0);

            waypointData.set(identifier, {
                identifier,
                type: wp.getElementsByTagName('type')[0].textContent || 'Waypoint',
                lat: parseFloat(wp.getElementsByTagName('lat')[0].textContent),
                lon: parseFloat(wp.getElementsByTagName('lon')[0].textContent),
                altFeet: trueAltitude, // On stocke l'altitude VRAIE
                comment: ''
            });
        }

        const orderedWaypoints = [];
        for (const rp of xmlDoc.getElementsByTagName('route-point')) {
            const id = rp.getElementsByTagName('waypoint-identifier')[0].textContent;
            if (waypointData.has(id)) {
                orderedWaypoints.push(waypointData.get(id));
            }
        }

        if (orderedWaypoints.length < 2) {
            throw new Error("Une route doit contenir au moins 2 points.");
        }

        const routeNameFromXml = xmlDoc.getElementsByTagName('route-name')[0]?.textContent;
        flightData.routeName = routeNameFromXml || fileName.replace(/\.[^/.]+$/, "");
        flightData.waypoints = orderedWaypoints;
    }

    // Code commun après le parsing (affichage de l'éditeur)
    showEditor();
}