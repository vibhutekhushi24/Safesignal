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
   1. AI CHAT  —  replaces the fake matchResponse() function
   ═══════════════════════════════════════════════════════════════
   HOW TO WIRE IT:
   In your existing sendChat() function, replace:
     setTimeout(()=>appendMsg(matchResponse(val),'bot'),700);
   with:
     sendChatToBackend(val);
   ─────────────────────────────────────────────────────────────── */
async function sendChatToBackend(userMessage) {
  const msgs = document.getElementById('chatMessages');
  const typingId = 'typing-' + Date.now();
  msgs.innerHTML += `<div class="msg bot" id="${typingId}">
    <div class="msg-bubble" style="color:var(--muted);font-style:italic">⏳ Connecting to AI... (first message may take ~15s)</div>
  </div>`;
  msgs.scrollTop = msgs.scrollHeight;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35000);
    const res = await fetch(BASE_URL + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userMessage }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    const data = await res.json();
    document.getElementById(typingId)?.remove();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    appendMsg(data.reply, 'bot');
  } catch (err) {
    document.getElementById(typingId)?.remove();
    if (err.name === 'AbortError') {
      appendMsg('⚠️ AI is waking up (Render free tier). Please send your message again in a few seconds.', 'bot');
    } else {
      appendMsg('⚠️ Could not reach AI. Check your connection and try again.', 'bot');
    }
    console.error('Chat error:', err);
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
    // Still log SOS without coordinates
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
    // SOS still shows UI even if backend fails — never block the user
  }
}

/* ═══════════════════════════════════════════════════════════════
   4. EMERGENCY CONTACTS
   ═══════════════════════════════════════════════════════════════
   HOW TO WIRE IT:
   Replace your addContact() function body with:
     addContactToBackend();
   And call loadContacts() once on page load.
   ─────────────────────────────────────────────────────────────── */
async function loadContacts() {
  const userId = Auth.getUserId();
  if (!userId) return; // Not logged in — keep showing hardcoded contacts

  try {
    const contacts = await apiFetch(`/api/contacts/${userId}`);
    const list     = document.getElementById('contactsList');
    if (!contacts.length) return;

    list.innerHTML = ''; // Clear mock contacts
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
    // Fallback: add locally even if backend fails
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
    cardEl.remove(); // Remove from UI anyway
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
   5. NEARBY SERVICES  —  replaces hardcoded nearby cards
   ═══════════════════════════════════════════════════════════════
   HOW TO WIRE IT:
   In your filter-tab buttons, add onclick="filterNearby('hospital')" etc.
   It auto-loads on page open to 'nearby' section.
   ─────────────────────────────────────────────────────────────── */
let userLat = null, userLng = null;

function initNearby() {
  const grid = document.querySelector('.nearby-grid');
  if (!navigator.geolocation) {
    if (grid) grid.innerHTML = '<div style="color:var(--muted);font-size:0.85rem;padding:1rem">📍 GPS not supported on this device.</div>';
    return;
  }
  if (grid) grid.innerHTML = '<div style="color:var(--muted);font-size:0.85rem;padding:1rem">📡 Getting your location...</div>';
  navigator.geolocation.getCurrentPosition(
    pos => {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      // Update the map status label
      const status = document.querySelector('.map-status');
      if (status) status.innerHTML = '<div class="status-dot"></div>GPS ACTIVE — LOCATION FOUND';
      loadNearby('hospital');
    },
    () => {
      if (grid) grid.innerHTML = '<div style="color:var(--muted);font-size:0.85rem;padding:1rem">⚠️ Location access denied. Please allow GPS and refresh.</div>';
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// OSM amenity tag mapping
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

  const radius = 5000; // 5km radius
  const osmTag = osmTypeMap[type] || 'amenity=hospital';
  const [amenityKey, amenityVal] = osmTag.split('=');

  // Overpass API query — finds nodes and ways with the given amenity tag
  const query = `
    [out:json][timeout:15];
    (
      node["${amenityKey}"="${amenityVal}"](around:${radius},${userLat},${userLng});
      way["${amenityKey}"="${amenityVal}"](around:${radius},${userLat},${userLng});
    );
    out center 20;
  `;

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query
    });
    const data = await res.json();
    const elements = data.elements || [];

    if (!elements.length) {
      grid.innerHTML = '<div style="color:var(--muted);font-size:0.85rem;padding:1rem">No results found within 5km.</div>';
      return;
    }

    const icons    = { hospital:'🏥', police:'🚔', fire_station:'🚒', pharmacy:'💊' };
    const classes  = { hospital:'hosp', police:'police', fire_station:'fire', pharmacy:'hosp' };

    // Parse results, sort by distance
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

// Human-readable time ago (e.g. "12 min ago")
function timeAgo(isoString) {
  if (!isoString) return 'recently';
  const diff = (Date.now() - new Date(isoString)) / 1000;
  if (diff < 60)   return Math.floor(diff) + ' sec ago';
  if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
  if (diff < 86400)return Math.floor(diff / 3600) + ' hr ago';
  return Math.floor(diff / 86400) + ' days ago';
}

// Haversine distance in km between two lat/lng points
function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ═══════════════════════════════════════════════════════════════
   AUTO-INIT — runs when the page loads
   ═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  loadRecentIncidents(); // Populate report feed from DB
  loadContacts();        // Load contacts if logged in
  initNearby();          // Start GPS for nearby section
});
