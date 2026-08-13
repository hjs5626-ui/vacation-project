/* Memo image storage — IndexedDB (not localStorage) */

export const MEMO_MEDIA_DB_NAME = 'memento_media';
export const MEMO_MEDIA_STORE = 'memo_images';

const MEMO_IMAGE_MAX_LONG_EDGE = 1600;
const MEMO_IMAGE_JPEG_QUALITY = 0.82;
const MEMO_IMAGE_MAX_FILE_BYTES = 25 * 1024 * 1024;

let dbPromise = null;

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export function openMemoMediaDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }

    const request = indexedDB.open(MEMO_MEDIA_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MEMO_MEDIA_STORE)) {
        db.createObjectStore(MEMO_MEDIA_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onblocked = () => reject(new Error('IndexedDB open blocked'));
  }).catch((error) => {
    dbPromise = null;
    throw error;
  });

  return dbPromise;
}

export async function saveMemoImageBlob(record) {
  const db = await openMemoMediaDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEMO_MEDIA_STORE, 'readwrite');
    tx.oncomplete = () => resolve(record.id);
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB save failed'));
    tx.objectStore(MEMO_MEDIA_STORE).put(record);
  });
}

export async function getMemoImageBlob(imageId) {
  if (!imageId) return null;
  const db = await openMemoMediaDatabase();
  const tx = db.transaction(MEMO_MEDIA_STORE, 'readonly');
  return reqToPromise(tx.objectStore(MEMO_MEDIA_STORE).get(imageId));
}

export async function deleteMemoImageBlob(imageId) {
  if (!imageId) return;
  const db = await openMemoMediaDatabase();
  const tx = db.transaction(MEMO_MEDIA_STORE, 'readwrite');
  tx.objectStore(MEMO_MEDIA_STORE).delete(imageId);
  await reqToPromise(tx);
}

const objectUrlRegistry = new WeakMap();

export function revokeMemoImageObjectUrls(container) {
  if (!container) return;
  container.querySelectorAll('img[data-memo-object-url]').forEach((img) => {
    const url = img.dataset.memoObjectUrl || img.src;
    if (url?.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
    }
    img.removeAttribute('src');
    img.removeAttribute('data-memo-object-url');
  });
}

export async function loadMemoImageIntoElement(imgElement) {
  if (!imgElement) return false;
  const imageId = imgElement.dataset.memoImageId;
  if (!imageId) return false;

  try {
    const record = await getMemoImageBlob(imageId);
    if (!record?.blob) return false;

    const url = URL.createObjectURL(record.blob);
    imgElement.src = url;
    imgElement.dataset.memoObjectUrl = url;
    imgElement.removeAttribute('data-memo-load-error');
    return true;
  } catch (error) {
    console.warn('[Memo] loadMemoImageIntoElement failed:', imageId, error);
    imgElement.removeAttribute('src');
    imgElement.dataset.memoLoadError = '1';
    return false;
  }
}

export function applyMemoImageLayoutHints(container) {
  if (!container) return;
  container.querySelectorAll('img[data-memo-image-id]').forEach((img) => {
    img.style.display = 'block';
    img.style.width = '';
    img.style.height = '';
    img.style.maxWidth = '';
    img.style.maxHeight = '';
    img.style.objectFit = '';
  });
  container.querySelectorAll('.memo-editor-photo-block').forEach((block) => {
    block.style.width = '';
    block.style.maxWidth = '';
    block.style.margin = '';
  });
}

export async function hydrateMemoImagesInContainer(container, { readOnly = false } = {}) {
  if (!container) return;
  applyMemoImageLayoutHints(container);
  const imgs = container.querySelectorAll('img[data-memo-image-id]');
  await Promise.all(
    [...imgs].map(async (img) => {
      if (img.dataset.memoObjectUrl || img.src?.startsWith('blob:')) return;
      const ok = await loadMemoImageIntoElement(img);
      if (!ok && readOnly) {
        const fallback = document.createElement('span');
        fallback.className = 'memo-image-fallback';
        fallback.textContent = '사진을 불러올 수 없습니다.';
        img.replaceWith(fallback);
      }
    })
  );
}

