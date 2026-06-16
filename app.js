// --- START OF FILE app.js ---

// --- STATE & INITIALIZATION ---
// flightData.waypoints[n].altFeet représente maintenant l'altitude VRAIE
let flightData = { routeName: '', waypoints: [] };
let globalIsaDeviation = 0;
let turnRadius180 = 1.5;
let turnRadius150 = 1.0;
let gradient3Eng = 500;
let newPointCounter = 1;
let lastWeatherAverages = null; // Pour stocker les données météo pour l'impression

// NOUVELLES VARIABLES GLOBALES
let navStartTime = '08:00';
let avgGroundSpeed = 180;
let currentlyEditingDzIndex = -1; // Pour savoir quel WP on modifie


// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
        }, err => {
            console.log('ServiceWorker registration failed: ', err);
        });
    });

    navigator.serviceWorker.addEventListener('message', event => {
        if (event.data && event.data.type === 'FILE_SHARE') {
            processFile(event.data.file);
        }
    });
}

// --- GESTION DU THÈME (clair / sombre) ---
function getResolvedTheme() {
    const explicit = document.documentElement.getAttribute('data-theme');
    if (explicit === 'dark' || explicit === 'light') return explicit;
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}

function updateThemeUI(theme) {
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0f1626' : '#2563eb');
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('mountainlog-theme', theme); } catch (e) {}
    updateThemeUI(theme);
}

function toggleTheme() {
    applyTheme(getResolvedTheme() === 'dark' ? 'light' : 'dark');
}

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    const logBody = document.getElementById('log-body');

    // Thème : initialise l'icône et branche le bouton de bascule
    updateThemeUI(getResolvedTheme());
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

    // Listener de fichier
    document.getElementById('fileInput').addEventListener('change', handleFileSelect);
    // Création d'un nouveau log + édition du nom du plan
    document.getElementById('create-new-log-btn').addEventListener('click', handleCreateNewLog);
    document.getElementById('add-waypoint-end-btn').addEventListener('click', handleAddWaypointAtEnd);
    document.getElementById('route-name-input').addEventListener('input', (e) => { flightData.routeName = e.target.value; });
    
    // Listeners pour les paramètres globaux
    document.getElementById('global-isa-input').addEventListener('input', handleGlobalIsaChange);
    const turnRadius180Input = document.getElementById('turn-radius-180');
    const turnRadius150Input = document.getElementById('turn-radius-150');
    const gradient3EngInput = document.getElementById('gradient-3eng');
    const navStartTimeInput = document.getElementById('nav-start-time');
    const avgGroundSpeedInput = document.getElementById('avg-ground-speed');

    turnRadius180Input.value = turnRadius180;
    turnRadius150Input.value = turnRadius150;
    gradient3EngInput.value = gradient3Eng;
    navStartTimeInput.value = navStartTime;
    avgGroundSpeedInput.value = avgGroundSpeed;

    turnRadius180Input.addEventListener('input', (e) => { turnRadius180 = parseFloat(e.target.value) || 0; });
    turnRadius150Input.addEventListener('input', (e) => { turnRadius150 = parseFloat(e.target.value) || 0; });
    gradient3EngInput.addEventListener('input', (e) => { gradient3Eng = parseFloat(e.target.value) || 0; });
    navStartTimeInput.addEventListener('input', (e) => { navStartTime = e.target.value; });
    avgGroundSpeedInput.addEventListener('input', (e) => { avgGroundSpeed = parseFloat(e.target.value) || 180; });


    // Utilisation de la délégation d'événements pour les boutons dupliqués
    document.addEventListener('click', (event) => {
        if (event.target.matches('.generate-json-btn')) handleGenerateJSON();
        if (event.target.matches('.generate-fpl-btn')) handleGenerateFPL();
        if (event.target.matches('.generate-kml-btn')) handleGenerateKML();
        if (event.target.matches('.generate-crd-btn')) handleGenerateCRD();
        if (event.target.matches('.share-log-btn')) handleShareLog();
        if (event.target.matches('.print-btn')) handlePrint(event.target);
    });
    
    // Gestionnaires d'événements pour la modale FPL (ceux-ci sont uniques)
    const fplModal = document.getElementById('fpl-options-modal');
    document.getElementById('fpl-modal-close').addEventListener('click', () => fplModal.style.display = 'none');
    document.getElementById('fpl-standard-btn').addEventListener('click', generateFplStandard);
    document.getElementById('fpl-altitude-btn').addEventListener('click', generateFplWithAltitudesInName);
    fplModal.addEventListener('click', (e) => {
        if (e.target === fplModal) fplModal.style.display = 'none';
    });

    // Gestionnaires pour la modale DZ
    const dzModal = document.getElementById('dz-options-modal');
    document.getElementById('dz-modal-close').addEventListener('click', () => dzModal.style.display = 'none');
    document.getElementById('dz-save-btn').addEventListener('click', handleSaveDzData);
    document.getElementById('dz-fetch-weather-btn').addEventListener('click', fetchDzWeather);

    // Gérer le sélecteur de hauteur de largage personnalisé
    const dzDropHeightSelect = document.getElementById('dz-drop-height-select');
    const dzDropHeightCustomInput = document.getElementById('dz-drop-height-custom');
    dzDropHeightSelect.addEventListener('change', () => {
        if (dzDropHeightSelect.value === 'custom') {
            dzDropHeightCustomInput.style.display = 'inline-block';
            dzDropHeightCustomInput.focus();
        } else {
            dzDropHeightCustomInput.style.display = 'none';
            dzDropHeightCustomInput.value = dzDropHeightSelect.value;
        }
    });
    dzModal.addEventListener('click', (e) => {
        if (e.target === dzModal) dzModal.style.display = 'none';
    });

    // Gestionnaires pour la modale de partage
    const shareModal = document.getElementById('share-options-modal');
    document.getElementById('share-modal-close').addEventListener('click', () => shareModal.style.display = 'none');
    shareModal.addEventListener('click', (e) => { if (e.target === shareModal) shareModal.style.display = 'none'; });
    document.getElementById('share-file-btn').addEventListener('click', shareLogFile);
    document.getElementById('share-link-btn').addEventListener('click', shareLogLink);
    document.getElementById('copy-link-btn').addEventListener('click', copyShareLink);
    
    // Listeners pour Open-Meteo
    const forecastDateTimeInput = document.getElementById('forecast-datetime');
    const fetchWeatherBtn = document.getElementById('fetch-weather-btn');
    fetchWeatherBtn.addEventListener('click', handleFetchWeather);

    // Pré-remplir la date à l'heure actuelle + 1h, arrondie
    const now = new Date();
    now.setHours(now.getHours() + 1, 0, 0, 0); // Prochaine heure ronde
    // Conversion au format YYYY-MM-DDTHH:MM requis par l'input
    const localDateTime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    forecastDateTimeInput.value = localDateTime;


    // Gestionnaires d'événements pour le tableau (glisser-déposer, clics, etc.)
    logBody.addEventListener('click', handleLogTableClick);
    logBody.addEventListener('input', handleTableInput);
    logBody.addEventListener('dragstart', handleDragStart);
    logBody.addEventListener('dragover', handleDragOver);
    logBody.addEventListener('dragleave', handleDragLeave);
    logBody.addEventListener('drop', handleDrop);
    logBody.addEventListener('dragend', handleDragEnd);

    // Charge automatiquement un log reçu via un lien / QR code (#log=...)
    loadSharedLogFromHash();
});


