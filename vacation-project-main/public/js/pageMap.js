import { saveEntries } from './state.js';
import { showToast } from './utils.js';

const activeMaps = new Map();

export const MAP_EMOJIS = [
  '\uD83D\uDCCD', '\u2708\uFE0F', '\uD83C\uDFD6\uFE0F', '\u2615', '\uD83C\uDFD5\uFE0F', '\uD83C\uDFE8',
  '\uD83C\uDF5C', '\uD83C\uDFA1', '\uD83D\uDE86', '\uD83C\uDF38', '\uD83D\uDCF8', '\uD83C\uDF70',
  '\u26FA', '\uD83C\uDF32', '\u26F5', '\uD83C\uDF55', '\uD83C\uDF66', '\uD83C\uDFA8',
  '\uD83C\uDFF0', '\uD83D\uDECD\uFE0F', '\uD83D\uDE97', '\u26F0\uFE0F', '\uD83D\uDEB2', '\uD83C\uDF63',
  '\uD83C\uDF7B', '\uD83C\uDF1F', '\uD83D\uDC96', '\uD83D\uDC3E'
];

export const MAP_COLORS = [
  '#ec4899', '#8b5cf6', '#06b6d4', '#10b981',
  '#f59e0b', '#ef4444', '#6366f1', '#f97316', '#334155'
];

const MAP_STYLES = {
  osm:      { name: '\uAE30\uBCF8 \uC9C0\uB3C4', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',                         attribution: '\u00A9 OpenStreetMap' },
  hot:      { name: '\uC5EC\uD589 \uD14C\uB9C8', url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',                       attribution: '\u00A9 OpenStreetMap, Tiles: HOT' },
  topo:     { name: '\uC9C0\uD615 \uC9C0\uB3C4', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',                            attribution: '\u00A9 OpenTopoMap' },
  cycle:    { name: '\uC790\uC804\uAC70 \uC9C0\uB3C4', url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',     attribution: '\u00A9 CyclOSM' }
};

/* ================================================================
   Public API
   ================================================================ */

export function destroyPageMap(pageId) {
  const entry = activeMaps.get(pageId);
  if (entry) {
    try { entry.map.remove(); } catch (_) {}
    activeMaps.delete(pageId);
  }
}

export function initPageMap(container, pageData) {
  const pageId = pageData.id;
  destroyPageMap(pageId);

  if (!Array.isArray(pageData.mapLocations)) pageData.mapLocations = [];

  var savedStyle = pageData.mapStyle || 'osm';
  var styleKey = MAP_STYLES[savedStyle] ? savedStyle : 'osm';

  // ---- Build DOM ------------------------------------------------
  container.innerHTML = buildMapHTML(pageId, pageData, styleKey);

  const mapEl = container.querySelector('#leaflet-map-' + pageId);

  // ---- Boot Leaflet after layout settles -------------------------
  // Leaflet needs a container with a real pixel height.
  // The canvas gets its height via flex, which resolves asynchronously.
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      if (!mapEl.isConnected) return;
      bootLeaflet(container, mapEl, pageData, pageId, styleKey);
    });
  });
}

/* ================================================================
   Internal helpers
   ================================================================ */

