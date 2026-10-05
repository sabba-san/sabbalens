/* ================================================================
   SABBALENS LANDING — Dark Developer / Builder
   Loads live stats from API and renders recent photo previews.
   ================================================================ */

const API_BASE = '/api/v1';
const PREVIEW_LIMIT = 6;

async function loadLandingData() {
  await Promise.all([loadStats(), loadPreviewGrid()]);
}

async function loadStats() {
  try {
    const res = await fetch(API_BASE + '/photos?limit=500');
    if (!res.ok) return;
    const photos = await res.json();

    const counts = {
      total: photos.length,
      draft: 0,
      scheduled: 0,
      published: 0
    };

    photos.forEach(p => {
      if (counts[p.status] !== undefined) counts[p.status]++;
    });

    document.getElementById('stat-total').textContent = counts.total;
    document.getElementById('stat-draft').textContent = counts.draft;
    document.getElementById('stat-scheduled').textContent = counts.scheduled;
    document.getElementById('stat-published').textContent = counts.published;
  } catch (e) {
    // Silently fail - stats are decorative
  }
}

function photoUrl(photo) {
  return '/uploads/' + encodeURIComponent(photo.file_path.split('/').pop());
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value + (value.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(value) ? '' : 'Z'));
  return isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function loadPreviewGrid() {
  const grid = document.getElementById('preview-grid');
  if (!grid) return;

  // Show skeletons while loading
  grid.innerHTML = Array.from({ length: PREVIEW_LIMIT }, () =>
    '<div class="skeleton" style="aspect-ratio:4/3;width:100%"></div>'
  ).join('');

  try {
    const res = await fetch(API_BASE + '/photos?limit=' + PREVIEW_LIMIT);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const photos = await res.json();

    if (photos.length === 0) {
      grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--color-fg-subtle);font-size:var(--text-sm);padding:var(--space-8)">No photos yet. Import one in the scheduler.</p>';
      return;
    }

    grid.innerHTML = photos.map(photo => `
      <a href="/app/?id=${encodeURIComponent(photo.id)}" class="preview-card" aria-label="${photo.filename}">
        <img src="${photoUrl(photo)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;position:relative;z-index:1" />
        <div class="status-badge status-badge--${photo.status}" style="position:absolute;top:var(--space-2);left:var(--space-2);z-index:2;font-size:var(--text-xs);padding:2px 8px;border-radius:var(--radius-full);font-weight:600;display:inline-flex;align-items:center;gap:4px;background:${getStatusBg(photo.status)};color:${getStatusColor(photo.status)};border:1px solid ${getStatusBorder(photo.status)}">
          <span style="width:6px;height:6px;border-radius:50%;background:${getStatusColor(photo.status)}"></span>
          ${photo.status}
        </div>
      </a>
    `).join('');
  } catch (e) {
    grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--color-error);font-size:var(--text-sm);padding:var(--space-8)">Could not load previews</p>';
  }
}

function getStatusBg(status) {
  switch (status) {
    case 'scheduled': return 'rgba(255,43,43,0.15)';
    case 'published': return 'rgba(34,197,94,0.15)';
    case 'failed': return 'rgba(239,68,68,0.15)';
    default: return 'transparent';
  }
}

function getStatusColor(status) {
  switch (status) {
    case 'scheduled': return '#FF2B2B';
    case 'published': return '#22C55E';
    case 'failed': return '#EF4444';
    default: return '#71717A';
  }
}

function getStatusBorder(status) {
  switch (status) {
    case 'scheduled': return '#FF2B2B';
    case 'published': return '#22C55E';
    case 'failed': return '#EF4444';
    default: return '#27272A';
  }
}

// Make dropzone clickable to open scheduler
document.addEventListener('DOMContentLoaded', function() {
  const dropzone = document.getElementById('landing-dropzone');
  if (dropzone) {
    dropzone.addEventListener('click', () => window.location.href = '/app/');
    dropzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        window.location.href = '/app/';
      }
    });
  }
  loadLandingData();
});