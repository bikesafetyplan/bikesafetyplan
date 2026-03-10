# Morris Township Planning Map

Static Leaflet prototype for reviewing Morris Township walkability and bikeability issues with a small working group. The site is designed to run as a lightweight GitHub Pages project with no build step and no backend.

The project now has two clearly distinct public-facing surfaces:
- `index.html` is the official planning reference used for working-group review and orientation.
- `survey.html` is the April survey-phase intake tool, where responses remain under review and separate from the official planning map.

## File Structure

- `index.html` sets up the official planning-view page shell, sidebar sections, and Leaflet map container.
- `survey.html` provides the guided Survey Mode intake page for the April survey phase.
- `styles.css` contains the responsive layout and the civic/editorial visual styling.
- `script.js` loads the local GeoJSON files, initializes the Leaflet map, and manages filters, layer toggles, the visible-hotspots list, popups, and the detail panel.
- `survey.js` manages the Survey Mode map, form switching, map-click capture, and prototype confirmation flow.
- `vendor/leaflet/` stores a local copy of Leaflet JS/CSS and image assets so the live map does not depend on a third-party CDN for bootstrap.
- `data/hotspots.geojson` stores the TAC hotspot points normalized into the project taxonomy.
- `data/destinations.geojson` stores curated reference destinations used to interpret hotspot demand and travel patterns.
- `data/context-lines.geojson` stores sidewalk, trail, crosswalk, and township-border linework for subdued map context.
- `data/survey-sample-submissions.json` stores mock survey-phase entries used by the Survey Mode page.
- `Incoming Data/*.kmz` contains the raw KMZ layer exports used to assemble the local planning data.

## Local Preview

Because the page fetches local GeoJSON files, open it through a small static server instead of `file://`.

```bash
cd /Users/matthewreate/Desktop/Township\ Map
python3 -m http.server 8000
```

Then visit [http://localhost:8000](http://localhost:8000).

## GitHub Pages Deployment

1. Push this folder to a GitHub repository.
2. In the repository settings, open `Pages`.
3. Set the source to `Deploy from a branch`.
4. Choose your main branch and the `/ (root)` folder.
5. Save the setting and wait for GitHub Pages to publish the site.

No build process is required. All paths are relative, so the site works directly from the repository root.

Core map assets are vendored locally in `vendor/leaflet/` to reduce the chance of live map bootstrap failures caused by third-party CDN availability.

## Replacing the Sample and TAC Data Later

The shipped prototype reads only local GeoJSON files at runtime. To replace the current data:

1. Export the latest Google My Maps / KML data or convert another source into GeoJSON.
2. Keep hotspot points in `data/hotspots.geojson`, destination points in `data/destinations.geojson`, and contextual linework in `data/context-lines.geojson`.
3. Preserve the existing property names used by the UI:
   - Hotspots: `id`, `title`, `category`, `description`, `status`, `source`, `notes`, `source_layer`, `latitude`, `longitude`
   - Destinations: `id`, `title`, `category`, `description`, `latitude`, `longitude`
   - Context lines: `id`, `display_group`, `source_layer`, optionally `title`, `description`
4. Keep GeoJSON coordinates in standard `[longitude, latitude]` order.
5. If you add new hotspot categories, update `HOTSPOT_CATEGORIES` in [script.js](/Users/matthewreate/Desktop/Township%20Map/script.js).

The destination layer is intentionally small and curated. It should function as a civic reference set, not an exhaustive amenity inventory.

## Live Submission Path: Google Forms

The site now treats Google Forms as the first live submission backend. The public website remains the map and survey interface, while the final submission step opens a Google Form in a new tab for actual intake, optional photo upload, and later review by the planning group.

This setup keeps the public flow lightweight:
- the website captures map context, trip intent, and structured descriptions
- Google Forms stores the submission
- Google Drive stores uploaded photos from the form's file-upload question
- the planning group reviews submissions before anything enters the official planning record

Current limitations of this approach:
- file upload requires the respondent to sign in with a Google account
- photo upload happens only in Google Forms, not on the website
- Google Form submissions do not automatically appear back on the public map

The map is meant to be read in a clear hierarchy: official planning data forms the current working base, survey responses remain separate and under review, and context layers support orientation rather than equal evidentiary weight.

## Recommended Google Form Structure

Use one Google Form with branching based on the first question:

1. `Submission type`
   - `Report a problem spot`
   - `Request a route or destination connection`
2. Branch to one of two sections.

Problem-spot section:
- `Issue category`
- `How is this experienced?`
- `Location description`
- `Nearby intersection or address`
- `Map coordinates (optional)`
- `Describe the problem`
- `Photo upload (optional)`
- `Contact information (optional)`

Route-request section:
- `Destination type`
- `How are you trying to make this trip?`
- `From what area are you starting?`
- `Where do you want to go?`
- `Location or nearby intersection`
- `Map coordinates (optional)`
- `What gets in the way?`
- `Photo upload (optional)`
- `Contact information (optional)`

## Wiring Survey Mode to Google Forms

`survey.js` includes a `FORM_CONFIG` object near the top of the file. That object is the single place to connect the live Google Form.

To wire it:
1. Create the Google Form and its branched sections.
2. In Google Forms, choose `Get pre-filled link`.
3. Enter sample answers, generate the link, and inspect the resulting query string.
4. Copy each `entry.<id>` value into the matching field inside `FORM_CONFIG.googleFormFieldIds`.
5. Paste the responder URL into `FORM_CONFIG.formBaseUrl`.
6. Set `FORM_CONFIG.enabled` to `true`.

Suggested field mapping from the site:
- `submission_type`
- `category`
- `location_text`
- `coordinates`
- `origin_area`
- `desired_destination`
- `description`
- `concern_mode`
- `concern_mode_summary`
- `additional_notes`

Notes:
- `concern_mode` can be mapped to a checkbox-style Google Form field if the pre-filled link supports repeated values cleanly.
- `concern_mode_summary` exists as a safer fallback for a single text field if checkbox prefill is too brittle.
- `Photo upload` and `Contact information` should stay inside Google Forms as manual entry.

This setup can later be replaced by a custom backend without changing the public-facing survey structure on the site.

## Survey Mode

`survey.html` is the guided intake page for the April survey phase. It is intentionally distinct from the official planning viewer in `index.html`.

Survey Mode:
- collects two structured types of resident input: problem spots and route / destination requests
- supports map-assisted point capture or typed location text
- frames all responses as `under_review`
- opens the live Google Form for final submission when `FORM_CONFIG` is wired in `survey.js`
- uses `data/survey-sample-submissions.json` as a sample under-review layer rather than live public storage

The planning viewer and Survey Mode are intentionally labeled as different phases of the same process:
- `Official Planning View` = working-group reference and orientation
- `Survey Intake View` = April resident input held under review

## Easiest Next Steps

1. Review the imported hotspot points and confirm the category mapping from the TAC source map.
2. Keep the destination layer limited to stable schools, parks, trailheads, museums, and civic sites that help explain walking and biking demand.
3. Decide whether the full context linework is useful as-is or should be thinned into a smaller set of overlays for easier public reading.
4. When the working group is ready for live intake, connect `survey.js` to the Google Form responder URL and pre-filled field IDs before exposing the form publicly.
