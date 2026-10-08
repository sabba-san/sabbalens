/* ================================================================
   SABBALENS LANDING v2 - preview at /preview/, CTAs funnel to /v2/
   Live stats plus preview grid from /api/v1. No framework.
   Captions sit below images, never overlaid on them.
   ================================================================ */

const API_BASE = '/api/v1';
const PREVIEW_LIMIT = 6;

const BADGE_BASE = 'inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ';
const DOT_BASE = 'w-1.5 h-1.5 rounded-full ';

function badgeClasses(status) {
  switch (status) {
    case 'scheduled': return BADGE_BASE + 'text-accent bg-[rgba(255,43,43,0.15)]';
    case 'published': return BADGE_BASE + 'text-ok bg-[rgba(34,197,94,0.15)]';
    case 'failed': return BADGE_BASE + 'text-err bg-[rgba(239,68,68,0.15)]';
    default: return BADGE_BASE + 'text-muted border border-line';
  }
}

function dotClasses(status) {
  switch (status) {
    case 'scheduled': return DOT_BASE + 'bg-accent';
    case 'published': return DOT_BASE + 'bg-ok';
    case 'failed': return DOT_BASE + 'bg-err';
    default: return DOT_BASE + 'bg-muted';
  }
}

function buildBadge(status, label) {
  var safe = ['draft', 'scheduled', 'published', 'failed'].indexOf(status) !== -1 ? status : 'draft';
  var badge = document.createElement('span');
  badge.className = badgeClasses(safe);
  var dot = document.createElement('span');
  dot.className = dotClasses(safe);
  dot.setAttribute('aria-hidden', 'true');
  var text = document.createElement('span');
  text.textContent = label || safe;
  badge.appendChild(dot);
  badge.appendChild(text);
  return badge;
}

function setBadge(el, status, label) {
  var fresh = buildBadge(status, label);
  el.className = fresh.className;
  el.replaceChildren.apply(el, Array.prototype.slice.call(fresh.childNodes));
}

function photoUrl(photo) {
  return '/uploads/' + encodeURIComponent(photo.file_path.split('/').pop());
}

