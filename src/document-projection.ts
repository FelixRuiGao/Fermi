import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export const PROJECTED_DOCUMENT_EXTENSIONS = new Set([".pdf", ".docx", ".xlsx", ".pptx"]);
const PROJECTION_CACHE_DIR = ".document-projections";

type MarkItDownLike = {
  convert: (source: string) => Promise<{ markdown: string } | null | undefined>;
};

export interface ProjectedDocumentView {
  sourcePath: string;
  sourceExt: string;
  text: string;
  sizeBytes: number;
  mtimeMs: number;
}

let markItDownPromise: Promise<MarkItDownLike> | null = null;

function normalizeDocBaseName(filePath: string): string {
  const base = path.basename(filePath, path.extname(filePath)) || "document";
  return base.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 64) || "document";
}

function buildCachePath(filePath: string, artifactsDir: string, sizeBytes: number, mtimeMs: number): string {
  const ext = path.extname(filePath).toLowerCase();
  const safeBase = normalizeDocBaseName(filePath);
  const hash = createHash("sha256")
    .update(`${filePath}:${sizeBytes}:${mtimeMs}`)
    .digest("hex")
    .slice(0, 10);
  return path.join(artifactsDir, PROJECTION_CACHE_DIR, `${safeBase}-${hash}${ext}.md`);
}

function installPdfjsPolyfills(): void {
  // pdfjs-dist (transitive via pdf-parse) needs DOMMatrix and Path2D at runtime.
  // In Node/Bun without @napi-rs/canvas these globals are missing.  We only do
  // text extraction — never rendering — so minimal stubs are sufficient.
  if (!globalThis.DOMMatrix) {
    globalThis.DOMMatrix = class DOMMatrix {
      a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
      m11 = 1; m12 = 0; m13 = 0; m14 = 0;
      m21 = 0; m22 = 1; m23 = 0; m24 = 0;
      m31 = 0; m32 = 0; m33 = 1; m34 = 0;
      m41 = 0; m42 = 0; m43 = 0; m44 = 1;
      is2D = true; isIdentity = true;
      constructor(init?: number[] | string) {
        if (Array.isArray(init) && init.length === 6) {
          [this.a, this.b, this.c, this.d, this.e, this.f] = init;
          this.m11 = this.a; this.m12 = this.b;
          this.m21 = this.c; this.m22 = this.d;
          this.m41 = this.e; this.m42 = this.f;
          this.isIdentity = false;
        }
      }
      invertSelf() { return this; }
      multiplySelf() { return this; }
      preMultiplySelf() { return this; }
      translate() { return this; }
      scale() { return this; }
      inverse() { return new (globalThis.DOMMatrix as any)(); }
    } as any;
  }
  if (!globalThis.Path2D) {
    globalThis.Path2D = class Path2D {
      addPath() {}
    } as any;
  }
  if (!globalThis.ImageData) {
    globalThis.ImageData = class ImageData {
      width: number; height: number; data: Uint8ClampedArray;
      constructor(w: number, h: number) {
        this.width = w; this.height = h;
        this.data = new Uint8ClampedArray(w * h * 4);
      }
    } as any;
  }
}

async function preloadPdfjsWorker(): Promise<void> {
  if ((globalThis as Record<string, unknown>).pdfjsWorker) return;
  try {
    let workerPath: string | undefined;
    // Compiled binary: worker shipped as runtime asset next to the executable
    const assetPath = path.join(path.dirname(process.execPath), "pdfjs", "pdf.worker.mjs");
    if (existsSync(assetPath)) {
      workerPath = assetPath;
    } else {
      // Dev mode: resolve through the dependency chain
      const { createRequire } = await import("node:module");
      const mktRequire = createRequire(require.resolve("markitdown-ts"));
      const ppRequire = createRequire(mktRequire.resolve("pdf-parse"));
      workerPath = ppRequire.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
    }
    (globalThis as Record<string, unknown>).pdfjsWorker = await import(workerPath);
  } catch {
    // Worker preload failed — pdfjs-dist will attempt its own fallback.
  }
}

async function getMarkItDown(): Promise<MarkItDownLike> {
  if (!markItDownPromise) {
    markItDownPromise = (async () => {
      installPdfjsPolyfills();
      await preloadPdfjsWorker();
      // Suppress pdfjs-dist's top-level warnings about @napi-rs/canvas (we
      // already polyfilled above, but the require() still fails and warns).
      const origWarn = console.warn;
      console.warn = (...args: unknown[]) => {
        const msg = typeof args[0] === "string" ? args[0] : "";
        if (msg.includes("@napi-rs/canvas") || msg.includes("Cannot polyfill")) return;
        origWarn.apply(console, args);
      };
      try {
        const mod = await import("markitdown-ts");
        return new mod.MarkItDown();
      } finally {
        console.warn = origWarn;
      }
    })();
  }
  return markItDownPromise;
}

export function isProjectedDocumentPath(filePath: string): boolean {
  return PROJECTED_DOCUMENT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function projectedDocumentLabel(filePath: string): string {
  return path.extname(filePath).toLowerCase().slice(1).toUpperCase() || "document";
}

export async function loadProjectedDocumentView(
  filePath: string,
  artifactsDir?: string,
): Promise<ProjectedDocumentView> {
  const ext = path.extname(filePath).toLowerCase();
  if (!PROJECTED_DOCUMENT_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported projected document type: ${ext || "(no extension)"}`);
  }
  if (ext === ".pptx") {
    throw new Error("PPTX projection is not yet available in this runtime.");
  }

  const stat = statSync(filePath);
  if (!stat.isFile()) {
    throw new Error(`Not a file: ${filePath}`);
  }

  let cachePath: string | null = null;
  if (artifactsDir) {
    cachePath = buildCachePath(filePath, artifactsDir, stat.size, stat.mtimeMs);
    if (existsSync(cachePath)) {
      return {
        sourcePath: filePath,
        sourceExt: ext,
        text: readFileSync(cachePath, "utf-8"),
        sizeBytes: stat.size,
        mtimeMs: Math.trunc(stat.mtimeMs),
      };
    }
  }

  const markItDown = await getMarkItDown();
  const result = await markItDown.convert(filePath);
  const markdown = result?.markdown?.trim();
  if (!markdown) {
    throw new Error(`${projectedDocumentLabel(filePath)} conversion produced no text.`);
  }

  if (cachePath) {
    mkdirSync(path.dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, markdown, "utf-8");
  }

  return {
    sourcePath: filePath,
    sourceExt: ext,
    text: markdown,
    sizeBytes: stat.size,
    mtimeMs: Math.trunc(stat.mtimeMs),
  };
}