// --- UI & DATA MANIPULATION FUNCTIONS ---

function autosizeTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
}

function populateLogTable() {
    const logTable = document.getElementById('log-table');
    logTable.querySelector('thead tr').innerHTML = `
        <th class="col-num">#</th>
        <th class="col-wp">Waypoint</th>
        <th class="col-coords">Coordonnées</th>
        <th class="col-alt">Altitude</th>
        <th class="col-comment">Commentaires</th>
        <th class="col-actions">Actions</th>
    `;

    const logBody = document.getElementById('log-body');
    logBody.innerHTML = '';
    lastWeatherAverages = null; // Réinitialiser les données météo lors du chargement d'un nouveau plan

    flightData.waypoints.forEach((wp, index) => {
        const row = logBody.insertRow();
        row.className = 'draggable-row';
        row.setAttribute('draggable', 'true');
        row.setAttribute('data-index', index);
        
        const ddmCoords = decimalToDDM(wp.lat, wp.lon);

        // Rendre le textarea readonly, car il est maintenant géré par la modale DZ
        row.innerHTML = `
            <td class="drag-handle" title="Glisser pour réorganiser"><span>${index + 1}</span><span class="drag-icon">☰</span></td>
            <td class="editable-cell">
                <span class="display-value">${wp.identifier}</span>
                <input type="text" class="input-value" value="${wp.identifier}" style="display:none;">
                <button class="edit-btn edit-waypoint-btn" data-index="${index}">Modifier</button>
            </td>
            <td class="editable-cell">
                <span class="display-value">${ddmCoords}</span>
                <input type="text" class="input-value" value="${ddmCoords}" style="display:none;">
                <button class="edit-btn edit-coord-btn" data-index="${index}">Modifier</button>
            </td>
            <td>
                <div class="altitude-cell-content">
                    <div class="true-altitude-wrapper">
                        <input type="number" id="alt-input-${index}" class="altitude-input" data-index="${index}" value="${wp.altFeet}" step="100">
                        <span class="unit">ft</span>
                        <span class="label">(Vraie)</span>
                    </div>
                    <div class="calculated-values">
                        <div class="indicated-altitude-display"></div>
                        <div class="oat-display"></div>
                    </div>
                </div>
            </td>
            <td><textarea class="comment-textarea" data-index="${index}" rows="1" readonly>${wp.comment || ''}</textarea></td>
            <td>
                <button class="add-dz-btn" data-index="${index}">Drop Zone</button>
                <button class="delete-btn delete-wp-btn" data-index="${index}">Supprimer</button>
            </td>
        `;

        if (index < flightData.waypoints.length - 1) {
            const nextWp = flightData.waypoints[index + 1];
            const distance = calculateDistanceNM(wp.lat, wp.lon, nextWp.lat, nextWp.lon);
            const insertRow = logBody.insertRow();
            insertRow.className = 'insert-row';
            const cell = insertRow.insertCell();
            cell.colSpan = 6;
            cell.innerHTML = `
                <div class="insert-cell-content">
                    <span>Leg: <strong>${distance.toFixed(2)} NM</strong></span>
                    <div class="add-wp-controls">
                        <span>Ajouter à</span>
                        <input type="number" class="distance-input" min="0.1" step="0.1" placeholder="NM">
                        <span>NM du point suivant</span>
                        <button class="add-wp-btn" data-index="${index}">Créer</button>
                    </div>
                    <button class="add-manual-wp-btn" data-index="${index}">Ajouter manuellement</button>
                </div>
                <div class="manual-add-form" data-index="${index}">
                    <div class="form-grid">
                        <div class="form-group">
                            <label for="new-wp-ident-${index}">Identifiant</label>
                            <input type="text" id="new-wp-ident-${index}" placeholder="Ex: MON_POINT">
                        </div>
                        <div class="form-group">
                            <label for="new-wp-coords-${index}">Coordonnées</label>
                            <input type="text" id="new-wp-coords-${index}" placeholder="Format: NXX°XX.XX EYYY°YY.YY">
                            <span class="input-hint">Ex: N45°12.34 E005°43.21</span>
                        </div>
                        <div class="form-group">
                            <label for="new-wp-alt-${index}">Altitude Vraie (ft)</label>
                            <input type="number" id="new-wp-alt-${index}" placeholder="Ex: 5000">
                        </div>
                        <div class="form-group full-width">
                            <label for="new-wp-comment-${index}">Commentaire</label>
                            <textarea id="new-wp-comment-${index}" rows="2" placeholder="Facultatif"></textarea>
                        </div>
                    </div>
                    <div class="form-actions">
                        <button class="cancel-manual-wp-btn btn-sm btn-secondary" data-index="${index}">Annuler</button>
                        <button class="save-manual-wp-btn btn-sm btn-success" data-index="${index}">Enregistrer</button>
                    </div>
                </div>
            `;
        }
    });

    if (flightData.waypoints.length === 0) {
        const emptyRow = logBody.insertRow();
        const cell = emptyRow.insertCell();
        cell.colSpan = 6;
        cell.className = 'empty-log-message';
        cell.textContent = 'Aucun waypoint pour le moment. Cliquez sur « + Ajouter un waypoint » ci-dessous pour commencer.';
    }

    setTimeout(() => {
        document.querySelectorAll('.comment-textarea').forEach(autosizeTextarea);
    }, 0);
    
    updateAllIndicatedAltitudes();
    
    document.getElementById('weather-section').style.display = 'block';
    document.getElementById('weather-results-container').innerHTML = '';
}

function updateAllIndicatedAltitudes() {
    document.querySelectorAll('#log-body tr:not(.insert-row)').forEach((row, index) => {
        if (flightData.waypoints[index]) {
            updateIndicatedAltitudeForRow(row, index);
        }
    });
}

function updateIndicatedAltitudeForRow(row, index) {
    const wp = flightData.waypoints[index];
    const { indicatedAltitude, airTempC } = calculateIndicatedAltitude(wp.altFeet, globalIsaDeviation);
    const indicatedAltDisplay = row.querySelector('.indicated-altitude-display');
    const oatDisplay = row.querySelector('.oat-display');
    if (indicatedAltDisplay) {
        indicatedAltDisplay.innerHTML = `<span class="value">≈ ${indicatedAltitude.toLocaleString('fr-FR')} ft</span> <span class="label">(Indiquée)</span>`;
    }
    if (oatDisplay) {
        oatDisplay.innerHTML = `<span>T° ext:</span> <span class="value">${airTempC.toFixed(1)}°C</span>`;
    }
}

function checkAndDisplayDuplicateWarnings() {
    const warningBanners = document.querySelectorAll('.warning-banner');
    const identifiers = flightData.waypoints.map(wp => wp.identifier);
    const seen = new Set();
    const duplicates = new Set(identifiers.filter(id => seen.size === seen.add(id).size));
    const hasDuplicates = duplicates.size > 0;
    const message = hasDuplicates ? `<strong>Attention :</strong> Identifiants dupliqués : ${Array.from(duplicates).join(', ')}.` : '';
    const displayStyle = hasDuplicates ? 'block' : 'none';
    warningBanners.forEach(banner => { banner.innerHTML = message; banner.style.display = displayStyle; });
}