function buildMapHTML(pageId, pageData, styleKey) {
  var locCount = pageData.mapLocations.length;
  var countText = locCount > 0
    ? locCount + '\uAC1C\uC758 \uC7A5\uC18C'
    : '\uACBD\uB85C \uB9CC\uB4E4\uAE30 (\uD074\uB9AD\uD558\uC5EC \uCD94\uAC00)';

  var styleButtons = Object.keys(MAP_STYLES).map(function (k) {
    var s = MAP_STYLES[k];
    var cls = k === styleKey ? 'style-opt active' : 'style-opt';
    return '<button class="' + cls + '" data-style="' + k + '">' + s.name + '</button>';
  }).join('');

  return ''
    + '<div class="diary-map-header">'
    +   '<div class="diary-map-title">'
    +     '<span class="diary-map-icon">\uD83D\uDDFA\uFE0F</span>'
    +     '<span class="diary-map-count" id="loc-count-' + pageId + '">' + countText + '</span>'
    +   '</div>'
    +   '<div class="diary-map-actions">'
    +     '<button class="btn-map-action" id="btn-search-' + pageId + '" title="\uC7A5\uC18C \uAC80\uC0C9">\uD83D\uDD0D</button>'
    +     '<button class="btn-map-action" id="btn-gps-' + pageId + '" title="\uB0B4 \uC704\uCE58">\uD83C\uDFAF</button>'
    +     '<div class="map-style-dropdown-wrap">'
    +       '<button class="btn-map-action" id="btn-style-' + pageId + '" title="\uD14C\uB9C8 \uBCC0\uACBD">\uD83C\uDFA8</button>'
    +       '<div class="map-style-dropdown hidden" id="style-drop-' + pageId + '">' + styleButtons + '</div>'
    +     '</div>'
    +     '<button class="btn-map-action" id="btn-toggle-size-' + pageId + '" title="\uC9C0\uB3C4 \uD06C\uAE30 \uC870\uC808">\u2195\uFE0F</button>'
    +   '</div>'
    + '</div>'
    + '<div class="diary-map-search hidden" id="search-bar-' + pageId + '">'
    +   '<input type="text" class="map-search-input" id="search-input-' + pageId + '" placeholder="\uC7A5\uC18C \uAC80\uC0C9 (\uC608: \uC81C\uC8FC\uB3C4, \uB3C4\uCFC4\uC5ED)..." autocomplete="off" />'
    +   '<button class="btn-map-close-search" id="btn-close-search-' + pageId + '">\u2715</button>'
    +   '<div class="map-search-results" id="search-results-' + pageId + '"></div>'
    + '</div>'
    + '<div class="diary-map-canvas" id="leaflet-map-' + pageId + '"></div>';
}

