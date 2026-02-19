// remoteStorage.js adapter — future implementation
//
// remoteStorage (https://remotestorage.io) gives each user their own cloud storage
// via an open protocol. The adapter would:
//
// Personal storage (push/pull to user's own cloud):
//   - push(): write snapshot JSON to /open-setlist/snapshot.json
//   - pull(): read /open-setlist/snapshot.json
//   - isConfigured(): check if remoteStorage widget is connected
//
// Band sharing:
//   - Leader publishes snapshot to a public folder
//   - Members pull from that public URL (read-only)
//   - URL format: https://<storage-host>/public/open-setlist/snapshot.json
//
// Dependencies: remotestorage (npm package), remotestorage-widget (optional UI)
