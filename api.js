/* ═══════════════════════════════════════════════════════════════
   SafeSignal — Backend Integration
   Drop this file next to your index.html and add:
   <script src="api.js"></script>  just before </body>
   ═══════════════════════════════════════════════════════════════ */

const BASE_URL = 'https://safesignal-backend-sasp.onrender.com';

/* ─────────────────────────────────────────────────────────────
   AUTH — stores token + user_id in localStorage after login
   ───────────────────────────────────────────────────────────── */
const Auth = {
  getToken()  { return localStorage.getItem('ss_token'); },
  getUserId() { return localStorage.getItem('ss_user_id'); },
  isLoggedIn(){ return !!this.getToken(); },
  save(token, user) {
    localStorage.setItem('ss_token',   token);
    localStorage.setItem('ss_user_id', user.id);
    localStorage.setItem('ss_user',    JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem('ss_token');
    localStorage.removeItem('ss_user_id');
    localStorage.removeItem('ss_user');
  }
};

/* ─────────────────────────────────────────────────────────────
   CORE FETCH HELPER
   ───────────────────────────────────────────────────────────── */
async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (Auth.getToken()) headers['Authorization'] = `Bearer ${Auth.getToken()}`;
  const res = await fetch(BASE_URL + path, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/* ═══════════════════════════════════════════════════════════════
   1. AI CHAT  —  powered by Google Gemini 1.5 Flash
   ═══════════════════════════════════════════════════════════════
   HOW TO WIRE IT:
   In your existing sendChat() function, replace:
     setTimeout(()=>appendMsg(matchResponse(val),'bot'),700);
   with:
     sendChatToBackend(val);
   ─────────────────────────────────────────────────────────────── */
const GEMINI_API_KEY = 'AIzaSyAkL2_ThVpfWW4JZtnVBCbBXrZu1WGNwdI';

async function sendChatToBackend(userMessage) {
  const msgs = document.getElementById('chatMessages');
  const typingId = 'typing-' + Date.now();
  msgs.innerHTML += `<div class="msg bot" id="${typingId}">
    <div class="msg-bubble" style="color:var(--muted);font-style:italic">⏳ Gemini AI is thinking...</div>
  </div>`;
  msgs.scrollTop = msgs.scrollHeight;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are SafeSignal's emergency AI assistant for Indian users.
Give clear, calm, step-by-step guidance. Keep responses concise and actionable.
User emergency query: ${userMessage}`
            }]
          }]
        })
      }
    );

    const data = await res.json();
    document.getElementById(typingId)?.remove();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) throw new Error('No response from Gemini');
    appendMsg(reply, 'bot');
  } catch (err) {
    document.getElementById(typingId)?.remove();
    appendMsg('⚠️ AI unavailable. Please try again.', 'bot');
    console.error('Gemini error:', err);
  }
}

/* ═══════════════════════════════════════════════════════════════
   2. INCIDENT REPORTS
   ═══════════════════════════════════════════════════════════════
   HOW TO WIRE IT:
   In your submitReport() function, replace everything inside
   the function with: submitReportToBackend();
   ─────────────────────────────────────────────────────────────── */
async function submitReportToBackend() {
  const title = document.getElementById('reportTitle').value.trim();
  const desc  = document.getElementById('reportDesc').value.trim();

  if (!selType) { alert('Please select an incident type.'); return; }
  if (!title)   { alert('Please enter an incident title.'); return; }

  // Get coordinates from the location text shown on screen
  const locText = document.getElementById('locText').textContent;
  const coords  = locText.match(/([-\d.]+),\s*([-\d.]+)/);
  const lat = coords ? parseFloat(coords[1]) : null;
  const lng = coords ? parseFloat(coords[2]) : null;

  const btn = document.querySelector('.report-submit-btn');
  btn.textContent = 'SUBMITTING...';
  btn.disabled = true;

  try {
    const payload = {
      user_id:     Auth.getUserId() || null,
      type:        selType.toLowerCase(),
      title,
      description: desc,
      severity:    selSev,
      lat,
      lng
    };

    await apiFetch('/api/incidents', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    // Add to the on-screen feed (same as before, but now also saved to DB)
    const feed   = document.getElementById('reportFeed');
    const colors = { high: 'var(--red)', med: 'var(--amber)', low: 'var(--green)' };
    feed.insertAdjacentHTML('afterbegin', `
      <div class="report-item" style="border-color:rgba(16,185,129,0.3)">
        <div class="ri-badge" style="background:${colors[selSev]}"></div>
        <div class="ri-body">
          <div class="ri-title">${selType} — ${title}</div>
          <div class="ri-meta">
            <span>📍 ${lat ? lat.toFixed(4) + ', ' + lng.toFixed(4) : 'Your location'}</span>
            <span>⏱ Just now</span>
          </div>
        </div>
        <span class="ri-sev ${selSev}">${selSev.toUpperCase()}</span>
      </div>`);

    document.getElementById('reportTitle').value = '';
    document.getElementById('reportDesc').value   = '';
    alert('✅ Report submitted! Nearby users and authorities have been alerted.');

  } catch (err) {
    alert('❌ Failed to submit report: ' + err.message);
    console.error('Report error:', err);
  } finally {
    btn.textContent = 'SUBMIT REPORT';
    btn.disabled    = false;
  }
}

/* Load recent incidents from backend into the report feed */
async function loadRecentIncidents() {
  try {
    const incidents = await apiFetch('/api/incidents');
    const feed = document.getElementById('reportFeed');
    if (!incidents.length) return;

    feed.innerHTML = ''; // Clear hardcoded mock data
    const colors = { high: 'var(--red)', med: 'var(--amber)', medium: 'var(--amber)', low: 'var(--green)' };

    incidents.forEach(inc => {
      const sev   = (inc.severity || 'med').toLowerCase();
      const ago   = timeAgo(inc.created_at);
      feed.insertAdjacentHTML('beforeend', `
        <div class="report-item">
          <div class="ri-badge" style="background:${colors[sev] || 'var(--amber)'}"></div>
          <div class="ri-body">
            <div class="ri-title">${inc.type ? inc.type + ' — ' : ''}${inc.title}</div>
            <div class="ri-meta">
              <span>📍 ${inc.lat ? inc.lat.toFixed(4) + ', ' + inc.lng.toFixed(4) : 'Unknown location'}</span>
              <span>⏱ ${ago}</span>
            </div>
          </div>
          <span class="ri-sev ${sev}">${sev.toUpperCase()}</span>
        </div>`);
    });
  } catch (err) {
    const feed = document.getElementById('reportFeed');
    if (feed) feed.innerHTML = '<div style="color:var(--muted);font-size:0.85rem;padding:1rem">No community reports yet. Be the first to report!</div>';
    console.warn('Could not load incidents:', err.message);
  }
}

/* ═══════════════════════════════════════════════════════════════
   3. SOS TRIGGER
   ═══════════════════════════════════════════════════════════════
   HOW TO WIRE IT:
   In your openSOS() function, add this line at the very top:
     triggerSOS();
   ─────────────────────────────────────────────────────────────── */
function triggerSOS() {
  if (!navigator.geolocation) {
    sendSOSToBackend(null, null);
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => sendSOSToBackend(pos.coords.latitude, pos.coords.longitude),
    ()  => sendSOSToBackend(null, null)
  );
}

async function sendSOSToBackend(lat, lng) {
  try {
    const data = await apiFetch('/api/sos/trigger', {
      method: 'POST',
      body: JSON.stringify({
        user_id: Auth.getUserId() || null,
        lat,
        lng
      })
    });
    console.log('✅ SOS triggered —', data.contacts_notified, 'contact(s) notified');
  } catch (err) {
    console.error('SOS backend error:', err.message);
  }
}

/* ═══════════════════════════════════════════════════════════════
   4. EMERGENCY CONTACTS
   ═══════════════════════════════════════════════════════════════ */
async function loadContacts() {
  const userId = Auth.getUserId();
  if (!userId) return;

  try {
    const contacts = await apiFetch(`/api/contacts/${userId}`);
    const list     = document.getElementById('contactsList');
    if (!contacts.length) return;

    list.innerHTML = '';
    contacts.forEach(c => renderContactCard(c));
  } catch (err) {
    console.warn('Could not load contacts:', err.message);
  }
}

async function addContactToBackend() {
  const name      = document.getElementById('newName').value.trim();
  const phone     = document.getElementById('newPhone').value.trim();
  const relation  = document.getElementById('newRelation').value.trim();

  if (!name || !phone) { alert('Name and phone are required.'); return; }

  const btn = document.querySelector('[onclick="addContact()"]');
  if (btn) { btn.textContent = 'Adding...'; btn.disabled = true; }

  try {
    const contact = await apiFetch('/api/contacts', {
      method: 'POST',
      body: JSON.stringify({
        user_id:    Auth.getUserId() || null,
        name,
        phone,
        relation,
        is_primary: false
      })
    });

    renderContactCard(contact);
    document.getElementById('newName').value     = '';
    document.getElementById('newPhone').value    = '';
    document.getElementById('newRelation').value = '';

  } catch (err) {
    const list   = document.getElementById('contactsList');
    const emojis = ['👤','👨','👩','🧑','👦','👧'];
    const emoji  = emojis[Math.floor(Math.random() * emojis.length)];
    list.insertAdjacentHTML('beforeend', `
      <div class="contact-card">
        <div class="contact-avatar">${emoji}</div>
        <div class="contact-info"><strong>${name}</strong><span>${phone}${relation ? ' · ' + relation : ''}</span></div>
        <div class="contact-actions">
          <button class="icon-btn" onclick="window.open('tel:${phone}')">📞</button>
          <button class="icon-btn">💬</button>
          <button class="icon-btn danger" onclick="this.closest('.contact-card').remove()">🗑</button>
        </div>
      </div>`);
    console.warn('Contact saved locally only:', err.message);
  } finally {
    if (btn) { btn.textContent = 'Add Contact'; btn.disabled = false; }
  }
}

async function deleteContact(id, cardEl) {
  try {
    await apiFetch(`/api/contacts/${id}`, { method: 'DELETE' });
    cardEl.remove();
  } catch (err) {
    cardEl.remove();
    console.warn('Delete contact error:', err.message);
  }
}

function renderContactCard(c) {
  const list   = document.getElementById('contactsList');
  const emojis = ['👤','👨','👩','🧑'];
  const emoji  = emojis[Math.floor(Math.random() * emojis.length)];
  const card   = document.createElement('div');
  card.className = 'contact-card';
  card.innerHTML = `
    <div class="contact-avatar">${emoji}</div>
    <div class="contact-info">
      <strong>${c.name}${c.is_primary ? ' <span class="badge-emergency">PRIMARY</span>' : ''}</strong>
      <span>${c.phone}${c.relation ? ' · ' + c.relation : ''}</span>
    </div>
    <div class="contact-actions">
      <button class="icon-btn" onclick="window.open('tel:${c.phone}')">📞</button>
      <button class="icon-btn">💬</button>
      <button class="icon-btn danger">🗑</button>
    </div>`;
  card.querySelector('.icon-btn.danger').addEventListener('click', () => {
    if (c.id) deleteContact(c.id, card);
    else card.remove();
  });
  list.appendChild(card);
}

/* ═══════════════════════════════════════════════════════════════
   5. NEARBY SERVICES
   ═══════════════════════════════════════════════════════════════ */
let userLat = null, userLng = null;
let ssMap = null, userMarker = null, placeMarkers = [];

function initNearby() {
  const grid = document.querySelector('.nearby-grid');
  if (!navigator.geolocation) {
    if (grid) grid.innerHTML = '<div style="color:var(--muted);font-size:0.85rem;padding:1rem">📍 GPS not supported on this device.</div>';
    return;
  }
  if (grid) grid.innerHTML = '<div style="color:var(--muted);font-size:0.85rem;padding:1rem">📡 Getting your location...</div>';

  const mapEl = document.getElementById('leafletMap');
  if (mapEl && !ssMap && typeof L !== 'undefined') {
    ssMap = L.map('leafletMap', { zoomControl: true, attributionControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18
    }).addTo(ssMap);
    ssMap.getContainer().style.filter = 'brightness(0.85) saturate(0.9)';
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;

      const statusText = document.getElementById('mapStatusText');
      if (statusText) statusText.textContent = 'GPS ACTIVE — LOCATION FOUND';

      if (ssMap) {
        ssMap.setView([userLat, userLng], 14);
        if (userMarker) userMarker.remove();
        const userIcon = L.divIcon({
          html: '<div style="font-size:1.8rem;line-height:1;filter:drop-shadow(0 2px 6px rgba(232,0,45,0.7))">📍</div>',
          iconSize: [30, 30], iconAnchor: [15, 30], className: ''
        });
        userMarker = L.marker([userLat, userLng], { icon: userIcon })
          .addTo(ssMap)
          .bindPopup('<b>You are here</b>');
      }

      loadNearby('hospital');
    },
    () => {
      if (grid) grid.innerHTML = '<div style="color:var(--muted);font-size:0.85rem;padding:1rem">⚠️ Location access denied. Please allow GPS and refresh.</div>';
      const statusText = document.getElementById('mapStatusText');
      if (statusText) statusText.textContent = 'GPS UNAVAILABLE';
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function addMapMarkers(places, type) {
  if (!ssMap) return;
  placeMarkers.forEach(m => m.remove());
  placeMarkers = [];
  const emojis = { hospital:'🏥', police:'🚔', fire_station:'🚒', pharmacy:'💊' };
  const emoji = emojis[type] || '📍';
  places.slice(0, 10).forEach(place => {
    if (!place.lat || !place.lng) return;
    const icon = L.divIcon({
      html: `<div style="font-size:1.4rem;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5))">${emoji}</div>`,
      iconSize: [24, 24], iconAnchor: [12, 24], className: ''
    });
    const marker = L.marker([place.lat, place.lng], { icon })
      .addTo(ssMap)
      .bindPopup(`<b>${place.name}</b>${place.addr ? '<br>' + place.addr : ''}`);
    placeMarkers.push(marker);
  });
}

const osmTypeMap = {
  hospital:     'amenity=hospital',
  police:       'amenity=police',
  fire_station: 'amenity=fire_station',
  pharmacy:     'amenity=pharmacy'
};

async function loadNearby(type = 'hospital') {
  if (!userLat || !userLng) {
    initNearby();
    return;
  }

  const grid = document.querySelector('.nearby-grid');
  grid.innerHTML = '<div style="color:var(--muted);font-size:0.85rem;padding:1rem">📡 Searching OpenStreetMap...</div>';

  const radius = 5000;
  const osmTag = osmTypeMap[type] || 'amenity=hospital';
  const [amenityKey, amenityVal] = osmTag.split('=');

  const query = `
    [out:json][timeout:15];
    (
      node["${amenityKey}"="${amenityVal}"](around:${radius},${userLat},${userLng});
      way["${amenityKey}"="${amenityVal}"](around:${radius},${userLat},${userLng});
    );
    out center 20;
  `;

  const mirrors = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass-api.de/api/interpreter'
  ];
  let data = null;
  for (const mirror of mirrors) {
    try {
      const res = await fetch(mirror, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query)
      });
      if (!res.ok) continue;
      data = await res.json();
      if (data && data.elements) break;
    } catch (e) { continue; }
  }

  try {
    if (!data || !data.elements) throw new Error('All mirrors failed');
    const elements = data.elements || [];

    if (!elements.length) {
      grid.innerHTML = '<div style="color:var(--muted);font-size:0.85rem;padding:1rem">No results found within 5km.</div>';
      return;
    }

    const icons    = { hospital:'🏥', police:'🚔', fire_station:'🚒', pharmacy:'💊' };
    const classes  = { hospital:'hosp', police:'police', fire_station:'fire', pharmacy:'hosp' };

    const places = elements.map(el => {
      const lat  = el.lat  || el.center?.lat;
      const lng  = el.lon  || el.center?.lon;
      const name = el.tags?.name || el.tags?.['name:en'] || ('Unnamed ' + type);
      const addr = [el.tags?.['addr:street'], el.tags?.['addr:city']].filter(Boolean).join(', ') || '';
      const dist = lat ? getDistanceKm(userLat, userLng, lat, lng) : 999;
      return { lat, lng, name, addr, dist };
    }).filter(p => p.lat).sort((a, b) => a.dist - b.dist);

    grid.innerHTML = '';
    places.forEach(place => {
      const distLabel = place.dist < 1
        ? (place.dist * 1000).toFixed(0) + ' m'
        : place.dist.toFixed(1) + ' km';
      const safeName = place.name.replace(/'/g, "\\'");
      grid.insertAdjacentHTML('beforeend', `
        <div class="nearby-card" onclick="openMaps(${place.lat},${place.lng},'${safeName}')">
          <div class="nc-icon ${classes[type] || 'hosp'}">${icons[type] || '📍'}</div>
          <div class="nc-meta">
            <strong>${place.name}</strong>
            <span>${place.addr || 'Tap for directions'}</span>
          </div>
          <div class="nc-dist">${distLabel}</div>
        </div>`);
    });

  } catch (err) {
    grid.innerHTML = '<div style="color:var(--muted);font-size:0.85rem;padding:1rem">⚠️ Could not load nearby services. Check internet connection.</div>';
    console.error('Nearby (Overpass) error:', err);
  }
}

function openMaps(lat, lng, name) {
  window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
}

/* ═══════════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
   ═══════════════════════════════════════════════════════════════ */
function timeAgo(isoString) {
  if (!isoString) return 'recently';
  const diff = (Date.now() - new Date(isoString)) / 1000;
  if (diff < 60)   return Math.floor(diff) + ' sec ago';
  if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
  if (diff < 86400)return Math.floor(diff / 3600) + ' hr ago';
  return Math.floor(diff / 86400) + ' days ago';
}

function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ═══════════════════════════════════════════════════════════════
   AUTO-INIT
   ═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  loadRecentIncidents();
  loadContacts();
  initNearby();
});
