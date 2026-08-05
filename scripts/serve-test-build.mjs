import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const portArgumentIndex = process.argv.indexOf("--port");
const port = Number(
  portArgumentIndex >= 0 ? process.argv[portArgumentIndex + 1] : 4173,
);
if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
  throw new RangeError("Test server port must be a valid TCP port.");
}

const distributionRoot = join(process.cwd(), "dist");
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function localPath(pathname) {
  const withoutTestPrefix = pathname.startsWith("/eclipse/")
    ? pathname.slice("/eclipse".length)
    : pathname;
  const relative = normalize(withoutTestPrefix).replace(/^[/\\]+/, "");
  const candidate = join(distributionRoot, relative);
  if (!candidate.startsWith(distributionRoot)) return null;
  try {
    return statSync(candidate).isFile() ? candidate : null;
  } catch {
    return null;
  }
}

createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  const requestedFile = localPath(decodeURIComponent(url.pathname));
  const file = requestedFile ?? join(distributionRoot, "index.html");
  response.setHeader(
    "content-type",
    contentTypes[extname(file)] ?? "application/octet-stream",
  );
  createReadStream(file).pipe(response);
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`Serving UI test build on http://127.0.0.1:${port}\n`);
});
