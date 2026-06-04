import * as vscode from "vscode";
import { tmpdir } from "os";
import { join } from "path";
import { writeFileSync, mkdirSync } from "fs";

let diffCounter = 0;

export async function showDiff(
  filePath: string,
  before: string,
  after: string,
): Promise<void> {
  const id = ++diffCounter;
  const dir = join(tmpdir(), "fermi-diffs");
  mkdirSync(dir, { recursive: true });

  const beforePath = join(dir, `${id}-before-${baseName(filePath)}`);
  const afterPath = join(dir, `${id}-after-${baseName(filePath)}`);

  writeFileSync(beforePath, before);
  writeFileSync(afterPath, after);

  const beforeUri = vscode.Uri.file(beforePath);
  const afterUri = vscode.Uri.file(afterPath);

  await vscode.commands.executeCommand(
    "vscode.diff",
    beforeUri,
    afterUri,
    `Fermi: ${baseName(filePath)} (diff)`,
  );
}

function baseName(p: string): string {
  return p.split("/").pop() ?? p;
}