function bootLeaflet(container, mapEl, pageData, pageId, styleKey) {
  // Leaflet REQUIRES the container to have a non-zero pixel height.
  // Compute it explicitly from the parent to be 100% safe.
  var headerEl = container.querySelector('.diary-map-header');
  var headerH = headerEl ? headerEl.offsetHeight : 42;
  var canvasH = container.offsetHeight - headerH;
  if (canvasH < 50) canvasH = 200; // fallback
  mapEl.style.height = canvasH + 'px';

  var map = L.map(mapEl, { zoomControl: false, attributionControl: false });
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  var tileLayer = L.tileLayer(MAP_STYLES[styleKey].url, {
    maxZoom: 19,
    attribution: MAP_STYLES[styleKey].attribution
  }).addTo(map);

  var routeLayer = L.featureGroup().addTo(map);
  activeMaps.set(pageId, { map: map, tileLayer: tileLayer, routeLayer: routeLayer, pageData: pageData });

  // default view (Seoul)
  map.setView([37.5665, 126.9780], 7);

  // force size recalc after Leaflet pane is positioned
  setTimeout(function () { try { map.invalidateSize(); } catch (_) {} }, 50);

  // ---- renderMarkers --------------------------------------------
  function renderMarkers() {
    routeLayer.clearLayers();
    var latlngs = [];

    pageData.mapLocations.forEach(function (loc, index) {
      latlngs.push([loc.lat, loc.lng]);
      var emoji = loc.emoji || '\uD83D\uDCCD';
      var color = loc.color || '#ec4899';

      var iconHtml = ''
        + '<div class="custom-map-pin" style="--pin-color:' + color + '">'
        +   '<div class="pin-pulse"></div>'
        +   '<div class="pin-badge">' + (index + 1) + '</div>'
        +   '<div class="pin-emoji">' + emoji + '</div>'
        + '</div>';

      var customIcon = L.divIcon({
        className: 'custom-leaflet-icon',
        html: iconHtml,
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        popupAnchor: [0, -40]
      });

      var marker = L.marker([loc.lat, loc.lng], { icon: customIcon, draggable: true });

      // popup
      var popEl = document.createElement('div');
      popEl.className = 'custom-map-popup';
      popEl.innerHTML = ''
        + '<div class="popup-title">' + (loc.placeName || '\uC774\uB984 \uC5C6\uB294 \uC7A5\uC18C') + '</div>'
        + (loc.note ? '<div class="popup-note">' + loc.note + '</div>' : '')
        + '<div class="popup-addr">' + (loc.address || '') + '</div>'
        + '<div class="popup-actions">'
        +   '<button class="btn-popup edit-btn">\uC218\uC815</button>'
        +   '<button class="btn-popup delete-btn">\uC0AD\uC81C</button>'
        + '</div>';

      popEl.querySelector('.edit-btn').addEventListener('click', function () {
        openLocationEditor(pageId, index, renderMarkers);
      });
      popEl.querySelector('.delete-btn').addEventListener('click', function () {
        if (confirm('\uC774 \uC7A5\uC18C\uB97C \uACBD\uB85C\uC5D0\uC11C \uC0AD\uC81C\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?')) {
          pageData.mapLocations.splice(index, 1);
          saveEntries();
          renderMarkers();
        }
      });

      marker.bindPopup(popEl, { minWidth: 200, closeButton: false });

      marker.on('dragend', function (e) {
        var pos = e.target.getLatLng();
        loc.lat = pos.lat;
        loc.lng = pos.lng;
        fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + pos.lat + '&lon=' + pos.lng)
          .then(function (r) { return r.json(); })
          .then(function (data) { if (data && data.display_name) loc.address = data.display_name; })
          .catch(function () {})
          .finally(function () { saveEntries(); renderMarkers(); });
      });

      routeLayer.addLayer(marker);
    });

    // polyline
    if (latlngs.length > 1) {
      L.polyline(latlngs, {
        color: '#8b5cf6', weight: 4,
        dashArray: '8, 8', lineCap: 'round', lineJoin: 'round'
      }).addTo(routeLayer);
    }

    if (latlngs.length > 0) {
      map.fitBounds(routeLayer.getBounds(), { padding: [50, 50], maxZoom: 16 });
    } else {
      map.setView([37.5665, 126.9780], 7);
    }

    var countEl = container.querySelector('#loc-count-' + pageId);
    if (countEl) {
      countEl.textContent = pageData.mapLocations.length > 0
        ? pageData.mapLocations.length + '\uAC1C\uC758 \uC7A5\uC18C'
        : '\uACBD\uB85C \uB9CC\uB4E4\uAE30 (\uD074\uB9AD\uD558\uC5EC \uCD94\uAC00)';
    }
  }

  renderMarkers();

  // ---- UI Events ------------------------------------------------
  // toggle size
  container.querySelector('#btn-toggle-size-' + pageId).addEventListener('click', function () {
    container.classList.toggle('expanded');
    setTimeout(function () {
      map.invalidateSize();
      // recalculate canvas height for new container size
      var hdr = container.querySelector('.diary-map-header');
      var hH = hdr ? hdr.offsetHeight : 42;
      var cH = container.offsetHeight - hH;
      if (cH < 50) cH = 200;
      mapEl.style.height = cH + 'px';
      map.invalidateSize();
      if (pageData.mapLocations.length > 0) {
        map.fitBounds(routeLayer.getBounds(), { padding: [50, 50], maxZoom: 16 });
      }
    }, 350);
  });

  // style dropdown
  var btnStyle = container.querySelector('#btn-style-' + pageId);
  var styleDrop = container.querySelector('#style-drop-' + pageId);
  btnStyle.addEventListener('click', function (e) { e.stopPropagation(); styleDrop.classList.toggle('hidden'); });
  document.addEventListener('click', function () { styleDrop.classList.add('hidden'); });
  styleDrop.querySelectorAll('.style-opt').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      var sk = e.target.dataset.style;
      pageData.mapStyle = sk;
      saveEntries();
      map.removeLayer(tileLayer);
      tileLayer = L.tileLayer(MAP_STYLES[sk].url, { maxZoom: 19, attribution: MAP_STYLES[sk].attribution }).addTo(map);
      styleDrop.querySelectorAll('.style-opt').forEach(function (b) { b.classList.remove('active'); });
      e.target.classList.add('active');
    });
  });

  // GPS
  container.querySelector('#btn-gps-' + pageId).addEventListener('click', function () {
    if (!navigator.geolocation) { showToast('GPS\uB97C \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uBE0C\uB77C\uC6B0\uC800\uC785\uB2C8\uB2E4.'); return; }
    showToast('\uC704\uCE58\uB97C \uCC3E\uB294 \uC911...');
    navigator.geolocation.getCurrentPosition(function (pos) {
      var lat = pos.coords.latitude, lng = pos.coords.longitude;
      map.flyTo([lat, lng], 15);
      addLocation(pageId, lat, lng, renderMarkers);
    }, function () { showToast('\uC704\uCE58\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.'); });
  });

  // search
  var searchBar = container.querySelector('#search-bar-' + pageId);
  var searchInput = container.querySelector('#search-input-' + pageId);
  var searchResults = container.querySelector('#search-results-' + pageId);
  container.querySelector('#btn-search-' + pageId).addEventListener('click', function () {
    searchBar.classList.remove('hidden');
    searchInput.focus();
  });
  container.querySelector('#btn-close-search-' + pageId).addEventListener('click', function () {
    searchBar.classList.add('hidden');
    searchResults.innerHTML = '';
    searchInput.value = '';
  });

  var searchTimeout;
  searchInput.addEventListener('input', function (e) {
    var q = e.target.value.trim();
    clearTimeout(searchTimeout);
    if (!q) { searchResults.innerHTML = ''; return; }
    searchTimeout = setTimeout(function () {
      fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(q) + '&limit=5')
        .then(function (r) { return r.json(); })
        .then(function (data) {
          searchResults.innerHTML = data.length === 0
            ? '<div class="no-result">\uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</div>' : '';
          data.forEach(function (item) {
            var div = document.createElement('div');
            div.className = 'search-result-item';
            div.innerHTML = '<div class="res-name">' + item.display_name.split(',')[0] + '</div>'
              + '<div class="res-addr">' + item.display_name + '</div>';
            div.addEventListener('click', function () {
              var lat = parseFloat(item.lat), lng = parseFloat(item.lon);
              map.flyTo([lat, lng], 15);
              searchBar.classList.add('hidden');
              searchResults.innerHTML = '';
              searchInput.value = '';
              pageData.mapLocations.push({
                lat: lat, lng: lng,
                placeName: item.display_name.split(',')[0],
                address: item.display_name,
                note: '', emoji: '\uD83D\uDCCD', color: '#8b5cf6'
              });
              saveEntries();
              renderMarkers();
              openLocationEditor(pageId, pageData.mapLocations.length - 1, renderMarkers);
            });
            searchResults.appendChild(div);
          });
        })
        .catch(function () {
          searchResults.innerHTML = '<div class="no-result">\uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.</div>';
        });
    }, 500);
  });

  // click map to add
  map.on('click', function (e) {
    addLocation(pageId, e.latlng.lat, e.latlng.lng, renderMarkers);
  });

  // ResizeObserver for ongoing layout shifts — delayed to avoid race with Leaflet pane init
  if (typeof ResizeObserver !== 'undefined') {
    setTimeout(function () {
      if (!activeMaps.has(pageId)) return;
      var ro = new ResizeObserver(function () {
        try { map.invalidateSize(); } catch (_) {}
      });
      ro.observe(mapEl);
    }, 200);
  }
}

