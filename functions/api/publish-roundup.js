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

const validateRoundup = ({ slug, markdown, image }) => {
  const problems = [];

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    problems.push("Slug must use lowercase letters, numbers, and single hyphens only.");
  }

  if (!(image instanceof File)) {
    problems.push("Choose a roundup image.");
  } else {
    const extension = image.name.split(".").pop()?.toLowerCase() ?? "";
    const allowedExtensions = ALLOWED_IMAGE_TYPES.get(image.type);

    if (!allowedExtensions || !allowedExtensions.includes(extension)) {
      problems.push("The image must be a JPG, PNG, or WebP file with a matching extension.");
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(image.name)) {
      problems.push("The image filename may contain only letters, numbers, periods, underscores, and hyphens.");
    }
    if (image.size < 1) problems.push("The selected image is empty.");
    if (image.size > MAX_IMAGE_BYTES) problems.push("The image must be 8 MB or smaller.");
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
  if (image instanceof File && imagePath !== `/images/${image.name}`) {
    problems.push(`Frontmatter image must be exactly /images/${image.name}.`);
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

const fileExists = async (path, headers) => {
  const response = await fetch(`${githubFileUrl(path)}?ref=${BRANCH}`, { headers });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`GitHub could not check ${path} (${response.status}).`);
  return true;
};

const createGithubFile = async ({ path, content, message, headers }) => {
  const response = await fetch(githubFileUrl(path), {
    method: "PUT",
    headers: {
      ...headers,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      message,
      content,
      branch: BRANCH
    })
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.message || `GitHub rejected ${path} (${response.status}).`);
  }
  return result;
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
  const imageValue = form.get("image");
  const slug = typeof slugValue === "string" ? slugValue.trim() : "";
  const markdown = typeof markdownValue === "string"
    ? markdownValue.replace(/\r\n?/g, "\n").trim()
    : "";
  const image = imageValue instanceof File ? imageValue : null;

  const problems = validateRoundup({ slug, markdown, image });
  if (problems.length) {
    return jsonResponse({ error: "Validation failed.", problems }, 400);
  }

  const markdownPath = `src/content/roundups/${slug}.md`;
  const imagePath = `public/images/${image.name}`;
  const headers = githubHeaders(env.GITHUB_TOKEN);

  try {
    const [markdownExists, imageExists] = await Promise.all([
      fileExists(markdownPath, headers),
      fileExists(imagePath, headers)
    ]);

    const conflicts = [];
    if (markdownExists) conflicts.push(`A roundup already exists at ${markdownPath}.`);
    if (imageExists) conflicts.push(`An image already exists at ${imagePath}.`);
    if (conflicts.length) {
      return jsonResponse({ error: "Publishing would overwrite an existing file.", problems: conflicts }, 409);
    }

    const now = new Date().toISOString();
    const imageBytes = new Uint8Array(await image.arrayBuffer());
    const imageResult = await createGithubFile({
      path: imagePath,
      content: bytesToBase64(imageBytes),
      message: `Upload roundup image for ${slug} ${now}`,
      headers
    });

    const markdownResult = await createGithubFile({
      path: markdownPath,
      content: textToBase64(`${markdown}\n`),
      message: `Publish roundup ${slug} ${now}`,
      headers
    });

    return jsonResponse({
      success: true,
      message: "Roundup and image committed to GitHub. Cloudflare deployment should begin automatically.",
      slug,
      markdown_path: markdownPath,
      image_path: imagePath,
      image_commit: imageResult?.commit?.sha ?? null,
      commit: markdownResult?.commit?.sha ?? null
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