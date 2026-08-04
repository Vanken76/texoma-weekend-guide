const REPOSITORY = "Vanken76/texoma-weekend-guide";
const FILE_PATH = "public/data/local-geography-directory.json";
const MEDIA_DIRECTORY = "public/images/geography";
const BRANCH = "main";
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 30 * 1024 * 1024;

const ALLOWED_ENTITY_TYPES = new Set([
  "country", "state", "county", "city", "region", "district", "geographic_feature"
]);
const ALLOWED_STATUS = new Set(["active", "inactive", "planned", "archived"]);
const ALLOWED_COVERAGE = new Set(["core", "regional", "destination", "reference", "outside"]);
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_ROLES = new Set([
  "hero_primary", "hero_secondary", "official_logo", "seal", "flag", "outline",
  "thumbnail", "social", "gallery"
]);

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

const toBase64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

const fromBase64 = (value) => {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const githubHeadersFor = (token) => ({
  accept: "application/vnd.github+json",
  authorization: `Bearer ${token}`,
  "x-github-api-version": "2022-11-28",
  "user-agent": "texoma-weekend-guide-geography-publisher"
});

const extensionForType = (type) => ({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
}[type] || null);

const normalizeEntity = (input) => {
  const entity = structuredClone(input);
  if (entity.state_symbols && !entity.official_symbols) entity.official_symbols = entity.state_symbols;
  delete entity.state_symbols;
  entity.region_slugs = Array.isArray(entity.region_slugs) ? [...new Set(entity.region_slugs.filter(Boolean))] : [];
  entity.related_geography_slugs = Array.isArray(entity.related_geography_slugs)
    ? [...new Set(entity.related_geography_slugs.filter(Boolean))]
    : [];
  entity.sources = Array.isArray(entity.sources) ? entity.sources : [];
  entity.media = entity.media && typeof entity.media === "object" && !Array.isArray(entity.media)
    ? entity.media
    : {};
  entity.media.gallery = Array.isArray(entity.media.gallery) ? entity.media.gallery : [];
  return entity;
};

const validateEntity = (entity) => {
  const problems = [];
  if (!entity || typeof entity !== "object" || Array.isArray(entity)) return ["The geography record must be one JSON object."];
  if (!ALLOWED_ENTITY_TYPES.has(entity.entity_type)) problems.push("entity_type is invalid.");
  if (!entity.name || typeof entity.name !== "string") problems.push("name is required.");
  if (!entity.slug || typeof entity.slug !== "string") problems.push("slug is required.");
  else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entity.slug)) problems.push("slug must use lowercase letters, numbers, and single hyphens only.");
  if (!ALLOWED_STATUS.has(entity.status)) problems.push("status is invalid.");
  if (entity.publish_ready !== true) problems.push("publish_ready must be true.");
  if (!entity.description || typeof entity.description !== "string") problems.push("description is required.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entity.last_verified || "")) problems.push("last_verified must be YYYY-MM-DD.");
  if (!Array.isArray(entity.sources) || entity.sources.length === 0) problems.push("sources must contain at least one source object.");
  if (!ALLOWED_COVERAGE.has(entity.coverage_level)) problems.push("coverage_level is invalid.");
  if (typeof entity.within_twg_service_area !== "boolean") problems.push("within_twg_service_area must be true or false.");
  if (entity.entity_type !== "country" && (!entity.country_slug || typeof entity.country_slug !== "string")) problems.push("country_slug is required for non-country records.");
  if (entity.entity_type === "state" && !entity.country_slug) problems.push("A state requires country_slug.");
  if (entity.entity_type === "county" && !entity.state_slug) problems.push("A county requires state_slug.");
  if (entity.entity_type === "city" && !entity.state_slug) problems.push("A city requires state_slug.");
  const hasLat = entity.latitude !== null && entity.latitude !== undefined;
  const hasLng = entity.longitude !== null && entity.longitude !== undefined;
  if (hasLat !== hasLng) problems.push("latitude and longitude must be supplied together.");
  if (hasLat && (!Number.isFinite(entity.latitude) || entity.latitude < -90 || entity.latitude > 90)) problems.push("latitude is invalid.");
  if (hasLng && (!Number.isFinite(entity.longitude) || entity.longitude < -180 || entity.longitude > 180)) problems.push("longitude is invalid.");
  if (entity.coordinate_status === "verified") {
    if (!hasLat || !hasLng) problems.push("Verified coordinates require a valid coordinate pair.");
    if (!entity.coordinate_verified_at || !entity.coordinate_verified_by) problems.push("Verified coordinates require coordinate_verified_at and coordinate_verified_by.");
  }
  return problems;
};

