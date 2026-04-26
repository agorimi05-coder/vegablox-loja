import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(".");
const dist = resolve(root, "dist");

mkdirSync(dist, { recursive: true });
copyFileSync(resolve(root, "index.html"), resolve(dist, "index.html"));

console.log("Static build created at dist/index.html");
