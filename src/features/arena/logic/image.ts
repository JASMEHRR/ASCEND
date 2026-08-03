/**
 * Client-side image prep for puzzle uploads.
 *
 * Uploads are stored as data URLs inside the week document, and Firestore caps
 * a document at 1 MB. Base64 inflates bytes by about a third, so anything over
 * roughly 700 KB of original file would fail to save — which is most phone
 * photos. Downscaling and re-encoding here keeps uploads well inside the limit
 * without needing Firebase Storage, and a puzzle grid never shows enough of
 * any single tile to miss the lost resolution.
 */

/** Longest edge, in px, of a stored puzzle image. */
const MAX_EDGE = 1280;

/** Stay comfortably under Firestore's 1 MB document ceiling. */
const MAX_BYTES = 600_000;

export interface PreparedImage {
  dataUrl: string;
  aspect: number;
}

/**
 * Downscale and JPEG-encode a file, stepping quality down until it fits.
 * Rejects if the file isn't a decodable image.
 */
export function prepareImage(file: File): Promise<PreparedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That file doesn't look like an image."));
      img.onload = () => {
        const { naturalWidth: w, naturalHeight: h } = img;
        const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
        const cw = Math.max(1, Math.round(w * scale));
        const ch = Math.max(1, Math.round(h * scale));

        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas is unavailable in this browser.'));
        ctx.drawImage(img, 0, 0, cw, ch);

        // Step quality down until the encoded string fits the budget.
        let quality = 0.82;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > MAX_BYTES && quality > 0.3) {
          quality -= 0.12;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        if (dataUrl.length > MAX_BYTES) {
          return reject(new Error('That image is too large to store. Try a smaller one, or paste a link.'));
        }
        resolve({ dataUrl, aspect: w / h });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Measure a remote image so its frame keeps the right shape.
 *
 * Rejects if the URL doesn't actually resolve to an image. The common mistake
 * is pasting the address of a *search results page* rather than the picture
 * itself — that loads as HTML, the canvas renders empty, and without this
 * check there's nothing to tell the user why.
 */
export function measureImage(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth / img.naturalHeight || 1);
    img.onerror = () =>
      reject(
        new Error(
          "That link didn't load as an image. If you copied it from a search page, right-click the picture itself and choose “Copy image address”.",
        ),
      );
    img.src = url;
  });
}
