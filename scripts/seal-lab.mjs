/**
 * Build lab.enc — AES-256-GCM of the playable sandbox, engine, mc, and cards.
 * Password comes from RIFTERS_LAB_PASSWORD and is not written into the repo.
 *
 * File layout:
 *   0  magic "RFLB"
 *   4  version u8 = 1
 *   5  PBKDF2 iterations u32 BE
 *   9  salt 16
 *  25  iv 12
 *  37  ciphertext || 16-byte GCM tag
 *
 * Plaintext is a counted list of utf-8 path + bytes.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export const SEAL_ITERATIONS = 120000;
export const SEAL_MAGIC = Buffer.from("RFLB");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function walkFiles(dir, prefix, out) {
  for (const name of fs.readdirSync(dir)) {
    if (name.endsWith(".bak") || name.startsWith("_patch_") || name.startsWith("_fix_") || name.startsWith("_diag_")) {
      continue;
    }
    const abs = path.join(dir, name);
    const rel = prefix ? prefix + "/" + name : name;
    const st = fs.statSync(abs);
    if (st.isDirectory()) walkFiles(abs, rel, out);
    else if (st.isFile()) out.push([rel, fs.readFileSync(abs)]);
  }
}

export function collectPlayableFiles(repo = root) {
  const out = [["sandbox.html", fs.readFileSync(path.join(repo, "sandbox.html"))]];
  for (const dir of ["engine", "mc", "cards"]) {
    walkFiles(path.join(repo, dir), dir, out);
  }
  out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return out;
}

export function encodePack(files) {
  const parts = [Buffer.alloc(4)];
  parts[0].writeUInt32BE(files.length, 0);
  for (const [rel, body] of files) {
    const pathBuf = Buffer.from(rel, "utf8");
    if (pathBuf.length > 65535) throw new Error("path too long " + rel);
    const head = Buffer.alloc(2 + 4);
    head.writeUInt16BE(pathBuf.length, 0);
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    head.writeUInt32BE(buf.length, 2);
    parts.push(head.subarray(0, 2), pathBuf, head.subarray(2), buf);
  }
  return Buffer.concat(parts);
}

export function decodePack(plain) {
  const buf = Buffer.isBuffer(plain) ? plain : Buffer.from(plain);
  if (buf.length < 4) throw new Error("pack short");
  const count = buf.readUInt32BE(0);
  if (count > 2000) throw new Error("pack count");
  const files = [];
  let o = 4;
  for (let i = 0; i < count; i++) {
    if (o + 2 > buf.length) throw new Error("pack truncated path");
    const pathLen = buf.readUInt16BE(o);
    o += 2;
    if (o + pathLen + 4 > buf.length) throw new Error("pack truncated");
    const rel = buf.subarray(o, o + pathLen).toString("utf8");
    o += pathLen;
    const bodyLen = buf.readUInt32BE(o);
    o += 4;
    if (o + bodyLen > buf.length) throw new Error("pack truncated body");
    files.push([rel, Buffer.from(buf.subarray(o, o + bodyLen))]);
    o += bodyLen;
  }
  return files;
}

export function plaintextDigest(files) {
  return crypto.createHash("sha256").update(encodePack(files)).digest("hex");
}

export function writeSealManifest(files, encBytes, repo = root) {
  const manifest = {
    files: files.length,
    packSha256: plaintextDigest(files),
    encSha256: crypto.createHash("sha256").update(encBytes).digest("hex"),
  };
  fs.writeFileSync(path.join(repo, "lab.manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

export function encryptPack(files, password, opts = {}) {
  if (!password) throw new Error("password required");
  const iterations = opts.iterations || SEAL_ITERATIONS;
  const salt = opts.salt || crypto.randomBytes(16);
  const iv = opts.iv || crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plain = encodePack(files);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  const head = Buffer.alloc(4 + 1 + 4 + 16 + 12);
  SEAL_MAGIC.copy(head, 0);
  head.writeUInt8(1, 4);
  head.writeUInt32BE(iterations, 5);
  Buffer.from(salt).copy(head, 9);
  Buffer.from(iv).copy(head, 25);
  return Buffer.concat([head, ciphertext]);
}

export function decryptPack(blob, password) {
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  if (buf.length < 37 + 16 || !buf.subarray(0, 4).equals(SEAL_MAGIC)) {
    throw new Error("not a lab seal");
  }
  if (buf.readUInt8(4) !== 1) throw new Error("unsupported seal version");
  const iterations = buf.readUInt32BE(5);
  const salt = buf.subarray(9, 25);
  const iv = buf.subarray(25, 37);
  const ciphertext = buf.subarray(37, buf.length - 16);
  const tag = buf.subarray(buf.length - 16);
  const key = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decodePack(plain);
}

function main() {
  const password = process.env.RIFTERS_LAB_PASSWORD;
  if (!password) {
    console.error("Set RIFTERS_LAB_PASSWORD (not stored in the repo).");
    process.exit(1);
  }
  const files = collectPlayableFiles();
  const out = path.join(root, "lab.enc");
  fs.writeFileSync(out, encryptPack(files, password));
  const encBytes = fs.readFileSync(out);
  const back = decryptPack(encBytes, password);
  if (back.length !== files.length) {
    console.error("seal round-trip count mismatch");
    process.exit(1);
  }
  writeSealManifest(files, encBytes);
  console.log("wrote " + out + " (" + files.length + " files)");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
