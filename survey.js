const HOTSPOT_CATEGORIES = [
  { id: "sidewalk_gap", label: "Sidewalk gap", color: "#b85b3e" },
  { id: "unsafe_crossing", label: "Unsafe crossing", color: "#9e3a35" },
  { id: "visibility_issue", label: "Visibility issue", color: "#7c5d32" },
  { id: "speeding_concern", label: "Speeding concern", color: "#85564b" },
  { id: "accessibility_barrier", label: "Accessibility barrier", color: "#4f7077" },
  { id: "general_hotspot", label: "General hotspot", color: "#5f6573" },
];

const DESTINATION_CATEGORIES = [
  { id: "park", label: "Park", color: "#2e6f63" },
  { id: "school", label: "School", color: "#3d6380" },
  { id: "trail_access", label: "Trail access", color: "#466d52" },
  { id: "civic", label: "Civic destination", color: "#505c79" },
  { id: "business", label: "Business area", color: "#76604a" },
];

const HOTSPOT_MODES = [
  { value: "walking", label: "Walking" },
  { value: "rolling", label: "Rolling" },
  { value: "cycling", label: "Cycling" },
  { value: "safety", label: "Safety emphasis" },
];

const DESTINATION_MODES = [
  { value: "walking", label: "Walking" },
  { value: "rolling", label: "Rolling" },
  { value: "cycling", label: "Cycling" },
];

const API_CONFIG = {
  enabled: true,
  baseUrl: "https://morris-township-survey-intake.matthewreate.workers.dev",
};

const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const surveyState = {
  map: null,
  baseTileLayer: null,
  labelTileLayer: null,
  capturePending: false,
  captureMarker: null,
  surveyRecords: [],
};

const elements = {
  mapStatus: document.getElementById("survey-map-status"),
  form: document.getElementById("survey-form"),
  submissionType: document.getElementById("submission-type"),
  categoryLabel: document.getElementById("category-label"),
  categorySelect: document.getElementById("category-select"),
  locationLabel: document.getElementById("location-label"),
  locationText: document.getElementById("location-text"),
  originAreaField: document.getElementById("origin-area-field"),
  originArea: document.getElementById("origin-area"),
  desiredDestinationField: document.getElementById("desired-destination-field"),
  desiredDestination: document.getElementById("desired-destination"),
  descriptionLabel: document.getElementById("description-label"),
  descriptionText: document.getElementById("description-text"),
  modeLabel: document.getElementById("mode-label"),
  modeHelp: document.getElementById("mode-help"),
  modeError: document.getElementById("mode-error"),
  concernModeInputs: Array.from(document.querySelectorAll('input[name="concern_mode"]')),
  captureMapPoint: document.getElementById("survey-capture-map-point"),
  cancelCapture: document.getElementById("survey-cancel-capture"),
  captureBanner: document.getElementById("survey-capture-banner"),
  captureStatus: document.getElementById("survey-capture-status"),
  latitude: document.getElementById("survey-latitude"),
  longitude: document.getElementById("survey-longitude"),
  confirmation: document.getElementById("survey-confirmation"),
  confirmationTitle: document.getElementById("survey-confirmation-title"),
  confirmationText: document.getElementById("survey-confirmation-text"),
  photoUpload: document.getElementById("photo-upload"),
  submitButton: document.getElementById("survey-submit-button"),
};

document.addEventListener("DOMContentLoaded", () => {
  init().catch((error) => {
    console.error(error);
    showMapFailure();
    disableMapCapture("Map click capture is unavailable until the survey map loads.");
  });
});

async function init() {
  bindForm();
  renderFormMode();

  const [surveyRecords, hotspots, destinations] = await Promise.all([
    loadJSON("data/survey-sample-submissions.json", []),
    loadGeoJSON("data/hotspots.geojson"),
    loadGeoJSON("data/destinations.geojson"),
  ]);

  surveyState.surveyRecords = surveyRecords;

  if (!ensureLeafletAvailable()) {
    disableMapCapture("Map click capture is unavailable until the survey map loads.");
    return;
  }

  initializeMap();
  applySurveyMapTheme();
  buildOfficialHotspots(hotspots.features);
  buildDestinationContext(destinations.features);
  buildSurveyRecords(surveyRecords);
  window.addEventListener("morris-theme-change", applySurveyMapTheme);
}

async function loadGeoJSON(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }

  return response.json();
}

async function loadJSON(path, fallback = []) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }

  return response.json() || fallback;
}

