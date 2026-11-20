const AVATAR_SIZE = 64;
const AVATAR_LOAD_TIMEOUT = 5_000;

export async function cacheSignInAvatar(url: string): Promise<string | undefined> {
  try {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.referrerPolicy = 'no-referrer';
    const loaded = await new Promise<boolean>((resolve) => {
      const finish = (success: boolean) => {
        clearTimeout(timeout);
        image.onload = null;
        image.onerror = null;
        resolve(success);
      };
      const timeout = setTimeout(() => finish(false), AVATAR_LOAD_TIMEOUT);
      image.onload = () => finish(true);
      image.onerror = () => finish(false);
      image.src = url;
    });
    if (!loaded) return;

    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const context = canvas.getContext('2d');
    const size = Math.min(image.naturalWidth, image.naturalHeight);
    if (!context || !size) return;
    context.drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2,
      size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    return canvas.toDataURL('image/webp', 0.8);
  } catch {
    return undefined;
  }
}
