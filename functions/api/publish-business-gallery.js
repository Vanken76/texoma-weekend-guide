const REPOSITORY = "Vanken76/texoma-weekend-guide";
const DIRECTORY_PATH = "public/data/local-business-directory.json";
const IMAGE_ROOT = "public/images/businesses";
const BRANCH = "main";
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGES_PER_UPLOAD = 12;

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });

const toBase64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

const fromBase64 = (value) => {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const extensionForType = (type) => ({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
}[type] || null);

const githubHeadersFor = (token) => ({
  accept: "application/vnd.github+json",
  authorization: `Bearer ${token}`,
  "x-github-api-version": "2022-11-28",
  "user-agent": "texoma-weekend-guide-business-gallery-publisher"
});

const validateImage = (image, index) => {
  const problems = [];
  const extension = extensionForType(image?.type);
  if (!extension) problems.push(`Photo ${index + 1} must be a JPG, PNG, or WebP image.`);
  if (!image?.data || typeof image.data !== "string") problems.push(`Photo ${index + 1} image data is missing.`);
  if (!Number.isFinite(image?.size) || image.size <= 0) problems.push(`Photo ${index + 1} file size is invalid.`);
  if (image?.size > MAX_IMAGE_BYTES) problems.push(`Photo ${index + 1} must be 4 MB or smaller.`);
  return problems;
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.ADMIN_KEY || !env.GITHUB_TOKEN) {
    return jsonResponse({ error: "Publisher secrets are not configured in Cloudflare." }, 500);
  }

  const suppliedKey = request.headers.get("x-admin-key");
  if (!suppliedKey || suppliedKey !== env.ADMIN_KEY) {
    return jsonResponse({ error: "Incorrect admin key." }, 401);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "The submitted content is not valid JSON." }, 400);
  }

  const slug = typeof payload?.slug === "string" ? payload.slug.trim() : "";
  const images = Array.isArray(payload?.images) ? payload.images : [];
  const replaceGallery = payload?.replace_gallery === true;

  const problems = [];
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    problems.push("A valid business slug is required.");
  }
  if (!images.length) problems.push("Select at least one gallery photo.");
  if (images.length > MAX_IMAGES_PER_UPLOAD) problems.push(`Upload no more than ${MAX_IMAGES_PER_UPLOAD} photos at once.`);
  images.forEach((image, index) => problems.push(...validateImage(image, index)));
  if (problems.length) return jsonResponse({ error: "Gallery validation failed.", problems }, 400);

  const githubHeaders = githubHeadersFor(env.GITHUB_TOKEN);
  const directoryUrl = `https://api.github.com/repos/${REPOSITORY}/contents/${DIRECTORY_PATH}?ref=${BRANCH}`;
  const currentResponse = await fetch(directoryUrl, { headers: githubHeaders });
  if (!currentResponse.ok) {
    return jsonResponse({ error: `GitHub could not read the current directory file (${currentResponse.status}).` }, 502);
  }

  const currentFile = await currentResponse.json();
  let directory;
  try {
    directory = JSON.parse(fromBase64(currentFile.content));
  } catch {
    return jsonResponse({ error: "The current business directory could not be decoded." }, 502);
  }

  const business = directory.businesses?.find((record) => record?.slug === slug);
  if (!business) return jsonResponse({ error: `No business with slug ${slug} was found.` }, 404);

  const stamp = Date.now();
  const uploaded = [];

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    const extension = extensionForType(image.type);
    const imagePath = `${IMAGE_ROOT}/${slug}/gallery-${stamp}-${index + 1}.${extension}`;
    const uploadUrl = `https://api.github.com/repos/${REPOSITORY}/contents/${imagePath}`;
    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: { ...githubHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        message: `Upload gallery photo for ${slug} ${new Date().toISOString()}`,
        content: image.data.replace(/\s/g, ""),
        branch: BRANCH
      })
    });
    const uploadResult = await uploadResponse.json();
    if (!uploadResponse.ok) {
      return jsonResponse({ error: uploadResult?.message || `GitHub rejected gallery photo ${index + 1}.` }, 502);
    }

    const url = `/${imagePath.replace(/^public\//, "")}`;
    uploaded.push({
      url,
      alt: (typeof image.alt === "string" && image.alt.trim()) || `${business.business_name} photo ${index + 1}`,
      caption: (typeof image.caption === "string" && image.caption.trim()) || null
    });
  }

  const existingGallery = Array.isArray(business.gallery) ? business.gallery : [];
  business.gallery = replaceGallery ? uploaded : [...existingGallery, ...uploaded];
  business.last_checked = new Date().toISOString().slice(0, 10);
  directory.generated_on = new Date().toISOString().slice(0, 10);

  const updateResponse = await fetch(`https://api.github.com/repos/${REPOSITORY}/contents/${DIRECTORY_PATH}`, {
    method: "PUT",
    headers: { ...githubHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      message: `Update business gallery ${slug} ${new Date().toISOString()}`,
      content: toBase64(`${JSON.stringify(directory, null, 2)}\n`),
      sha: currentFile.sha,
      branch: BRANCH
    })
  });
  const updateResult = await updateResponse.json();
  if (!updateResponse.ok) {
    return jsonResponse({ error: updateResult?.message || "GitHub rejected the gallery directory update." }, 502);
  }

  return jsonResponse({
    success: true,
    message: `${uploaded.length} gallery photo${uploaded.length === 1 ? "" : "s"} added to ${business.business_name}.`,
    slug,
    uploaded,
    gallery_count: business.gallery.length,
    commit: updateResult?.commit?.sha ?? null
  });
};

export const onRequest = async ({ request }) => {
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);
};
