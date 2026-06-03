/**
 * PedagIA — persistência na nuvem (Supabase Storage + pedagia_workspace)
 * Depende de: _sb, currentSession, getImageB64, cleanB64, imgB64Type (index.html)
 */
(function (global) {
  const BUCKET = 'pedagia';
  const SIGNED_TTL = 60 * 60 * 24; // 24h
  /** Limite típico Supabase Cloud (plano Free ≈ 50 MB). Ajuste no Dashboard → Storage → Settings. */
  const STORAGE_MAX_BYTES = 50 * 1024 * 1024;

  function uid() {
    return global.currentSession?.user?.id || null;
  }

  function enabled() {
    return !!(global._sb && uid());
  }

  function prefix() {
    return uid();
  }

  function materialBookKey(materialId) {
    const id = materialId || global.st?.materialId;
    return id || 'current';
  }

  function pathBook(materialId) {
    return `${prefix()}/books/${materialBookKey(materialId)}.pdf`;
  }

  function workspaceBuilderRoot(ws) {
    const root = ws?.builder_state;
    return root && typeof root === 'object' ? root : null;
  }

  function resolveBookPath(materialId, ws) {
    const key = materialBookKey(materialId);
    const root = workspaceBuilderRoot(ws);
    const bookMeta = root?.__books?.[key];
    if (bookMeta?.path) return bookMeta.path;
    if (global.st?.bookStoragePath) return global.st.bookStoragePath;
    if (!materialId && !global.st?.materialId && ws?.book_storage_path) return ws.book_storage_path;
    return pathBook(materialId);
  }

  function resolveBuilderSnap(materialId, ws) {
    const key = materialBookKey(materialId);
    const root = workspaceBuilderRoot(ws);
    const byMat = root?.__byMaterial;
    if (byMat && typeof byMat === 'object' && byMat[key]) return byMat[key];
    if (root?.imageCatalog && (!materialId || materialBookKey(materialId) === 'current')) return root;
    return null;
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

  function isStorageSizeError(err) {
    const msg = String(err?.message || err || '').toLowerCase();
    return (
      msg.includes('maximum allowed size') ||
      msg.includes('maximum size exceeded') ||
      msg.includes('payload too large') ||
      err?.status === 413 ||
      err?.statusCode === 413
    );
  }

  function formatMb(bytes) {
    return (bytes / (1024 * 1024)).toFixed(1);
  }

  async function upload(path, blob, contentType) {
    const size = blob.size || 0;
    const { error } = await global._sb.storage.from(BUCKET).upload(path, blob, {
      upsert: true,
      contentType: contentType || blob.type || 'application/octet-stream',
    });
    if (error) {
      if (isStorageSizeError(error)) {
        const e = new Error(
          `Arquivo grande demais para o Storage (${formatMb(size)} MB). ` +
            'No Supabase: Storage → Settings → aumente o limite global (ex.: 200 MB) e rode supabase/schema.sql para o bucket pedagia.',
        );
        e.code = 'STORAGE_SIZE_LIMIT';
        throw e;
      }
      throw error;
    }
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

  async function uploadBookFile(file, materialId) {
    const key = materialBookKey(materialId);
    const p = pathBook(materialId);
    try {
      await upload(p, file, 'application/pdf');
    } catch (err) {
      if (err?.code === 'STORAGE_SIZE_LIMIT' || isStorageSizeError(err)) {
        const ws = (await getWorkspace().catch(() => null)) || {};
        const root = { ...(workspaceBuilderRoot(ws) || {}) };
        const books = { ...(root.__books || {}) };
        books[key] = {
          path: null,
          file_name: file.name,
          total_pages: global.st?.bookTotalPages || null,
        };
        root.__books = books;
        const patch = { builder_state: root };
        if (key === 'current') {
          patch.book_storage_path = null;
          patch.book_file_name = file.name;
          patch.book_total_pages = global.st?.bookTotalPages || null;
        }
        await upsertWorkspace(patch);
        return { path: null, localOnly: true, maxBytes: STORAGE_MAX_BYTES, message: err.message };
      }
      throw err;
    }
    const ws = (await getWorkspace().catch(() => null)) || {};
    const root = { ...(workspaceBuilderRoot(ws) || {}) };
    const books = { ...(root.__books || {}) };
    books[key] = {
      path: p,
      file_name: file.name,
      total_pages: global.st?.bookTotalPages || null,
    };
    root.__books = books;
    const patch = { builder_state: root };
    if (key === 'current') {
      patch.book_storage_path = p;
      patch.book_file_name = file.name;
      patch.book_total_pages = global.st?.bookTotalPages || null;
    }
    await upsertWorkspace(patch);
    if (global.st) global.st.bookStoragePath = p;
    return { path: p, localOnly: false };
  }

  function isStorageMissingError(err) {
    const msg = String(err?.message || err || '').toLowerCase();
    return (
      msg.includes('not found') ||
      msg.includes('object not found') ||
      msg.includes('404') ||
      msg.includes('400') ||
      err?.status === 404 ||
      err?.status === 400 ||
      err?.statusCode === 404 ||
      err?.statusCode === 400
    );
  }

  async function loadBookIntoState(materialId) {
    const ws = await getWorkspace();
    const storagePath = resolveBookPath(materialId, ws);
    if (!storagePath) return false;
    const pdfjsLib = global['pdfjs-dist/build/pdf'] || global.pdfjsLib;
    if (!pdfjsLib) return false;
    const key = materialBookKey(materialId);
    const meta = workspaceBuilderRoot(ws)?.__books?.[key];
    try {
      const blob = await download(storagePath);
      const ab = await blob.arrayBuffer();
      global.st.bookPdf = await pdfjsLib.getDocument({ data: ab }).promise;
      global.st.bookFileName = meta?.file_name || ws?.book_file_name || global.st.bookFileName || 'livro.pdf';
      global.st.bookTotalPages = global.st.bookPdf.numPages;
      global.st.bookFile = new File([ab], global.st.bookFileName, { type: 'application/pdf' });
      global.st.bookStoragePath = storagePath;
      return true;
    } catch (err) {
      if (isStorageMissingError(err)) {
        try {
          if (key === 'current') await upsertWorkspace({ book_storage_path: null });
        } catch (_) {}
        return false;
      }
      throw err;
    }
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

  /** Lista arquivos em {userId}/images/ no bucket pedagia */
  async function listStorageImages() {
    if (!enabled()) return [];
    const folder = `${prefix()}/images`;
    const all = [];
    let offset = 0;
    const limit = 100;

    while (offset < 500) {
      const { data, error } = await global._sb.storage.from(BUCKET).list(folder, {
        limit,
        offset,
        sortBy: { column: 'created_at', order: 'desc' },
      });
      if (error) throw error;
      const batch = data || [];
      for (const f of batch) {
        if (!f?.name || f.name.endsWith('/')) continue;
        if (!/\.(jpe?g|png|webp)$/i.test(f.name)) continue;
        const storagePath = `${folder}/${f.name}`;
        const imageId = f.name.replace(/\.(jpe?g|png|webp)$/i, '');
        all.push({
          imageId,
          storagePath,
          fileName: f.name,
          size: f.metadata?.size,
          updatedAt: f.updated_at || f.created_at,
        });
      }
      if (batch.length < limit) break;
      offset += limit;
    }

    const ws = await getWorkspace().catch(() => null);
    const metaById = new Map();
    const root = workspaceBuilderRoot(ws);
    const catalogSources = [];
    if (root?.imageCatalog) catalogSources.push(root.imageCatalog);
    if (root?.__byMaterial && typeof root.__byMaterial === 'object') {
      for (const snap of Object.values(root.__byMaterial)) {
        if (snap?.imageCatalog) catalogSources.push(snap.imageCatalog);
      }
    }
    for (const list of catalogSources) {
      for (const img of list) {
        if (img?.imageId) metaById.set(img.imageId, img);
      }
    }
    const cloudMeta = root?.__cloudImageMeta;
    if (cloudMeta && typeof cloudMeta === 'object') {
      for (const [id, meta] of Object.entries(cloudMeta)) {
        if (id && meta) metaById.set(id, { ...(metaById.get(id) || {}), ...meta, imageId: id });
      }
    }

    const out = [];
    for (const item of all) {
      const meta = metaById.get(item.imageId) || {};
      let previewUrl = '';
      try {
        previewUrl = await signedUrl(item.storagePath);
      } catch (e) {
        console.warn('signedUrl', item.imageId, e);
      }
      out.push({
        imageId: item.imageId,
        storagePath: item.storagePath,
        fileName: item.fileName,
        previewUrl,
        dataUri: previewUrl,
        dataUrl: previewUrl,
        title: meta.title || '',
        sourceText: meta.sourceText || meta.src || meta.caption || '',
        caption: meta.caption || meta.src || '',
        pageNumber: meta.pageNumber || meta.pageNum,
        savedToBuilder: !!meta.savedToBuilder,
        cloudSaved: true,
      });
    }
    return out;
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

  function slimBuilderSnapshot(snap) {
    const catalog = snap.imageCatalog || [];
    return {
      bookFileName: snap.bookFileName,
      bookTotalPages: snap.bookTotalPages,
      sumarioPage: snap.sumarioPage,
      sumarioSkipped: !!snap.sumarioSkipped,
      bookChapters: snap.bookChapters,
      selectedChapterIdx: snap.selectedChapterIdx,
      selectedPages: snap.selectedPages,
      capManual: snap.capManual,
      savedAt: snap.savedAt,
      imageCatalog: catalog.map(stripImageBlob),
      imageQuestionBlocks: (snap.imageQuestionBlocks || []).map(b => ({
        blockId: b.blockId,
        selected: b.selected,
        imageId: b.imageId,
        image: stripImageBlob(b.image || {}),
        question: b.question,
      })),
    };
  }

  async function saveBuilderState(snap, materialId) {
    const catalog = snap.imageCatalog || [];
    for (const img of catalog) {
      if (!img.storagePath && global.getImageB64(img)) {
        try {
          await uploadCatalogImage(img);
        } catch (err) {
          if (!isStorageSizeError(err)) throw err;
          console.warn('Imagem não enviada (tamanho):', img.imageId, err.message);
        }
      }
    }
    const slim = slimBuilderSnapshot({ ...snap, imageCatalog: catalog });
    const json = JSON.stringify(slim);
    if (json.length > 900000) {
      slim.imageCatalog = (slim.imageCatalog || []).map(img => ({
        imageId: img.imageId,
        pageNumber: img.pageNumber,
        storagePath: img.storagePath,
        caption: (img.caption || '').slice(0, 120),
        savedToBuilder: img.savedToBuilder,
      }));
      slim.imageQuestionBlocks = (slim.imageQuestionBlocks || []).map(b => ({
        blockId: b.blockId,
        selected: b.selected,
        imageId: b.imageId,
        image: b.image ? { imageId: b.image.imageId, storagePath: b.image.storagePath } : {},
        question: b.question,
      }));
    }
    const key = materialBookKey(materialId);
    try {
      const ws = (await getWorkspace().catch(() => null)) || {};
      const root = { ...(workspaceBuilderRoot(ws) || {}) };
      const byMat = { ...(root.__byMaterial || {}), [key]: slim };
      root.__byMaterial = byMat;
      if (key === 'current') {
        Object.assign(root, slim);
      }
      await upsertWorkspace({
        builder_state: root,
        book_file_name: snap.bookFileName,
        book_total_pages: snap.bookTotalPages,
      });
    } catch (err) {
      if (isStorageSizeError(err) || String(err?.message || '').includes('too large')) {
        const e = new Error('Metadados do builder grandes demais para a nuvem — use menos imagens ou salve só neste navegador.');
        e.code = 'BUILDER_STATE_TOO_LARGE';
        throw e;
      }
      throw err;
    }
    return slim;
  }

  async function loadBuilderState(materialId) {
    const ws = await getWorkspace();
    return resolveBuilderSnap(materialId, ws);
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

  function newImageId() {
    const r = Math.random().toString(36).slice(2, 10);
    return `img_${r}_${Date.now().toString(36).slice(-6)}`;
  }

  async function uploadMediaImage(file) {
    if (!file?.type?.startsWith('image/')) throw new Error('Envie JPEG, PNG ou WebP.');
    const imageId = newImageId();
    const mime = file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const p = `${prefix()}/images/${imageId}.${ext}`;
    await upload(p, file, mime);
    const url = await signedUrl(p);
    return {
      imageId,
      storagePath: p,
      previewUrl: url,
      dataUri: url,
      dataUrl: url,
      cloudSaved: true,
      fileName: `${imageId}.${ext}`,
    };
  }

  async function upsertImageMeta(entry) {
    if (!enabled() || !entry?.imageId) return;
    const slim = {
      imageId: entry.imageId,
      storagePath: entry.storagePath || null,
      title: entry.title || '',
      sourceText: entry.sourceText || entry.src || entry.caption || '',
      src: entry.src || entry.sourceText || '',
      caption: entry.caption || entry.sourceText || '',
      pageNumber: entry.pageNumber || entry.pageNum || null,
      segmented: !!entry.segmented,
      cloudSaved: true,
      savedToBuilder: !!entry.savedToBuilder,
      description: (entry.description || '').slice(0, 500),
      type: entry.type || 'figura',
    };
    const ws = (await getWorkspace().catch(() => null)) || {};
    const root = { ...(workspaceBuilderRoot(ws) || {}) };
    root.__cloudImageMeta = { ...(root.__cloudImageMeta || {}), [entry.imageId]: slim };
    const cat = Array.isArray(root.imageCatalog) ? root.imageCatalog : [];
    const i = cat.findIndex((x) => x.imageId === entry.imageId);
    if (i >= 0) cat[i] = { ...cat[i], ...slim };
    else cat.push(slim);
    root.imageCatalog = cat;
    await upsertWorkspace({ builder_state: root });
    return slim;
  }

  async function deleteStorageImage(storagePath, imageId) {
    if (storagePath) {
      try {
        await remove(storagePath);
      } catch (e) {
        if (!isStorageMissingError(e)) throw e;
      }
    }
    const ws = await getWorkspace().catch(() => null);
    const snap = ws?.builder_state && typeof ws.builder_state === 'object' ? ws.builder_state : {};
    const imageCatalog = (snap.imageCatalog || []).filter((i) => i.imageId !== imageId);
    const imageQuestionBlocks = (snap.imageQuestionBlocks || []).filter((b) => b.imageId !== imageId);
    const cloudMeta = { ...(snap.__cloudImageMeta || {}) };
    delete cloudMeta[imageId];
    await upsertWorkspace({
      builder_state: {
        ...snap,
        imageCatalog,
        imageQuestionBlocks,
        __cloudImageMeta: cloudMeta,
      },
    });
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
    STORAGE_MAX_BYTES,
    isStorageSizeError,
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
    loadBuilderState,
    pathBook,
    saveHeadersIndex,
    loadHeadersIndex,
    listStorageImages,
    upsertImageMeta,
    uploadMediaImage,
    deleteStorageImage,
    newImageId,
    signedUrl,
    upload,
    download,
    remove,
    pathHeaderFile,
    clearWorkspace,
    stripImageBlob,
  };
})(typeof window !== 'undefined' ? window : globalThis);
