import { context } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const outdir = resolve("artifacts/browser-check");
await mkdir(outdir, { recursive: true });
await copyFile("tests/browser/index.html", `${outdir}/index.html`);
await copyFile("src/styles.css", `${outdir}/styles.css`);
const build = await context({
  entryPoints: ["tests/browser/branchNavigation.js"],
  outfile: `${outdir}/checks.js`,
  bundle: true,
  format: "esm",
  alias: { obsidian: resolve("tests/browser/obsidian.js") },
});
const { port } = await build.serve({ host: "127.0.0.1", port: 18766, servedir: outdir });
console.log(`Open http://127.0.0.1:${port} and click Run source navigation checks. No vault or network AI is used.`);
process.once("SIGINT", async () => { await build.dispose(); process.exit(0); });
