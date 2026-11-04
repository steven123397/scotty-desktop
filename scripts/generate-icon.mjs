import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SIZES = [16, 32, 48, 64, 128, 256];

function parseArgs(argv) {
  const options = {
    source: null,
    out: path.join(ROOT, "build-assets", "icon.ico"),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag !== "--source" && flag !== "--out") {
      throw new Error(`unknown argument: ${flag}`);
    }
    if (!value) {
      throw new Error(`${flag} requires a value`);
    }
    options[flag.slice(2)] = path.resolve(value);
    index += 1;
  }
  return options;
}

function resolveSource(override) {
  if (override) {
    return override;
  }
  const config = JSON.parse(readFileSync(path.join(ROOT, "upstream.json"), "utf8"));
  const upstream = process.env.SCOTTY_SRC
    ? path.resolve(process.env.SCOTTY_SRC)
    : path.join(ROOT, ".cache", "upstream", config.tag);
  return path.join(upstream, "app", "icon.svg");
}

function svgBaseSize(svg) {
  const match = /viewBox=["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i.exec(svg);
  if (!match) {
    return 32;
  }
  return Math.max(Number(match[1]), Number(match[2])) || 32;
}

function encodeIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);

  const entries = Buffer.alloc(frames.length * 16);
  let offset = 6 + entries.length;
  frames.forEach((frame, index) => {
    const entry = index * 16;
    entries[entry] = frame.size === 256 ? 0 : frame.size;
    entries[entry + 1] = frame.size === 256 ? 0 : frame.size;
    entries[entry + 2] = 0;
    entries[entry + 3] = 0;
    entries.writeUInt16LE(1, entry + 4);
    entries.writeUInt16LE(32, entry + 6);
    entries.writeUInt32LE(frame.data.length, entry + 8);
    entries.writeUInt32LE(offset, entry + 12);
    offset += frame.data.length;
  });

  return Buffer.concat([header, entries, ...frames.map((frame) => frame.data)]);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const source = resolveSource(options.source);
  if (!existsSync(source)) {
    throw new Error(`icon source not found: ${source} (run npm run upstream:fetch first)`);
  }

  const svg = readFileSync(source);
  const baseSize = svgBaseSize(svg.toString("utf8"));
  const density = Math.ceil((72 * 256) / baseSize);

  const frames = [];
  for (const size of SIZES) {
    const data = await sharp(svg, { density }).resize(size, size).png().toBuffer();
    frames.push({ size, data });
  }

  const ico = encodeIco(frames);
  mkdirSync(path.dirname(options.out), { recursive: true });
  writeFileSync(options.out, ico);
  console.log(`icon written: ${options.out} (${SIZES.join(", ")} px, ${ico.length} bytes)`);
}

try {
  await main();
} catch (error) {
  console.error(`generate-icon failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}