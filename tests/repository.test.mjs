import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createServer } from "node:net";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const root = new URL("../", import.meta.url);
const execFileAsync = promisify(execFile);
const excludedDirectories = new Set([
  ".git",
  "coverage",
  "dist",
  "node_modules",
]);

async function readPublicTree(relativeDirectory = ".") {
  const directory = new URL(`${relativeDirectory}/`, root);
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      if (entry.isDirectory()) {
        if (excludedDirectories.has(entry.name) || entry.name.startsWith("__")) {
          return "";
        }
        return readPublicTree(`${relativeDirectory}/${entry.name}`);
      }
      return /\.(cjs|css|html|js|json|md|mjs|mts|ts|tsx|yaml|yml)$/.test(
        entry.name,
      )
        ? readFile(new URL(entry.name, directory), "utf8")
        : "";
    }),
  );
  return contents.join("\n");
}

async function readBuiltArtifact(relativeDirectory = "dist") {
  const directory = new URL(`${relativeDirectory}/`, root);
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      if (entry.isDirectory()) {
        return readBuiltArtifact(`${relativeDirectory}/${entry.name}`);
      }
      return /\.(css|html|js|json|txt)$/.test(entry.name)
        ? readFile(new URL(entry.name, directory), "utf8")
        : "";
    }),
  );
  return contents.join("\n");
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function waitForServer(url) {
  const deadline = Date.now() + 10_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw lastError ?? new Error("Preview server did not start.");
}

test("builds a portable static Vite application without source maps", async () => {
  const [html, assets, images, socialImages] = await Promise.all([
    readFile(new URL("dist/index.html", root), "utf8"),
    readdir(new URL("dist/assets/", root)),
    readdir(new URL("dist/images/", root)),
    readdir(new URL("dist/og/", root)),
  ]);

  assert.match(html, /<html lang="en">/);
  assert.match(html, /<title>Eclipse Atlas<\/title>/);
  assert.match(html, /property="og:image" content="\.\/og\/eclipse-atlas\.jpg"/);
  assert.match(html, /(?:src|href)="\.\/assets\//);
  assert.ok(assets.some((file) => file.endsWith(".js")));
  assert.ok(assets.some((file) => file.endsWith(".css")));
  assert.equal(assets.some((file) => file.endsWith(".map")), false);
  assert.ok(images.includes("eclipse-atlas-header-1600.webp"));
  assert.ok(images.includes("eclipse-atlas-header-960.webp"));
  assert.ok(socialImages.includes("eclipse-atlas.jpg"));
});

test("keeps unlicensed legacy data out of runtime code and build assets", async () => {
  const [versionableSource, builtArtifact, runtimeSource, builtRuntimeAssets] =
    await Promise.all([
      readPublicTree(),
      readBuiltArtifact(),
      readPublicTree("src"),
      readBuiltArtifact("dist/assets"),
    ]);
  const publishableContent = `${versionableSource}\n${builtArtifact}`;
  const runtimeContent = `${runtimeSource}\n${builtRuntimeAssets}`;
  const prohibitedProvider = ["tres", "eclipses"].join("");
  const legacyFields = [
    "score_" + "tres",
    "climate" + "Score",
    "cloud" + "Index",
    "ticket" + "Price",
    "score" + "-tile",
    "/api/" + "location",
  ];

  assert.equal(
    runtimeContent.toLocaleLowerCase().includes(prohibitedProvider),
    false,
  );
  for (const field of legacyFields) {
    assert.equal(
      publishableContent.toLocaleLowerCase().includes(field.toLowerCase()),
      false,
    );
  }
  assert.match(versionableSource, /sources\.json/);
  assert.match(builtArtifact, /SIL OPEN FONT LICENSE Version 1\.1/);
  await assert.rejects(readdir(new URL("server/", root)));
});

test("publishes a complete machine-readable source catalog", async () => {
  const catalog = JSON.parse(
    await readFile(new URL("public/sources.json", root), "utf8"),
  );
  assert.equal(catalog.schemaVersion, 1);
  assert.ok(catalog.sources.length >= 5);
  for (const source of catalog.sources) {
    assert.ok(source.id);
    assert.ok(source.producer);
    assert.ok(source.retrievedAt);
    assert.ok(source.license.name);
    assert.ok(source.transformation);
    assert.ok(source.limitations.length > 0);
  }
});

test("does not publish fixed event values or incorrect contact-horizon semantics", async () => {
  const publicSource = `${await readPublicTree("src")}\n${await readPublicTree("public")}`;
  for (const prohibitedCopy of [
    "20:28 CEST",
    "Sun at 7–9°",
    "astronomical horizon",
    "horizonte astronómico",
  ]) {
    assert.equal(publicSource.includes(prohibitedCopy), false);
  }
});

test("keeps WebGL and Three.js out of the owned interface", async () => {
  const source = await readPublicTree("src");
  assert.doesNotMatch(source, /(?:from\s+["']three["']|Three\.js|WebGL)/i);
});

test("keeps ignored local material outside version control", async () => {
  const cwd = fileURLToPath(root);
  await execFileAsync("git", ["check-ignore", "--quiet", "CLAUDE.local.md"], {
    cwd,
  });
  await execFileAsync(
    "git",
    ["check-ignore", "--quiet", "__scratch/__project-notes.md"],
    { cwd },
  );

  const { stdout: trackedFiles } = await execFileAsync("git", ["ls-files"], {
    cwd,
  });
  assert.doesNotMatch(
    trackedFiles,
    /(?:^|\/)CLAUDE\.local\.md$|(?:^|\/)__[^/]+(?:\/|$)/m,
  );

  const versionableSource = await readPublicTree();
  const hostHomePrefixes = [
    ["/", "home", "/"].join(""),
    ["/", "Users", "/"].join(""),
  ];
  const pemKeyHeader = ["-----BEGIN ", "PRI", "VATE KEY-----"].join("");
  for (const prefix of hostHomePrefixes) {
    assert.equal(versionableSource.includes(prefix), false);
  }
  assert.equal(versionableSource.includes(pemKeyHeader), false);
});

test("serves the production artifact and source catalog with correct MIME types", async () => {
  const port = await availablePort();
  const child = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    { cwd: new URL(".", root), stdio: "ignore" },
  );

  try {
    const home = await waitForServer(`http://127.0.0.1:${port}/`);
    assert.match(home.headers.get("content-type") ?? "", /text\/html/);
    const sources = await fetch(`http://127.0.0.1:${port}/sources.json`);
    assert.equal(sources.status, 200);
    assert.match(
      sources.headers.get("content-type") ?? "",
      /application\/json/,
    );
  } finally {
    child.kill("SIGTERM");
  }
});
