const REPOSITORY = "Vanken76/texoma-weekend-guide";
const FILE_PATH = "public/data/local-event-directory.json";
const BRANCH = "main";
const ALLOWED_STATUSES = new Set(["draft", "upcoming", "recurring", "postponed", "canceled", "ended"]);
const ALLOWED_COST_TYPES = new Set(["free", "paid", "donation", "varies", "unknown"]);

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const toBase64 = (text) => { const bytes = new TextEncoder().encode(text); let binary = ""; for (let i=0;i<bytes.length;i+=0x8000) binary += String.fromCharCode(...bytes.subarray(i,i+0x8000)); return btoa(binary); };

const validateEvents = (data) => {
  const problems = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) return ["The top level must be a JSON object."];
  if (!Array.isArray(data.events)) return ['The JSON must contain an "events" array.'];
  const slugs = new Map();
  for (const [index,event] of data.events.entries()) {
    const prefix = `Event ${index + 1}`;
    if (!event?.event_name || typeof event.event_name !== "string") problems.push(`${prefix} is missing an event name.`);
    if (!event?.event_slug || typeof event.event_slug !== "string") problems.push(`${prefix} is missing an event slug.`);
    else slugs.set(event.event_slug, (slugs.get(event.event_slug) || 0) + 1);
    if (!event?.start_datetime || Number.isNaN(Date.parse(event.start_datetime))) problems.push(`${prefix} has an invalid start_datetime.`);
    if (event?.end_datetime && Number.isNaN(Date.parse(event.end_datetime))) problems.push(`${prefix} has an invalid end_datetime.`);
    if (event?.end_datetime && event?.start_datetime && Date.parse(event.end_datetime) < Date.parse(event.start_datetime)) problems.push(`${prefix} ends before it starts.`);
    if (!ALLOWED_STATUSES.has(event?.status)) problems.push(`${prefix} has an invalid status.`);
    if (!ALLOWED_COST_TYPES.has(event?.cost_type)) problems.push(`${prefix} has an invalid cost_type.`);
  }
  const duplicates = [...slugs.entries()].filter(([,count]) => count > 1).map(([slug]) => slug);
  if (duplicates.length) problems.push(`Duplicate event slug(s): ${duplicates.join(", ")}`);
  const eventCount = data.events.length;
  const readyCount = data.events.filter((event) => event?.publish_ready === true).length;
  if (data.event_count !== eventCount) problems.push(`event_count says ${data.event_count}, but the array contains ${eventCount}.`);
  if (data.publish_ready_count !== readyCount) problems.push(`publish_ready_count says ${data.publish_ready_count}, but ${readyCount} records are publish-ready.`);
  return problems;
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.ADMIN_KEY || !env.GITHUB_TOKEN) return jsonResponse({ error: "Publisher secrets are not configured in Cloudflare." }, 500);
  if (request.headers.get("x-admin-key") !== env.ADMIN_KEY) return jsonResponse({ error: "Incorrect admin key." }, 401);
  let directory;
  try { directory = JSON.parse(await request.text()); } catch { return jsonResponse({ error: "The submitted content is not valid JSON." }, 400); }
  const problems = validateEvents(directory);
  if (problems.length) return jsonResponse({ error: "Validation failed.", problems }, 400);

  const headers = { accept: "application/vnd.github+json", authorization: `Bearer ${env.GITHUB_TOKEN}`, "x-github-api-version": "2022-11-28", "user-agent": "texoma-weekend-guide-publisher" };
  const fileUrl = `https://api.github.com/repos/${REPOSITORY}/contents/${FILE_PATH}?ref=${BRANCH}`;
  const currentResponse = await fetch(fileUrl, { headers });
  if (!currentResponse.ok) return jsonResponse({ error: `GitHub could not read the current event file (${currentResponse.status}).` }, 502);
  const currentFile = await currentResponse.json();
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/contents/${FILE_PATH}`, { method: "PUT", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ message: `Publish event directory update ${new Date().toISOString()}`, content: toBase64(`${JSON.stringify(directory,null,2)}\n`), sha: currentFile.sha, branch: BRANCH }) });
  const result = await response.json();
  if (!response.ok) return jsonResponse({ error: result?.message || `GitHub rejected the update (${response.status}).` }, 502);
  return jsonResponse({ success: true, message: "Event Directory committed to GitHub. Cloudflare deployment should begin automatically.", commit: result?.commit?.sha ?? null, event_count: directory.event_count, publish_ready_count: directory.publish_ready_count });
};
export const onRequest = async ({ request }) => request.method === "POST" ? undefined : jsonResponse({ error: "Method not allowed." }, 405);
