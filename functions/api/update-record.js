const REPOSITORY = "Vanken76/texoma-weekend-guide";
const BRANCH = "main";
const RECORDS = {
  business: {
    path: "public/data/local-business-directory.json",
    arrayKey: "businesses",
    slugKey: "slug",
    countKey: "business_count"
  },
  event: {
    path: "public/data/local-event-directory.json",
    arrayKey: "events",
    slugKey: "event_slug",
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
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
};

const fromBase64 = (value) => {
  const normalized = String(value || "").replace(/\n/g, "");
  const bytes = Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const githubHeaders = (token) => ({
  accept: "application/vnd.github+json",
  authorization: `Bearer ${token}`,
  "x-github-api-version": "2022-11-28",
  "user-agent": "texoma-weekend-guide-record-admin"
});

const readJson = async (response) => {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`GitHub returned an unreadable response (${response.status}).`);
  }
};

const loadFile = async (token, path) => {
  const headers = githubHeaders(token);
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/contents/${path}?ref=${BRANCH}`, { headers });
  if (!response.ok) throw new Error(`GitHub could not read ${path} (${response.status}).`);
  const file = await readJson(response);

  let text = "";
  if (typeof file.content === "string" && file.content.trim()) {
    text = fromBase64(file.content);
  } else if (file.git_url) {
    const blobResponse = await fetch(file.git_url, { headers });
    if (!blobResponse.ok) throw new Error(`GitHub could not read the data blob (${blobResponse.status}).`);
    const blob = await readJson(blobResponse);
    if (blob.encoding !== "base64" || typeof blob.content !== "string") {
      throw new Error("GitHub returned the data blob in an unsupported format.");
    }
    text = fromBase64(blob.content);
  } else {
    throw new Error("GitHub returned file metadata without readable content.");
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`The current ${path} file could not be decoded.`);
  }
  return { file, data };
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.ADMIN_KEY || !env.GITHUB_TOKEN) {
    return jsonResponse({ error: "Admin secrets are not configured in Cloudflare." }, 500);
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

  if (payload?.action !== "delete") {
    return jsonResponse({ error: "Unsupported action." }, 400);
  }

  const recordType = typeof payload.record_type === "string" ? payload.record_type.trim().toLowerCase() : "";
  const slug = typeof payload.slug === "string" ? payload.slug.trim() : "";
  const config = RECORDS[recordType];

  if (!config) return jsonResponse({ error: "record_type must be business or event." }, 400);
  if (!slug) return jsonResponse({ error: "A slug is required." }, 400);

  try {
    const { file, data } = await loadFile(env.GITHUB_TOKEN, config.path);
    const records = data?.[config.arrayKey];
    if (!Array.isArray(records)) {
      return jsonResponse({ error: `The current directory does not contain a ${config.arrayKey} array.` }, 502);
    }

    const before = records.length;
    data[config.arrayKey] = records.filter((record) => record?.[config.slugKey] !== slug);
    if (data[config.arrayKey].length === before) {
      return jsonResponse({ error: `${recordType === "event" ? "Event" : "Business"} slug was not found: ${slug}` }, 404);
    }

    data[config.countKey] = data[config.arrayKey].length;
    data.publish_ready_count = data[config.arrayKey].filter((record) => record?.publish_ready === true).length;
    data.generated_on = new Date().toISOString().slice(0, 10);

    const headers = githubHeaders(env.GITHUB_TOKEN);
    const updateResponse = await fetch(`https://api.github.com/repos/${REPOSITORY}/contents/${config.path}`, {
      method: "PUT",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        message: `Delete ${recordType} ${slug} ${new Date().toISOString()}`,
        content: toBase64(`${JSON.stringify(data, null, 2)}\n`),
        sha: file.sha,
        branch: BRANCH
      })
    });
    const result = await readJson(updateResponse);
    if (!updateResponse.ok) {
      throw new Error(result?.message || `GitHub rejected the delete (${updateResponse.status}).`);
    }

    return jsonResponse({
      success: true,
      message: `${recordType === "event" ? "Event" : "Business"} ${slug} was deleted.`,
      slug,
      record_type: recordType,
      commit: result?.commit?.sha || null
    });
  } catch (error) {
    return jsonResponse({
      error: "Record deletion failed.",
      detail: error instanceof Error ? error.message : "Unknown server error."
    }, 502);
  }
};

export const onRequest = async (context) => {
  if (context.request.method === "POST") return onRequestPost(context);
  return jsonResponse({ error: "Method not allowed." }, 405);
};
