/* Builder feedback: explicit context only, persisted by the shared Accounts service. */
(function (root) {
  'use strict';
  const TOOL = 'upg', APP = 'Unified Profile Generator', ADMIN = 'imansur@salesforce.com';
  const $ = id => document.getElementById(id);
  const categories = { bug: 'Bug report', feature: 'Feature request', general: 'General feedback' };
  const statuses = { new: 'New', reviewing: 'Reviewing', completed: 'Completed' };
  let files = [], urls = [], detailUrls = [], decodingUrls = [], busy = false, processing = false;
  let key = null, signature = '', submittedContext = null, admin = false, identity = null;
  let epoch = 0, sessionSequence = 0, listSequence = 0, detailSequence = 0;
  let page = 1, pageSize = 25, total = 0, ready = false, knownSignedIn = null, revalidatingSession = false, opener, inboxOpener;
  let version = String(root.__UPG_FEEDBACK_VERSION__ || '1.1.0');
  const auth = () => root.SaasyAuth;
  const message = (id, text) => { $(id).textContent = text; };
  const revoke = list => { list.forEach(url => root.URL.revokeObjectURL(url)); list.length = 0; };
  const errors = {
    forbidden: 'Your account does not have access to the feedback inbox.',
    invalid_token: 'Your sign-in has expired. Sign in again to continue.',
    missing_token: 'Sign in to view the feedback inbox.',
    auth_session_changed: 'Your account changed. Reopen feedback to continue.',
    feedback_rate_limited: 'You have reached the hourly feedback limit. Please try again later.',
    feedback_storage_full: 'The feedback inbox is full. Please try again later.',
    invalid_attachment: 'Remove the screenshot and choose a PNG, JPEG, or WebP image.',
    too_many_attachments: 'You can attach up to 3 screenshots.',
    payload_too_large: 'The submission is too large. Remove a screenshot and try again.',
    feedback_service_unavailable: 'Feedback is temporarily unavailable. Please try again later.'
  };
  function errorText(error) {
    const code = error?.code || error?.error || error?.message;
    return errors[code] || (error?.name === 'TypeError' ? 'Could not connect. Check your connection and try again. Your feedback has been kept.' : error?.message || 'Something went wrong. Please try again.');
  }
  function fingerprint() {
    // Accounts retains the known email when a JWT expires, but removes it on
    // explicit sign-out. Expiration must not erase an unfinished submission.
    try { const email = auth()?.getEmail?.()?.toLowerCase(); return email ? 'account:' + email : 'guest'; }
    catch (_) { return 'guest'; }
  }
  function signedIn() { try { return !!auth()?.isSignedIn?.(); } catch (_) { return false; } }
  function revokeAdmin() {
    admin = false; ready = false; clearInbox(); $('feedback-inbox-open').hidden = true;
    if ($('feedback-inbox-dialog').open) $('feedback-inbox-dialog').close();
  }
  function expiredSession(error, token) {
    if (token !== epoch || identity !== fingerprint()) return false;
    const code = error?.code || error?.error || error?.message;
    if (code !== 'invalid_token' && code !== 'missing_token') return false;
    revokeAdmin();
    if (!revalidatingSession) {
      revalidatingSession = true;
      Promise.resolve(refreshSession(true)).finally(() => { revalidatingSession = false; });
    }
    return true;
  }
  function setDisabled(value) {
    $('feedback-form').querySelectorAll('input,select,textarea,button').forEach(field => { field.disabled = value; });
  }
  function resetDraft() {
    revoke(urls); files = []; key = null; signature = ''; submittedContext = null;
    $('feedback-form').reset(); $('feedback-previews').replaceChildren();
    message('feedback-message', ''); message('feedback-reference', '');
    $('feedback-success').hidden = true; $('feedback-form').hidden = false;
  }
  function clearInbox() {
    listSequence++; detailSequence++; revoke(detailUrls);
    $('feedback-inbox-list').replaceChildren(); $('feedback-inbox-detail').replaceChildren();
    $('feedback-inbox-detail').hidden = true;
    message('feedback-unread', ''); message('feedback-inbox-message', ''); message('feedback-page', '');
    $('feedback-inbox-retry').hidden = true; $('feedback-inbox-retry').onclick = null;
  }
  function clearPrivate() {
    epoch++; admin = false; ready = false; busy = false; processing = false; page = 1; total = 0;
    clearInbox(); resetDraft(); revoke(decodingUrls); setDisabled(false);
    $('feedback-filter-category').value = ''; $('feedback-filter-status').value = '';
    $('feedback-inbox-open').hidden = true;
    for (const id of ['feedback-dialog', 'feedback-inbox-dialog']) if ($(id).open) $(id).close();
    opener = null; inboxOpener = null;
  }
  function same(token) {
    if (identity !== fingerprint()) { refreshSession(); return false; }
    if (knownSignedIn !== signedIn()) refreshSession();
    return token === epoch;
  }
  const current = token => same(token) && admin;
  async function refreshSession(force = false) {
    const next = fingerprint();
    if (identity !== next) { clearPrivate(); identity = next; ready = false; }
    const signed = signedIn();
    if (knownSignedIn !== signed) { knownSignedIn = signed; revokeAdmin(); }
    if (!force && ready) return;
    const token = epoch, seq = ++sessionSequence;
    if (typeof auth()?.getFeedbackSession !== 'function') { ready = false; return; }
    ready = true;
    try {
      const session = await auth().getFeedbackSession(TOOL);
      if (!same(token) || seq !== sessionSequence) return;
      admin = signed && session.admin === true && session.email?.toLowerCase() === ADMIN;
      $('feedback-inbox-open').hidden = !admin;
      if (!admin) { clearInbox(); if ($('feedback-inbox-dialog').open) $('feedback-inbox-dialog').close(); return; }
      try {
        const result = await auth().listFeedback({ tool: TOOL, category: '', status: '', page: 1 });
        if (current(token) && seq === sessionSequence) count(result.unreadCount);
      } catch (error) { expiredSession(error,token); /* Other failures offer retry in the inbox. */ }
    } catch (_) {
      if (same(token) && seq === sessionSequence) { ready = false; admin = false; clearInbox(); $('feedback-inbox-open').hidden = true; if ($('feedback-inbox-dialog').open) $('feedback-inbox-dialog').close(); }
    }
  }
  function context() {
    let mode = '', view = '', step = '';
    try {
      mode = typeof state !== 'undefined' && state.profileType === 'b2b' ? 'Account' : 'Individual';
      const lens = typeof getProfileStrategy === 'function' ? getProfileStrategy().lens : '';
      view = ({sales:'Sales',service:'Service',marketing:'Marketing',success:'Success',custom:'Custom'})[lens] || '';
      const steps = ['Customer','Identity','Insights','Signals','Modules','Recommendations','Export'];
      const dot = document.querySelector('.step-dot[aria-current="step"]');
      const index = typeof currentStep === 'number' ? currentStep : Number(dot?.dataset.step || 0);
      step = steps[index] || 'Customer';
    } catch (_) { /* Feedback also works if the editor has not initialized. */ }
    return { appName: APP, appVersion: version, step: [step, mode, view].filter(Boolean).join(' · ').slice(0,120) };
  }
  function renderFiles() {
    revoke(urls); $('feedback-previews').replaceChildren();
    files.forEach((file, index) => {
      const item = el('li'), img = el('img'), remove = el('button', 'Remove image ' + (index + 1));
      img.src = root.URL.createObjectURL(file.blob); urls.push(img.src); img.alt = file.name;
      remove.type = 'button'; remove.disabled = busy || processing;
      remove.onclick = () => { files.splice(index, 1); renderFiles(); };
      item.append(img, remove); $('feedback-previews').append(item);
    });
  }
  function toData(blob) {
    return new Promise((resolve, reject) => {
      const reader = new root.FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(new Error('The image could not be read.')); reader.readAsDataURL(blob);
    });
  }
  async function compress(file) {
    if (!['image/png','image/jpeg','image/webp'].includes(file.type)) throw new Error('Choose PNG, JPEG, or WebP images.');
    if (file.size > 20 * 1024 * 1024) throw new Error('Choose an image smaller than 20 MB.');
    const url = root.URL.createObjectURL(file), img = new root.Image(); decodingUrls.push(url);
    try {
      await new Promise((resolve, reject) => {
        const timer = root.setTimeout(() => reject(new Error('The image could not be decoded.')),10000);
        img.onload = () => { root.clearTimeout(timer); resolve(); }; img.onerror = () => { root.clearTimeout(timer); reject(new Error('The image could not be decoded.')); }; img.src = url;
      });
      const width = img.naturalWidth, height = img.naturalHeight;
      if (!width || !height || width * height > 60000000) throw new Error('This image is too large to process. Choose a smaller screenshot.');
      const canvas = document.createElement('canvas'); let scale = Math.min(1,1800 / Math.max(width,height)), blob;
      for (let attempt = 0; attempt < 5; attempt++) {
        canvas.width = Math.max(1,Math.round(width * scale)); canvas.height = Math.max(1,Math.round(height * scale));
        const drawing = canvas.getContext('2d'); if (!drawing) throw new Error('Your browser could not process this image.');
        drawing.fillStyle = '#fff'; drawing.fillRect(0,0,canvas.width,canvas.height); drawing.drawImage(img,0,0,canvas.width,canvas.height);
        blob = await new Promise(resolve => canvas.toBlob(resolve,'image/jpeg',.85 - attempt * .08));
        if (blob && blob.size <= 1024 * 1024) break; scale *= .75;
      }
      if (!blob || blob.size > 1024 * 1024) throw new Error('This screenshot could not fit within 1 MB. Choose a smaller image.');
      return { name: (file.name || 'screenshot').replace(/\.[^.]+$/,'').slice(0,110) + '.jpg', type: blob.type, blob, data: await toData(blob) };
    } finally {
      const index = decodingUrls.indexOf(url);
      if (index !== -1) { root.URL.revokeObjectURL(url); decodingUrls.splice(index,1); }
    }
  }
  async function addFiles(incoming) {
    if (busy || processing) return;
    const images = Array.from(incoming || []); if (!images.length) return;
    if (images.length + files.length > 3) { message('feedback-message','You can attach up to 3 images. Remove one before adding another.'); return; }
    const token = epoch; processing = true; $('feedback-submit').disabled = true; message('feedback-message','Preparing screenshots…');
    try {
      const additions = [];
      for (const file of images) { additions.push(await compress(file)); if (!same(token)) return; }
      files.push(...additions); message('feedback-message','');
    } catch (error) { if (same(token)) message('feedback-message',errorText(error)); }
    finally { if (same(token)) { processing = false; $('feedback-submit').disabled = false; $('feedback-files').value = ''; renderFiles(); } }
  }
  async function submit(event) {
    event.preventDefault(); if (busy || processing || !$('feedback-form').reportValidity()) return;
    if (identity !== fingerprint()) { refreshSession(); return; }
    if (typeof auth()?.submitFeedback !== 'function') { message('feedback-message','Feedback is unavailable. Reload the app and try again.'); return; }
    const payload = { tool: TOOL, category: $('feedback-category').value, name: $('feedback-name').value.trim(), email: $('feedback-email').value.trim(), description: $('feedback-description').value.trim(), context: context(), attachments: files.map(({name,type,data}) => ({name,type,data})) };
    if (!payload.name || !payload.description) { message('feedback-message','Enter your name and a description.'); return; }
    const next = JSON.stringify({...payload,context:undefined});
    if (next !== signature) { key = root.crypto.randomUUID(); signature = next; submittedContext = payload.context; } else payload.context = submittedContext;
    const token = epoch; busy = true; setDisabled(true); renderFiles(); message('feedback-message','Sending feedback…');
    try {
      const result = await auth().submitFeedback(payload,key); if (!same(token)) return;
      if (!result?.id) throw new Error('The server did not confirm your submission. Please try again.');
      $('feedback-form').hidden = true; $('feedback-success').hidden = false;
      message('feedback-reference','Reference: ' + result.id); $('feedback-done').focus();
    } catch (error) { expiredSession(error,token); if (same(token)) message('feedback-message',errorText(error)); }
    finally { if (same(token)) { busy = false; setDisabled(false); renderFiles(); } }
  }
  function el(tag,text,className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
  function count(value) { message('feedback-unread',Number(value) > 0 ? String(value) : ''); }
  function inboxError(error,retry) { message('feedback-inbox-message',errorText(error)); $('feedback-inbox-retry').hidden = false; $('feedback-inbox-retry').onclick = retry; }
  function listView() {
    detailSequence++; revoke(detailUrls); $('feedback-inbox-detail').replaceChildren(); $('feedback-inbox-detail').hidden = true;
    for (const id of ['feedback-inbox-list','feedback-pagination','feedback-inbox-controls']) $(id).hidden = false;
  }
  async function loadList() {
    if (!admin) return; listView(); const token = epoch, seq = ++listSequence;
    message('feedback-inbox-message','Loading feedback…'); $('feedback-inbox-retry').hidden = true; $('feedback-inbox-list').replaceChildren();
    try {
      const result = await auth().listFeedback({tool:TOOL,category:$('feedback-filter-category').value,status:$('feedback-filter-status').value,page});
      if (!current(token) || seq !== listSequence) return;
      total = result.total; pageSize = Number(result.pageSize) || 25; count(result.unreadCount);
      message('feedback-inbox-message',result.items.length ? '' : 'No feedback matches these filters.');
      for (const item of result.items) {
        const button = el('button',undefined,'feedback-row'); button.type = 'button';
        button.append(el('strong',(item.readAt ? '' : '● ') + (categories[item.category] || 'Feedback') + ' · ' + item.name),el('span',item.description.slice(0,180)),el('span',item.email + ' · ' + (statuses[item.status] || item.status) + ' · ' + new Date(item.createdAt).toLocaleDateString()));
        button.onclick = () => openDetail(item.id); $('feedback-inbox-list').append(button);
      }
      message('feedback-page','Page ' + page + ' of ' + Math.max(1,Math.ceil(total/pageSize)));
      $('feedback-prev').disabled = page <= 1; $('feedback-next').disabled = page * pageSize >= total;
    } catch (error) { expiredSession(error,token); if (current(token) && seq === listSequence) inboxError(error,loadList); }
  }
  async function openDetail(id) {
    if (!admin) return; const token = epoch, seq = ++detailSequence; listSequence++; revoke(detailUrls);
    for (const key of ['feedback-inbox-list','feedback-pagination','feedback-inbox-controls']) $(key).hidden = true;
    const box = $('feedback-inbox-detail'); box.hidden = false; box.replaceChildren();
    message('feedback-inbox-message','Loading submission…'); $('feedback-inbox-retry').hidden = true;
    try {
      const result = await auth().getFeedback(id,TOOL); if (!current(token) || seq !== detailSequence) return;
      const item = result.feedback, back = el('button','← Back to inbox'), heading = el('h3',categories[item.category] || 'Feedback');
      message('feedback-inbox-message',''); back.type = 'button'; back.onclick = loadList; heading.tabIndex = -1;
      box.append(back,heading,el('p',item.name + ' · ' + item.email + '\n' + new Date(item.createdAt).toLocaleString() + ' · Reference ' + item.id,'feedback-detail-meta'),el('p',item.description,'feedback-detail-description'));
      if (item.context || item.toolName) box.append(el('p',[item.toolName,item.context?.appVersion,item.context?.step].filter(Boolean).join(' · '),'feedback-detail-meta'));
      let savedStatus = item.status;
      const label = el('label','Status'), select = el('select'); select.id = 'feedback-detail-status'; label.htmlFor = select.id;
      for (const [value,text] of Object.entries(statuses)) { const option = el('option',text); option.value = value; select.append(option); }
      select.value = savedStatus;
      select.onchange = async () => {
        if (!current(token) || seq !== detailSequence) return; const value = select.value; select.disabled = true;
        try { await auth().updateFeedback(id,{status:value},TOOL); if (!current(token) || seq !== detailSequence) return; savedStatus = value; message('feedback-inbox-message','Status saved.'); }
        catch (error) { expiredSession(error,token); if (current(token) && seq === detailSequence) { select.value = savedStatus; message('feedback-inbox-message',errorText(error)); } }
        finally { if (current(token) && seq === detailSequence) select.disabled = false; }
      };
      box.append(label,select);
      const remove = el('button','Delete submission'), actions = el('div',undefined,'feedback-actions'); remove.type = 'button'; remove.id = 'feedback-delete';
      remove.onclick = async () => {
        if (!current(token) || seq !== detailSequence || remove.disabled || !root.confirm('Delete this submission and its screenshots permanently?')) return;
        remove.disabled = true; select.disabled = true;
        try { await auth().deleteFeedback(id,TOOL); if (!current(token) || seq !== detailSequence) return; page = Math.min(page,Math.max(1,Math.ceil(Math.max(0,total-1)/pageSize))); await loadList(); }
        catch (error) { expiredSession(error,token); if (current(token) && seq === detailSequence) message('feedback-inbox-message',errorText(error)); }
        finally { if (current(token) && seq === detailSequence) { remove.disabled = false; select.disabled = false; } }
      };
      actions.append(remove); box.append(actions); heading.focus();
      if (!item.readAt) {
        try { await auth().updateFeedback(id,{read:true},TOOL); if (!current(token) || seq !== detailSequence) return; count(Math.max(0,Number($('feedback-unread').textContent || 0)-1)); }
        catch (error) { expiredSession(error,token); if (current(token) && seq === detailSequence) message('feedback-inbox-message','Opened, but could not mark as read: ' + errorText(error)); }
      }
      for (const attachment of item.attachments || []) {
        if (!current(token) || seq !== detailSequence) return;
        try {
          const blob = await auth().getFeedbackAttachment(id,attachment.id,TOOL); if (!current(token) || seq !== detailSequence) return;
          if (!['image/jpeg','image/png','image/webp'].includes(blob.type)) throw new Error('Unsupported attachment type.');
          const url = root.URL.createObjectURL(blob), img = el('img',undefined,'feedback-detail-image'); detailUrls.push(url); img.src = url; img.alt = attachment.name; box.append(img);
        } catch (error) { expiredSession(error,token); if (current(token) && seq === detailSequence) box.append(el('p','Screenshot unavailable: ' + errorText(error))); }
      }
    } catch (error) { expiredSession(error,token); if (current(token) && seq === detailSequence) inboxError(error,() => openDetail(id)); }
  }
  function init() {
    if (!$('feedback-open')) return;
    $('feedback-open').onclick = () => {
      if (identity !== fingerprint()) refreshSession(); opener = document.activeElement;
      if (auth()?.isSignedIn?.()) {
        if (!$('feedback-email').value) $('feedback-email').value = auth().getEmail?.() || '';
        if (!$('feedback-name').value) $('feedback-name').value = auth().getName?.() || auth().getUser?.()?.name || '';
      }
      if (!$('feedback-dialog').open) $('feedback-dialog').showModal(); $('feedback-category').focus();
    };
    document.querySelectorAll('[data-feedback-close]').forEach(button => { button.onclick = () => { if (!busy && !processing) $('feedback-dialog').close(); }; });
    $('feedback-dialog').addEventListener('cancel',event => { if (busy || processing) event.preventDefault(); });
    $('feedback-dialog').addEventListener('close',() => { if (!$('feedback-success').hidden) resetDraft(); if (opener?.isConnected) opener.focus(); });
    $('feedback-done').onclick = () => $('feedback-dialog').close(); $('feedback-form').onsubmit = submit;
    $('feedback-files').onchange = event => addFiles(event.target.files);
    const drop = $('feedback-drop');
    drop.addEventListener('dragover',event => { event.preventDefault(); drop.classList.add('dragging'); });
    drop.addEventListener('dragleave',() => drop.classList.remove('dragging'));
    drop.addEventListener('drop',event => { event.preventDefault(); drop.classList.remove('dragging'); addFiles(event.dataTransfer?.files); });
    $('feedback-dialog').addEventListener('paste',event => {
      const items = Array.from(event.clipboardData?.items || []).filter(item => item.kind === 'file' && item.type.startsWith('image/'));
      if (items.length) { event.preventDefault(); addFiles(items.map(item => item.getAsFile()).filter(Boolean)); }
    });
    $('feedback-inbox-open').onclick = async () => {
      inboxOpener = document.activeElement; await refreshSession(true); if (!admin) return;
      if (!$('feedback-inbox-dialog').open) $('feedback-inbox-dialog').showModal(); page = 1; loadList();
    };
    document.querySelectorAll('[data-feedback-inbox-close]').forEach(button => { button.onclick = () => $('feedback-inbox-dialog').close(); });
    $('feedback-inbox-dialog').addEventListener('close',() => {
      const unread = $('feedback-unread').textContent; clearInbox(); if (admin) count(unread);
      if (inboxOpener?.isConnected) inboxOpener.focus();
    });
    for (const id of ['feedback-filter-category','feedback-filter-status']) $(id).onchange = () => { page = 1; loadList(); };
    $('feedback-prev').onclick = () => { if (page > 1) { page--; loadList(); } };
    $('feedback-next').onclick = () => { if (page * pageSize < total) { page++; loadList(); } };
    const observer = new root.MutationObserver(() => refreshSession());
    for (const id of ['auth-email','auth-profile-btn','auth-signin-btn']) if ($(id)) observer.observe($(id),{childList:true,subtree:true,characterData:true,attributes:true});
    root.addEventListener('storage',() => refreshSession()); root.addEventListener('focus',() => refreshSession());
    root.addEventListener('pageshow',() => refreshSession());
    document.addEventListener('visibilitychange',() => { if (!document.hidden) refreshSession(); });
    document.addEventListener('click',() => { if (identity !== fingerprint()) refreshSession(); },true);
    Promise.resolve(root.saasyAuthReady).then(() => refreshSession(true)).catch(() => {});
    if (root.fetch) root.fetch('/api/app-version').then(response => response.ok ? response.json() : null).then(meta => {
      if (meta?.version) version = String(meta.version).slice(0,60) + (meta.commit ? ' (' + String(meta.commit).slice(0,12) + ')' : '');
    }).catch(() => {});
    root.addEventListener('pagehide',clearPrivate);
  }
  root.UPGFeedback = { refreshSession };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})(window);
