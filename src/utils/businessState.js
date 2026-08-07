const normalizeExplicitState = (value) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["tx", "texas"].includes(normalized)) return "tx";
  if (["ok", "oklahoma"].includes(normalized)) return "ok";
  return "";
};

const stateFromLocationText = (value) => {
  const text = String(value ?? "").trim();
  if (!text) return "";

  const match = text.match(/(?:^|,\s*)(TX|Texas|OK|Oklahoma)\b/i);
  return normalizeExplicitState(match?.[1] ?? "");
};

export const businessStateCode = (business = {}) => {
  const explicit = [
    business.state_abbreviation,
    business.state,
    business.state_name,
    business.state_slug
  ]
    .map(normalizeExplicitState)
    .find(Boolean);

  if (explicit) return explicit;

  return [
    business.service_area_or_location,
    business.full_address,
    business.formatted_address
  ]
    .map(stateFromLocationText)
    .find(Boolean) || "";
};
