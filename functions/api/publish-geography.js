const REPOSITORY = "Vanken76/texoma-weekend-guide";
const DIRECTORY_PATH = "public/data/local-geography-directory.json";
const IMAGE_ROOT = "public/images/geography";
const BRANCH = "main";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_UPLOADS = 12;
const ENTITY_TYPES = new Set(["country", "state", "county", "city", "region", "district", "geographic_feature"]);
const STATUSES = new Set(["active", "inactive", "planned", "archived"]);
const COVERAGE = new Set(["core", "regional", "destination", "reference", "outside"]);
const MEDIA_ROLES = new Set(["hero_primary", "hero_secondary", "official_logo", "seal", "flag", "outline", "gallery", "thumbnail", "social"]);
const USAGE_STATUSES = new Set(["owned", "licensed", "public-domain", "official-government-source", "permission-granted", "review-required", "restricted"]);

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  }
});

const toBase64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
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

const roleFileStem = (role) => ({
  hero_primary: "hero-primary",
  hero_secondary: "hero-secondary",
  official_logo: "official-logo",
  seal: "seal",
  flag: "flag",
  outline: "outline",
  thumbnail: "thumbnail",
  social: "social"
}[role] || null);

const githubHeadersFor = (token) => ({
  accept: "application/vnd.github+json",
  authorization: `Bearer ${token}`,
  "x-github-api-version": "2022-11-28",
  "user-agent": "texoma-weekend-guide-geography-publisher"
});

const readJsonSafely = async (response, context = "GitHub") => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${context} returned an unreadable response (${response.status}).`);
  }
};

const validateEntity = (entity) => {
  const problems = [];
  if (!entity || typeof entity !== "object" || Array.isArray(entity)) return ["The geography record must be one JSON object."];
  if (!ENTITY_TYPES.has(entity.entity_type)) problems.push("entity_type is invalid.");
  if (!entity.name || typeof entity.name !== "string") problems.push("name is required.");
  if (!entity.slug || typeof entity.slug !== "string") problems.push("slug is required.");
  else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entity.slug)) problems.push("slug must use lowercase letters, numbers, and single hyphens only.");
  if (!STATUSES.has(entity.status)) problems.push("status is invalid.");
  if (entity.publish_ready !== true) problems.push("publish_ready must be true.");
  if (!entity.description || typeof entity.description !== "string") problems.push("description is required.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entity.last_verified || "")) problems.push("last_verified must be YYYY-MM-DD.");
  if (!Array.isArray(entity.sources) || entity.sources.length === 0) problems.push("sources must contain at least one source object.");
  if (!COVERAGE.has(entity.coverage_level)) problems.push("coverage_level is invalid.");
  if (typeof entity.within_twg_service_area !== "boolean") problems.push("within_twg_service_area must be true or false.");
  if (entity.entity_type !== "country" && !entity.country_slug) problems.push("country_slug is required for non-country records.");
  if (entity.entity_type === "county" && !entity.state_slug) problems.push("A county requires state_slug.");
  if (entity.entity_type === "city" && !entity.state_slug) problems.push("A city requires state_slug.");
  if (entity.state_symbols && !entity.official_symbols) problems.push("Use official_symbols instead of deprecated state_symbols.");
  return problems;
};

const validateUpload = (upload, index) => {
  const problems = [];
  const prefix = `Image ${index + 1}`;
  if (!MEDIA_ROLES.has(upload?.role)) problems.push(`${prefix} has an invalid asset role.`);
  if (!extensionForType(upload?.type)) problems.push(`${prefix} must be a JPG, PNG, or WebP image.`);
  if (!upload?.data || typeof upload.data !== "string") problems.push(`${prefix} image data is missing.`);
  if (!Number.isFinite(upload?.size) || upload.size <= 0) problems.push(`${prefix} file size is invalid.`);
  if (upload?.size > MAX_IMAGE_BYTES) problems.push(`${prefix} must be 8 MB or smaller.`);
  if (!upload?.alt_text || typeof upload.alt_text !== "string") problems.push(`${prefix} requires alt text.`);
  if (!USAGE_STATUSES.has(upload?.usage_status)) problems.push(`${prefix} has an invalid usage/license status.`);
  if (upload?.last_verified && !/^\d{4}-\d{2}-\d{2}$/.test(upload.last_verified)) problems.push(`${prefix} last_verified must be YYYY-MM-DD.`);
  return problems;
};

const loadDirectory = async (githubHeaders) => {
  const url = `https://api.github.com/repos/${REPOSITORY}/contents/${DIRECTORY_PATH}?ref=${BRANCH}`;
  const response = await fetch(url, { headers: githubHeaders });
  if (!response.ok) throw new Error(`GitHub could not read the geography directory (${response.status}).`);
  const file = await readJsonSafely(response);
  let text = "";

  if (typeof file.content === "string" && file.content.trim()) {
    text = fromBase64(file.content);
  } else if (file.git_url) {
    const blobResponse = await fetch(file.git_url, { headers: githubHeaders });
    if (!blobResponse.ok) throw new Error(`GitHub could not read the geography directory blob (${blobResponse.status}).`);
    const blob = await readJsonSafely(blobResponse);
    if (blob.encoding !== "base64" || typeof blob.content !== "string") throw new Error("GitHub returned the geography directory blob in an unsupported format.");
    text = fromBase64(blob.content);
  } else if (file.download_url) {
    const rawResponse = await fetch(file.download_url, { cache: "no-store" });
    if (!rawResponse.ok) throw new Error(`GitHub could not download the geography directory (${rawResponse.status}).`);
    text = await rawResponse.text();
  } else {
    throw new Error("GitHub returned geography-directory metadata without readable file content.");
  }

  let directory;
  try {
    directory = JSON.parse(text);
  } catch {
    throw new Error("The current GitHub geography directory could not be decoded.");
  }
  if (!Array.isArray(directory.entities)) throw new Error("The current geography directory does not contain an entities array.");
  return { file, directory };
};

