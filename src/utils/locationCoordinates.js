export const COORDINATE_STATUSES = Object.freeze([
  "missing",
  "unverified",
  "verified",
  "rejected"
]);

export const COORDINATE_SOURCES = Object.freeze([
  "manual",
  "official",
  "geocoded",
  "imported"
]);

const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(number) ? number : null;
};

export const isValidLatitude = (value) => {
  const latitude = toFiniteNumber(value);
  return latitude !== null && latitude >= -90 && latitude <= 90;
};

export const isValidLongitude = (value) => {
  const longitude = toFiniteNumber(value);
  return longitude !== null && longitude >= -180 && longitude <= 180;
};

export const normalizeCoordinatePair = (latitudeValue, longitudeValue) => {
  const latitude = toFiniteNumber(latitudeValue);
  const longitude = toFiniteNumber(longitudeValue);
  const hasLatitude = latitude !== null;
  const hasLongitude = longitude !== null;

  if (!hasLatitude && !hasLongitude) {
    return {
      latitude: null,
      longitude: null,
      valid: false,
      complete: false,
      reason: "missing"
    };
  }

  if (!hasLatitude || !hasLongitude) {
    return {
      latitude,
      longitude,
      valid: false,
      complete: false,
      reason: "incomplete_pair"
    };
  }

  if (!isValidLatitude(latitude)) {
    return {
      latitude,
      longitude,
      valid: false,
      complete: true,
      reason: "latitude_out_of_range"
    };
  }

  if (!isValidLongitude(longitude)) {
    return {
      latitude,
      longitude,
      valid: false,
      complete: true,
      reason: "longitude_out_of_range"
    };
  }

  return {
    latitude,
    longitude,
    valid: true,
    complete: true,
    reason: null
  };
};

export const getCoordinateMetadata = (record = {}) => {
  const pair = normalizeCoordinatePair(record.latitude, record.longitude);
  const source = COORDINATE_SOURCES.includes(record.coordinate_source)
    ? record.coordinate_source
    : null;
  const status = COORDINATE_STATUSES.includes(record.coordinate_status)
    ? record.coordinate_status
    : pair.valid
      ? "unverified"
      : "missing";

  return {
    ...pair,
    source,
    status,
    verifiedAt: record.coordinate_verified_at || null,
    verifiedBy: record.coordinate_verified_by || null,
    note: record.coordinate_note || null,
    usableForMap: pair.valid && status === "verified"
  };
};

export const validateCoordinateRecord = (record = {}, options = {}) => {
  const metadata = getCoordinateMetadata(record);
  const errors = [];
  const warnings = [];

  if (metadata.reason === "incomplete_pair") {
    errors.push("Latitude and longitude must be supplied together.");
  } else if (metadata.reason === "latitude_out_of_range") {
    errors.push("Latitude must be between -90 and 90.");
  } else if (metadata.reason === "longitude_out_of_range") {
    errors.push("Longitude must be between -180 and 180.");
  }

  if (metadata.valid && !metadata.source) {
    warnings.push("Coordinate source is missing.");
  }

  if (metadata.status === "verified" && !metadata.valid) {
    errors.push("Coordinates cannot be marked verified unless the pair is valid.");
  }

  if (metadata.status === "verified" && !metadata.verifiedAt) {
    warnings.push("Verified coordinates should include coordinate_verified_at.");
  }

  if (options.requireVerified === true && !metadata.usableForMap) {
    errors.push("A verified coordinate pair is required for map publication.");
  }

  return {
    valid: errors.length === 0,
    usableForMap: metadata.usableForMap,
    errors,
    warnings,
    metadata
  };
};

export const chooseCoordinatePair = (event = {}, venue = null) => {
  const eventCoordinates = getCoordinateMetadata(event);
  const venueCoordinates = getCoordinateMetadata(venue || {});

  if (eventCoordinates.usableForMap) {
    return { ...eventCoordinates, owner: "event" };
  }

  if (venueCoordinates.usableForMap) {
    return { ...venueCoordinates, owner: "venue" };
  }

  if (eventCoordinates.valid) {
    return { ...eventCoordinates, owner: "event" };
  }

  if (venueCoordinates.valid) {
    return { ...venueCoordinates, owner: "venue" };
  }

  return {
    latitude: null,
    longitude: null,
    valid: false,
    complete: false,
    reason: "missing",
    source: null,
    status: "missing",
    verifiedAt: null,
    verifiedBy: null,
    note: null,
    usableForMap: false,
    owner: null
  };
};