function initializeMap() {
  const map = L.map("survey-map", {
    center: [40.7965, -74.4815],
    zoom: 13,
    zoomControl: true,
    preferCanvas: true,
  });

  const tileConfig = getTileConfig();

  surveyState.baseTileLayer = L.tileLayer(tileConfig.baseUrl, {
    subdomains: "abcd",
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);

  surveyState.labelTileLayer = L.tileLayer(tileConfig.labelUrl, {
    subdomains: "abcd",
    maxZoom: 19,
    pane: "overlayPane",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);

  map.createPane("officialPane");
  map.getPane("officialPane").style.zIndex = 410;

  map.createPane("destinationPane");
  map.getPane("destinationPane").style.zIndex = 420;

  map.createPane("surveyPane");
  map.getPane("surveyPane").style.zIndex = 440;

  map.createPane("capturePane");
  map.getPane("capturePane").style.zIndex = 450;

  map.on("click", handleMapClick);
  surveyState.map = map;
  hideMapFailure();
}

function buildOfficialHotspots(features) {
  features.forEach((feature) => {
    const [longitude, latitude] = feature.geometry.coordinates;
    const category = getHotspotCategory(feature.properties.category);

    L.circleMarker([latitude, longitude], {
      pane: "officialPane",
      radius: 4,
      fillColor: category.color,
      color: "#fffaf3",
      weight: 1.5,
      fillOpacity: 0.28,
      opacity: 0.55,
      interactive: false,
    }).addTo(surveyState.map);
  });
}

function buildDestinationContext(features) {
  features.forEach((feature) => {
    const [longitude, latitude] = feature.geometry.coordinates;
    const category = getDestinationCategory(feature.properties.category);

    L.circleMarker([latitude, longitude], {
      pane: "destinationPane",
      radius: 5,
      fillColor: category.color,
      color: "#fffaf3",
      weight: 1.5,
      fillOpacity: 0.5,
      opacity: 0.7,
    })
      .bindPopup(
        `<div class="map-popup"><h3>${escapeHtml(feature.properties.title)}</h3><p>Reference destination</p></div>`,
        {
          className: "map-popup",
          maxWidth: 240,
        },
      )
      .addTo(surveyState.map);
  });
}

function buildSurveyRecords(records) {
  records
    .filter((record) => Number.isFinite(record.latitude) && Number.isFinite(record.longitude))
    .forEach((record) => {
      const category = getSurveyCategory(record);

      L.circleMarker([record.latitude, record.longitude], {
        pane: "surveyPane",
        radius: 7,
        fillColor: "#ffffff",
        color: category.color,
        weight: 3,
        fillOpacity: 0.94,
      })
        .bindPopup(buildSurveyPopup(record), {
          className: "map-popup",
          maxWidth: 260,
        })
        .addTo(surveyState.map);
    });
}

function bindForm() {
  elements.submissionType.addEventListener("change", renderFormMode);
  elements.captureMapPoint.addEventListener("click", toggleCaptureMode);
  elements.cancelCapture.addEventListener("click", cancelCaptureMode);
  elements.form.addEventListener("submit", handleSubmit);
  elements.concernModeInputs.forEach((input) => {
    input.addEventListener("change", () => {
      if (getSelectedModes().length > 0) {
        elements.modeError.hidden = true;
      }
    });
  });
}

function renderFormMode() {
  const mode = elements.submissionType.value;
  const isDestinationMode = mode === "destination_request";

  const categories = isDestinationMode ? DESTINATION_CATEGORIES : HOTSPOT_CATEGORIES;
  const modeOptions = isDestinationMode ? DESTINATION_MODES : HOTSPOT_MODES;
  elements.categoryLabel.textContent = isDestinationMode ? "Destination type" : "Issue type";
  elements.locationLabel.textContent = isDestinationMode ? "Approximate start point or nearby location" : "Nearby street or location";
  elements.locationText.placeholder = isDestinationMode
    ? "Example: neighborhood streets south of Woodland Ave"
    : "Example: Columbia Turnpike near Woodland School";
  elements.descriptionLabel.textContent = isDestinationMode ? "What gets in the way" : "Problem description";
  elements.descriptionText.placeholder = isDestinationMode
    ? "Describe what gets in the way between your starting area and destination."
    : "Describe the location and what feels difficult, unsafe, or incomplete.";
  elements.originAreaField.hidden = !isDestinationMode;
  elements.desiredDestinationField.hidden = !isDestinationMode;
  elements.originArea.required = isDestinationMode;
  elements.desiredDestination.required = isDestinationMode;
  elements.modeLabel.textContent = isDestinationMode
    ? "How are you trying to make this trip"
    : "Who does this affect or how is it experienced";
  elements.modeHelp.textContent = isDestinationMode
    ? "Rolling is mainly for wheelchairs, strollers, mobility devices, and other wheeled travel."
    : "Rolling is mainly for wheelchair, stroller, mobility-device, and other wheeled travel concerns.";
  elements.modeError.hidden = true;
  if (!surveyState.capturePending && !elements.captureMapPoint.disabled) {
    elements.captureStatus.textContent = isDestinationMode
      ? "Coordinates are optional. You can type a location or place a point for the starting area or approximate trip context."
      : "Coordinates are optional. You can type a location or place a point directly on the map.";
  }

  elements.categorySelect.innerHTML = categories
    .map(
      (category) =>
        `<option value="${escapeHtml(category.id)}">${escapeHtml(category.label)}</option>`,
    )
    .join("");

  elements.concernModeInputs.forEach((input, index) => {
    const option = modeOptions[index];
    const card = input.closest(".checkbox-card");
    const labelText = card?.querySelector("span");

    if (!option) {
      input.checked = false;
      input.disabled = true;
      if (card) {
        card.hidden = true;
      }
      return;
    }

    input.disabled = false;
    input.value = option.value;
    if (labelText) {
      labelText.textContent = option.label;
    }
    if (card) {
      card.hidden = false;
    }
  });
}

function toggleCaptureMode() {
  if (!surveyState.map) {
    return;
  }

  if (surveyState.capturePending) {
    cancelCaptureMode();
    return;
  }

  surveyState.capturePending = true;
  document.body.classList.add("map-capture-active");
  elements.captureBanner.hidden = false;
  elements.captureMapPoint.textContent = "Cancel map capture";
  elements.captureStatus.textContent =
    "Map capture is active. Click once on the survey map to place this location.";
}

function handleMapClick(event) {
  if (!surveyState.capturePending) {
    return;
  }

  elements.latitude.value = event.latlng.lat.toFixed(5);
  elements.longitude.value = event.latlng.lng.toFixed(5);
  renderCaptureMarker(event.latlng);
  elements.captureStatus.textContent =
    "Coordinates captured from the map. You can adjust them manually if needed before submitting.";
  surveyState.capturePending = false;
  elements.captureBanner.hidden = true;
  elements.captureMapPoint.textContent = "Capture from map click";
  document.body.classList.remove("map-capture-active");
}

function cancelCaptureMode() {
  surveyState.capturePending = false;
  elements.captureBanner.hidden = true;
  elements.captureMapPoint.textContent = "Capture from map click";
  elements.captureStatus.textContent =
    elements.submissionType.value === "destination_request"
      ? "Coordinates are optional. You can type a location or place a point for the starting area or approximate trip context."
      : "Coordinates are optional. You can type a location or place a point directly on the map.";
  document.body.classList.remove("map-capture-active");
}

function renderCaptureMarker(latlng) {
  if (!surveyState.captureMarker) {
    surveyState.captureMarker = L.circleMarker(latlng, {
      pane: "capturePane",
      radius: 8,
      fillColor: "#ffffff",
      color: "#27566b",
      weight: 3,
      fillOpacity: 0.92,
      dashArray: "4 3",
    }).addTo(surveyState.map);
    return;
  }

  surveyState.captureMarker.setLatLng(latlng);
}

function clearCaptureMarker() {
  if (!surveyState.captureMarker || !surveyState.map) {
    return;
  }

  surveyState.map.removeLayer(surveyState.captureMarker);
  surveyState.captureMarker = null;
}

async function handleSubmit(event) {
  event.preventDefault();

  const selectedModes = getSelectedModes();
  if (selectedModes.length === 0) {
    elements.modeError.hidden = false;
    const firstEnabledInput = elements.concernModeInputs.find((input) => !input.disabled);
    if (firstEnabledInput) {
      firstEnabledInput.focus();
    }
    return;
  }

  elements.modeError.hidden = true;

  const photoFile = elements.photoUpload.files?.[0] || null;
  const photoError = validatePhotoFile(photoFile);
  if (photoError) {
    showConfirmation("Submission Not Sent", photoError, "error");
    return;
  }

  const formData = new FormData(elements.form);
  const mode = formData.get("submission_type");
  const payload = {
    submission_type: mode,
    category: formData.get("category"),
    title:
      mode === "destination_request"
        ? buildRouteRequestTitle(formData.get("origin_area"), formData.get("desired_destination"), selectedModes)
        : formData.get("location_text"),
    latitude: formData.get("latitude") || null,
    longitude: formData.get("longitude") || null,
    location_text: formData.get("location_text"),
    origin_area: formData.get("origin_area") || "",
    description: formData.get("description"),
    desired_destination: formData.get("desired_destination") || "",
    concern_mode: selectedModes,
    review_status: "under_review",
    submitted_at: new Date().toISOString().slice(0, 10),
    additional_notes: formData.get("additional_notes") || "",
  };

  if (!API_CONFIG.enabled || !API_CONFIG.baseUrl) {
    showConfirmation(
      "Live Submission Not Yet Connected",
      "Survey Mode is ready for a live Cloudflare intake workflow, but the API base URL has not been configured yet. When connected, this same step will submit the report and optional photo directly into the review queue.",
      "warning",
    );
    return;
  }

  try {
    setSubmitting(true);
    let submissionResponse;
    try {
      submissionResponse = await postJson(getApiUrl("/api/submissions"), {
        ...payload,
        photo_present: Boolean(photoFile),
      });
    } catch (error) {
      throw new Error(getSubmissionStageError(error));
    }

    if (photoFile) {
      let uploadResponse;
      try {
        uploadResponse = await postJson(
          getApiUrl(`/api/submissions/${encodeURIComponent(submissionResponse.id)}/photo-upload-url`),
          {
            filename: photoFile.name,
            content_type: photoFile.type,
            size: photoFile.size,
          },
        );
      } catch (error) {
        throw new Error(getUploadAuthorizationError(error));
      }

      try {
        await uploadPhoto(uploadResponse.upload_url, photoFile);
      } catch (error) {
        throw new Error(getPhotoUploadError(error));
      }

      try {
        await postJson(
          getApiUrl(`/api/submissions/${encodeURIComponent(submissionResponse.id)}/finalize-photo`),
          {
            photo_key: uploadResponse.photo_key,
            filename: photoFile.name,
            content_type: photoFile.type,
          },
        );
      } catch (error) {
        throw new Error(getFinalizeUploadError(error));
      }
    }

    showConfirmation(
      "Submission Received",
      payload.submission_type === "destination_request"
        ? `Your route request from ${payload.origin_area || payload.location_text || "starting area not specified"} to ${payload.desired_destination || "destination not specified"} by ${formatModeList(payload.concern_mode)} has been submitted for review${photoFile ? " with one photo attached" : ""}.`
        : `Your trouble-spot report for ${payload.location_text || "location not specified"} has been submitted for review${photoFile ? " with one photo attached" : ""}.`,
      "success",
    );

    elements.form.reset();
    renderFormMode();
    elements.latitude.value = "";
    elements.longitude.value = "";
    clearCaptureMarker();
    cancelCaptureMode();
  } catch (error) {
    console.error(error);
    showConfirmation(
      "Submission Not Sent",
      error instanceof Error
        ? error.message
        : "Something went wrong while sending the submission. Please try again shortly.",
      "error",
    );
  } finally {
    setSubmitting(false);
  }
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "The submission service did not accept this request.");
  }

  return data;
}

