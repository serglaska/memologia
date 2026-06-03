import sharp from 'sharp';

// LinkedIn Newsletter: 1280×720 (16:9)
const W = 1280;
const H = 720;

export async function makeNewsletterImage(imageUrl) {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} при завантаженні фото`);
  const input = Buffer.from(await res.arrayBuffer());

  const meta = await sharp(input).metadata();
  const srcW = meta.width;
  const srcH = meta.height;

  // Масштабуємо оригінал так, щоб він вписався по висоті
  const scale = H / srcH;
  const fgW = Math.round(srcW * scale);
  const fgH = H;
  const left = Math.max(0, Math.round((W - fgW) / 2));

  const [background, foreground] = await Promise.all([
    // Фон: розтягуємо з crop і сильно блюримо
    sharp(input)
      .resize(W, H, { fit: 'cover', position: 'centre' })
      .blur(28)
      .jpeg({ quality: 80 })
      .toBuffer(),
    // Передній план: масштабуємо по висоті, зберігаємо пропорції
    sharp(input)
      .resize(fgW, fgH)
      .toBuffer(),
  ]);

  return sharp(background)
    .composite([{ input: foreground, left, top: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer();
}