const publicUrlForPath = (repoPath) => `/${repoPath.replace(/^public\//, "")}`;

const upsertImage = async ({ entity, upload, index, githubHeaders }) => {
  const extension = extensionForType(upload.type);
  if (!extension) throw new Error(`Image ${index + 1} has an unsupported file type.`);
  const stamp = Date.now();
  const stem = upload.role === "gallery" ? `gallery-${stamp}-${index + 1}` : roleFileStem(upload.role);
  if (!stem) throw new Error(`Image ${index + 1} has an unsupported media role.`);
  const imagePath = `${IMAGE_ROOT}/${entity.slug}-${stem}.${extension}`;
  const apiUrl = `https://api.github.com/repos/${REPOSITORY}/contents/${imagePath}`;
  const currentResponse = await fetch(`${apiUrl}?ref=${BRANCH}`, { headers: githubHeaders });
  let existingSha = null;
  if (currentResponse.ok) existingSha = (await readJsonSafely(currentResponse)).sha || null;
  else if (currentResponse.status !== 404) throw new Error(`GitHub could not inspect ${upload.name || `image ${index + 1}`} (${currentResponse.status}).`);

  const body = {
    message: `Upload geography ${upload.role} for ${entity.slug} ${new Date().toISOString()}`,
    content: upload.data.replace(/\s/g, ""),
    branch: BRANCH
  };
  if (existingSha) body.sha = existingSha;

  const response = await fetch(apiUrl, {
    method: "PUT",
    headers: { ...githubHeaders, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = await readJsonSafely(response, "GitHub image upload");
  if (!response.ok) throw new Error(result?.message || `GitHub rejected ${upload.name || `image ${index + 1}`} (${response.status}).`);

  return {
    asset: {
      url: publicUrlForPath(imagePath),
      alt_text: upload.alt_text,
      source_name: upload.source_name || "",
      source_url: upload.source_url || "",
      credit: upload.credit || "",
      usage_status: upload.usage_status,
      usage_notes: upload.usage_notes || "",
      last_verified: upload.last_verified || new Date().toISOString().slice(0, 10)
    },
    commit: result?.commit?.sha || null
  };
};

const mergeExistingMedia = (existing, submitted) => {
  const existingMedia = existing?.media && typeof existing.media === "object" ? existing.media : {};
  const submittedMedia = submitted && typeof submitted === "object" ? submitted : {};
  const merged = { ...existingMedia, ...submittedMedia };
  if (Array.isArray(existingMedia.gallery) && Array.isArray(submittedMedia.gallery) && submittedMedia.gallery.length === 0 && existingMedia.gallery.length > 0) {
    merged.gallery = existingMedia.gallery;
  }
  if (!Array.isArray(merged.gallery)) merged.gallery = [];
  return merged;
};

const writeDirectory = async ({ directory, fileSha, githubHeaders, slug }) => {
  const today = new Date().toISOString().slice(0, 10);
  directory.entity_count = directory.entities.length;
  directory.publish_ready_count = directory.entities.filter((record) => record?.publish_ready === true).length;
  directory.generated_on = today;
  if ("last_updated" in directory) directory.last_updated = today;

  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/contents/${DIRECTORY_PATH}`, {
    method: "PUT",
    headers: { ...githubHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      message: `Publish geography ${slug} ${new Date().toISOString()}`,
      content: toBase64(`${JSON.stringify(directory, null, 2)}\n`),
      sha: fileSha,
      branch: BRANCH
    })
  });
  const result = await readJsonSafely(response, "GitHub geography directory update");
  if (!response.ok) throw new Error(result?.message || `GitHub rejected the geography directory update (${response.status}).`);
  return result?.commit?.sha || null;
};

const handlePost = async ({ request, env }) => {
  if (!env.ADMIN_KEY || !env.GITHUB_TOKEN) return jsonResponse({ error: "Publisher secrets are not configured in Cloudflare." }, 500);
  if (request.headers.get("x-admin-key") !== env.ADMIN_KEY) return jsonResponse({ error: "Incorrect admin key." }, 401);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "The submitted content is not valid JSON." }, 400);
  }

  const entity = payload?.entity ?? payload;
  const uploads = Array.isArray(payload?.uploads) ? payload.uploads : [];
  const removeSlugs = Array.isArray(payload?.remove_slugs)
    ? payload.remove_slugs.filter((slug) => typeof slug === "string" && slug.trim()).map((slug) => slug.trim())
    : [];

  const problems = validateEntity(entity);
  if (uploads.length > MAX_UPLOADS) problems.push(`Upload no more than ${MAX_UPLOADS} images at once.`);
  uploads.forEach((upload, index) => problems.push(...validateUpload(upload, index)));
  if (problems.length) return jsonResponse({ error: "Geography validation failed.", problems }, 400);

  const githubHeaders = githubHeadersFor(env.GITHUB_TOKEN);
  const { file, directory } = await loadDirectory(githubHeaders);
  const existingIndex = directory.entities.findIndex((record) => record?.slug === entity.slug);
  const existing = existingIndex >= 0 ? directory.entities[existingIndex] : null;
  entity.media = mergeExistingMedia(existing, entity.media);

  const uploaded = [];
  for (let index = 0; index < uploads.length; index += 1) {
    const upload = uploads[index];
    const result = await upsertImage({ entity, upload, index, githubHeaders });
    uploaded.push({ role: upload.role, url: result.asset.url, commit: result.commit });
    if (upload.role === "gallery") entity.media.gallery.push(result.asset);
    else entity.media[upload.role] = result.asset;
  }

  let action = "added";
  if (existingIndex >= 0) {
    directory.entities[existingIndex] = entity;
    action = "updated";
  } else {
    directory.entities.push(entity);
  }

  const slugsToRemove = new Set(removeSlugs.filter((slug) => slug !== entity.slug));
  const beforeRemoval = directory.entities.length;
  directory.entities = directory.entities.filter((record) => !slugsToRemove.has(record?.slug));
  const removedCount = beforeRemoval - directory.entities.length;
  const commit = await writeDirectory({ directory, fileSha: file.sha, githubHeaders, slug: entity.slug });

  return jsonResponse({
    success: true,
    message: `${entity.name} was ${action} in the geography directory.`,
    action,
    entity,
    entity_count: directory.entity_count,
    publish_ready_count: directory.publish_ready_count,
    uploaded_media_count: uploaded.length,
    uploaded,
    removed_count: removedCount,
    commit
  });
};

export const onRequestPost = async (context) => {
  try {
    return await handlePost(context);
  } catch (error) {
    return jsonResponse({
      error: "Geography publishing failed.",
      detail: error instanceof Error ? error.message : "Unknown server error."
    }, 500);
  }
};

export const onRequest = async (context) => {
  if (context.request.method === "POST") return onRequestPost(context);
  return jsonResponse({ error: "Method not allowed." }, 405);
};