function createDownloadLink(content, fileName, mimeType) {
    const container = document.getElementById('download-container');
    container.innerHTML = '';
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.className = 'download-link';
    a.style.backgroundColor = fileName.includes('.kml') ? '#28a745' : (fileName.includes('.crd') ? '#17a2b8' : (fileName.includes('.json') ? '#ffc107' : '#6c757d'));
    if (fileName.includes('.json')) a.style.color = '#212529';
    a.textContent = `Télécharger ${fileName}`;
    container.appendChild(a);
    container.style.display = 'block';

    // Déclenche directement le téléchargement quand on clique sur le bouton (JSON, FPL, etc.).
    // Le lien reste affiché comme solution de repli, notamment sur iOS où le
    // téléchargement automatique peut être bloqué dans une PWA installée.
    a.click();

    // Garantit que le lien de repli est visible si le téléchargement auto n'a pas abouti.
    container.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// --- EVENT HANDLERS ---

// Affiche l'éditeur (paramètres + table) — commun à l'import de fichier et à la création
function showEditor() {
    document.getElementById('global-isa-input').value = globalIsaDeviation;
    const routeInput = document.getElementById('route-name-input');
    if (routeInput) routeInput.value = flightData.routeName || '';
    populateLogTable();
    checkAndDisplayDuplicateWarnings();
    document.getElementById('log-container').style.display = 'block';
    document.querySelector('.global-settings-section').style.display = 'block';
    document.getElementById('download-container').style.display = 'none';
}

// Crée un nouveau log vierge : deux waypoints de départ, prêts à être édités/renommés
function handleCreateNewLog() {
    if (flightData.waypoints.length > 0 &&
        !window.confirm("Créer un nouveau log ? Le plan de vol actuel sera remplacé.")) {
        return;
    }
    globalIsaDeviation = parseFloat(document.getElementById('global-isa-input').value) || 0;
    newPointCounter = 1;
    flightData = { routeName: '', waypoints: [] };
    showEditor();
    const routeInput = document.getElementById('route-name-input');
    if (routeInput) routeInput.focus();
    document.getElementById('log-container').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Ajoute un waypoint à la fin du plan (fonctionne même sur un log vide)
function handleAddWaypointAtEnd() {
    const wps = flightData.waypoints;
    const last = wps[wps.length - 1];
    wps.push({
        identifier: `WPT${newPointCounter++}`,
        type: 'USER WAYPOINT',
        lat: last ? +(last.lat + 0.05).toFixed(5) : 45.50,
        lon: last ? +(last.lon + 0.05).toFixed(5) : 6.00,
        altFeet: last ? last.altFeet : 0,
        comment: ''
    });
    populateLogTable();
    checkAndDisplayDuplicateWarnings();
}

function handleGlobalIsaChange(event) {
    globalIsaDeviation = parseFloat(event.target.value) || 0;
    updateAllIndicatedAltitudes();
}

let draggedItem = null;
function handleDragStart(e) {
    const target = e.target.closest('.draggable-row');
    if (!target || (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON')) {
        e.preventDefault(); return;
    }
    draggedItem = target;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', target.dataset.index);
    setTimeout(() => { draggedItem.classList.add('dragging'); }, 0);
}
function handleDragOver(e) {
    e.preventDefault();
    const targetRow = e.target.closest('.draggable-row');
    if (!targetRow || targetRow === draggedItem) return;
    document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom'));
    const rect = targetRow.getBoundingClientRect();
    const middleY = rect.top + rect.height / 2;
    targetRow.classList.add(e.clientY < middleY ? 'drag-over-top' : 'drag-over-bottom');
}
function handleDragLeave(e) {
    const targetRow = e.target.closest('.draggable-row');
    if (targetRow) targetRow.classList.remove('drag-over-top', 'drag-over-bottom');
}
function handleDrop(e) {
    e.preventDefault();
    const targetRow = e.target.closest('.draggable-row');
    if (!targetRow || !draggedItem) return;
    const draggedIndex = parseInt(draggedItem.dataset.index, 10);
    let targetIndex = parseInt(targetRow.dataset.index, 10);
    const rect = targetRow.getBoundingClientRect();
    if (e.clientY >= (rect.top + rect.height / 2)) targetIndex++;
    if (draggedIndex < targetIndex) targetIndex--;
    const [movedItem] = flightData.waypoints.splice(draggedIndex, 1);
    flightData.waypoints.splice(targetIndex, 0, movedItem);
    populateLogTable();
}
function handleDragEnd(e) {
    draggedItem?.classList.remove('dragging');
    document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom'));
    draggedItem = null;
}

function handleLogTableClick(event) {
    const target = event.target;
    if (target.closest('.dragging')) return;

    const editButton = target.closest('.edit-btn');
    const addButton = target.closest('.add-wp-btn');
    const deleteButton = target.closest('.delete-wp-btn');
    const showManualFormButton = target.closest('.add-manual-wp-btn');
    const saveManualButton = target.closest('.save-manual-wp-btn');
    const cancelManualButton = target.closest('.cancel-manual-wp-btn');
    const dzButton = target.closest('.add-dz-btn');

    if (editButton) handleEditClick(editButton);
    else if (addButton) handleAddPointAtDistance(addButton);
    else if (deleteButton) handleDeleteWaypoint(deleteButton);
    else if (showManualFormButton) showManualAddForm(showManualFormButton);
    else if (saveManualButton) handleManualAddWaypoint(saveManualButton);
    else if (dzButton) handleDzButtonClick(dzButton);
    else if (cancelManualButton) hideManualAddForm(cancelManualButton);
}

function handleTableInput(event) {
    const target = event.target;
    const index = parseInt(target.dataset.index, 10);
    if (!flightData.waypoints[index]) return;
    
    const row = target.closest('tr');

    if (target.classList.contains('altitude-input')) {
        flightData.waypoints[index].altFeet = parseFloat(target.value) || 0;
        updateIndicatedAltitudeForRow(row, index);
    }
}

function handleDeleteWaypoint(button) {
    const index = parseInt(button.dataset.index, 10), waypointIdentifier = flightData.waypoints[index].identifier;
    if (window.confirm(`Êtes-vous sûr de vouloir supprimer le waypoint "${waypointIdentifier}" ?`)) {
        flightData.waypoints.splice(index, 1);
        populateLogTable();
        checkAndDisplayDuplicateWarnings();
    }
}

function handleAddPointAtDistance(button) {
    const index = parseInt(button.dataset.index, 10), input = button.parentElement.querySelector('.distance-input'), distanceFromNext = parseFloat(input.value);
    if (isNaN(distanceFromNext) || distanceFromNext <= 0) { alert("Veuillez entrer une distance valide et positive."); input.classList.add('input-error'); return; }
    input.classList.remove('input-error');
    const wp1 = flightData.waypoints[index], wp2 = flightData.waypoints[index + 1], totalDistance = calculateDistanceNM(wp1.lat, wp1.lon, wp2.lat, wp2.lon);
    if (distanceFromNext >= totalDistance) { alert(`La distance (${distanceFromNext.toFixed(2)} NM) doit être inférieure à la distance totale du segment (${totalDistance.toFixed(2)} NM).`); input.classList.add('input-error'); return; }
    const distanceFromStart = totalDistance - distanceFromNext, bearing = calculateBearing(wp1.lat, wp1.lon, wp2.lat, wp2.lon), newPointCoords = calculateDestinationPoint(wp1.lat, wp1.lon, bearing, distanceFromStart);
    const interpolatedAltitude = wp1.altFeet + (wp2.altFeet - wp1.altFeet) * (distanceFromStart / totalDistance);
    const newWaypoint = { identifier: `NEW_POINT_${newPointCounter++}`, type: 'USER WAYPOINT', lat: newPointCoords.lat, lon: newPointCoords.lon, altFeet: Math.round(interpolatedAltitude), comment: '' };
    flightData.waypoints.splice(index + 1, 0, newWaypoint);
    populateLogTable();
    checkAndDisplayDuplicateWarnings();
}

function showManualAddForm(button) {
    const insertRow = button.closest('.insert-row');
    insertRow.querySelector('.insert-cell-content').style.display = 'none';
    insertRow.querySelector('.manual-add-form').style.display = 'block';
}

function hideManualAddForm(button) {
    const insertRow = button.closest('.insert-row');
    const form = insertRow.querySelector('.manual-add-form');
    form.style.display = 'none';
    insertRow.querySelector('.insert-cell-content').style.display = 'flex';
    form.querySelectorAll('input, textarea').forEach(input => { input.value = ''; input.classList.remove('input-error'); });
}

function handleManualAddWaypoint(button) {
    const index = parseInt(button.dataset.index, 10), form = button.closest('.manual-add-form');
    const identInput = form.querySelector(`#new-wp-ident-${index}`), coordsInput = form.querySelector(`#new-wp-coords-${index}`), altInput = form.querySelector(`#new-wp-alt-${index}`), commentInput = form.querySelector(`#new-wp-comment-${index}`);
    let isValid = true;
    [identInput, coordsInput].forEach(el => el.classList.remove('input-error'));
    const identifier = identInput.value.trim();
    if (!identifier) { identInput.classList.add('input-error'); isValid = false; }
    const coords = parseDDM(coordsInput.value);
    if (!coords) { coordsInput.classList.add('input-error'); isValid = false; }
    if (!isValid) { alert("Veuillez corriger les champs en surbrillance. L'identifiant et les coordonnées sont obligatoires."); return; }
    const newWaypoint = { identifier, type: 'USER WAYPOINT', lat: coords.lat, lon: coords.lon, altFeet: parseFloat(altInput.value) || 0, comment: commentInput.value.trim() };
    flightData.waypoints.splice(index + 1, 0, newWaypoint);
    populateLogTable();
    checkAndDisplayDuplicateWarnings();
}

function handleEditClick(button) {
    const cell = button.closest('.editable-cell'), displaySpan = cell.querySelector('.display-value'), inputField = cell.querySelector('.input-value'), index = button.dataset.index;
    if (button.classList.contains('save')) {
        let success = false;
        if (button.classList.contains('edit-coord-btn')) {
            const newCoords = parseDDM(inputField.value);
            if (newCoords) { flightData.waypoints[index].lat = newCoords.lat; flightData.waypoints[index].lon = newCoords.lon; populateLogTable(); success = true; } else { alert("Format de coordonnées invalide. Utilisez NXX°XX.XX EYYY°YY.YY"); }
        } else if (button.classList.contains('edit-waypoint-btn')) {
            const newIdentifier = inputField.value.trim();
            if (newIdentifier) { flightData.waypoints[index].identifier = newIdentifier; displaySpan.textContent = newIdentifier; checkAndDisplayDuplicateWarnings(); success = true; } else { alert("Le nom du waypoint ne peut pas être vide."); }
        }
        if (success && !button.classList.contains('edit-coord-btn')) {
            inputField.style.display = 'none'; displaySpan.style.display = 'inline'; button.textContent = 'Modifier'; button.classList.remove('save'); inputField.classList.remove('input-error');
        } else if (!success) { inputField.classList.add('input-error'); }
    } else {
        displaySpan.style.display = 'none'; inputField.style.display = 'inline-block'; button.textContent = 'OK'; button.classList.add('save'); inputField.focus();
    }
}

// Garde-fou : certains exports exigent un minimum de waypoints
function ensureMinWaypoints(min) {
    if (flightData.waypoints.length < min) {
        alert(`Le plan de vol doit contenir au moins ${min} waypoints pour cet export.`);
        return false;
    }
    return true;
}

function handleGenerateJSON() {
    const jsonContent = generateJSON(flightData, globalIsaDeviation);
    const fileName = `${flightData.routeName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
    createDownloadLink(jsonContent, fileName, 'application/json');
}

function handleGenerateCRD() {
    if (!ensureMinWaypoints(2)) return;
    const firstWp = flightData.waypoints[0], lastWp = flightData.waypoints[flightData.waypoints.length - 1];
    if (!/^[A-Z]{4}$/i.test(firstWp.identifier) || !/^[A-Z]{4}$/i.test(lastWp.identifier)) {
        alert(`Erreur CRD : Le premier et le dernier waypoint doivent être des codes OACI de 4 lettres.`); return;
    }
    const crdContent = generateCRD(flightData.routeName, flightData.waypoints);
    const fileName = `${flightData.routeName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.crd`;
    createDownloadLink(crdContent, fileName, 'application/xml');
}

function handleGenerateKML() {
    if (!ensureMinWaypoints(2)) return;
    const kmlContent = generateKML(flightData.routeName, flightData.waypoints);
    const fileName = `${flightData.routeName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.kml`;
    createDownloadLink(kmlContent, fileName, 'application/vnd.google-earth.kml+xml');
}

// --- GESTION DES EXPORTS FPL VIA MODALE ---

function handleGenerateFPL() {
    if (!ensureMinWaypoints(2)) return;
    document.getElementById('fpl-options-modal').style.display = 'flex';
}

function prepareWaypointsForFplExport() {
    return flightData.waypoints.map(wp => {
        const { indicatedAltitude } = calculateIndicatedAltitude(wp.altFeet, globalIsaDeviation);
        return { ...wp, altFeet: indicatedAltitude };
    });
}

function generateFplStandard() {
    const waypointsForExport = prepareWaypointsForFplExport();
    const fplContent = generateFPL(flightData.routeName, waypointsForExport);
    const fileName = `${flightData.routeName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.fpl`;
    createDownloadLink(fplContent, fileName, 'application/xml');
    document.getElementById('fpl-options-modal').style.display = 'none';
}

function generateFplWithAltitudesInName() {
    const waypointsForExport = prepareWaypointsForFplExport();
    const waypointsWithModifiedNames = waypointsForExport.map((wp, index) => {
        const originalWp = flightData.waypoints[index];
        const newIdentifier = `${originalWp.identifier}-${originalWp.altFeet}V-${wp.altFeet}I`;
        return { ...wp, identifier: newIdentifier };
    });
    const fplContent = generateFPL(flightData.routeName, waypointsWithModifiedNames);
    const fileName = `${flightData.routeName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_altitudes.fpl`;
    createDownloadLink(fplContent, fileName, 'application/xml');
    document.getElementById('fpl-options-modal').style.display = 'none';
}

// =================================================================================
// PARTAGE DU LOG (Web Share / AirDrop, lien auto-chargé, QR code)
// =================================================================================

// Données compactes du log pour l'encodage dans une URL / un QR code
function getShareableData() {
    const waypoints = flightData.waypoints.map(({ isaDeviationC, ...rest }) => rest);
    return { routeName: flightData.routeName, waypoints, globalIsaDeviation };
}

function buildShareUrl() {
    const encoded = LZString.compressToEncodedURIComponent(JSON.stringify(getShareableData()));
    return location.origin + location.pathname + '#log=' + encoded;
}

function handleShareLog() {
    if (flightData.waypoints.length === 0) {
        alert("Ajoutez au moins un waypoint avant de partager le log.");
        return;
    }
    const url = buildShareUrl();
    const input = document.getElementById('share-link-input');
    if (input) input.value = url;
    const copyBtn = document.getElementById('copy-link-btn');
    if (copyBtn) copyBtn.textContent = 'Copier';
    renderQrCode(url);
    document.getElementById('share-options-modal').style.display = 'flex';
}

// Partage le fichier .json via la feuille de partage iOS (AirDrop). Repli : téléchargement.
function shareLogFile() {
    const json = generateJSON(flightData, globalIsaDeviation);
    const fileName = (flightData.routeName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'plan') + '.json';
    const file = new File([json], fileName, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'Mountain Log', text: flightData.routeName || 'Plan de vol' })
            .catch(err => { if (err && err.name !== 'AbortError') console.error('Partage fichier échoué :', err); });
    } else {
        createDownloadLink(json, fileName, 'application/json');
        document.getElementById('share-options-modal').style.display = 'none';
        alert("Le partage direct n'est pas disponible ici. Le fichier a été préparé : utilise « Télécharger » puis AirDrop depuis l'app Fichiers.");
    }
}

// Partage le lien (qui charge le plan automatiquement à l'ouverture). Repli : copie.
function shareLogLink() {
    const url = buildShareUrl();
    if (navigator.share) {
        navigator.share({ title: 'Mountain Log', text: flightData.routeName || 'Plan de vol', url })
            .catch(err => { if (err && err.name !== 'AbortError') console.error('Partage lien échoué :', err); });
    } else {
        copyShareLink();
    }
}

function copyShareLink() {
    const input = document.getElementById('share-link-input');
    const url = input ? input.value : buildShareUrl();
    const btn = document.getElementById('copy-link-btn');
    const done = () => { if (btn) { btn.textContent = 'Copié ✓'; setTimeout(() => { btn.textContent = 'Copier'; }, 1500); } };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(() => { if (input) { input.select(); document.execCommand('copy'); done(); } });
    } else if (input) {
        input.select();
        document.execCommand('copy');
        done();
    }
}

// Génère le QR code (SVG) à partir du lien de partage
function renderQrCode(text) {
    const container = document.getElementById('share-qr');
    if (!container) return;
    container.innerHTML = '';
    container.classList.remove('qr-error');
    try {
        const qr = qrcode(0, 'L'); // type auto, correction d'erreur L (capacité maximale)
        qr.addData(text);
        qr.make();
        container.innerHTML = qr.createSvgTag({ scalable: true, margin: 2 });
    } catch (e) {
        container.classList.add('qr-error');
        container.textContent = 'Plan trop volumineux pour un QR code — utilise « Partager le fichier » ou « Partager le lien ».';
    }
}

// Charge automatiquement un log encodé dans l'URL (#log=...) au démarrage
function loadSharedLogFromHash() {
    const match = (location.hash || '').match(/log=([^&]+)/);
    if (!match) return;
    try {
        const json = LZString.decompressFromEncodedURIComponent(match[1]);
        const data = JSON.parse(json);
        if (!data || !Array.isArray(data.waypoints)) throw new Error('Données invalides');
        flightData = { routeName: data.routeName || '', waypoints: data.waypoints };
        flightData.waypoints.forEach(wp => { wp.comment = wp.comment || ''; });
        globalIsaDeviation = data.globalIsaDeviation ?? 0;
        newPointCounter = 1;
        showEditor();
        // Nettoie l'URL pour éviter un rechargement involontaire du même plan
        history.replaceState(null, '', location.pathname + location.search);
    } catch (e) {
        console.error('Lien de log invalide :', e);
        alert("Le lien de partage est invalide ou corrompu.");
    }
}

// =================================================================================
// FONCTION D'IMPRESSION (MISE À JOUR)
// =================================================================================
function handlePrint(clickedButton) {
    const printContainer = document.getElementById('print-content');
    
    const isTopButton = clickedButton.closest('#top-action-bar');
    const indicatedCheckboxId = isTopButton ? 'print-indicated-alt-top' : 'print-indicated-alt-bottom';
    const trueCheckboxId = isTopButton ? 'print-true-alt-top' : 'print-true-alt-bottom';

    const printIndicated = document.getElementById(indicatedCheckboxId).checked;
    const printTrue = document.getElementById(trueCheckboxId).checked;

    let printHtml = '';

    // Construction du résumé de vol
    let summaryHtml = `
        <div id="print-summary-info">
            <div class="print-summary-box">
                <h4>Paramètres de Vol</h4>
                <div class="summary-row">
                    <span class="summary-label">Déviation ISA choisie:</span>
                    <span class="summary-value">ISA ${globalIsaDeviation >= 0 ? '+' : ''}${globalIsaDeviation}°C</span>
                </div>
                <div class="summary-row">
                    <span class="summary-label">Diamètre mini virage 180 KIAS:</span>
                    <span class="summary-value">${turnRadius180.toFixed(2)} Nm</span>
                </div>
                <div class="summary-row">
                    <span class="summary-label">Diamètre mini virage 150 KIAS (Flaps 50%):</span>
                    <span class="summary-value">${turnRadius150.toFixed(2)} Nm</span>
                </div>
                <div class="summary-row">
                    <span class="summary-label">Pente 3 ENG:</span>
                    <span class="summary-value">${gradient3Eng} ft/Nm</span>
                </div>
            </div>`;

    if (lastWeatherAverages) {
        summaryHtml += `
            <div class="print-summary-box">
                <h4>Prévisions Météo (${lastWeatherAverages.time})</h4>
                <div class="summary-row">
                    <span class="summary-label">QNH Moyen:</span>
                    <span class="summary-value">${lastWeatherAverages.qnh} hPa</span>
                </div>
                <div class="summary-row">
                    <span class="summary-label">Vent/T° FL050:</span>
                    <span class="summary-value">${lastWeatherAverages.windFL050.dir}°/${lastWeatherAverages.windFL050.kts}kt | ${lastWeatherAverages.tempFL050}°C (${lastWeatherAverages.isaDevFL050})</span>
                </div>
                <div class="summary-row">
                    <span class="summary-label">Vent/T° FL100:</span>
                    <span class="summary-value">${lastWeatherAverages.windFL100.dir}°/${lastWeatherAverages.windFL100.kts}kt | ${lastWeatherAverages.tempFL100}°C (${lastWeatherAverages.isaDevFL100})</span>
                </div>
            </div>`;
    }
    summaryHtml += `</div>`;
    printHtml += summaryHtml;


    const legArrowIcon = `<svg class="leg-arrow-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;

    printHtml += `
        <table class="print-log-table">
            <thead>
                <tr>
                    <th class="print-col-num">#</th>
                    <th class="print-col-wp">Waypoint</th>
                    <th class="print-col-coords">Coordonnées</th>
                    ${printTrue ? '<th class="print-col-alt">Alt. Vraie</th>' : ''}
                    ${printIndicated ? '<th class="print-col-alt">Alt. Indiquée</th>' : ''}
                    <th class="print-col-comment">Commentaires</th>
                </tr>
            </thead>
            <tbody>`;

    flightData.waypoints.forEach((wp, index) => {
        const ddmCoords = decimalToDDM(wp.lat, wp.lon);
        const { indicatedAltitude } = calculateIndicatedAltitude(wp.altFeet, globalIsaDeviation);
        
        let legInfoHtml = '';
        if (index > 0) {
            const prevWp = flightData.waypoints[index - 1];
            const distance = calculateDistanceNM(prevWp.lat, prevWp.lon, wp.lat, wp.lon);
            legInfoHtml = `
                <div class="leg-info">
                    ${legArrowIcon}
                    <span>${distance.toFixed(2)} NM</span>
                </div>`;
        }
        
        printHtml += `
            <tr class="waypoint-data-row">
                <td class="print-col-num">${index + 1}</td>
                <td class="print-col-wp waypoint-identifier-cell">
                    ${legInfoHtml}
                    <span class="waypoint-identifier">${wp.identifier}</span>
                </td>
                <td class="print-col-coords">${ddmCoords}</td>
                ${printTrue ? `<td class="print-col-alt data-value">${wp.altFeet.toLocaleString('fr-FR')} ft</td>` : ''}
                ${printIndicated ? `<td class="print-col-alt data-value">≈ ${indicatedAltitude.toLocaleString('fr-FR')} ft</td>` : ''}
                <td class="print-col-comment">${(wp.comment || '').replace(/</g, '<').replace(/>/g, '>')}</td>
            </tr>
        `;
    });

    printHtml += '</tbody></table>';

    printContainer.innerHTML = printHtml;
    
    setTimeout(() => {
        window.print();
    }, 100);
}

// --- FONCTIONS MÉTÉO (Open-Meteo) ---

async function handleFetchWeather() {
    const forecastDateTime = document.getElementById('forecast-datetime').value;

    if (!forecastDateTime) {
        alert("Veuillez sélectionner une date et une heure pour la prévision.");
        return;
    }

    const resultsContainer = document.getElementById('weather-results-container');
    resultsContainer.innerHTML = '<div class="loader"></div>';
    lastWeatherAverages = null;

    const extremeWaypoints = getExtremeWaypoints(flightData.waypoints);
    if (extremeWaypoints.length === 0) {
        resultsContainer.innerHTML = '<p class="weather-error">Aucun waypoint à analyser.</p>';
        return;
    }
    
    const latString = extremeWaypoints.map(wp => wp.lat.toFixed(4)).join(',');
    const lonString = extremeWaypoints.map(wp => wp.lon.toFixed(4)).join(',');
    const date = forecastDateTime.split('T')[0];

    const hourlyParams = [
        'pressure_msl',
        'temperature_850hPa',
        'windspeed_850hPa',
        'winddirection_850hPa',
        'temperature_700hPa',
        'windspeed_700hPa',
        'winddirection_700hPa'
    ].join(',');

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latString}&longitude=${lonString}&hourly=${hourlyParams}&start_date=${date}&end_date=${date}&timezone=UTC`;
    
    try {
        const response = await fetch(url);
        const weatherData = await response.json();
        
        if (!response.ok) {
            throw new Error(`Erreur Open-Meteo: ${weatherData.reason || 'Erreur inconnue'}`);
        }

        processAndDisplayWeather(weatherData, forecastDateTime);

    } catch (error) {
        resultsContainer.innerHTML = `<p class="weather-error">Erreur: ${error.message}</p>`;
        console.error("Erreur lors de la récupération des données météo:", error);
    }
}

function calculateStandardIsaTempC(altitudeFt) {
    const ISA_SEA_LEVEL_TEMP_C = 15;
    const LAPSE_RATE_C_PER_1000_FT = 1.98;
    return ISA_SEA_LEVEL_TEMP_C - ((altitudeFt / 1000) * LAPSE_RATE_C_PER_1000_FT);
}

function processAndDisplayWeather(apiData, requestedDateTime) {
    const resultsContainer = document.getElementById('weather-results-container');
    
    if (!Array.isArray(apiData)) {
        console.error("La réponse de l'API n'est pas un tableau:", apiData);
        resultsContainer.innerHTML = `<p class="weather-error">Format de réponse API inattendu.</p>`;
        return;
    }
    
    const allQnh = [], allTempFL050 = [], allTempFL100 = [];
    const allWindSpeedsFL050 = [], allWindDirsFL050 = [];
    const allWindSpeedsFL100 = [], allWindDirsFL100 = [];

    // CORRECTION : Chercher l'heure arrondie, pas l'heure exacte.
    const requestedDate = new Date(requestedDateTime);
    const targetHour = requestedDate.getUTCHours();
    const targetApiTimeString = `T${targetHour.toString().padStart(2, '0')}:00`;

    apiData.forEach(locationData => {
        if (!locationData.hourly || !locationData.hourly.time) {
            console.warn("Données horaires manquantes pour une localisation:", locationData);
            return;
        }
        
        const timeIndex = locationData.hourly.time.findIndex(t => t.endsWith(targetApiTimeString));

        if (timeIndex === -1) {
             console.warn(`Heure ${requestedDate.toISOString().slice(0, 16)} non trouvée pour une localisation.`);
             return;
        }

        allQnh.push(locationData.hourly.pressure_msl[timeIndex]);
        allTempFL050.push(locationData.hourly.temperature_850hPa[timeIndex]);
        allWindSpeedsFL050.push(locationData.hourly.windspeed_850hPa[timeIndex]);
        allWindDirsFL050.push(locationData.hourly.winddirection_850hPa[timeIndex]);
        allTempFL100.push(locationData.hourly.temperature_700hPa[timeIndex]);
        allWindSpeedsFL100.push(locationData.hourly.windspeed_700hPa[timeIndex]);
        allWindDirsFL100.push(locationData.hourly.winddirection_700hPa[timeIndex]);
    });

    if (allQnh.length === 0) {
        resultsContainer.innerHTML = `<p class="weather-error">Aucune donnée météo valide trouvée pour l'heure spécifiée. Essayez une heure ronde (ex: 14:00).</p>`;
        return;
    }

    const average = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    
    const avgQnh = average(allQnh);
    const avgTempFL050 = average(allTempFL050);
    const avgTempFL100 = average(allTempFL100);

    const windFL050 = calculateVectorialWindAverage(allWindSpeedsFL050, allWindDirsFL050);
    const windFL100 = calculateVectorialWindAverage(allWindSpeedsFL100, allWindDirsFL100);
    
    const standardTempFL050 = calculateStandardIsaTempC(5000);
    const isaDeviationFL050 = avgTempFL050 - standardTempFL050;
    const standardTempFL100 = calculateStandardIsaTempC(10000);
    const isaDeviationFL100 = avgTempFL100 - standardTempFL100;

    const formatIsaDeviation = (deviation) => {
        const roundedDev = Math.round(deviation);
        return `ISA ${roundedDev >= 0 ? '+' : ''}${roundedDev}`;
    };
    
    lastWeatherAverages = {
        time: requestedDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + requestedDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + 'Z',
        qnh: Math.round(avgQnh),
        tempFL050: avgTempFL050.toFixed(1),
        isaDevFL050: formatIsaDeviation(isaDeviationFL050),
        windFL050: windFL050,
        tempFL100: avgTempFL100.toFixed(1),
        isaDevFL100: formatIsaDeviation(isaDeviationFL100),
        windFL100: windFL100
    };

    resultsContainer.innerHTML = `
        <div class="weather-results-grid">
            <div class="weather-item">
                <span class="label">QNH Moyen</span>
                <div class="weather-data-row">
                    <span class="value">${lastWeatherAverages.qnh}<span class="unit"> hPa</span></span>
                </div>
            </div>
            <div class="weather-item">
                <span class="label">Conditions Moyennes au FL050</span>
                <div class="weather-data-row">
                    <span class="param-name">Température:</span>
                    <span class="value">${lastWeatherAverages.tempFL050}<span class="unit"> °C</span></span>
                </div>
                <div class="weather-data-row">
                    <span class="param-name">Déviation ISA:</span>
                    <span class="value">${lastWeatherAverages.isaDevFL050}</span>
                </div>
                <div class="weather-data-row">
                    <span class="param-name">Vent:</span>
                    <span class="value">${lastWeatherAverages.windFL050.dir}° / ${lastWeatherAverages.windFL050.kts}<span class="unit"> KT</span></span>
                </div>
            </div>
            <div class="weather-item">
                <span class="label">Conditions Moyennes au FL100</span>
                <div class="weather-data-row">
                    <span class="param-name">Température:</span>
                    <span class="value">${lastWeatherAverages.tempFL100}<span class="unit"> °C</span></span>
                </div>
                 <div class="weather-data-row">
                    <span class="param-name">Déviation ISA:</span>
                    <span class="value">${lastWeatherAverages.isaDevFL100}</span>
                </div>
                 <div class="weather-data-row">
                    <span class="param-name">Vent:</span>
                    <span class="value">${lastWeatherAverages.windFL100.dir}° / ${lastWeatherAverages.windFL100.kts}<span class="unit"> KT</span></span>
                </div>
            </div>
        </div>
    `;
}

function calculateVectorialWindAverage(speeds, directions) {
    let sumU = 0, sumV = 0;
    const KMH_TO_KTS = 0.539957;

    for (let i = 0; i < speeds.length; i++) {
        const speedKts = speeds[i] * KMH_TO_KTS;
        const angleRad = directions[i] * Math.PI / 180;
        sumU += speedKts * Math.sin(angleRad);
        sumV += speedKts * Math.cos(angleRad);
    }
    
    const avgU = sumU / speeds.length;
    const avgV = sumV / speeds.length;

    const avgWindSpeedKts = Math.sqrt(avgU * avgU + avgV * avgV);
    
    let avgWindDir = (Math.atan2(avgU, avgV) * 180 / Math.PI);
    if (avgWindDir < 0) avgWindDir += 360;

    return {
        dir: String(Math.round(avgWindDir)).padStart(3, '0'),
        kts: Math.round(avgWindSpeedKts)
    };
}


// --- FONCTIONS DE GESTION DE LA DZ ---

function calculateTOT(targetIndex) {
    if (targetIndex === 0) {
        const [startHours, startMinutes] = navStartTime.split(':').map(Number);
        const startDate = new Date();
        startDate.setUTCHours(startHours, startMinutes, 0, 0);
        return startDate;
    }

    let totalDistance = 0;
    for (let i = 0; i < targetIndex; i++) {
        const wp1 = flightData.waypoints[i];
        const wp2 = flightData.waypoints[i + 1];
        totalDistance += calculateDistanceNM(wp1.lat, wp1.lon, wp2.lat, wp2.lon);
    }

    const flightTimeHours = totalDistance / avgGroundSpeed;
    const flightTimeMillis = flightTimeHours * 60 * 60 * 1000;

    const [startHours, startMinutes] = navStartTime.split(':').map(Number);
    const startDate = new Date();
    startDate.setUTCHours(startHours, startMinutes, 0, 0);

    return new Date(startDate.getTime() + flightTimeMillis);
}


function handleDzButtonClick(button) {
    currentlyEditingDzIndex = parseInt(button.dataset.index, 10);
    const waypoint = flightData.waypoints[currentlyEditingDzIndex];
    const modal = document.getElementById('dz-options-modal');

    const totDate = calculateTOT(currentlyEditingDzIndex);
    const totHours = totDate.getUTCHours().toString().padStart(2, '0');
    const totMinutes = totDate.getUTCMinutes().toString().padStart(2, '0');
    document.getElementById('dz-tot').value = `${totHours}:${totMinutes} Z`;

    const dzData = waypoint.dzData || {};

    // Gérer dynamiquement les options de CARP
    const carpSelect = document.getElementById('dz-carp');
    const currentWpCarp = dzData.carp;

    const usedCarpsByOthers = new Set(
        flightData.waypoints
            .filter((wp, index) => index !== currentlyEditingDzIndex && wp.dzData && wp.dzData.carp)
            .map(wp => wp.dzData.carp)
    );

    const allCarpOptions = ['CARP01', 'CARP02', 'CARP03', 'CARP04', 'CARP05'];
    carpSelect.innerHTML = ''; // Vider les options existantes

    allCarpOptions.forEach(carp => {
        // Ajouter l'option si c'est celle de ce WP ou si elle n'est pas utilisée ailleurs
        if (carp === currentWpCarp || !usedCarpsByOthers.has(carp)) {
            const option = document.createElement('option');
            option.value = carp;
            option.textContent = carp;
            carpSelect.appendChild(option);
        }
    });

    // Sélectionner la valeur actuelle ou la première disponible
    carpSelect.value = currentWpCarp || (carpSelect.options.length > 0 ? carpSelect.options[0].value : '');
    
    document.getElementById('dz-le-te').value = dzData.leTe || 600;
    document.getElementById('dz-le-pi').value = dzData.lePi || 0;
    document.getElementById('dz-run-in').value = dzData.runInCourse || 0;
    document.getElementById('dz-tp').value = dzData.tp || 2;
    document.getElementById('dz-sd-stab-select').value = dzData.sdStabType || 'STAB';
    document.getElementById('dz-sd-stab-value').value = dzData.sdStabValue || 1;
    document.getElementById('dz-esc').value = dzData.dzEsc || 0.1;
    document.getElementById('dz-altitude').value = dzData.zt || 1000;

    const dropHeight = dzData.h || 984;
    const dropHeightSelect = document.getElementById('dz-drop-height-select');
    const dropHeightCustom = document.getElementById('dz-drop-height-custom');
    if (dropHeight == 984 || dropHeight == 1312) {
        dropHeightSelect.value = dropHeight;
        dropHeightCustom.style.display = 'none';
    } else {
        dropHeightSelect.value = 'custom';
        dropHeightCustom.style.display = 'inline-block';
    }
    dropHeightCustom.value = dropHeight;
    
    document.getElementById('dz-weather-results').innerHTML = '<p>Cliquez sur "Récupérer la météo".</p>';
    modal.style.display = 'flex';
}

async function fetchDzWeather() {
    const waypoint = flightData.waypoints[currentlyEditingDzIndex];
    if (!waypoint) return;

    const resultsContainer = document.getElementById('dz-weather-results');
    resultsContainer.innerHTML = '<div class="loader"></div>';

    const zt = parseInt(document.getElementById('dz-altitude').value, 10);
    const altVraie = waypoint.altFeet;
    const totDate = calculateTOT(currentlyEditingDzIndex);
    const totDateString = totDate.toISOString().split('T')[0]; // "YYYY-MM-DD"

    const sfc_url = `https://api.open-meteo.com/v1/forecast?latitude=${waypoint.lat.toFixed(4)}&longitude=${waypoint.lon.toFixed(4)}&hourly=temperature_2m,pressure_msl,windspeed_10m,winddirection_10m&elevation=${(zt * FEET_TO_METERS).toFixed(0)}&start_date=${totDateString}&end_date=${totDateString}&timezone=UTC`;
    const alt_url = `https://api.open-meteo.com/v1/forecast?latitude=${waypoint.lat.toFixed(4)}&longitude=${waypoint.lon.toFixed(4)}&hourly=temperature_700hPa,windspeed_700hPa,winddirection_700hPa,temperature_850hPa,windspeed_850hPa,winddirection_850hPa&start_date=${totDateString}&end_date=${totDateString}&timezone=UTC`;

    try {
        const [sfcResponse, altResponse] = await Promise.all([fetch(sfc_url), fetch(alt_url)]);
        const sfcData = await sfcResponse.json();
        const altData = await altResponse.json();
        
        if (!sfcResponse.ok || !altResponse.ok) {
            console.error("SFC Error:", sfcData, "ALT Error:", altData);
            throw new Error("Erreur de l'API Météo");
        }
        
        const totHour = totDate.getUTCHours();
        const targetApiTimeString = `T${totHour.toString().padStart(2, '0')}:00`;
        const timeIndex = sfcData.hourly.time.findIndex(t => t.endsWith(targetApiTimeString));

        if (timeIndex === -1) {
            console.error("Could not find time. TOT Date:", totDate, "Target API time string:", targetApiTimeString, "API times:", sfcData.hourly.time);
            throw new Error("Heure du TOT non trouvée dans les prévisions.");
        }
        
        const sfcWindDir = sfcData.hourly.winddirection_10m[timeIndex];
        const sfcWindKts = (sfcData.hourly.windspeed_10m[timeIndex] * 0.539957).toFixed(0);
        const sfcWind = `${sfcWindDir}°/${sfcWindKts}kt`;
        const sfcTemp = Math.round(sfcData.hourly.temperature_2m[timeIndex]) + '°C';
        const qnh = sfcData.hourly.pressure_msl[timeIndex].toFixed(0) + ' hPa';

        const isHighAlt = altVraie > 7500;
        const altWindDir = isHighAlt ? altData.hourly.winddirection_700hPa[timeIndex] : altData.hourly.winddirection_850hPa[timeIndex];
        const altWindKmh = isHighAlt ? altData.hourly.windspeed_700hPa[timeIndex] : altData.hourly.windspeed_850hPa[timeIndex];
        const altTempVal = isHighAlt ? altData.hourly.temperature_700hPa[timeIndex] : altData.hourly.temperature_850hPa[timeIndex];
        
        const altWind = `${altWindDir}°/${(altWindKmh * 0.539957).toFixed(0)}kt`;
        const altTemp = Math.round(altTempVal) + '°C';

        resultsContainer.innerHTML = `
            <span>ALT WIND: <span class="value">${altWind}</span></span>
            <span>ALT T°C: <span class="value">${altTemp}</span></span>
            <span>SFC WIND: <span class="value">${sfcWind}</span></span>
            <span>SFC T°C: <span class="value">${sfcTemp}</span></span>
            <span style="grid-column: 1 / -1;">QNH: <span class="value">${qnh}</span></span>
        `;
        
        if (!waypoint.dzData) waypoint.dzData = {};
        waypoint.dzData.weather = { altWind, altTemp, sfcWind, sfcTemp, qnh };

    } catch (error) {
        resultsContainer.innerHTML = `<p class="weather-error" style="grid-column: 1 / -1;">Erreur: ${error.message}</p>`;
        console.error("Fetch DZ Weather Error:", error);
    }
}


function handleSaveDzData() {
    if (currentlyEditingDzIndex < 0) return;
    const waypoint = flightData.waypoints[currentlyEditingDzIndex];

    const sdStabSelect = document.getElementById('dz-sd-stab-select');
    const dropHeightSelect = document.getElementById('dz-drop-height-select');
    
    if (!waypoint.dzData) waypoint.dzData = {};

    const dzData = {
        carp: document.getElementById('dz-carp').value,
        tot: document.getElementById('dz-tot').value,
        leTe: document.getElementById('dz-le-te').value,
        lePi: document.getElementById('dz-le-pi').value,
        runInCourse: document.getElementById('dz-run-in').value,
        tp: document.getElementById('dz-tp').value,
        sdStabType: sdStabSelect.value,
        sdStabValue: document.getElementById('dz-sd-stab-value').value,
        dzEsc: document.getElementById('dz-esc').value,
        zt: document.getElementById('dz-altitude').value,
        h: (dropHeightSelect.value === 'custom' ? document.getElementById('dz-drop-height-custom').value : dropHeightSelect.value),
        weather: waypoint.dzData.weather || {}
    };

    waypoint.dzData = dzData;

    const weather = dzData.weather;
    const weatherSfcWind = weather.sfcWind || 'N/A';
    const weatherSfcTemp = weather.sfcTemp || 'N/A';
    const weatherQnh = (weather.qnh || 'N/A').replace(' hPa', '');
    
    const dzComment = `--- DZ INFO ---
${dzData.carp} | TOT: ${dzData.tot}
LE-TE: ${dzData.leTe}m | LE-PI: ${dzData.lePi}m
Run-in Course: ${dzData.runInCourse}°
TP: ${dzData.tp}Nm | ${dzData.sdStabType}: ${dzData.sdStabValue}Nm | DZ ESC: ${dzData.dzEsc}Nm
ALT WIND=${weather.altWind || 'N/A'} | ALT T°C=${weather.altTemp || 'N/A'}
SFC WIND=${weatherSfcWind} | SFC T°C=${weatherSfcTemp}
QNH=${weatherQnh} | Zt: ${dzData.zt}ft | H: ${dzData.h}ft
--- END DZ ---`;

    let existingComment = waypoint.comment || '';
    const dzRegex = /\n?--- DZ INFO ---[\s\S]*?--- END DZ ---/g;
    existingComment = existingComment.replace(dzRegex, '').trim();
    
    waypoint.comment = (existingComment ? existingComment + '\n' : '') + dzComment;

    document.getElementById('dz-options-modal').style.display = 'none';
    populateLogTable();
    currentlyEditingDzIndex = -1;
}