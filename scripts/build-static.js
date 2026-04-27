import { cpSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(".");
const dist = resolve(root, "dist");

mkdirSync(dist, { recursive: true });
copyFileSync(resolve(root, "index.html"), resolve(dist, "index.html"));

const imagesDir = resolve(root, "images");
if (existsSync(imagesDir)) {
  cpSync(imagesDir, resolve(dist, "images"), { recursive: true });
}

const assetsDir = resolve(root, "assets");
if (existsSync(assetsDir)) {
  cpSync(assetsDir, resolve(dist, "assets"), { recursive: true });
}

console.log("Static build created at dist");