const validateUploads = (uploads) => {
  const problems = [];
  let total = 0;
  for (const [index, upload] of uploads.entries()) {
    if (!upload || typeof upload !== "object") { problems.push(`Media item ${index + 1} is invalid.`); continue; }
    if (!ALLOWED_ROLES.has(upload.role)) problems.push(`Media item ${index + 1} has an invalid role.`);
    if (!ALLOWED_IMAGE_TYPES.has(upload.type)) problems.push(`Media item ${index + 1} must be JPG, PNG, or WebP.`);
    if (!upload.data || typeof upload.data !== "string") problems.push(`Media item ${index + 1} is missing file data.`);
    if (!Number.isFinite(upload.size) || upload.size <= 0 || upload.size > MAX_FILE_BYTES) problems.push(`Media item ${index + 1} must be 8 MB or smaller.`);
    if (!upload.alt_text || typeof upload.alt_text !== "string") problems.push(`Media item ${index + 1} requires alt text.`);
    if (!upload.usage_status || typeof upload.usage_status !== "string") problems.push(`Media item ${index + 1} requires usage status.`);
    total += Number(upload.size) || 0;
  }
  if (total > MAX_TOTAL_BYTES) problems.push("Combined media uploads must be 30 MB or smaller.");
  return problems;
};

