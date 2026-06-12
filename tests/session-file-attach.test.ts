import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, mock, spyOn } from "bun:test";
import JSZip from "jszip";

import { Session } from "../src/session.js";
import { executeTool } from "../src/tools/basic.js";

// PDF extraction is mocked at the unpdf seam (real PDFs are exercised in
// tests/document-projection.test.ts and the build verification). DOCX/XLSX/PPTX
// below use real minimal OOXML files and run through the real converters.
mock.module("unpdf", () => ({
  getDocumentProxy: async () => ({}),
  extractText: async () => ({
    totalPages: 3,
    text: "# Converted PDF\n\nThis is a converted PDF body.\n".repeat(200),
  }),
}));

async function writeMinimalDocx(filePath: string, paragraphs: string[]): Promise<void> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  const body = paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join("");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  );
  writeFileSync(filePath, await zip.generateAsync({ type: "nodebuffer" }));
}

async function writeMinimalXlsx(filePath: string, rows: string[][]): Promise<void> {
  const zip = new JSZip();
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  const colLetter = (i: number) => String.fromCharCode(65 + i);
  const sheetRows = rows
    .map((cells, r) => {
      const xmlCells = cells
        .map((value, c) => `<c r="${colLetter(c)}${r + 1}" t="inlineStr"><is><t>${value}</t></is></c>`)
        .join("");
      return `<row r="${r + 1}">${xmlCells}</row>`;
    })
    .join("");
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`,
  );
  writeFileSync(filePath, await zip.generateAsync({ type: "nodebuffer" }));
}

async function writeMinimalPptx(filePath: string, slides: string[][]): Promise<void> {
  const zip = new JSZip();
  slides.forEach((paragraphs, index) => {
    const body = paragraphs.map((p) => `<a:p><a:r><a:t>${p}</a:t></a:r></a:p>`).join("");
    zip.file(
      `ppt/slides/slide${index + 1}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody>${body}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
    );
  });
  writeFileSync(filePath, await zip.generateAsync({ type: "nodebuffer" }));
}

async function callProcessFileAttachments(
  userInput: string,
  supportsMultimodal: boolean,
  projectRoot?: string,
  sessionArtifactsOverride?: string,
): Promise<string | Array<Record<string, unknown>>> {
  const fakeSession = {
    _projectRoot: projectRoot,
    _sessionArtifactsOverride: sessionArtifactsOverride,
    primaryAgent: {
      modelConfig: {
        supportsMultimodal,
      },
    },
  };
  return (Session.prototype as any)._processFileAttachments.call(fakeSession, userInput);
}

