/**
 * Ambient declarations for text imports (Bun `with { type: "text" }`).
 * The imported value is the file's raw contents as a string.
 */
declare module "*.md" {
  const text: string;
  export default text;
}

declare module "*.txt" {
  const text: string;
  export default text;
}
