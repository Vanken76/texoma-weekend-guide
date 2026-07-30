const REPOSITORY = "Vanken76/texoma-weekend-guide";
const BRANCH = "main";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", ["jpg", "jpeg"]],
  ["image/png", ["png"]],
  ["image/webp", ["webp"]]
]);

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });

const bytesToBase64 = (bytes) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

const textToBase64 = (text) =>
  bytesToBase64(new TextEncoder().encode(text));

const frontmatterValue = (frontmatter, key) => {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, "m"));
  return match?.[1]?.trim() ?? "";
};

const validateImage = (image, label, problems, required = false) => {
  if (!(image instanceof File)) {
    if (required) problems.push(`Choose a ${label.toLowerCase()}.`);
    return;
  }

  const extension = image.name.split(".").pop()?.toLowerCase() ?? "";
  const allowedExtensions = ALLOWED_IMAGE_TYPES.get(image.type);
  if (!allowedExtensions || !allowedExtensions.includes(extension)) {
    problems.push(`${label} must be a JPG, PNG, or WebP file with a matching extension.`);
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(image.name)) {
    problems.push(`${label} filename may contain only letters, numbers, periods, underscores, and hyphens.`);
  }
  if (image.size < 1) problems.push(`${label} is empty.`);
  if (image.size > MAX_IMAGE_BYTES) problems.push(`${label} must be 8 MB or smaller.`);
};

const validateRoundup = ({ slug, markdown, primaryImage, secondaryImage }) => {
  const problems = [];

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    problems.push("Slug must use lowercase letters, numbers, and single hyphens only.");
  }

  validateImage(primaryImage, "Primary image", problems, true);
  validateImage(secondaryImage, "Second image", problems, false);
  if (primaryImage instanceof File && secondaryImage instanceof File && primaryImage.name === secondaryImage.name) {
    problems.push("The primary and second images must have different filenames.");
  }

  if (!markdown.startsWith("---\n")) {
    problems.push("Markdown must begin with a frontmatter delimiter (---).");
    return problems;
  }

  const closingIndex = markdown.indexOf("\n---", 4);
  if (closingIndex < 0) {
    problems.push("Markdown is missing the closing frontmatter delimiter.");
    return problems;
  }

  const frontmatter = markdown.slice(4, closingIndex);
  const body = markdown.slice(closingIndex + 4).trim();
  const title = frontmatterValue(frontmatter, "title");
  const description = frontmatterValue(frontmatter, "description");
  const startDate = frontmatterValue(frontmatter, "startDate");
  const endDate = frontmatterValue(frontmatter, "endDate");
  const imagePath = frontmatterValue(frontmatter, "image");

  if (!title) problems.push("Frontmatter is missing title.");
  if (!description) problems.push("Frontmatter is missing description.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) problems.push("startDate must use YYYY-MM-DD.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) problems.push("endDate must use YYYY-MM-DD.");
  if (startDate && endDate && endDate < startDate) problems.push("endDate cannot be before startDate.");
  if (primaryImage instanceof File && imagePath !== `/images/${primaryImage.name}`) {
    problems.push(`Frontmatter image must be exactly /images/${primaryImage.name}.`);
  }
  if (secondaryImage instanceof File && !body.includes(`(/images/${secondaryImage.name})`)) {
    problems.push(`Markdown body must include an image link ending in (/images/${secondaryImage.name}).`);
  }
  if (!body) problems.push("The roundup body is empty.");
  if (!/^##\s+/m.test(body)) problems.push("The roundup body needs at least one ## section heading.");

  return problems;
};

const githubHeaders = (token) => ({
  accept: "application/vnd.github+json",
  authorization: `Bearer ${token}`,
  "x-github-api-version": "2022-11-28",
  "user-agent": "texoma-weekend-guide-publisher"
});

const githubFileUrl = (path) =>
  `https://api.github.com/repos/${REPOSITORY}/contents/${path}`;

