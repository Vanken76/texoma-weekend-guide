import {
  onRequestGet as handleGalleryGet,
  onRequestPost as handleGalleryPost
} from "../publish-business-gallery.js";

export const onRequestGet = async (context) => handleGalleryGet(context);
export const onRequestPost = async (context) => handleGalleryPost(context);

export const onRequest = async (context) => {
  if (context.request.method === "GET") return handleGalleryGet(context);
  if (context.request.method === "POST") return handleGalleryPost(context);
  return new Response(JSON.stringify({ error: "Method not allowed." }), {
    status: 405,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
};
