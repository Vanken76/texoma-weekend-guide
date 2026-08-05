# Texoma Weekend Guide Publishing Troubleshooting

## First rule: do not keep retrying blindly

When an admin tool reports an error, determine whether the requested GitHub change already happened before changing code or pressing the button again.

## Error: `Unexpected token '<'`, `<!DOCTYPE...`, or “not valid JSON”

This means the browser expected JSON from an API endpoint but received HTML instead. The HTML may be a Cloudflare error page, a fallback page, a redirect target, or a generic site page.

### Required diagnostic order

1. **Check recent GitHub commits first.**
   - Look for an upload or publish commit matching the business, event, image, or slug.
   - Check whether the target file already exists in the repository.
   - If the commit exists, do not upload the same file again.

2. **Identify the last completed step.**
   - Image commit exists but directory commit does not: image upload succeeded; directory read/write failed afterward.
   - No commit exists: authentication, routing, request validation, or the first GitHub operation likely failed.
   - Directory commit exists: the publish likely succeeded even if the browser displayed a bad response.

3. **Check response type and status.**
   - Record request URL, method, HTTP status, content type, and the first portion of the response.
   - Never assume a routing problem solely from `<!DOCTYPE>`.

4. **Check directory size handling.**
   - GitHub’s Contents API may omit inline `content` for larger files.
   - Publishers must support, in order: inline `content`, `git_url` blob fallback, then `download_url` fallback.
   - Never assume `currentFile.content` is always present.

5. **Check Cloudflare Functions only after the GitHub commit check.**
   - Confirm the expected route returns JSON, including JSON for method-not-allowed responses.
   - Verify that the `functions/` directory is included in the deployment.

## Before modifying a working endpoint

1. Identify the last known successful commit.
2. Compare the current file with that version.
3. Prove the failing step before editing.
4. Change one variable at a time.
5. After two failed fixes, stop patching and add diagnostics or inspect the actual response.
6. Do not add aliases, redirects, or alternate routes until the original route failure is proven.
7. Preserve existing media and gallery fields when republishing a business record.

## Large-directory requirement

Every publisher that reads a growing JSON directory must use a shared large-file-safe reader:

- Use inline base64 `content` when present.
- Otherwise fetch `git_url` and decode the base64 blob.
- Otherwise fetch `download_url` as text.
- Return a JSON error with details when none are available.

This applies to business, event, gallery, record editor, geography, roundup, and future directory publishers.

## Safe testing rules

- Prefer read-only health checks.
- A GET request to a POST-only API should still return JSON with status 405.
- Do not test production writes with dummy records.
- Do not repeatedly upload the same image to test response handling.
- Confirm data and media commits independently.

## Known incident: August 5, 2026

The Salty Heifer logo upload succeeded multiple times, but the business publisher failed afterward while reading the enlarged business directory. Cloudflare returned HTML, causing the browser to report a JSON parse error. The correct diagnosis was a large-file handling failure, not an image-format, browser-cache, admin-key, or route-alias problem.