describe("Session file attachment integration", () => {
  it("injects text file context and removes @path from user text", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fermi-attach-text-"));
    try {
      const filePath = join(dir, "note.txt");
      writeFileSync(filePath, "hello from file\nsecond line\n", "utf-8");

      const result = await callProcessFileAttachments(`Please inspect @${filePath}`, false, dir);

      expect(typeof result).toBe("string");
      const text = result as string;
      expect(text).toContain("Please inspect");
      expect(text).not.toContain(`@${filePath}`);
      expect(text).toContain("<context label=\"User Files\">");
      expect(text).toContain("hello from file");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("builds multimodal content parts for image attachments", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fermi-attach-img-"));
    try {
      const imgPath = join(dir, "tiny.png");
      // Bytes are enough for attachment packaging; image decoding is not performed here.
      writeFileSync(imgPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]));

      const result = await callProcessFileAttachments(`Analyze this @${imgPath}`, true, dir);

      expect(Array.isArray(result)).toBe(true);
      const parts = result as Array<Record<string, unknown>>;

      const textParts = parts.filter((p) => p["type"] === "text");
      const imageParts = parts.filter((p) => p["type"] === "image");

      expect(imageParts).toHaveLength(1);
      expect(imageParts[0]["media_type"]).toBe("image/png");
      expect(typeof imageParts[0]["data"]).toBe("string");
      expect((imageParts[0]["data"] as string).length).toBeGreaterThan(0);

      expect(textParts.length).toBeGreaterThanOrEqual(1);
      const joinedText = textParts.map((p) => String(p["text"] ?? "")).join("\n");
      expect(joinedText).toContain("Analyze this");
      expect(joinedText).not.toContain(`@${imgPath}`);
      expect(joinedText).toContain("<context label=\"User Files\">");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("allows explicit external @file attachments in the current turn", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "fermi-project-"));
    const externalDir = mkdtempSync(join(tmpdir(), "fermi-external-"));
    try {
      const externalFile = join(externalDir, "secret.txt");
      writeFileSync(externalFile, "top secret\n", "utf-8");

      const result = await callProcessFileAttachments(`Check @${externalFile}`, false, projectDir);

      expect(typeof result).toBe("string");
      const text = result as string;
      expect(text).toContain("Check");
      expect(text).toContain("<context label=\"User Files\">");
      expect(text).toContain("top secret");
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
      rmSync(externalDir, { recursive: true, force: true });
    }
  });

  it("converts PDF attachments to a hidden markdown view and keeps the original path for follow-up reads", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fermi-attach-pdf-"));
    const artifactsDir = mkdtempSync(join(tmpdir(), "fermi-attach-artifacts-"));
    try {
      const pdfPath = join(dir, "paper.pdf");
      writeFileSync(pdfPath, Buffer.from("%PDF-1.4\nfake\n"));

      const result = await callProcessFileAttachments(
        `Review @${pdfPath}`,
        false,
        dir,
        artifactsDir,
      );

      expect(typeof result).toBe("string");
      const text = result as string;
      expect(text).toContain("Review");
      expect(text).toContain("Converted PDF");
      expect(text).not.toContain(".pdf.md");
      expect(text).toContain(`Use read_file on the original path (${pdfPath})`);

      const readResult = await executeTool(
        "read_file",
        { path: pdfPath, start_line: 1, end_line: 5 },
        { projectRoot: dir, sessionArtifactsDir: artifactsDir },
      );
      expect(readResult.content).toContain("Auto-extracted Markdown view");
      expect(readResult.content).toContain(pdfPath);
      expect(readResult.content).toContain("Converted PDF");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(artifactsDir, { recursive: true, force: true });
    }
  });

  it("routes DOCX and XLSX reads through the same extracted-markdown path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fermi-attach-docproj-"));
    const artifactsDir = mkdtempSync(join(tmpdir(), "fermi-attach-docproj-artifacts-"));
    try {
      const docxPath = join(dir, "spec.docx");
      const xlsxPath = join(dir, "table.xlsx");
      await writeMinimalDocx(docxPath, ["Spec heading", "Docx body text", "Third paragraph"]);
      await writeMinimalXlsx(xlsxPath, [
        ["Name", "Count"],
        ["alpha", "1"],
        ["beta", "2"],
      ]);

      const docxResult = await executeTool(
        "read_file",
        { path: docxPath, start_line: 1, end_line: 4 },
        { projectRoot: dir, sessionArtifactsDir: artifactsDir },
      );
      expect(docxResult.content).toContain("DOCX source");
      expect(docxResult.content).toContain("Docx body text");

      const xlsxResult = await executeTool(
        "read_file",
        { path: xlsxPath, start_line: 1, end_line: 6 },
        { projectRoot: dir, sessionArtifactsDir: artifactsDir },
      );
      expect(xlsxResult.content).toContain("XLSX source");
      expect(xlsxResult.content).toContain("| alpha | 1 |");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(artifactsDir, { recursive: true, force: true });
    }
  });

  it("routes PPTX reads through the extracted-markdown path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fermi-attach-pptx-"));
    const artifactsDir = mkdtempSync(join(tmpdir(), "fermi-attach-pptx-artifacts-"));
    try {
      const pptxPath = join(dir, "slides.pptx");
      await writeMinimalPptx(pptxPath, [
        ["Roadmap overview", "Q3 milestones"],
        ["Risks and mitigations"],
      ]);

      const result = await executeTool(
        "read_file",
        { path: pptxPath },
        { projectRoot: dir, sessionArtifactsDir: artifactsDir },
      );

      expect(result.content).toContain("PPTX source");
      expect(result.content).toContain("## Slide 1");
      expect(result.content).toContain("Roadmap overview");
      expect(result.content).toContain("## Slide 2");
      expect(result.content).toContain("Risks and mitigations");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(artifactsDir, { recursive: true, force: true });
    }
  });
});
