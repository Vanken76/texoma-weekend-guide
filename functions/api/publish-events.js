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
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

const fromBase64 = (value) => {
  const binary = atob(String(value || "").replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const githubHeaders = (token) => ({
  accept: "application/vnd.github+json",
  authorization: `Bearer ${token}`,
  "x-github-api-version": "2022-11-28",
  "user-agent": "texoma-weekend-guide-event-publisher"
});

const githubJson = async (token, path, options = {}) => {
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}${path}`, {
    ...options,
    headers: {
      ...githubHeaders(token),
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.message || `GitHub request failed (${response.status}).`);
  return result;
};

const stringArray = (value) => Array.isArray(value)
  ? [...new Set(value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean))]
  : typeof value === "string" && value.trim() ? [value.trim()] : [];

const normalizeEvent = (submittedEvent) => {
  const event = { ...submittedEvent };

  event.venue_slugs = stringArray([
    ...stringArray(event.venue_slugs),
    ...stringArray(event.venue_slug),
    ...stringArray(event.secondary_venue_slugs)
  ]);

  event.categories = stringArray([
    ...stringArray(event.categories),
    ...stringArray(event.event_category)
  ]);

  event.partner_business_slugs = stringArray(event.partner_business_slugs);
  event.partner_names = stringArray([
    ...stringArray(event.partner_names),
    ...stringArray(event.partner_organizations)
  ]);

  if (!event.organizer_name && typeof event.host_name === "string") {
    event.organizer_name = event.host_name.trim();
  }

  delete event.venue_slug;
  delete event.secondary_venue_slugs;
  delete event.event_category;
  delete event.host_name;
  delete event.partner_organizations;

  return event;
};

const invalidSlugs = (values) => values.filter((slug) => !SLUG_PATTERN.test(slug));

const validateEvent = (event) => {
  const problems = [];
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return ["The submitted event must be one JSON object."];
  }
  if (!event.event_name || typeof event.event_name !== "string") problems.push("event_name is required.");
  if (!event.event_slug || typeof event.event_slug !== "string") problems.push("event_slug is required.");
  else if (!SLUG_PATTERN.test(event.event_slug)) problems.push("event_slug must use lowercase letters, numbers, and single hyphens only.");
  if (!event.start_datetime || Number.isNaN(Date.parse(event.start_datetime))) problems.push("start_datetime is required and must be a valid date and time.");
  if (event.end_datetime && Number.isNaN(Date.parse(event.end_datetime))) problems.push("end_datetime must be null or a valid date and time.");
  if (event.end_datetime && event.start_datetime && Date.parse(event.end_datetime) < Date.parse(event.start_datetime)) problems.push("end_datetime cannot be before start_datetime.");
  if (!ALLOWED_STATUSES.has(event.status)) problems.push("status must be draft, upcoming, recurring, postponed, canceled, or ended.");
  if (!ALLOWED_COST_TYPES.has(event.cost_type)) problems.push("cost_type must be free, paid, donation, varies, or unknown.");
  if (!Array.isArray(event.venue_slugs) || event.venue_slugs.length === 0) problems.push("venue_slugs is required and must contain at least one venue slug.");
  else if (invalidSlugs(event.venue_slugs).length) problems.push("Every venue_slugs value must use lowercase letters, numbers, and single hyphens only.");
  if (event.host_business_slug && !SLUG_PATTERN.test(event.host_business_slug)) problems.push("host_business_slug must use lowercase letters, numbers, and single hyphens only.");
  if (!Array.isArray(event.partner_business_slugs)) problems.push("partner_business_slugs must be an array when provided.");
  else if (invalidSlugs(event.partner_business_slugs).length) problems.push("Every partner_business_slugs value must use lowercase letters, numbers, and single hyphens only.");
  if (!Array.isArray(event.partner_names)) problems.push("partner_names must be an array when provided.");
  if (!Array.isArray(event.categories)) problems.push("categories must be an array.");
  if (event.image_url && !/^\/images\/events\/[a-z0-9-]+\.(jpg|png|webp)$/.test(event.image_url)) problems.push("image_url must use /images/events/event-slug.jpg, .png, or .webp.");
  return problems;
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

  event = normalizeEvent(event);
  removeSlugs = Array.isArray(removeSlugs)
    ? removeSlugs.filter((slug) => typeof slug === "string" && slug.trim()).map((slug) => slug.trim())
    : [];

  const problems = validateEvent(event);
  let flyerPath = null;
  let flyerBytes = null;
  if (flyer) {
    if (!ALLOWED_IMAGE_TYPES.has(flyer.type)) problems.push("Flyer must be a JPG, PNG, or WebP image.");
    if (flyer.size > MAX_IMAGE_BYTES) problems.push("Flyer must be 8 MB or smaller.");
    const extension = ALLOWED_IMAGE_TYPES.get(flyer.type);
    if (extension && event?.event_slug) {
      flyerPath = `public/images/events/${event.event_slug}.${extension}`;
      event.image_url = `/images/events/${event.event_slug}.${extension}`;
      flyerBytes = new Uint8Array(await flyer.arrayBuffer());
    }
  }
  if (problems.length) return jsonResponse({ error: "Event validation failed.", problems }, 400);

  const token = env.GITHUB_TOKEN;

  try {
    const ref = await githubJson(token, `/git/ref/heads/${BRANCH}`);
    const parentSha = ref.object.sha;
    const parentCommit = await githubJson(token, `/git/commits/${parentSha}`);

    const currentFile = await githubJson(token, `/contents/${FILE_PATH}?ref=${parentSha}`);
    let encodedDirectory = typeof currentFile.content === "string" && currentFile.content.trim()
      ? currentFile.content
      : null;

    if (!encodedDirectory && currentFile.sha) {
      const currentBlob = await githubJson(token, `/git/blobs/${currentFile.sha}`);
      if (currentBlob.encoding !== "base64" || typeof currentBlob.content !== "string") {
        return jsonResponse({ error: "GitHub returned the Event Directory blob in an unsupported format." }, 502);
      }
      encodedDirectory = currentBlob.content;
    }

    let directory;
    try {
      directory = JSON.parse(fromBase64(encodedDirectory));
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

    const directoryBlob = await githubJson(token, "/git/blobs", {
      method: "POST",
      body: JSON.stringify({ content: `${JSON.stringify(directory, null, 2)}\n`, encoding: "utf-8" })
    });

    const treeEntries = [{
      path: FILE_PATH,
      mode: "100644",
      type: "blob",
      sha: directoryBlob.sha
    }];

    if (flyerPath && flyerBytes) {
      const flyerBlob = await githubJson(token, "/git/blobs", {
        method: "POST",
        body: JSON.stringify({ content: bytesToBase64(flyerBytes), encoding: "base64" })
      });
      treeEntries.push({
        path: flyerPath,
        mode: "100644",
        type: "blob",
        sha: flyerBlob.sha
      });
    }

    const tree = await githubJson(token, "/git/trees", {
      method: "POST",
      body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree: treeEntries })
    });

    const commit = await githubJson(token, "/git/commits", {
      method: "POST",
      body: JSON.stringify({
        message: `Publish event ${event.event_slug} ${new Date().toISOString()}`,
        tree: tree.sha,
        parents: [parentSha]
      })
    });

    await githubJson(token, `/git/refs/heads/${BRANCH}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false })
    });

    return jsonResponse({
      success: true,
      message: `${event.event_name} was ${action} in one GitHub commit.`,
      action,
      slug: event.event_slug,
      removed_count: removedCount,
      event_count: directory.event_count,
      publish_ready_count: directory.publish_ready_count,
      image_path: flyerPath,
      image_commit: flyerPath ? commit.sha : null,
      commit: commit.sha
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub publishing failed.";
    const conflict = /fast forward|reference update failed|422/i.test(message);
    return jsonResponse({
      error: conflict
        ? "The repository changed during publishing. Please press Publish Event again."
        : message
    }, conflict ? 409 : 502);
  }
};

export const onRequest = async ({ request }) => request.method === "POST" ? undefined : jsonResponse({ error: "Method not allowed." }, 405);
