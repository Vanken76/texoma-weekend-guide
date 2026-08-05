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
  const normalized = String(value || "").replace(/\n/g, "");
  const binary = atob(normalized);
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

const authorize = (request, env) => {
  if (!env.ADMIN_KEY || !env.GITHUB_TOKEN) {
    return { error: jsonResponse({ error: "Publisher secrets are not configured in Cloudflare." }, 500) };
  }
  const suppliedKey = request.headers.get("x-admin-key");
  if (!suppliedKey || suppliedKey !== env.ADMIN_KEY) {
    return { error: jsonResponse({ error: "Incorrect admin key." }, 401) };
  }
  return { githubHeaders: githubHeadersFor(env.GITHUB_TOKEN) };
};

const readDirectory = async (githubHeaders) => {
  const url = `https://api.github.com/repos/${REPOSITORY}/contents/${DIRECTORY_PATH}?ref=${BRANCH}`;
  const response = await fetch(url, { headers: githubHeaders });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`GitHub could not read the current directory file (${response.status}). ${detail.slice(0, 200)}`.trim());
  }

  const file = await response.json();
  let text;

  if (typeof file.content === "string" && file.content.trim()) {
    text = fromBase64(file.content);
  } else if (file.git_url) {
    const blobResponse = await fetch(file.git_url, { headers: githubHeaders });
    if (!blobResponse.ok) {
      const detail = await blobResponse.text().catch(() => "");
      throw new Error(`GitHub could not read the directory blob (${blobResponse.status}). ${detail.slice(0, 200)}`.trim());
    }
    const blob = await blobResponse.json();
    if (blob.encoding !== "base64" || typeof blob.content !== "string") {
      throw new Error("GitHub returned the directory blob in an unsupported format.");
    }
    text = fromBase64(blob.content);
  } else if (file.download_url) {
    const rawResponse = await fetch(file.download_url, { cache: "no-store" });
    if (!rawResponse.ok) {
      throw new Error(`GitHub could not download the directory file (${rawResponse.status}).`);
    }
    text = await rawResponse.text();
  } else {
    throw new Error("GitHub returned directory metadata without readable file content.");
  }

  let directory;
  try {
    directory = JSON.parse(text);
  } catch (error) {
    throw new Error(`The business directory could not be decoded: ${error instanceof Error ? error.message : "Unknown JSON error"}`);
  }

  if (!Array.isArray(directory.businesses)) {
    throw new Error("The business directory does not contain a businesses array.");
  }

  return { file, directory };
};

const writeDirectory = async ({ directory, fileSha, githubHeaders, message }) => {
  directory.generated_on = new Date().toISOString().slice(0, 10);
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/contents/${DIRECTORY_PATH}`, {
    method: "PUT",
    headers: { ...githubHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      message,
      content: toBase64(`${JSON.stringify(directory, null, 2)}\n`),
      sha: fileSha,
      branch: BRANCH
    })
  });

  const raw = await response.text();
  let result = {};
  try {
    result = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`GitHub returned an unreadable response while saving the gallery (${response.status}).`);
  }
  if (!response.ok) throw new Error(result?.message || "GitHub rejected the gallery directory update.");
  return result?.commit?.sha ?? null;
};

const validateSlug = (slug) => Boolean(slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug));

const validateImage = (image, index) => {
  const problems = [];
  if (!extensionForType(image?.type)) problems.push(`Photo ${index + 1} must be a JPG, PNG, or WebP image.`);
  if (!image?.data || typeof image.data !== "string") problems.push(`Photo ${index + 1} image data is missing.`);
  if (!Number.isFinite(image?.size) || image.size <= 0) problems.push(`Photo ${index + 1} file size is invalid.`);
  if (image?.size > MAX_IMAGE_BYTES) problems.push(`Photo ${index + 1} must be 4 MB or smaller.`);
  return problems;
};

const repoPathFromPublicUrl = (url) => {
  if (typeof url !== "string" || !url.startsWith("/images/businesses/")) return null;
  return `public${url}`;
};

const deleteRepoImage = async ({ url, githubHeaders, slug }) => {
  const path = repoPathFromPublicUrl(url);
  if (!path) return false;
  const apiUrl = `https://api.github.com/repos/${REPOSITORY}/contents/${path}`;
  const current = await fetch(`${apiUrl}?ref=${BRANCH}`, { headers: githubHeaders });
  if (current.status === 404) return false;
  if (!current.ok) throw new Error(`GitHub could not inspect ${url} (${current.status}).`);
  const file = await current.json();
  const response = await fetch(apiUrl, {
    method: "DELETE",
    headers: { ...githubHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      message: `Delete gallery photo for ${slug} ${new Date().toISOString()}`,
      sha: file.sha,
      branch: BRANCH
    })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.message || `GitHub could not delete ${url}.`);
  return true;
};

export const onRequestGet = async ({ request, env }) => {
  const auth = authorize(request, env);
  if (auth.error) return auth.error;
  const url = new URL(request.url);
  const slug = (url.searchParams.get("slug") || "").trim();
  if (!validateSlug(slug)) return jsonResponse({ error: "A valid business slug is required." }, 400);

  try {
    const { directory } = await readDirectory(auth.githubHeaders);
    const business = directory.businesses.find((record) => record?.slug === slug);
    if (!business) return jsonResponse({ error: `No business with slug ${slug} was found.` }, 404);
    return jsonResponse({
      success: true,
      business_name: business.business_name,
      slug,
      gallery: Array.isArray(business.gallery) ? business.gallery : []
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Gallery lookup failed."
    }, 502);
  }
};