export function collectMemoImageIdsFromHtml(html) {
  const ids = new Set();
  if (!html || typeof html !== 'string') return ids;

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  doc.body.querySelectorAll('[data-memo-image-id]').forEach((el) => {
    const id = el.getAttribute('data-memo-image-id')?.trim();
    if (id) ids.add(id);
  });
  return ids;
}

export function stripMemoImageSrcForSerialize(root) {
  if (!root) return;
  root.querySelectorAll('img[data-memo-image-id]').forEach((img) => {
    img.removeAttribute('src');
    img.removeAttribute('data-memo-object-url');
    img.removeAttribute('data-memo-load-error');
  });
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob failed'));
      },
      mimeType,
      quality
    );
  });
}

async function decodeImageFile(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fallback below */
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode failed'));
      el.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function getBitmapSize(source) {
  if ('width' in source && 'height' in source) {
    return { width: source.width, height: source.height };
  }
  return { width: 0, height: 0 };
}

export function validateMemoImageFile(file) {
  if (!file || !(file instanceof File)) {
    return { ok: false, reason: 'invalid' };
  }
  if (!file.type.startsWith('image/')) {
    return { ok: false, reason: 'not-image' };
  }
  if (file.size <= 0 || file.size > MEMO_IMAGE_MAX_FILE_BYTES) {
    return { ok: false, reason: 'too-large' };
  }
  if (file.type === 'image/gif') {
    return { ok: false, reason: 'gif' };
  }
  return { ok: true };
}

export async function compressMemoImageFile(file) {
  const validation = validateMemoImageFile(file);
  if (!validation.ok) {
    throw new Error(validation.reason || 'invalid');
  }

  const source = await decodeImageFile(file);
  const { width, height } = getBitmapSize(source);
  if (!width || !height) {
    if (typeof source.close === 'function') source.close();
    throw new Error('zero-dimensions');
  }

  const longEdge = Math.max(width, height);
  const scale = longEdge > MEMO_IMAGE_MAX_LONG_EDGE ? MEMO_IMAGE_MAX_LONG_EDGE / longEdge : 1;
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    if (typeof source.close === 'function') source.close();
    throw new Error('canvas-context');
  }

  ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
  if (typeof source.close === 'function') source.close();

  const preferWebp = file.type === 'image/webp';
  const hasAlpha = file.type === 'image/png' || file.type === 'image/webp';
  let mimeType = hasAlpha && !preferWebp ? 'image/png' : 'image/jpeg';
  let quality = mimeType === 'image/jpeg' ? MEMO_IMAGE_JPEG_QUALITY : undefined;

  let blob = await canvasToBlob(canvas, mimeType, quality);
  if (mimeType === 'image/webp' && (!blob || blob.size === 0)) {
    mimeType = 'image/jpeg';
    quality = MEMO_IMAGE_JPEG_QUALITY;
    blob = await canvasToBlob(canvas, mimeType, quality);
  }

  if (!blob || blob.size === 0) {
    throw new Error('encode-failed');
  }

  return {
    blob,
    mimeType,
    width: targetWidth,
    height: targetHeight,
  };
}

export async function createMemoImageRecordFromFile(file) {
  const compressed = await compressMemoImageFile(file);
  const id = crypto.randomUUID();
  const record = {
    id,
    blob: compressed.blob,
    mimeType: compressed.mimeType,
    width: compressed.width,
    height: compressed.height,
    createdAt: new Date().toISOString(),
    originalName: file.name ?? '',
    originalSize: file.size ?? 0,
  };
  await saveMemoImageBlob(record);
  return record;
}

export function getMemoImageValidationMessage(reason) {
  switch (reason) {
    case 'not-image':
      return '지원하지 않는 이미지 형식입니다.';
    case 'gif':
      return 'GIF 형식은 이번 버전에서 지원하지 않습니다.';
    case 'too-large':
      return '선택한 사진이 너무 큽니다.';
    case 'zero-dimensions':
      return '선택한 사진을 처리할 수 없습니다.';
    default:
      return '선택한 사진을 처리할 수 없습니다.';
  }
}

export function isMemoMediaQuotaError(error) {
  if (!error) return false;
  return error.name === 'QuotaExceededError' || error.code === 22;
}
