export type FileFieldValue = {
  name: string;
  mime: string;
  size: number;
  dataUrl: string;
};

export const FILE_FIELD_MAX_BYTES = 8 * 1024 * 1024;

const IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

export function isFileFieldImage(value: FileFieldValue | null): boolean {
  if (!value?.mime) return false;
  if (IMAGE_MIMES.has(value.mime)) return true;
  return value.mime.startsWith('image/') && value.dataUrl.startsWith('data:image/');
}

export function parseFileFieldValue(raw: unknown): FileFieldValue | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object' && raw && 'dataUrl' in raw && 'name' in raw) {
    const value = raw as FileFieldValue;
    if (typeof value.dataUrl === 'string' && value.dataUrl.startsWith('data:')) {
      return {
        name: String(value.name || 'file'),
        mime: String(value.mime || ''),
        size: Number(value.size) || 0,
        dataUrl: value.dataUrl,
      };
    }
    return null;
  }
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;
  if (text.startsWith('data:image/')) {
    return {
      name: 'image',
      mime: text.slice(5, text.indexOf(';')) || 'image/png',
      size: 0,
      dataUrl: text,
    };
  }
  try {
    return parseFileFieldValue(JSON.parse(text));
  } catch {
    return null;
  }
}

export function serializeFileFieldValue(value: FileFieldValue | null): string {
  if (!value) return '';
  return JSON.stringify({
    name: value.name,
    mime: value.mime,
    size: value.size,
    dataUrl: value.dataUrl,
  });
}

export function fileFieldDisplayName(raw: unknown): string {
  return parseFileFieldValue(raw)?.name ?? '';
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

export async function fileToFieldValue(file: File): Promise<FileFieldValue> {
  const mime = file.type || 'application/octet-stream';
  if (!mime.startsWith('image/')) {
    throw new Error('Please choose an image (PNG, JPEG, GIF, or WebP).');
  }
  if (file.size > FILE_FIELD_MAX_BYTES) {
    throw new Error('Image is too large. Maximum size is 8 MB.');
  }
  const dataUrl = await readFileAsDataUrl(file);
  if (!dataUrl.startsWith('data:image/')) {
    throw new Error('Please choose an image (PNG, JPEG, GIF, or WebP).');
  }
  return {
    name: file.name || 'image',
    mime,
    size: file.size,
    dataUrl,
  };
}
