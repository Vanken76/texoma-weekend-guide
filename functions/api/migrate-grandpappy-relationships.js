const REPOSITORY = "Vanken76/texoma-weekend-guide";
const BRANCH = "main";
const PATH = "public/data/local-business-directory.json";
const MIGRATION_KEY = "twg-gpp-20260808-a4f9c2e71d6b";

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

const githubHeaders = (token) => ({
  accept: "application/vnd.github+json",
  authorization: `Bearer ${token}`,
  "x-github-api-version": "2022-11-28",
  "user-agent": "texoma-weekend-guide-migration"
});

const fromBase64 = (value) => {
  const normalized = String(value || "").replace(/\n/g, "");
  const bytes = Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const toBase64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
};

const readJson = async (response) => {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
};

export const onRequestGet = async ({ request, env }) => {
  const url = new URL(request.url);
  if (url.searchParams.get("key") !== MIGRATION_KEY) return jsonResponse({ error: "Not found." }, 404);
  if (!env.GITHUB_TOKEN) return jsonResponse({ error: "GitHub token is not configured." }, 500);

  try {
    const headers = githubHeaders(env.GITHUB_TOKEN);
    const fileResponse = await fetch(`https://api.github.com/repos/${REPOSITORY}/contents/${PATH}?ref=${BRANCH}`, { headers });
    if (!fileResponse.ok) return jsonResponse({ error: `Could not read directory (${fileResponse.status}).` }, 502);
    const file = await readJson(fileResponse);

    let text = "";
    if (typeof file.content === "string" && file.content.trim()) {
      text = fromBase64(file.content);
    } else if (file.git_url) {
      const blobResponse = await fetch(file.git_url, { headers });
      if (!blobResponse.ok) return jsonResponse({ error: `Could not read directory blob (${blobResponse.status}).` }, 502);
      const blob = await readJson(blobResponse);
      text = fromBase64(blob.content);
    }

    const data = JSON.parse(text);
    const businesses = Array.isArray(data.businesses) ? data.businesses : [];
    const grandpappy = businesses.find((item) => item?.slug === "grandpappy-point-resort-marina-denison");
    const point = businesses.find((item) => item?.slug === "the-point-restaurant");
    if (!grandpappy || !point) return jsonResponse({ error: "Required business records were not found." }, 404);

    grandpappy.parent_business = {
      slug: "lake-texoma",
      business_name: "Lake Texoma",
      relationship_note: "Grandpappy Point Resort & Marina is located on Lake Texoma in Denison, Texas."
    };
    grandpappy.updated_on = "2026-08-08";

    if (Array.isArray(grandpappy.good_to_know)) {
      grandpappy.good_to_know = grandpappy.good_to_know.map((note) =>
        typeof note === "string" && note.includes("should eventually have its own linked directory record")
          ? "The Point Restaurant is a separate waterfront restaurant located within Grandpappy Point Resort & Marina and has its own linked TWG directory record."
          : note
      );
    }

    point.parent_business = {
      slug: "grandpappy-point-resort-marina-denison",
      business_name: "Grandpappy Point Resort & Marina",
      relationship_note: "The Point Restaurant is located inside Grandpappy Point Resort & Marina."
    };
    point.updated_on = "2026-08-08";

    data.business_count = businesses.length;
    data.publish_ready_count = businesses.filter((record) => record?.publish_ready === true).length;
    data.generated_on = "2026-08-08";

    const updateResponse = await fetch(`https://api.github.com/repos/${REPOSITORY}/contents/${PATH}`, {
      method: "PUT",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        message: "Link Grandpappy Point and The Point Restaurant relationships",
        content: toBase64(`${JSON.stringify(data, null, 2)}\n`),
        sha: file.sha,
        branch: BRANCH
      })
    });
    const result = await readJson(updateResponse);
    if (!updateResponse.ok) return jsonResponse({ error: result?.message || `GitHub update failed (${updateResponse.status}).` }, 502);

    return jsonResponse({
      success: true,
      commit: result?.commit?.sha || null,
      updated: ["grandpappy-point-resort-marina-denison", "the-point-restaurant"]
    });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown migration error." }, 500);
  }
};

export const onRequest = async (context) => {
  if (context.request.method === "GET") return onRequestGet(context);
  return jsonResponse({ error: "Method not allowed." }, 405);
};
