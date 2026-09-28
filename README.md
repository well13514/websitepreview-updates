# WebsitePreview over-the-air web bundle

The WebsitePreview iOS app checks `https://well13514.github.io/websitepreview-updates/version.json` on launch.
If `version` is higher than the cached bundle, it downloads every file in `files` and serves the new UI —
no reinstall needed. Keep all files flat (no subdirectories); the app rejects anything else.
