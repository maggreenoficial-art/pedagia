/**
 * PedagIA — persistência na nuvem (Supabase Storage + pedagia_workspace)
 * Depende de: _sb, currentSession, getImageB64, cleanB64, imgB64Type (index.html)
 */
(function (global) {
  const BUCKET = 'pedagia';
  const SIGNED_TTL = 60 * 60 * 24; // 24h

  function uid() {
    return global.currentSession?.user?.id || null;
  }

  function enabled() {
    return !!(global._sb && uid());
  }

  function prefix() {
    return uid();
  }

  function pathBook() {
    return `${prefix()}/books/current.pdf`;
  }

  function pathImage(imageId) {
    return `${prefix()}/images/${imageId}.jpg`;
  }

  function pathHeaderFile(headerId, ext) {
    return `${prefix()}/headers/${headerId}.${ext || 'bin'}`;
  }

  async function signedUrl(storagePath) {
    const { data, error } = await global._sb.storage.from(BUCKET).createSignedUrl(storagePath, SIGNED_TTL);
    if (error) throw error;
    return data.signedUrl;
  }

  async function upload(path, blob, contentType) {
    const { error } = await global._sb.storage.from(BUCKET).upload(path, blob, {
      upsert: true,
      contentType: contentType || blob.type || 'application/octet-stream',
    });
    if (error) throw error;
    return path;
  }

  async function download(path) {
    const { data, error } = await global._sb.storage.from(BUCKET).download(path);
    if (error) throw error;
    return data;
  }

  async function remove(path) {
    const { error } = await global._sb.storage.from(BUCKET).remove([path]);
    if (error) throw error;
  }

  function b64ToBlob(b64, mime) {
    const bin = atob(global.cleanB64 ? global.cleanB64(b64) : b64.replace(/^data:[^;]+;base64,/, ''));
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime || 'image/jpeg' });
  }

  async function blobToB64(blob) {
    const ab = await blob.arrayBuffer();
    const bytes = new Uint8Array(ab);
    let s = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(s);
  }

  async function getWorkspace() {
    if (!enabled()) return null;
    const { data, error } = await global._sb
      .from('pedagia_workspace')
      .select('*')
      .eq('user_id', uid())
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function upsertWorkspace(patch) {
    if (!enabled()) return;
    const row = { user_id: uid(), ...patch, updated_at: new Date().toISOString() };
    const { error } = await global._sb.from('pedagia_workspace').upsert(row, { onConflict: 'user_id' });
    if (error) throw error;
  }

  async function uploadBookFile(file) {
    const p = pathBook();
    await upload(p, file, 'application/pdf');
    await upsertWorkspace({
      book_storage_path: p,
      book_file_name: file.name,
      book_total_pages: global.st?.bookTotalPages || null,
    });
    return p;
  }

  async function loadBookIntoState() {
    const ws = await getWorkspace();
    if (!ws?.book_storage_path) return false;
    const pdfjsLib = global['pdfjs-dist/build/pdf'] || global.pdfjsLib;
    if (!pdfjsLib) return false;
    const blob = await download(ws.book_storage_path);
    const ab = await blob.arrayBuffer();
    global.st.bookPdf = await pdfjsLib.getDocument({ data: ab }).promise;
    global.st.bookFileName = ws.book_file_name || 'livro.pdf';
    global.st.bookTotalPages = global.st.bookPdf.numPages;
    global.st.bookFile = new File([ab], global.st.bookFileName, { type: 'application/pdf' });
    return true;
  }

  async function uploadCatalogImage(entry) {
    if (!entry?.imageId) return entry;
    const b64 = global.getImageB64(entry);
    if (!b64) return entry;
    const mime = (global.imgB64Type && global.imgB64Type(b64) === 'png') ? 'image/png' : 'image/jpeg';
    const ext = mime === 'image/png' ? 'png' : 'jpg';
    const p = `${prefix()}/images/${entry.imageId}.${ext}`;
    await upload(p, b64ToBlob(b64, mime), mime);
    entry.storagePath = p;
    const url = await signedUrl(p);
    entry.previewUrl = url;
    entry.dataUri = url;
    entry.dataUrl = url;
    return entry;
  }

  async function hydrateCatalogEntry(entry) {
    if (!entry) return entry;
    if (global.getImageB64(entry)) return entry;
    if (!entry.storagePath) return entry;
    try {
      const url = await signedUrl(entry.storagePath);
      entry.previewUrl = url;
      entry.dataUri = url;
      entry.dataUrl = url;
    } catch (e) {
      console.warn('hydrate image', entry.imageId, e);
    }
    return entry;
  }

  async function fetchImageB64(entry) {
    if (!entry) return '';
    const existing = global.getImageB64(entry);
    if (existing) return existing;
    if (!entry.storagePath) return '';
    const blob = await download(entry.storagePath);
    const b64 = await blobToB64(blob);
    entry.base64 = b64;
    return b64;
  }

  async function hydrateCatalog(catalog) {
    return Promise.all((catalog || []).map(hydrateCatalogEntry));
  }

  async function uploadHeaderFile(headerId, file, kind) {
    const ext = kind === 'pdf' ? 'pdf' : 'docx';
    const p = pathHeaderFile(headerId, ext);
    await upload(p, file, kind === 'pdf' ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    return p;
  }

  async function loadHeaderFile(storagePath, fileName, kind) {
    const blob = await download(storagePath);
    const mime = kind === 'pdf' ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    return new File([blob], fileName || 'cabecalho', { type: mime });
  }

  async function saveBuilderState(snap) {
    const catalog = snap.imageCatalog || [];
    for (const img of catalog) {
      if (!img.storagePath && global.getImageB64(img)) {
        await uploadCatalogImage(img);
      }
    }
    const slim = {
      ...snap,
      imageCatalog: catalog.map(stripImageBlob),
      imageQuestionBlocks: (snap.imageQuestionBlocks || []).map(b => ({
        ...b,
        image: stripImageBlob(b.image || {}),
      })),
    };
    await upsertWorkspace({ builder_state: slim, book_file_name: snap.bookFileName, book_total_pages: snap.bookTotalPages });
    return slim;
  }

  function stripImageBlob(img) {
    if (!img) return img;
    const { base64, previewUrl, dataUri, dataUrl, ...rest } = img;
    return rest;
  }

  async function saveHeadersIndex(idx) {
    await upsertWorkspace({ headers_index: idx });
  }

  async function loadHeadersIndex() {
    const ws = await getWorkspace();
    return ws?.headers_index || { activeId: null, items: [] };
  }

  async function clearWorkspace() {
    if (!enabled()) return;
    const ws = await getWorkspace();
    const paths = [];
    if (ws?.book_storage_path) paths.push(ws.book_storage_path);
    (ws?.headers_index?.items || []).forEach(it => {
      if (it.storagePath) paths.push(it.storagePath);
    });
    const bState = ws?.builder_state;
    (bState?.imageCatalog || []).forEach(img => {
      if (img.storagePath) paths.push(img.storagePath);
    });
    if (paths.length) {
      await global._sb.storage.from(BUCKET).remove(paths);
    }
    await upsertWorkspace({
      book_storage_path: null,
      book_file_name: null,
      book_total_pages: null,
      builder_state: {},
      headers_index: { activeId: null, items: [] },
    });
  }

  global.PedagiaCloud = {
    BUCKET,
    enabled,
    getWorkspace,
    upsertWorkspace,
    uploadBookFile,
    loadBookIntoState,
    uploadCatalogImage,
    hydrateCatalogEntry,
    hydrateCatalog,
    fetchImageB64,
    uploadHeaderFile,
    loadHeaderFile,
    saveBuilderState,
    saveHeadersIndex,
    loadHeadersIndex,
    signedUrl,
    upload,
    download,
    remove,
    pathHeaderFile,
    clearWorkspace,
    stripImageBlob,
  };
})(typeof window !== 'undefined' ? window : globalThis);
