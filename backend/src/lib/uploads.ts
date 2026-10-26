import { randomUUID } from "node:crypto";
import type { RequestHandler, Response } from "express";
import multer from "multer";
import { config } from "../config.js";
import type { Db } from "../db/db.js";
import { badRequest, notFound } from "./http.js";

export type UploadKind = "photos" | "documents";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const DOCUMENT_TYPES = [...IMAGE_TYPES, "application/pdf"];

/**
 * Accepts one file in the multipart field "file" and stores it in the database under a random
 * name, given to the route as req.file.filename.
 * The browser-reported type is only a hint, so the file's first bytes are checked too.
 */
export function acceptFile(db: Db, kind: UploadKind, allowedTypes: string[]): RequestHandler[] {
  const receive = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, done) =>
      allowedTypes.includes(file.mimetype)
        ? done(null, true)
        : done(badRequest(`Only ${allowedTypes.map((t) => EXTENSIONS[t]).join(", ")} files are allowed`)),
  }).single("file");

  const store: RequestHandler = async (req, _res, next) => {
    if (!req.file) throw badRequest("Attach a file in the 'file' field");
    if (!contentMatches(req.file.buffer, req.file.mimetype)) throw badRequest("The file's contents don't match its type");
    req.file.filename = randomUUID() + EXTENSIONS[req.file.mimetype];
    await db.query("INSERT INTO uploads (kind, file_name, mime_type, data) VALUES ($1, $2, $3, $4)", [
      kind,
      req.file.filename,
      req.file.mimetype,
      req.file.buffer,
    ]);
    next();
  };

  return [receive, store];
}

export async function removeUpload(db: Db, kind: UploadKind, fileName: string | null) {
  if (fileName) await db.query("DELETE FROM uploads WHERE kind = $1 AND file_name = $2", [kind, fileName]);
}

/** Responds with a stored file. Names are random and never reused, so browsers may cache it for good. */
export async function sendUpload(db: Db, res: Response, kind: UploadKind, fileName: string) {
  const [file] = await db.query("SELECT mime_type, data FROM uploads WHERE kind = $1 AND file_name = $2", [
    kind,
    fileName,
  ]);
  if (!file) throw notFound("File");
  res.set("Cache-Control", "private, max-age=31536000, immutable");
  res.type(file.mime_type).send(Buffer.from(file.data));
}

/** Checks the file's "magic number" against its declared type. */
function contentMatches(buffer: Buffer, mimeType: string) {
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