/* ================================================================
   Add location helper
   ================================================================ */
function addLocation(pageId, lat, lng, renderCallback) {
  var entry = activeMaps.get(pageId);
  if (!entry) return;
  var pageData = entry.pageData;

  var placeName = '\uC0C8\uB85C\uC6B4 \uC7A5\uC18C';
  var address = '';

  fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng)
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.display_name) {
        address = data.display_name;
        placeName = address.split(',')[0];
      }
    })
    .catch(function () {})
    .finally(function () {
      pageData.mapLocations.push({
        lat: lat, lng: lng,
        placeName: placeName, address: address,
        note: '', emoji: '\uD83D\uDCCD', color: '#8b5cf6'
      });
      saveEntries();
      renderCallback();
      openLocationEditor(pageId, pageData.mapLocations.length - 1, renderCallback);
    });
}

/* ================================================================
   Location editor modal
   ================================================================ */
export function openLocationEditor(pageId, locIndex, renderCallback) {
  var entry = activeMaps.get(pageId);
  if (!entry) return;
  var loc = entry.pageData.mapLocations[locIndex];
  if (!loc) return;

  var modal = document.getElementById('map-loc-editor-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'map-loc-editor-modal';
    modal.className = 'app-dialog-overlay';
    document.body.appendChild(modal);
  }

  var emojiButtons = MAP_EMOJIS.map(function (e) {
    var cls = e === loc.emoji ? 'emoji-opt active' : 'emoji-opt';
    return '<button class="' + cls + '">' + e + '</button>';
  }).join('');

  var colorButtons = MAP_COLORS.map(function (c) {
    var cls = c === loc.color ? 'color-opt active' : 'color-opt';
    return '<button class="' + cls + '" style="background:' + c + '" data-color="' + c + '"></button>';
  }).join('');

  modal.innerHTML = ''
    + '<div class="map-loc-panel glass-panel">'
    +   '<h3>\uC7A5\uC18C \uC0C1\uC138 \uC815\uBCF4</h3>'
    +   '<div class="form-group"><label>\uC7A5\uC18C \uC774\uB984</label>'
    +     '<input type="text" id="loc-name-input" class="text-input" value="' + (loc.placeName || '') + '" /></div>'
    +   '<div class="form-group"><label>\uBA54\uBAA8</label>'
    +     '<input type="text" id="loc-note-input" class="text-input" value="' + (loc.note || '') + '" placeholder="\uAC04\uB2E8\uD55C \uBA54\uBAA8\uB97C \uB0A8\uACA8\uBCF4\uC138\uC694" /></div>'
    +   '<div class="form-group"><label>\uB9C8\uCEE4 \uC774\uBAA8\uC9C0</label>'
    +     '<div class="emoji-picker-grid">' + emojiButtons + '</div></div>'
    +   '<div class="form-group"><label>\uB9C8\uCEE4 \uD14C\uB9C8 \uC0C9\uC0C1</label>'
    +     '<div class="color-picker-flex">' + colorButtons + '</div></div>'
    +   '<div class="app-dialog-actions">'
    +     '<button class="btn-secondary" id="btn-loc-cancel">\uCDE8\uC18C</button>'
    +     '<button class="btn-primary" id="btn-loc-save">\uC800\uC7A5</button>'
    +   '</div>'
    + '</div>';

  modal.classList.remove('hidden');

  var selectedEmoji = loc.emoji || '\uD83D\uDCCD';
  var selectedColor = loc.color || '#ec4899';

  modal.querySelectorAll('.emoji-opt').forEach(function (btn) {
    btn.onclick = function () {
      modal.querySelectorAll('.emoji-opt').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      selectedEmoji = btn.textContent;
    };
  });

  modal.querySelectorAll('.color-opt').forEach(function (btn) {
    btn.onclick = function () {
      modal.querySelectorAll('.color-opt').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      selectedColor = btn.dataset.color;
    };
  });

  modal.querySelector('#btn-loc-cancel').onclick = function () { modal.classList.add('hidden'); };

  modal.querySelector('#btn-loc-save').onclick = function () {
    loc.placeName = modal.querySelector('#loc-name-input').value.trim();
    loc.note = modal.querySelector('#loc-note-input').value.trim();
    loc.emoji = selectedEmoji;
    loc.color = selectedColor;
    saveEntries();
    modal.classList.add('hidden');
    if (renderCallback) renderCallback();
  };
}
