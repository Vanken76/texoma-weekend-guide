const REPOSITORY = "Vanken76/texoma-weekend-guide";
const FILE_PATH = "public/data/local-business-directory.json";
const LOGO_DIRECTORY = "public/images/businesses";
const BRANCH = "main";
const MAX_LOGO_BYTES = 4 * 1024 * 1024;

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

const decodeBase64Utf8 = (content) => {
  const normalized = String(content || "").replace(/\n/g, "");
  const bytes = Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const githubHeadersFor = (token) => ({
  accept: "application/vnd.github+json",
  authorization: `Bearer ${token}`,
  "x-github-api-version": "2022-11-28",
  "user-agent": "texoma-weekend-guide-business-publisher"
});

const validateBusiness = (business) => {
  const problems = [];
  if (!business || typeof business !== "object" || Array.isArray(business)) {
    return ["The submitted business must be a JSON object."];
  }
  if (!business.business_name || typeof business.business_name !== "string") {
    problems.push("business_name is required.");
  }
  if (!business.slug || typeof business.slug !== "string") {
    problems.push("slug is required.");
  } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(business.slug)) {
    problems.push("slug must use lowercase letters, numbers, and single hyphens only.");
  }
  return problems;
};

const validateLogo = (logo) => {
  if (!logo) return [];
  const problems = [];
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowedTypes.has(logo.type)) problems.push("Logo must be a JPG, PNG, or WebP image.");
  if (!logo.data || typeof logo.data !== "string") problems.push("Logo image data is missing.");
  if (!Number.isFinite(logo.size) || logo.size <= 0) problems.push("Logo file size is invalid.");
  if (logo.size > MAX_LOGO_BYTES) problems.push("Logo must be 4 MB or smaller.");
  return problems;
};

const extensionForType = (type) => ({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
}[type] || null);

const readJsonSafely = async (response) => {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`GitHub returned an unreadable response (${response.status}).`);
  }
};

const loadDirectory = async (githubHeaders) => {
  const fileUrl = `https://api.github.com/repos/${REPOSITORY}/contents/${FILE_PATH}?ref=${BRANCH}`;
  const response = await fetch(fileUrl, { headers: githubHeaders });
  if (!response.ok) {
    throw new Error(`GitHub could not read the current directory file (${response.status}).`);
  }

  const currentFile = await readJsonSafely(response);
  let text = "";

  if (typeof currentFile.content === "string" && currentFile.content.trim()) {
    text = decodeBase64Utf8(currentFile.content);
  } else if (currentFile.git_url) {
    const blobResponse = await fetch(currentFile.git_url, { headers: githubHeaders });
    if (!blobResponse.ok) {
      throw new Error(`GitHub could not read the business directory blob (${blobResponse.status}).`);
    }
    const blob = await readJsonSafely(blobResponse);
    if (blob.encoding !== "base64" || typeof blob.content !== "string") {
      throw new Error("GitHub returned the business directory blob in an unsupported format.");
    }
    text = decodeBase64Utf8(blob.content);
  } else if (currentFile.download_url) {
    const rawResponse = await fetch(currentFile.download_url, { cache: "no-store" });
    if (!rawResponse.ok) {
      throw new Error(`GitHub could not download the business directory (${rawResponse.status}).`);
    }
    text = await rawResponse.text();
  } else {
    throw new Error("GitHub returned business-directory metadata without readable file content.");
  }

  let directory;
  try {
    directory = JSON.parse(text);
  } catch {
    throw new Error("The current GitHub business directory could not be decoded.");
  }

  if (!Array.isArray(directory.businesses)) {
    throw new Error("The current GitHub directory does not contain a businesses array.");
  }

  return { currentFile, directory };
};

