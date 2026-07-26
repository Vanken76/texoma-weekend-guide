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

const fromBase64 = (value) => {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const githubHeaders = (token) => ({
  accept: "application/vnd.github+json",
  authorization: `Bearer ${token}`,
  "x-github-api-version": "2022-11-28",
  "user-agent": "texoma-weekend-guide-event-publisher"
});

const validateEvent = (event) => {
  const problems = [];
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return ["The submitted event must be one JSON object."];
  }
  if (!event.event_name || typeof event.event_name !== "string") problems.push("event_name is required.");
  if (!event.event_slug || typeof event.event_slug !== "string") problems.push("event_slug is required.");
  else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(event.event_slug)) problems.push("event_slug must use lowercase letters, numbers, and single hyphens only.");
  if (!event.start_datetime || Number.isNaN(Date.parse(event.start_datetime))) problems.push("start_datetime is required and must be a valid date and time.");
  if (event.end_datetime && Number.isNaN(Date.parse(event.end_datetime))) problems.push("end_datetime must be null or a valid date and time.");
  if (event.end_datetime && event.start_datetime && Date.parse(event.end_datetime) < Date.parse(event.start_datetime)) problems.push("end_datetime cannot be before start_datetime.");
  if (!ALLOWED_STATUSES.has(event.status)) problems.push("status must be draft, upcoming, recurring, postponed, canceled, or ended.");
  if (!ALLOWED_COST_TYPES.has(event.cost_type)) problems.push("cost_type must be free, paid, donation, varies, or unknown.");
  if (event.image_url && !/^\/images\/events\/[a-z0-9-]+\.(jpg|png|webp)$/.test(event.image_url)) problems.push("image_url must use /images/events/event-slug.jpg, .png, or .webp.");
  return problems;
};

const putGithubFile = async ({ token, path, content, message, sha, binary = false }) => {
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/contents/${path}`, {
    method: "PUT",
    headers: { ...githubHeaders(token), "content-type": "application/json" },
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

  let event;
  let removeSlugs = [];
  let flyer = null;

  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      event = JSON.parse(String(form.get("event") || ""));
      removeSlugs = JSON.parse(String(form.get("remove_slugs") || "[]"));
      const candidate = form.get("flyer");
      if (candidate instanceof File && candidate.size > 0) flyer = candidate;
    } else {
      const payload = await request.json();
      event = payload?.event ?? payload;
      removeSlugs = payload?.remove_slugs ?? [];
    }
  } catch {
    return jsonResponse({ error: "The submitted event content is not valid JSON." }, 400);
  }

  removeSlugs = Array.isArray(removeSlugs)
    ? removeSlugs.filter((slug) => typeof slug === "string" && slug.trim()).map((slug) => slug.trim())
    : [];

  const problems = validateEvent(event);
  let flyerPath = null;
  if (flyer) {
    if (!ALLOWED_IMAGE_TYPES.has(flyer.type)) problems.push("Flyer must be a JPG, PNG, or WebP image.");
    if (flyer.size > MAX_IMAGE_BYTES) problems.push("Flyer must be 8 MB or smaller.");
    const extension = ALLOWED_IMAGE_TYPES.get(flyer.type);
    if (extension && event?.event_slug) {
      flyerPath = `public/images/events/${event.event_slug}.${extension}`;
      event.image_url = `/images/events/${event.event_slug}.${extension}`;
    }
  }
  if (problems.length) return jsonResponse({ error: "Event validation failed.", problems }, 400);

  const headers = githubHeaders(env.GITHUB_TOKEN);
  const fileUrl = `https://api.github.com/repos/${REPOSITORY}/contents/${FILE_PATH}?ref=${BRANCH}`;
  const currentResponse = await fetch(fileUrl, { headers });
  if (!currentResponse.ok) return jsonResponse({ error: `GitHub could not read the current Event Directory (${currentResponse.status}).` }, 502);

  const currentFile = await currentResponse.json();
  let directory;
  try {
    directory = JSON.parse(fromBase64(currentFile.content));
  } catch {
    return jsonResponse({ error: "The current GitHub Event Directory could not be decoded." }, 502);
  }
  if (!Array.isArray(directory.events)) return jsonResponse({ error: "The current GitHub Event Directory does not contain an events array." }, 502);

  const today = new Date().toISOString().slice(0, 10);
  const existingIndex = directory.events.findIndex((record) => record?.event_slug === event.event_slug);
  const previous = existingIndex >= 0 ? directory.events[existingIndex] : null;
  event.created_on = event.created_on || previous?.created_on || today;
  event.updated_on = today;
  event.last_checked = event.last_checked || today;
  event.timezone = event.timezone || "America/Chicago";
  if (!flyer && event.image_url === undefined && previous?.image_url) event.image_url = previous.image_url;

  let action = "added";
  if (existingIndex >= 0) {
    directory.events[existingIndex] = event;
    action = "updated";
  } else {
    directory.events.push(event);
  }

  const slugsToRemove = new Set(removeSlugs.filter((slug) => slug !== event.event_slug));
  const beforeRemoval = directory.events.length;
  directory.events = directory.events.filter((record) => !slugsToRemove.has(record?.event_slug));
  const removedCount = beforeRemoval - directory.events.length;

  directory.event_count = directory.events.length;
  directory.publish_ready_count = directory.events.filter((record) => record?.publish_ready === true).length;
  directory.generated_on = today;

  try {
    let imageCommit = null;
    if (flyer && flyerPath) {
      let imageSha;
      const imageRead = await fetch(`https://api.github.com/repos/${REPOSITORY}/contents/${flyerPath}?ref=${BRANCH}`, { headers });
      if (imageRead.ok) imageSha = (await imageRead.json()).sha;
      else if (imageRead.status !== 404) throw new Error(`GitHub could not read the flyer destination (${imageRead.status}).`);
      imageCommit = await putGithubFile({
        token: env.GITHUB_TOKEN,
        path: flyerPath,
        content: new Uint8Array(await flyer.arrayBuffer()),
        message: `Publish event flyer ${event.event_slug} ${new Date().toISOString()}`,
        sha: imageSha,
        binary: true
      });
    }

    const directoryCommit = await putGithubFile({
      token: env.GITHUB_TOKEN,
      path: FILE_PATH,
      content: `${JSON.stringify(directory, null, 2)}\n`,
      message: `Publish event ${event.event_slug} ${new Date().toISOString()}`,
      sha: currentFile.sha
    });

    return jsonResponse({
      success: true,
      message: `${event.event_name} was ${action} in the Event Directory.`,
      action,
      slug: event.event_slug,
      removed_count: removedCount,
      event_count: directory.event_count,
      publish_ready_count: directory.publish_ready_count,
      image_path: flyerPath,
      image_commit: imageCommit,
      commit: directoryCommit
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "GitHub publishing failed." }, 502);
  }
};

export const onRequest = async ({ request }) => request.method === "POST" ? undefined : jsonResponse({ error: "Method not allowed." }, 405);
