import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

// CDP screencast → timestamped JPEG frames → constant-fps mp4.
export async function startRecording(page, dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    const file = `${dir}/f${String(frames.length).padStart(5, "0")}.jpg`;
    writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ file, ts: metadata.timestamp });
    await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1, maxWidth: 1920, maxHeight: 1080 });
  return async function stop(out, fps = 30) {
    const end = Date.now() / 1000;
    await cdp.send("Page.stopScreencast").catch(() => {});
    if (frames.length === 0) throw new Error("no frames");
    let list = "";
    for (let i = 0; i < frames.length; i++) {
      const next = i + 1 < frames.length ? frames[i + 1].ts : end;
      const d = Math.max(0.001, next - frames[i].ts);
      list += `file '${frames[i].file.split("/").pop()}'\nduration ${d.toFixed(4)}\n`;
    }
    list += `file '${frames[frames.length - 1].file.split("/").pop()}'\n`;
    writeFileSync(`${dir}/list.txt`, list);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", `${dir}/list.txt`,
      "-vf", `fps=${fps},scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`, "-c:v", "libx264", "-crf", "16", "-preset", "medium", out]);
    return frames.length;
  };
}
