const REPOSITORY = "Vanken76/texoma-weekend-guide";
const FILE_PATH = "public/data/local-event-directory.json";
const BRANCH = "main";
const ALLOWED_STATUSES = new Set(["draft", "upcoming", "recurring", "postponed", "canceled", "ended"]);
const ALLOWED_COST_TYPES = new Set(["free", "paid", "donation", "varies", "unknown"]);
const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

const bytesToBase64 = (bytes) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

const textToBase64 = (text) => bytesToBase64(new TextEncoder().encode(text));

const validateEvents = (data) => {
  const problems = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) return ["The top level must be a JSON object."];
  if (!Array.isArray(data.events)) return ['The JSON must contain an "events" array.'];

  const slugs = new Map();
  for (const [index, event] of data.events.entries()) {
    const prefix = `Event ${index + 1}`;
    if (!event?.event_name || typeof event.event_name !== "string") problems.push(`${prefix} is missing an event name.`);
    if (!event?.event_slug || typeof event.event_slug !== "string") problems.push(`${prefix} is missing an event slug.`);
    else slugs.set(event.event_slug, (slugs.get(event.event_slug) || 0) + 1);
    if (!event?.start_datetime || Number.isNaN(Date.parse(event.start_datetime))) problems.push(`${prefix} has an invalid start_datetime.`);
    if (event?.end_datetime && Number.isNaN(Date.parse(event.end_datetime))) problems.push(`${prefix} has an invalid end_datetime.`);
    if (event?.end_datetime && event?.start_datetime && Date.parse(event.end_datetime) < Date.parse(event.start_datetime)) problems.push(`${prefix} ends before it starts.`);
    if (!ALLOWED_STATUSES.has(event?.status)) problems.push(`${prefix} has an invalid status.`);
    if (!ALLOWED_COST_TYPES.has(event?.cost_type)) problems.push(`${prefix} has an invalid cost_type.`);
    if (event?.image_url && !/^\/images\/events\/[a-z0-9-]+\.(jpg|png|webp)$/.test(event.image_url)) {
      problems.push(`${prefix} has an invalid event image path.`);
    }
  }

  const duplicates = [...slugs.entries()].filter(([, count]) => count > 1).map(([slug]) => slug);
  if (duplicates.length) problems.push(`Duplicate event slug(s): ${duplicates.join(", ")}`);

  const eventCount = data.events.length;
  const readyCount = data.events.filter((event) => event?.publish_ready === true).length;
  if (data.event_count !== eventCount) problems.push(`event_count says ${data.event_count}, but the array contains ${eventCount}.`);
  if (data.publish_ready_count !== readyCount) problems.push(`publish_ready_count says ${data.publish_ready_count}, but ${readyCount} records are publish-ready.`);
  return problems;
};

const githubHeaders = (token) => ({
  accept: "application/vnd.github+json",
  authorization: `Bearer ${token}`,
  "x-github-api-version": "2022-11-28",
  "user-agent": "texoma-weekend-guide-publisher"
});

const putGithubFile = async ({ token, path, content, message, binary = false }) => {
  const headers = githubHeaders(token);
  const current = await fetch(`https://api.github.com/repos/${REPOSITORY}/contents/${path}?ref=${BRANCH}`, { headers });
  let sha;
  if (current.ok) sha = (await current.json()).sha;
  else if (current.status !== 404) throw new Error(`GitHub could not read ${path} (${current.status}).`);

  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/contents/${path}`, {
    method: "PUT",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({
      message,
      content: binary ? bytesToBase64(content) : textToBase64(content),
      ...(sha ? { sha } : {}),
      branch: BRANCH
    })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.message || `GitHub rejected ${path} (${response.status}).`);
  return result?.commit?.sha ?? null;
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.ADMIN_KEY || !env.GITHUB_TOKEN) return jsonResponse({ error: "Publisher secrets are not configured in Cloudflare." }, 500);
  if (request.headers.get("x-admin-key") !== env.ADMIN_KEY) return jsonResponse({ error: "Incorrect admin key." }, 401);

  let directory;
  let flyer = null;
  let flyerPath = null;

  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      directory = JSON.parse(String(form.get("directory") || ""));
      const candidate = form.get("flyer");
      if (candidate instanceof File && candidate.size > 0) flyer = candidate;
      flyerPath = String(form.get("flyerPath") || "") || null;
    } else {
      directory = JSON.parse(await request.text());
    }
  } catch {
    return jsonResponse({ error: "The submitted event content is not valid." }, 400);
  }

  const problems = validateEvents(directory);

  if (flyer) {
    if (!ALLOWED_IMAGE_TYPES.has(flyer.type)) problems.push("Flyer must be a JPG, PNG, or WebP image.");
    if (flyer.size > MAX_IMAGE_BYTES) problems.push("Flyer must be 8 MB or smaller.");
    if (!flyerPath || !/^public\/images\/events\/[a-z0-9-]+\.(jpg|png|webp)$/.test(flyerPath)) problems.push("The flyer destination path is invalid.");
    const expectedExtension = ALLOWED_IMAGE_TYPES.get(flyer.type);
    if (flyerPath && expectedExtension && !flyerPath.endsWith(`.${expectedExtension}`)) problems.push("The flyer file type does not match its destination extension.");
  }

  if (problems.length) return jsonResponse({ error: "Validation failed.", problems }, 400);

  try {
    let imageCommit = null;
    if (flyer && flyerPath) {
      imageCommit = await putGithubFile({
        token: env.GITHUB_TOKEN,
        path: flyerPath,
        content: new Uint8Array(await flyer.arrayBuffer()),
        message: `Publish event flyer ${new Date().toISOString()}`,
        binary: true
      });
    }

    const directoryCommit = await putGithubFile({
      token: env.GITHUB_TOKEN,
      path: FILE_PATH,
      content: `${JSON.stringify(directory, null, 2)}\n`,
      message: `Publish event directory update ${new Date().toISOString()}`
    });

    return jsonResponse({
      success: true,
      message: flyer ? "Event flyer and Event Directory committed to GitHub. Cloudflare deployment should begin automatically." : "Event Directory committed to GitHub. Cloudflare deployment should begin automatically.",
      commit: directoryCommit,
      image_commit: imageCommit,
      image_path: flyerPath,
      event_count: directory.event_count,
      publish_ready_count: directory.publish_ready_count
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "GitHub publishing failed." }, 502);
  }
};

export const onRequest = async ({ request }) => request.method === "POST" ? undefined : jsonResponse({ error: "Method not allowed." }, 405);
