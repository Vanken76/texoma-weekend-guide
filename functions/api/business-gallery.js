import { onRequest as handleBusinessGallery } from "./publish-business-gallery.js";

export const onRequest = async (context) => handleBusinessGallery(context);
