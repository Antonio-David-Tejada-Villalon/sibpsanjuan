// Regenera src/sistema-diseno/tokens.css desde tokens.json: `npm run tokens`.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generarCss } from "../src/sistema-diseno/generarTokens.js";

const carpeta = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "sistema-diseno");
const tokens = JSON.parse(readFileSync(path.join(carpeta, "tokens.json"), "utf8"));
writeFileSync(path.join(carpeta, "tokens.css"), generarCss(tokens));
console.log("tokens.css regenerado desde tokens.json");
