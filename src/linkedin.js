import { config } from './config.js';
import { markPosted } from './db.js';

const API = 'https://api.linkedin.com/v2';

const headers = () => ({
  'Authorization': `Bearer ${config.linkedin.accessToken}`,
  'Content-Type': 'application/json',
  'X-Restli-Protocol-Version': '2.0.0',
});

// Крок 1: завантажуємо картинку на LinkedIn і отримуємо asset URN
async function uploadImage(imageUrl) {
  // 1a. Реєструємо upload
  const registerRes = await fetch(`${API}/assets?action=registerUpload`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        owner: config.linkedin.personUrn,
        serviceRelationships: [{
          relationshipType: 'OWNER',
          identifier: 'urn:li:userGeneratedContent',
        }],
      },
    }),
  });

  if (!registerRes.ok) {
    throw new Error(`LinkedIn register upload failed: ${registerRes.status} ${await registerRes.text()}`);
  }

  const registerData = await registerRes.json();
  const uploadUrl = registerData.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
  const asset = registerData.value.asset;

  // 1b. Завантажуємо бінарний контент картинки
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) throw new Error(`Failed to fetch image: ${imageUrl}`);
  const imageBuffer = await imageRes.arrayBuffer();

  // 1c. Пушимо на LinkedIn
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${config.linkedin.accessToken}` },
    body: imageBuffer,
  });

  if (!uploadRes.ok) {
    throw new Error(`LinkedIn image upload failed: ${uploadRes.status}`);
  }

  return asset; // urn:li:digitalmediaAsset:XXXXX
}

// Крок 2: публікуємо пост з картинкою і текстом
export async function postToLinkedIn(meme, text) {
  const asset = await uploadImage(meme.image_url);

  const body = {
    author: config.linkedin.personUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory: 'IMAGE',
        media: [{
          status: 'READY',
          description: { text: meme.title },
          media: asset,
          title: { text: meme.title },
        }],
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  const res = await fetch(`${API}/ugcPosts`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LinkedIn post failed: ${res.status} ${errText}`);
  }

  const postId = res.headers.get('x-restli-id') ?? 'unknown';
  markPosted(meme.id, postId);

  console.log(`[linkedin] Опубліковано: ${postId}`);
  return postId;
}
