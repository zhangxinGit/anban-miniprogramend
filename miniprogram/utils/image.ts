const DATA_IMAGE_PATTERN = /^data:image\/([a-z0-9.+-]+);base64,/i;

const resolvedImageCache = new Map<string, Promise<string>>();

function normalizeExt(rawExt: string): string {
  const ext = String(rawExt || '').trim().toLowerCase();
  if (!ext) return 'img';
  if (ext === 'jpeg') return 'jpg';
  if (ext === 'svg+xml') return 'svg';
  return ext.replace(/[^a-z0-9]/g, '') || 'img';
}

function hashText(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function accessFile(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const fs = wx.getFileSystemManager?.();
    if (!fs) {
      resolve(false);
      return;
    }
    fs.access({
      path: filePath,
      success: () => resolve(true),
      fail: () => resolve(false),
    });
  });
}

function writeBase64File(filePath: string, data: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager?.();
    if (!fs) {
      reject(new Error('文件系统不可用'));
      return;
    }
    fs.writeFile({
      filePath,
      data,
      encoding: 'base64',
      success: () => resolve(),
      fail: reject,
    });
  });
}

export function isDataImageUrl(src: string): boolean {
  return DATA_IMAGE_PATTERN.test(String(src || '').trim());
}

/**
 * 解析图片 src，使其可在小程序 <image> 中正常显示。
 *
 * OSS Bucket 为私有权限（阻止公共访问），后端已在所有接口处调用
 * ossService.toSignedUrlIfOss() 生成带签名的临时 URL（含 Expires/OSSAccessKeyId/Signature 参数），
 * 可直接作为 <image src> 使用，无需下载到本地。签名默认有效期 24 小时，期间可正常访问。
 *
 * 处理逻辑：
 * - base64 data URI → 写入本地文件，返回本地路径（旧版兼容）
 * - 其他 URL（OSS 签名 URL、本地路径、空字符串）→ 原样返回
 */
export async function resolveMiniProgramImageSrc(src: string): Promise<string> {
  const normalized = String(src || '').trim();
  if (!normalized) {
    return normalized;
  }

  // 非 base64 → 直接返回（OSS 签名 URL / 本地路径等）
  if (!isDataImageUrl(normalized)) {
    return normalized;
  }

  // base64 data URI → 写入本地文件
  const cached = resolvedImageCache.get(normalized);
  if (cached) {
    return cached;
  }

  const task = (async () => {
    const match = normalized.match(DATA_IMAGE_PATTERN);
    const base64 = normalized.replace(DATA_IMAGE_PATTERN, '').replace(/\s+/g, '');
    const userDataPath = wx.env?.USER_DATA_PATH || '';
    if (!match || !base64 || !userDataPath) {
      return normalized;
    }
    const ext = normalizeExt(match[1]);
    const filePath = `${userDataPath}/service_cover_${hashText(normalized)}.${ext}`;
    if (await accessFile(filePath)) {
      return filePath;
    }
    await writeBase64File(filePath, base64);
    return filePath;
  })().catch(() => normalized);

  resolvedImageCache.set(normalized, task);
  return task;
}