function formatDate(value) {
  if (!value) return 'n/a';
  var d = new Date(value + (value.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(value) ? '' : 'Z'));
  return isNaN(d.getTime()) ? 'n/a' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function loadStats() {
  try {
    const res = await fetch(API_BASE + '/photos?limit=500');
    if (!res.ok) return;
    const photos = await res.json();
    const counts = { total: photos.length, draft: 0, scheduled: 0, published: 0, failed: 0 };
    photos.forEach(function (p) { if (counts[p.status] !== undefined) counts[p.status]++; });
    setText('stat-total', counts.total);
    setText('stat-draft', counts.draft);
    setText('stat-scheduled', counts.scheduled);
    setText('stat-published', counts.published);
    setText('stat-failed', counts.failed);
    setText('settings-count', String(counts.total));
    var sub = document.getElementById('preview-sub');
    if (sub) sub.textContent = counts.total === 0
      ? 'No uploads yet. Import one in the scheduler.'
      : 'Latest uploads with live status.';
  } catch (e) { /* decorative */ }
}

function setText(id, value) {
  var el = document.getElementById(id);
  if (el) el.textContent = value;
}

async function loadHealth() {
  var dot = document.getElementById('health-dot');
  var text = document.getElementById('health-text');
  var apiBadge = document.getElementById('settings-api');
  try {
    var res = await fetch('/health');
    var ok = res.ok && (await res.json()).status === 'ok';
    if (dot) dot.className = 'w-2 h-2 rounded-full ' + (ok ? 'bg-ok' : 'bg-err');
    if (text) { text.textContent = ok ? 'online' : 'error'; text.className = 'font-mono text-xs ' + (ok ? 'text-ok' : 'text-err'); }
    if (apiBadge) setBadge(apiBadge, ok ? 'published' : 'failed', ok ? 'online' : 'error');
  } catch (e) {
    if (dot) dot.className = 'w-2 h-2 rounded-full bg-err';
    if (text) { text.textContent = 'offline'; text.className = 'font-mono text-xs text-err'; }
    if (apiBadge) setBadge(apiBadge, 'failed', 'offline');
  }
}

/* Cards keep image and caption apart: photo on top, location plus
   status in a caption row below. Nothing floats over the photo. */
function buildPreviewCard(photo) {
  var a = document.createElement('a');
  a.href = '/v2/?id=' + encodeURIComponent(photo.id);
  a.className = 'group block overflow-hidden rounded-md border border-line bg-surface hover:border-muted active:scale-[0.98] transition';
  a.setAttribute('aria-label', photo.filename + ' (' + photo.status + ')');

  var img = document.createElement('img');
  img.src = photoUrl(photo);
  img.alt = photo.filename || 'Uploaded photo';
  img.loading = 'lazy';
  img.className = 'w-full aspect-[4/3] object-cover group-hover:scale-[1.02] transition';
  a.appendChild(img);

  var caption = document.createElement('div');
  caption.className = 'flex items-center justify-between gap-2 px-3 py-2.5 border-t border-line';
  var meta = document.createElement('span');
  meta.className = 'truncate font-mono text-[11px] text-muted';
  meta.textContent = (photo.location_name || 'Unknown location') + ', ' + formatDate(photo.created_at);
  caption.appendChild(meta);
  caption.appendChild(buildBadge(photo.status, photo.status));
  a.appendChild(caption);
  return a;
}

async function loadPreviewGrid() {
  var grid = document.getElementById('preview-grid');
  if (!grid) return;
  grid.replaceChildren();
  for (var i = 0; i < PREVIEW_LIMIT; i++) {
    var sk = document.createElement('div');
    sk.className = 'skeleton aspect-[4/3] w-full';
    sk.setAttribute('aria-hidden', 'true');
    grid.appendChild(sk);
  }
  try {
    var res = await fetch(API_BASE + '/photos?limit=' + PREVIEW_LIMIT);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var photos = await res.json();
    grid.replaceChildren();
    if (photos.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'col-span-full rounded-md border border-dashed border-line p-8 text-center grid gap-2 place-items-center';
      var t = document.createElement('p');
      t.className = 'text-sm text-fg';
      t.textContent = 'No photos yet.';
      var s = document.createElement('p');
      s.className = 'text-sm text-muted';
      s.textContent = 'Import one in the scheduler to start the pipeline.';
      var link = document.createElement('a');
      link.href = '/v2/';
      link.className = 'inline-flex h-11 px-5 items-center rounded-md bg-accent text-bg text-sm font-medium hover:bg-accenthover transition min-h-[44px]';
      link.textContent = 'Open Scheduler';
      empty.appendChild(t);
      empty.appendChild(s);
      empty.appendChild(link);
      grid.appendChild(empty);
      return;
    }
    photos.forEach(function (photo) { grid.appendChild(buildPreviewCard(photo)); });
  } catch (e) {
    grid.replaceChildren();
    var err = document.createElement('p');
    err.className = 'col-span-full text-center text-sm text-err py-8';
    err.textContent = 'Could not load previews. Check that the API is running.';
    grid.appendChild(err);
  }
}

/* Reveal on scroll: transform plus opacity only, skipped when the
   user prefers reduced motion. Uses IntersectionObserver, never a
   scroll listener. */
function setupReveal() {
  document.body.classList.add('has-reveal');
  var items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.classList.add('in'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry, i) {
      if (entry.isIntersecting) {
        entry.target.style.transitionDelay = Math.min(i * 60, 240) + 'ms';
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  items.forEach(function (el) { io.observe(el); });
}

document.addEventListener('DOMContentLoaded', function () {
  setupReveal();
  loadStats();
  loadHealth();
  loadPreviewGrid();
});