export const onRequestPost = async ({ request, env }) => {
  const auth = authorize(request, env);
  if (auth.error) return auth.error;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "The submitted content is not valid JSON." }, 400);
  }

  const slug = typeof payload?.slug === "string" ? payload.slug.trim() : "";
  const action = payload?.action || "upload";
  if (!validateSlug(slug)) return jsonResponse({ error: "A valid business slug is required." }, 400);

  try {
    const { file, directory } = await readDirectory(auth.githubHeaders);
    const business = directory.businesses.find((record) => record?.slug === slug);
    if (!business) return jsonResponse({ error: `No business with slug ${slug} was found.` }, 404);
    const existingGallery = Array.isArray(business.gallery) ? business.gallery : [];

    if (action === "delete") {
      const targetUrl = typeof payload?.url === "string" ? payload.url : "";
      if (!targetUrl) return jsonResponse({ error: "A gallery photo URL is required." }, 400);
      const nextGallery = existingGallery.filter((item) => (typeof item === "string" ? item : item?.url) !== targetUrl);
      if (nextGallery.length === existingGallery.length) {
        return jsonResponse({ error: "That photo is not in this business gallery." }, 404);
      }
      await deleteRepoImage({ url: targetUrl, githubHeaders: auth.githubHeaders, slug });
      business.gallery = nextGallery;
      const commit = await writeDirectory({
        directory,
        fileSha: file.sha,
        githubHeaders: auth.githubHeaders,
        message: `Remove business gallery photo ${slug} ${new Date().toISOString()}`
      });
      return jsonResponse({ success: true, message: "Gallery photo removed.", gallery: nextGallery, gallery_count: nextGallery.length, commit });
    }

    if (action === "clear") {
      for (const item of existingGallery) {
        const url = typeof item === "string" ? item : item?.url;
        if (url) await deleteRepoImage({ url, githubHeaders: auth.githubHeaders, slug });
      }
      business.gallery = [];
      const commit = await writeDirectory({
        directory,
        fileSha: file.sha,
        githubHeaders: auth.githubHeaders,
        message: `Clear business gallery ${slug} ${new Date().toISOString()}`
      });
      return jsonResponse({ success: true, message: "Business gallery cleared.", gallery: [], gallery_count: 0, commit });
    }

    const images = Array.isArray(payload?.images) ? payload.images : [];
    const replaceGallery = payload?.replace_gallery === true;
    const problems = [];
    if (!images.length) problems.push("Select at least one gallery photo.");
    if (images.length > MAX_IMAGES_PER_UPLOAD) problems.push(`Upload no more than ${MAX_IMAGES_PER_UPLOAD} photos at once.`);
    images.forEach((image, index) => problems.push(...validateImage(image, index)));
    if (problems.length) return jsonResponse({ error: "Gallery validation failed.", problems }, 400);

    if (replaceGallery) {
      for (const item of existingGallery) {
        const url = typeof item === "string" ? item : item?.url;
        if (url) await deleteRepoImage({ url, githubHeaders: auth.githubHeaders, slug });
      }
    }

    const stamp = Date.now();
    const uploaded = [];
    for (let index = 0; index < images.length; index += 1) {
      const image = images[index];
      const extension = extensionForType(image.type);
      const imagePath = `${IMAGE_ROOT}/${slug}/gallery-${stamp}-${index + 1}.${extension}`;
      const uploadUrl = `https://api.github.com/repos/${REPOSITORY}/contents/${imagePath}`;
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: { ...auth.githubHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          message: `Upload gallery photo for ${slug} ${new Date().toISOString()}`,
          content: image.data.replace(/\s/g, ""),
          branch: BRANCH
        })
      });
      const uploadResult = await uploadResponse.json();
      if (!uploadResponse.ok) throw new Error(uploadResult?.message || `GitHub rejected gallery photo ${index + 1}.`);
      const url = `/${imagePath.replace(/^public\//, "")}`;
      uploaded.push({
        url,
        alt: (typeof image.alt === "string" && image.alt.trim()) || `${business.business_name} photo ${index + 1}`,
        caption: (typeof image.caption === "string" && image.caption.trim()) || null
      });
    }

    business.gallery = replaceGallery ? uploaded : [...existingGallery, ...uploaded];
    business.last_checked = new Date().toISOString().slice(0, 10);
    const commit = await writeDirectory({
      directory,
      fileSha: file.sha,
      githubHeaders: auth.githubHeaders,
      message: `Update business gallery ${slug} ${new Date().toISOString()}`
    });
    return jsonResponse({
      success: true,
      message: `${uploaded.length} gallery photo${uploaded.length === 1 ? "" : "s"} added to ${business.business_name}.`,
      slug,
      uploaded,
      gallery: business.gallery,
      gallery_count: business.gallery.length,
      commit
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : "Gallery update failed."
    }, 502);
  }
};

export const onRequest = async (context) => {
  try {
    const { request } = context;
    if (request.method === "GET") return onRequestGet(context);
    if (request.method === "POST") return onRequestPost(context);
    return jsonResponse({ error: "Method not allowed." }, 405);
  } catch (error) {
    return jsonResponse({
      error: "Gallery operation failed unexpectedly.",
      detail: error instanceof Error ? error.message : "Unknown server error"
    }, 500);
  }
};