const getExistingFileSha = async (path, headers) => {
  const response = await fetch(`${githubFileUrl(path)}?ref=${BRANCH}`, { headers });
  if (response.status === 404) return null;
  const result = await response.json();
  if (!response.ok) throw new Error(result?.message || `GitHub could not check ${path} (${response.status}).`);
  return typeof result?.sha === "string" ? result.sha : null;
};

const upsertGithubFile = async ({ path, content, message, headers }) => {
  const sha = await getExistingFileSha(path, headers);
  const response = await fetch(githubFileUrl(path), {
    method: "PUT",
    headers: {
      ...headers,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      message,
      content,
      branch: BRANCH,
      ...(sha ? { sha } : {})
    })
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.message || `GitHub rejected ${path} (${response.status}).`);
  }
  return { result, updated: Boolean(sha) };
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.ADMIN_KEY || !env.GITHUB_TOKEN) {
    return jsonResponse({ error: "Publisher secrets are not configured in Cloudflare." }, 500);
  }

  const suppliedKey = request.headers.get("x-admin-key");
  if (!suppliedKey || suppliedKey !== env.ADMIN_KEY) {
    return jsonResponse({ error: "Incorrect admin key." }, 401);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return jsonResponse({ error: "The submitted form data could not be read." }, 400);
  }

  const slugValue = form.get("slug");
  const markdownValue = form.get("markdown");
  const primaryValue = form.get("image_primary") ?? form.get("image");
  const secondaryValue = form.get("image_secondary");
  const slug = typeof slugValue === "string" ? slugValue.trim() : "";
  const markdown = typeof markdownValue === "string"
    ? markdownValue.replace(/\r\n?/g, "\n").trim()
    : "";
  const primaryImage = primaryValue instanceof File ? primaryValue : null;
  const secondaryImage = secondaryValue instanceof File && secondaryValue.size > 0 ? secondaryValue : null;

  const problems = validateRoundup({ slug, markdown, primaryImage, secondaryImage });
  if (problems.length) {
    return jsonResponse({ error: "Validation failed.", problems }, 400);
  }

  const markdownPath = `src/content/roundups/${slug}.md`;
  const primaryImagePath = `public/images/${primaryImage.name}`;
  const secondaryImagePath = secondaryImage ? `public/images/${secondaryImage.name}` : null;
  const headers = githubHeaders(env.GITHUB_TOKEN);

  try {
    const now = new Date().toISOString();
    const primaryBytes = new Uint8Array(await primaryImage.arrayBuffer());
    const primaryWrite = await upsertGithubFile({
      path: primaryImagePath,
      content: bytesToBase64(primaryBytes),
      message: `Publish primary roundup image for ${slug} ${now}`,
      headers
    });

    let secondaryWrite = null;
    if (secondaryImage && secondaryImagePath) {
      const secondaryBytes = new Uint8Array(await secondaryImage.arrayBuffer());
      secondaryWrite = await upsertGithubFile({
        path: secondaryImagePath,
        content: bytesToBase64(secondaryBytes),
        message: `Publish second roundup image for ${slug} ${now}`,
        headers
      });
    }

    const markdownWrite = await upsertGithubFile({
      path: markdownPath,
      content: textToBase64(`${markdown}\n`),
      message: `Publish roundup ${slug} ${now}`,
      headers
    });

    const updatedAny = primaryWrite.updated || secondaryWrite?.updated || markdownWrite.updated;
    return jsonResponse({
      success: true,
      message: updatedAny
        ? "Roundup files updated in GitHub. Cloudflare deployment should begin automatically."
        : "Roundup files committed to GitHub. Cloudflare deployment should begin automatically.",
      slug,
      markdown_path: markdownPath,
      primary_image_path: primaryImagePath,
      secondary_image_path: secondaryImagePath,
      markdown_commit: markdownWrite.result?.commit?.sha ?? null,
      primary_image_commit: primaryWrite.result?.commit?.sha ?? null,
      secondary_image_commit: secondaryWrite?.result?.commit?.sha ?? null,
      updated_existing: Boolean(updatedAny)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown GitHub publishing error.";
    return jsonResponse({ error: message }, 502);
  }
};

export const onRequest = async ({ request }) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }
};