const upsertLogo = async ({ business, logo, githubHeaders }) => {
  if (!logo) return null;
  const extension = extensionForType(logo.type);
  if (!extension) throw new Error("Unsupported logo file type.");

  const imagePath = `${LOGO_DIRECTORY}/${business.slug}-logo.${extension}`;
  const apiUrl = `https://api.github.com/repos/${REPOSITORY}/contents/${imagePath}`;
  const currentResponse = await fetch(`${apiUrl}?ref=${BRANCH}`, { headers: githubHeaders });
  let existingSha = null;

  if (currentResponse.ok) {
    existingSha = (await readJsonSafely(currentResponse)).sha || null;
  } else if (currentResponse.status !== 404) {
    throw new Error(`GitHub could not check the current logo (${currentResponse.status}).`);
  }

  const body = {
    message: `Upload business logo ${business.slug} ${new Date().toISOString()}`,
    content: logo.data.replace(/\s/g, ""),
    branch: BRANCH
  };
  if (existingSha) body.sha = existingSha;

  const uploadResponse = await fetch(apiUrl, {
    method: "PUT",
    headers: { ...githubHeaders, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const uploadResult = await readJsonSafely(uploadResponse);
  if (!uploadResponse.ok) {
    throw new Error(uploadResult?.message || `GitHub rejected the logo upload (${uploadResponse.status}).`);
  }

  return {
    path: `/${imagePath.replace(/^public\//, "")}`,
    commit: uploadResult?.commit?.sha || null
  };
};

const handlePost = async ({ request, env }) => {
  if (!env.ADMIN_KEY || !env.GITHUB_TOKEN) {
    return jsonResponse({ error: "Publisher secrets are not configured in Cloudflare." }, 500);
  }
  if (request.headers.get("x-admin-key") !== env.ADMIN_KEY) {
    return jsonResponse({ error: "Incorrect admin key." }, 401);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "The submitted content is not valid JSON." }, 400);
  }

  const business = payload?.business ?? payload;
  const logo = payload?.logo || null;
  const removeSlugs = Array.isArray(payload?.remove_slugs)
    ? payload.remove_slugs.filter((slug) => typeof slug === "string" && slug.trim()).map((slug) => slug.trim())
    : [];

  const problems = [...validateBusiness(business), ...validateLogo(logo)];
  if (problems.length) {
    return jsonResponse({ error: "Business validation failed.", problems }, 400);
  }

  const githubHeaders = githubHeadersFor(env.GITHUB_TOKEN);
  const { currentFile, directory } = await loadDirectory(githubHeaders);

  const existingIndex = directory.businesses.findIndex((record) => record?.slug === business.slug);
  const existing = existingIndex >= 0 ? directory.businesses[existingIndex] : null;
  if (existing) {
    for (const field of ["gallery", "logo_url", "logo_alt", "image", "image_url", "image_alt"]) {
      if (!(field in business) && field in existing) business[field] = existing[field];
    }
  }

  const logoResult = await upsertLogo({ business, logo, githubHeaders });
  if (logoResult) {
    business.logo_url = logoResult.path;
    business.logo_alt = `${business.business_name} logo`;
  }

  let action = "added";
  if (existingIndex >= 0) {
    directory.businesses[existingIndex] = business;
    action = "updated";
  } else {
    directory.businesses.push(business);
  }

  const slugsToRemove = new Set(removeSlugs.filter((slug) => slug !== business.slug));
  const beforeRemoval = directory.businesses.length;
  directory.businesses = directory.businesses.filter((record) => !slugsToRemove.has(record?.slug));
  const removedCount = beforeRemoval - directory.businesses.length;

  directory.business_count = directory.businesses.length;
  directory.publish_ready_count = directory.businesses.filter((record) => record?.publish_ready === true).length;
  directory.generated_on = new Date().toISOString().slice(0, 10);

  const updateResponse = await fetch(`https://api.github.com/repos/${REPOSITORY}/contents/${FILE_PATH}`, {
    method: "PUT",
    headers: { ...githubHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      message: `Publish business ${business.slug} ${new Date().toISOString()}`,
      content: toBase64(`${JSON.stringify(directory, null, 2)}\n`),
      sha: currentFile.sha,
      branch: BRANCH
    })
  });
  const updateResult = await readJsonSafely(updateResponse);
  if (!updateResponse.ok) {
    throw new Error(updateResult?.message || `GitHub rejected the directory update (${updateResponse.status}).`);
  }

  return jsonResponse({
    success: true,
    message: `${business.business_name} was ${action} in the directory.`,
    action,
    slug: business.slug,
    removed_count: removedCount,
    business_count: directory.business_count,
    publish_ready_count: directory.publish_ready_count,
    logo_url: logoResult?.path ?? business.logo_url ?? null,
    logo_commit: logoResult?.commit ?? null,
    commit: updateResult?.commit?.sha ?? null
  });
};

export const onRequestPost = async (context) => {
  try {
    return await handlePost(context);
  } catch (error) {
    return jsonResponse({
      error: "Business publishing failed.",
      detail: error instanceof Error ? error.message : "Unknown server error."
    }, 500);
  }
};

export const onRequest = async (context) => {
  if (context.request.method === "POST") return onRequestPost(context);
  return jsonResponse({ error: "Method not allowed." }, 405);
};