async function uploadPhoto(uploadUrl, file) {
  let response;
  try {
    response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type,
      },
      body: file,
    });
  } catch (error) {
    throw new Error(
      "The browser could not upload the photo to storage. This is usually a bucket CORS or origin setting issue in Cloudflare R2.",
      { cause: error },
    );
  }

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error(
        "Photo upload was blocked by Cloudflare R2. Check the bucket CORS settings for the site origin before testing again.",
      );
    }

    throw new Error("The photo could not be uploaded to storage. Please try again without the photo or try again shortly.");
  }
}

function validatePhotoFile(file) {
  if (!file) {
    return "";
  }

  const extension = getFileExtension(file.name);

  if (extension === "heic" || extension === "heif") {
    return "HEIC photos are not supported yet. Please export or save the image as JPG, PNG, or WebP before uploading.";
  }

  if (!ACCEPTED_PHOTO_TYPES.has(file.type)) {
    return "Please upload a JPG, PNG, or WebP image.";
  }

  if (file.size > MAX_PHOTO_SIZE_BYTES) {
    return "Please upload an image smaller than 10 MB.";
  }

  return "";
}

function showConfirmation(title, message, state = "success") {
  elements.confirmation.hidden = false;
  elements.confirmation.dataset.state = state;
  elements.confirmationTitle.textContent = title;
  elements.confirmationText.textContent = message;
}

