const REPOSITORY = "Vanken76/texoma-weekend-guide";
const FILE_PATH = "public/data/local-business-directory.json";
const BRANCH = "main";

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

  const business = payload?.business ?? payload;
  const removeSlugs = Array.isArray(payload?.remove_slugs)
    ? payload.remove_slugs.filter((slug) => typeof slug === "string" && slug.trim()).map((slug) => slug.trim())
    : [];

  const problems = validateBusiness(business);
  if (problems.length) {
    return jsonResponse({ error: "Business validation failed.", problems }, 400);
  }

  const githubHeaders = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${env.GITHUB_TOKEN}`,
    "x-github-api-version": "2022-11-28",
    "user-agent": "texoma-weekend-guide-business-publisher"
  };

  const fileUrl = `https://api.github.com/repos/${REPOSITORY}/contents/${FILE_PATH}?ref=${BRANCH}`;
  const currentResponse = await fetch(fileUrl, { headers: githubHeaders });
  if (!currentResponse.ok) {
    return jsonResponse({ error: `GitHub could not read the current directory file (${currentResponse.status}).` }, 502);
  }

  const currentFile = await currentResponse.json();
  let directory;
  try {
    directory = JSON.parse(fromBase64(currentFile.content));
  } catch {
    return jsonResponse({ error: "The current GitHub directory file could not be decoded." }, 502);
  }

  if (!Array.isArray(directory.businesses)) {
    return jsonResponse({ error: "The current GitHub directory does not contain a businesses array." }, 502);
  }

  const slugsToRemove = new Set(removeSlugs.filter((slug) => slug !== business.slug));
  const existingIndex = directory.businesses.findIndex((record) => record?.slug === business.slug);
  let action = "added";

  if (existingIndex >= 0) {
    directory.businesses[existingIndex] = business;
    action = "updated";
  } else {
    directory.businesses.push(business);
  }

  const beforeRemoval = directory.businesses.length;
  directory.businesses = directory.businesses.filter((record) => !slugsToRemove.has(record?.slug));
  const removedCount = beforeRemoval - directory.businesses.length;

  directory.business_count = directory.businesses.length;
  directory.publish_ready_count = directory.businesses.filter((record) => record?.publish_ready === true).length;
  directory.generated_on = new Date().toISOString().slice(0, 10);

  const formattedJson = `${JSON.stringify(directory, null, 2)}\n`;
  const now = new Date().toISOString();
  const updateResponse = await fetch(`https://api.github.com/repos/${REPOSITORY}/contents/${FILE_PATH}`, {
    method: "PUT",
    headers: { ...githubHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      message: `Publish business ${business.slug} ${now}`,
      content: toBase64(formattedJson),
      sha: currentFile.sha,
      branch: BRANCH
    })
  });

  const updateResult = await updateResponse.json();
  if (!updateResponse.ok) {
    return jsonResponse({ error: updateResult?.message || `GitHub rejected the update (${updateResponse.status}).` }, 502);
  }

  return jsonResponse({
    success: true,
    message: `${business.business_name} was ${action} in the directory.`,
    action,
    slug: business.slug,
    removed_count: removedCount,
    business_count: directory.business_count,
    publish_ready_count: directory.publish_ready_count,
    commit: updateResult?.commit?.sha ?? null
  });
};

export const onRequest = async ({ request }) => {
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);
};
