import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

export interface SpriteEntry {
  path: string;
  relPath: string;
  name: string;
  folder: string;
  ext: string;
  size: number;
  width: number | null;
  height: number | null;
  modified: number | null;
}

export interface ExportResult {
  copied: number;
  errors: string[];
}

export const api = {
  scanFolder: (root: string) => invoke<SpriteEntry[]>("scan_folder", { root }),
  readImageBytes: (path: string) => invoke<ArrayBuffer>("read_image_bytes", { path }),
  copyImage: (path: string) => invoke<void>("copy_image", { path }),
  copyFiles: (paths: string[]) => invoke<void>("copy_files", { paths }),
  copyText: (text: string) => invoke<void>("copy_text", { text }),
  exportFiles: (paths: string[], dest: string, root: string | null) =>
    invoke<ExportResult>("export_files", { paths, dest, root }),
  reveal: (path: string) => revealItemInDir(path),
};

export const fileUrl = (path: string) => convertFileSrc(path);

export async function pickFolder(title: string): Promise<string | null> {
  const result = await open({ directory: true, multiple: false, title });
  return typeof result === "string" ? result : null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export function formatDims(e: SpriteEntry): string {
  return e.width != null && e.height != null ? `${e.width}×${e.height}` : "?";
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
};

export const mimeFor = (ext: string) => MIME[ext] ?? "application/octet-stream";

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
