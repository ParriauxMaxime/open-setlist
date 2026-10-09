# Demo video

Records `docs/media/open-setlist-demo.mp4` from the real app: a 1920×1080 stage page frames the app (1180×820 tablet viewport) in an iframe, captions are animated in the page, and frames come from the Chrome DevTools screencast.

Requirements: Google Chrome, ffmpeg, a running `yarn dev` on :3000.

```bash
cd scripts/demo-video
npm i --no-save playwright-core
node make-csv.mjs          # synthetic Setlist Helper export used in the import scene
node demo.mjs              # writes demo-raw.mp4
```

Music is synthesized with ffmpeg (`aevalsrc`, see git history of this folder) and muxed with a 0.6 s fade in / 0.9 s fade out.
