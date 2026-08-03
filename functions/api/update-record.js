const REPOSITORY = "Vanken76/texoma-weekend-guide";
const BRANCH = "main";

const CONFIG = {
  business: {
    path: "public/data/local-business-directory.json",
    arrayKey: "businesses",
    slugKey: "slug",
    nameKey: "business_name",
    countKey: "business_count"
  },
  event: {
    path: "public/data/local-event-directory.json",
    arrayKey: "events",
    slugKey: "event_slug",
    nameKey: "event_name",
    countKey: "event_count"
  }
};

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
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

const validSlug = (value) => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

export const onRequestPost = async ({ request, env }) => {
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

  const { record_type: recordType, original_slug: originalSlug, record } = payload ?? {};
  const config = CONFIG[recordType];
  if (!config) return jsonResponse({ error: "record_type must be business or event." }, 400);
  if (!validSlug(originalSlug)) return jsonResponse({ error: "A valid original_slug is required." }, 400);
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return jsonResponse({ error: "record must be one JSON object." }, 400);
  }

  const newSlug = record[config.slugKey];
  const recordName = record[config.nameKey];
  const problems = [];
  if (!validSlug(newSlug)) problems.push(`${config.slugKey} must use lowercase letters, numbers, and single hyphens only.`);
  if (!recordName || typeof recordName !== "string") problems.push(`${config.nameKey} is required.`);
  if (problems.length) return jsonResponse({ error: "Validation failed.", problems }, 400);

  const githubHeaders = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${env.GITHUB_TOKEN}`,
    "x-github-api-version": "2022-11-28",
    "user-agent": "texoma-weekend-guide-record-editor"
  };

  const fileUrl = `https://api.github.com/repos/${REPOSITORY}/contents/${config.path}?ref=${BRANCH}`;
  const currentResponse = await fetch(fileUrl, { headers: githubHeaders });
  if (!currentResponse.ok) {
    return jsonResponse({ error: `GitHub could not read the current directory file (${currentResponse.status}).` }, 502);
  }

  const currentFile = await currentResponse.json();
  let directory;
  try {
    const decoded = Uint8Array.from(atob(currentFile.content.replace(/\n/g, "")), (c) => c.charCodeAt(0));
    directory = JSON.parse(new TextDecoder().decode(decoded));
  } catch {
    return jsonResponse({ error: "The current directory file could not be decoded." }, 502);
  }

  const records = directory[config.arrayKey];
  if (!Array.isArray(records)) return jsonResponse({ error: `Directory is missing ${config.arrayKey}.` }, 502);

  const index = records.findIndex((item) => item?.[config.slugKey] === originalSlug);
  if (index < 0) return jsonResponse({ error: `No ${recordType} record was found for ${originalSlug}.` }, 404);

  const duplicateIndex = records.findIndex((item, itemIndex) => itemIndex !== index && item?.[config.slugKey] === newSlug);
  if (duplicateIndex >= 0) return jsonResponse({ error: `Another record already uses the slug ${newSlug}.` }, 409);

  records[index] = record;
  directory[config.countKey] = records.length;
  directory.publish_ready_count = records.filter((item) => item?.publish_ready === true).length;
  directory.generated_on = new Date().toISOString().slice(0, 10);

  const formatted = `${JSON.stringify(directory, null, 2)}\n`;
  const updateResponse = await fetch(`https://api.github.com/repos/${REPOSITORY}/contents/${config.path}`, {
    method: "PUT",
    headers: { ...githubHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      message: `Update ${recordType} record ${originalSlug}`,
      content: toBase64(formatted),
      sha: currentFile.sha,
      branch: BRANCH
    })
  });

  const result = await updateResponse.json();
  if (!updateResponse.ok) {
    return jsonResponse({ error: result?.message || `GitHub rejected the update (${updateResponse.status}).` }, 502);
  }

  return jsonResponse({
    success: true,
    message: `${recordName} was saved. Cloudflare deployment should begin automatically.`,
    record_type: recordType,
    original_slug: originalSlug,
    slug: newSlug,
    commit: result?.commit?.sha ?? null
  });
};

export const onRequest = async ({ request }) => {
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);
};