function setSubmitting(isSubmitting) {
  elements.submitButton.disabled = isSubmitting;
  elements.submitButton.textContent = isSubmitting ? "Submitting..." : "Submit for Review";
}

function getSubmissionStageError(error) {
  return `${getErrorMessage(error, "The submission record could not be created.")} This usually means the Worker or D1 intake step failed.`;
}

function getUploadAuthorizationError(error) {
  return `${getErrorMessage(error, "The upload authorization step failed.")} The Worker could not prepare the photo upload to R2.`;
}

function getPhotoUploadError(error) {
  return getErrorMessage(
    error,
    "The photo could not be uploaded to storage. Check the R2 bucket CORS settings and try again.",
  );
}

function getFinalizeUploadError(error) {
  return `${getErrorMessage(error, "The uploaded photo could not be finalized.")} The file may have uploaded, but the review record was not updated.`;
}

function getErrorMessage(error, fallback) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function getFileExtension(filename) {
  const parts = String(filename || "").toLowerCase().split(".");
  return parts.length > 1 ? parts.at(-1) : "";
}

function getApiUrl(path) {
  return `${API_CONFIG.baseUrl.replace(/\/+$/, "")}${path}`;
}

function buildSurveyPopup(record) {
  const category = getSurveyCategory(record);
  if (record.submission_type === "destination_request") {
    return `
      <div class="map-popup">
        <h3>${escapeHtml(record.title)}</h3>
        <p>Route request · Under review</p>
        <p>From ${escapeHtml(record.origin_area || record.location_text || "starting area not specified")} to ${escapeHtml(record.desired_destination || "destination not specified")} by ${escapeHtml(formatModeList(record.concern_mode || []))}</p>
      </div>
    `;
  }

  return `
    <div class="map-popup">
      <h3>${escapeHtml(record.title)}</h3>
      <p>${escapeHtml(category.label)} · Under review</p>
    </div>
  `;
}

