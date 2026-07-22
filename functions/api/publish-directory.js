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

const validateDirectory = (data) => {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return ["The top level must be a JSON object."];
  }

  if (!Array.isArray(data.businesses)) {
    return ['The JSON must contain a "businesses" array.'];
  }

  const problems = [];
  const slugCounts = new Map();
  let missingNames = 0;
  let missingSlugs = 0;

  for (const business of data.businesses) {
    if (!business?.business_name || typeof business.business_name !== "string") {
      missingNames += 1;
    }

    if (!business?.slug || typeof business.slug !== "string") {
      missingSlugs += 1;
    } else {
      slugCounts.set(business.slug, (slugCounts.get(business.slug) ?? 0) + 1);
    }
  }

  const duplicateSlugs = [...slugCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([slug]) => slug);

  const businessCount = data.businesses.length;
  const publishReadyCount = data.businesses.filter(
    (business) => business?.publish_ready === true
  ).length;

  if (missingNames) problems.push(`${missingNames} record(s) missing a business name.`);
  if (missingSlugs) problems.push(`${missingSlugs} record(s) missing a slug.`);
  if (duplicateSlugs.length) problems.push(`Duplicate slug(s): ${duplicateSlugs.join(", ")}`);
  if (data.business_count !== businessCount) {
    problems.push(`business_count says ${data.business_count}, but the array contains ${businessCount}.`);
  }
  if (data.publish_ready_count !== publishReadyCount) {
    problems.push(
      `publish_ready_count says ${data.publish_ready_count}, but ${publishReadyCount} records are publish-ready.`
    );
  }

  return problems;
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.ADMIN_KEY || !env.GITHUB_TOKEN) {
    return jsonResponse(
      { error: "Publisher secrets are not configured in Cloudflare." },
      500
    );
  }

  const suppliedKey = request.headers.get("x-admin-key");
  if (!suppliedKey || suppliedKey !== env.ADMIN_KEY) {
    return jsonResponse({ error: "Incorrect admin key." }, 401);
  }

  let rawBody;
  let directory;

  try {
    rawBody = await request.text();
    directory = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "The submitted content is not valid JSON." }, 400);
  }

  const problems = validateDirectory(directory);
  if (problems.length) {
    return jsonResponse({ error: "Validation failed.", problems }, 400);
  }

  const githubHeaders = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${env.GITHUB_TOKEN}`,
    "x-github-api-version": "2022-11-28",
    "user-agent": "texoma-weekend-guide-publisher"
  };

  const fileUrl = `https://api.github.com/repos/${REPOSITORY}/contents/${FILE_PATH}?ref=${BRANCH}`;
  const currentResponse = await fetch(fileUrl, { headers: githubHeaders });

  if (!currentResponse.ok) {
    return jsonResponse(
      { error: `GitHub could not read the current directory file (${currentResponse.status}).` },
      502
    );
  }

  const currentFile = await currentResponse.json();
  const formattedJson = `${JSON.stringify(directory, null, 2)}\n`;
  const now = new Date().toISOString();

  const updateResponse = await fetch(
    `https://api.github.com/repos/${REPOSITORY}/contents/${FILE_PATH}`,
    {
      method: "PUT",
      headers: {
        ...githubHeaders,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        message: `Publish directory update ${now}`,
        content: toBase64(formattedJson),
        sha: currentFile.sha,
        branch: BRANCH
      })
    }
  );

  const updateResult = await updateResponse.json();

  if (!updateResponse.ok) {
    return jsonResponse(
      {
        error: updateResult?.message || `GitHub rejected the update (${updateResponse.status}).`
      },
      502
    );
  }

  return jsonResponse({
    success: true,
    message: "Directory committed to GitHub. Cloudflare deployment should begin automatically.",
    commit: updateResult?.commit?.sha ?? null,
    business_count: directory.business_count,
    publish_ready_count: directory.publish_ready_count
  });
};

export const onRequest = async ({ request }) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
};
