// ============================================================
// images.js — Image handling (drop, paste-URL, data-URL encoding)
// ============================================================
// The generator embeds images as data URLs in the exported HTML
// so the standalone file works from any host without external
// image dependencies. This module wires drop zones + URL inputs
// to the app state.
// ============================================================

const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // 3 MB safety cap

// Attach drag-drop + click-to-upload behavior to a drop zone.
// - zoneId:    id of the outer drop-zone div
// - previewId: id of the <img> preview inside it
// - onChange:  callback(dataUrl) — receives base64 data URL
function attachDropZone(zoneId, previewId, onChange) {
  const zone = document.getElementById(zoneId);
  const preview = document.getElementById(previewId);
  if (!zone) return;

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  zone.appendChild(fileInput);

  zone.addEventListener('click', () => fileInput.click());
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-active'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-active'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-active');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0], preview, onChange);
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFile(e.target.files[0], preview, onChange);
  });
}

function handleFile(file, preview, onChange) {
  if (!file.type.startsWith('image/')) {
    alert('Please choose an image file.');
    return;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    alert('Image is larger than 3 MB — please pick a smaller one for a lighter export.');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    if (preview) {
      preview.src = dataUrl;
      preview.classList.remove('hidden');
    }
    if (onChange) onChange(dataUrl);
  };
  reader.readAsDataURL(file);
}

// Set an image preview directly from a URL string. Used when the
// user pastes a URL into a text input instead of uploading.
function setImagePreviewFromURL(previewId, url) {
  const preview = document.getElementById(previewId);
  if (!preview) return;
  if (!url) {
    preview.src = '';
    preview.classList.add('hidden');
    return;
  }
  preview.src = url;
  preview.classList.remove('hidden');
}