const uploadMedia = async ({ entity, upload, githubHeaders, index }) => {
  const extension = extensionForType(upload.type);
  const suffix = upload.role === "gallery" ? `gallery-${String(index + 1).padStart(2, "0")}` : upload.role.replace(/_/g, "-");
  const imagePath = `${MEDIA_DIRECTORY}/${entity.slug}-${suffix}.${extension}`;
  const apiUrl = `https://api.github.com/repos/${REPOSITORY}/contents/${imagePath}`;
  const currentResponse = await fetch(`${apiUrl}?ref=${BRANCH}`, { headers: githubHeaders });
  let existingSha = null;
  if (currentResponse.ok) existingSha = (await currentResponse.json()).sha || null;
  else if (currentResponse.status !== 404) throw new Error(`Could not inspect existing media (${currentResponse.status}).`);

  const body = {
    message: `Upload geography media ${entity.slug} ${upload.role} ${new Date().toISOString()}`,
    content: upload.data.replace(/\s/g, ""),
    branch: BRANCH
  };
  if (existingSha) body.sha = existingSha;
  const response = await fetch(apiUrl, {
    method: "PUT",
    headers: { ...githubHeaders, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.message || `GitHub rejected media upload (${response.status}).`);

  return {
    role: upload.role,
    asset: {
      url: `/${imagePath.replace(/^public\//, "")}`,
      alt_text: upload.alt_text,
      source_name: upload.source_name || "",
      source_url: upload.source_url || "",
      credit: upload.credit || "",
      usage_status: upload.usage_status,
      usage_notes: upload.usage_notes || "",
      last_verified: upload.last_verified || entity.last_verified
    },
    commit: result?.commit?.sha || null
  };
};

const applyAsset = (entity, result) => {
  const media = entity.media;
  if (result.role === "gallery") media.gallery.push(result.asset);
  else media[result.role] = result.asset;
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.ADMIN_KEY || !env.GITHUB_TOKEN) return jsonResponse({ error: "Publisher secrets are not configured in Cloudflare." }, 500);
  if (request.headers.get("x-admin-key") !== env.ADMIN_KEY) return jsonResponse({ error: "Incorrect admin key." }, 401);

  let payload;
  try { payload = await request.json(); }
  catch { return jsonResponse({ error: "The submitted content is not valid JSON." }, 400); }

  const entity = normalizeEntity(payload?.entity ?? payload);
  const uploads = Array.isArray(payload?.uploads) ? payload.uploads : [];
  const removeSlugs = Array.isArray(payload?.remove_slugs) ? payload.remove_slugs.filter(Boolean) : [];
  const problems = [...validateEntity(entity), ...validateUploads(uploads)];
  if (problems.length) return jsonResponse({ error: "Geography validation failed.", problems }, 400);

  const githubHeaders = githubHeadersFor(env.GITHUB_TOKEN);
  const mediaCommits = [];
  try {
    for (let index = 0; index < uploads.length; index += 1) {
      const result = await uploadMedia({ entity, upload: uploads[index], githubHeaders, index });
      applyAsset(entity, result);
      if (result.commit) mediaCommits.push(result.commit);
    }
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Media upload failed." }, 502);
  }

  const fileUrl = `https://api.github.com/repos/${REPOSITORY}/contents/${FILE_PATH}?ref=${BRANCH}`;
  const currentResponse = await fetch(fileUrl, { headers: githubHeaders });
  if (!currentResponse.ok) return jsonResponse({ error: `GitHub could not read the geography directory (${currentResponse.status}).` }, 502);
  const currentFile = await currentResponse.json();
  let directory;
  try { directory = JSON.parse(fromBase64(currentFile.content)); }
  catch { return jsonResponse({ error: "The geography directory could not be decoded." }, 502); }
  if (!Array.isArray(directory.entities)) return jsonResponse({ error: "The geography directory does not contain an entities array." }, 502);

  const existingIndex = directory.entities.findIndex((record) => record?.slug === entity.slug);
  let action = "added";
  if (existingIndex >= 0) {
    const existing = directory.entities[existingIndex];
    entity.media = { ...(existing.media || {}), ...(entity.media || {}) };
    entity.media.gallery = Array.isArray(entity.media.gallery) ? entity.media.gallery : [];
    directory.entities[existingIndex] = entity;
    action = "updated";
  } else directory.entities.push(entity);

  const slugsToRemove = new Set(removeSlugs.filter((slug) => slug !== entity.slug));
  const beforeRemoval = directory.entities.length;
  directory.entities = directory.entities.filter((record) => !slugsToRemove.has(record?.slug));
  directory.entities.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  directory.schema_version = "1.0.1";
  directory.generated_on = new Date().toISOString().slice(0, 10);
  directory.entity_count = directory.entities.length;
  directory.publish_ready_count = directory.entities.filter((record) => record?.publish_ready === true).length;

  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/contents/${FILE_PATH}`, {
    method: "PUT",
    headers: { ...githubHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      message: `Publish geography ${entity.slug} ${new Date().toISOString()}`,
      content: toBase64(`${JSON.stringify(directory, null, 2)}\n`),
      sha: currentFile.sha,
      branch: BRANCH
    })
  });
  const result = await response.json();
  if (!response.ok) return jsonResponse({ error: result?.message || `GitHub rejected the update (${response.status}).` }, 502);

  return jsonResponse({
    success: true,
    message: `${entity.name} was ${action} in the geography directory.`,
    action,
    slug: entity.slug,
    entity_count: directory.entity_count,
    publish_ready_count: directory.publish_ready_count,
    removed_count: beforeRemoval - directory.entities.length,
    uploaded_media_count: uploads.length,
    media_commits: mediaCommits,
    commit: result?.commit?.sha || null,
    entity
  });
};

export const onRequest = async ({ request }) => {
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);
};