function getSurveyCategory(record) {
  return record.submission_type === "destination_request"
    ? getDestinationCategory(record.category)
    : getHotspotCategory(record.category);
}

function getHotspotCategory(categoryId) {
  return HOTSPOT_CATEGORIES.find((category) => category.id === categoryId) || {
    id: categoryId,
    label: formatCategoryLabel(categoryId),
    color: "#5f6573",
  };
}

function getDestinationCategory(categoryId) {
  return DESTINATION_CATEGORIES.find((category) => category.id === categoryId) || {
    id: categoryId,
    label: formatCategoryLabel(categoryId),
    color: "#6b7a8a",
  };
}

function ensureLeafletAvailable() {
  return typeof window.L !== "undefined";
}

function showMapFailure() {
  elements.mapStatus.hidden = false;
}

function hideMapFailure() {
  elements.mapStatus.hidden = true;
}

function disableMapCapture(message) {
  elements.captureMapPoint.disabled = true;
  elements.captureStatus.textContent = message;
}

function applySurveyMapTheme() {
  if (!surveyState.baseTileLayer || !surveyState.labelTileLayer) {
    return;
  }

  const tileConfig = getTileConfig();
  surveyState.baseTileLayer.setUrl(tileConfig.baseUrl);
  surveyState.labelTileLayer.setUrl(tileConfig.labelUrl);
}

function getTileConfig() {
  const isDarkTheme = document.documentElement.dataset.theme === "dark";
  return isDarkTheme
    ? {
        baseUrl: "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
        labelUrl: "https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png",
      }
    : {
        baseUrl: "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
        labelUrl: "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png",
      };
}

function getSelectedModes() {
  return elements.concernModeInputs
    .filter((input) => !input.disabled && input.checked)
    .map((input) => input.value);
}

function buildRouteRequestTitle(originArea, destination, modes) {
  const fromText = originArea ? `From ${originArea}` : "Route request";
  const destinationText = destination ? `to ${destination}` : "to destination";
  const modeText = modes.length > 0 ? `by ${formatModeList(modes)}` : "";
  return `${fromText} ${destinationText}${modeText ? ` ${modeText}` : ""}`;
}

function formatModeList(values) {
  const labels = values
    .map((value) => formatModeValue(value))
    .filter(Boolean);

  if (labels.length === 0) {
    return "unspecified mode";
  }

  if (labels.length === 1) {
    return labels[0];
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

function formatModeValue(value) {
  const labels = {
    walking: "walking",
    rolling: "rolling",
    cycling: "cycling",
    safety: "safety emphasis",
  };

  return labels[value] || formatCategoryLabel(value).toLowerCase();
}

function formatCategoryLabel(value) {
  return String(value)
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
