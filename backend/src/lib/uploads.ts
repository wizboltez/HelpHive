import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { open, unlink } from "node:fs/promises";
import path from "node:path";
import type { RequestHandler } from "express";
import multer from "multer";
import { config } from "../config.js";
import { badRequest } from "./http.js";

export type UploadKind = "photos" | "documents";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const DOCUMENT_TYPES = [...IMAGE_TYPES, "application/pdf"];

export const uploadPath = (kind: UploadKind, fileName = "") => path.resolve(config.uploadDir, kind, fileName);

/**
 * Accepts one file in the multipart field "file", saved under a random name.
 * The browser-reported type is only a hint, so the file's first bytes are checked too.
 */
export function acceptFile(kind: UploadKind, allowedTypes: string[]): RequestHandler[] {
  mkdirSync(uploadPath(kind), { recursive: true });

  const receive = multer({
    storage: multer.diskStorage({
      destination: uploadPath(kind),
      filename: (_req, file, done) => done(null, randomUUID() + EXTENSIONS[file.mimetype]),
    }),
    limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, done) =>
      allowedTypes.includes(file.mimetype)
        ? done(null, true)
        : done(badRequest(`Only ${allowedTypes.map((t) => EXTENSIONS[t]).join(", ")} files are allowed`)),
  }).single("file");

  const verify: RequestHandler = async (req, _res, next) => {
    if (!req.file) throw badRequest("Attach a file in the 'file' field");
    if (!(await contentMatches(req.file.path, req.file.mimetype))) {
      await unlink(req.file.path);
      throw badRequest("The file's contents don't match its type");
    }
    next();
  };

  return [receive, verify];
}

export async function removeUpload(kind: UploadKind, fileName: string | null) {
  if (fileName) await unlink(uploadPath(kind, fileName)).catch(() => {});
}

/** Checks the file's "magic number" against its declared type. */
async function contentMatches(filePath: string, mimeType: string) {
  const file = await open(filePath);
  const { buffer } = await file.read(Buffer.alloc(12), 0, 12, 0);
  await file.close();

  const starts = (...bytes: number[]) => bytes.every((b, i) => buffer[i] === b);
  switch (mimeType) {
    case "image/jpeg":
      return starts(0xff, 0xd8, 0xff);
    case "image/png":
      return starts(0x89, 0x50, 0x4e, 0x47);
    case "image/webp":
      return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
    case "application/pdf":
      return buffer.toString("ascii", 0, 5) === "%PDF-";
    default:
      return false;
  }
}
