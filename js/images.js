// ============================================================
// images.js — Image handling (drop, paste-URL, data-URL encoding)
// ============================================================
// Uploaded images are embedded as data URLs. Pasted remote image URLs
// remain remote. This module wires drop zones + URL inputs to app state.
// ============================================================

const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3 MB safety cap
const UPLOAD_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp']);

function imageUploadFeedback(zone, message, error = false) {
  const feedback = document.getElementById(`${zone.id}-status`);
  if (feedback) {
    feedback.textContent = message;
    feedback.dataset.error = String(error);
  }
  if (error) zone.setAttribute('aria-invalid', 'true');
  else zone.removeAttribute('aria-invalid');
}

// Attach drag-drop + click-to-upload behavior to a drop zone.
// - zoneId:    id of the outer drop-zone div
// - previewId: id of the <img> preview inside it
// - onChange:  callback(dataUrl) — receives base64 data URL
function attachDropZone(zoneId, previewId, onChange) {
  const zone = document.getElementById(zoneId);
  const preview = document.getElementById(previewId);
  if (!zone || zone.dataset.uploadAttached === 'true') return;
  zone.dataset.uploadAttached = 'true';
  const label = zone.dataset.uploadLabel || zone.getAttribute('aria-label') || `Upload ${zoneId.replace(/^(drop|upload)-/, '').replace(/-/g, ' ')} image`;
  zone.setAttribute('aria-label', label);
  if (zone.tagName !== 'BUTTON') {
    zone.setAttribute('role', 'button');
    zone.tabIndex = 0;
    zone.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        zone.click();
      }
    });
  }

  const feedback = document.createElement('p');
  feedback.id = `${zoneId}-status`;
  feedback.className = 'upload-feedback';
  feedback.style.gridColumn = '1 / -1';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  feedback.setAttribute('aria-atomic', 'true');
  // Compact icon buttons share a row with their text input; keep feedback
  // outside that row so an error does not squeeze the editing control.
  const feedbackAnchor = zone.classList.contains('w-14') ? zone.parentElement : zone;
  feedbackAnchor.insertAdjacentElement('afterend', feedback);
  zone.setAttribute('aria-describedby', [zone.getAttribute('aria-describedby'), feedback.id].filter(Boolean).join(' '));

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = [...UPLOAD_IMAGE_TYPES].join(',');
  fileInput.setAttribute('aria-label', label);
  fileInput.style.display = 'none';
  feedback.insertAdjacentElement('afterend', fileInput);

  let uploadSequence = 0;
  function selectFile(file) {
    if (!file) return;
    const sequence = ++uploadSequence;
    const owner = typeof state === 'undefined' ? null : state;
    const lens = owner?.profileStrategy?.lens;
    const mode = owner?.profileType;
    const source = preview?.getAttribute('src');
    const dataset = JSON.stringify(zone.dataset);
    const fields = [...(zone.parentElement?.querySelectorAll('input:not([type="file"]), textarea') || [])].map(el => [el, el.value]);
    const isCurrent = () => sequence === uploadSequence
      && document.getElementById(zoneId) === zone
      && JSON.stringify(zone.dataset) === dataset
      && (typeof state === 'undefined' ? null : state) === owner
      && owner?.profileStrategy?.lens === lens && owner?.profileType === mode
      && preview?.getAttribute('src') === source
      && fields.every(([el, value]) => el.value === value);
    imageUploadFeedback(zone, 'Reading image…');
    handleFile(file, preview, onChange, {
      isCurrent,
      onStale: () => {
        if (sequence === uploadSequence && document.getElementById(zoneId) === zone) {
          imageUploadFeedback(zone, 'Upload canceled because this view or image changed. Choose the file again.');
        }
      },
      report: (message, error) => imageUploadFeedback(zone, message, error)
    });
  }

  zone.addEventListener('click', () => fileInput.click());
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-active'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-active'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-active');
    selectFile(e.dataTransfer?.files?.[0]);
  });

  fileInput.addEventListener('change', (e) => {
    selectFile(e.target.files?.[0]);
    fileInput.value = ''; // Permit selecting the same file again after a failure.
  });
}

function handleFile(file, preview, onChange, options = {}) {
  const isCurrent = options.isCurrent || (() => true);
  const report = options.report || (() => {});
  if (!UPLOAD_IMAGE_TYPES.has(file.type)) {
    report('Choose a PNG, JPEG, GIF, WebP, AVIF, or BMP image. SVG files are not supported.', true);
    return;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    report('Image is larger than 3 MB. Choose a smaller image for a lighter export.', true);
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    if (!isCurrent()) { options.onStale?.(); return; }
    const dataUrl = safeImageURL(e.target.result);
    if (!dataUrl) {
      report('This image could not be read safely. Choose another image.', true);
      return;
    }
    report('Image updated.');
    if (preview) {
      preview.src = dataUrl;
      preview.classList.remove('hidden');
    }
    if (onChange) onChange(dataUrl);
  };
  reader.onerror = reader.onabort = () => {
    if (isCurrent()) report('The image could not be read. Choose the file again.', true);
  };
  try { reader.readAsDataURL(file); }
  catch (_) { if (isCurrent()) report('The image could not be read. Choose the file again.', true); }
}

// Set an image preview directly from a URL string. Used when the
// user pastes a URL into a text input instead of uploading.
function setImagePreviewFromURL(previewId, url) {
  const preview = document.getElementById(previewId);
  if (!preview) return;
  const imageURL = safeImageURL(url);
  const zone = preview.closest('[data-upload-attached]');
  if (!imageURL) {
    preview.removeAttribute('src');
    preview.classList.add('hidden');
    if (zone) imageUploadFeedback(zone, url ? 'Use an HTTP(S) image URL or upload a supported image.' : '', Boolean(url));
    return;
  }
  preview.src = imageURL;
  preview.classList.remove('hidden');
  if (zone) imageUploadFeedback(zone, '');
}

// The starter profile uses two project-owned photographs. They display as
// normal local assets in the builder and are converted to data URLs before a
// standalone export so the exported profile has no broken recommendation art.
const BUNDLED_STARTER_IMAGE_PATHS = new Set([
  'assets/tony-robbins-workshop-v1.jpg',
  'assets/tony-robbins-coaching-v1.jpg'
]);

async function bundledImageToDataUrl(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Unable to load ${path}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function hydrateBundledStarterImages(target) {
  const items = target?.recommendations?.items;
  if (!Array.isArray(items)) return;
  await Promise.all(items.map(async (item) => {
    if (!item?.image || !BUNDLED_STARTER_IMAGE_PATHS.has(item.image)) return;
    try {
      item.image = await bundledImageToDataUrl(item.image);
    } catch (_) {
      // Keep the asset path when the browser does not permit fetch from a
      // local file context. It still renders in the live preview and app.
    }
  }));
}
