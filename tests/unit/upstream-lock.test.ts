import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

const UPSTREAM = {
  repo: "https://github.com/brendan-appstart/bead-me-up-scotty",
  tag: "v0.4.0",
  commit: "cf6dda198db15a77399d1d9e77292618a7d08fa1",
  eleventyVersion: "3.1.6",
};

describe("upstream pin", () => {
  it("locks the upstream repo, tag, commit and Eleventy version", () => {
    const upstream = JSON.parse(read("upstream.json")) as Record<string, unknown>;

    expect(upstream).toEqual(UPSTREAM);
  });

  it("keeps the upstream MIT license text", () => {
    const license = read("licenses/bead-me-up-scotty.LICENSE");

    expect(license).toContain("MIT License");
    expect(license).toContain("Copyright (c) 2026 Brendan");
  });
});

describe("licensing", () => {
  it("declares this project's MIT license with current year and author", () => {
    const license = read("LICENSE");

    expect(license).toMatch(/^MIT License/);
    expect(license).toContain("Copyright (c) 2026 Steven Liang");
  });

  it("records upstream source and icon provenance in NOTICE", () => {
    const notice = read("NOTICE");

    expect(notice).toContain(UPSTREAM.repo);
    expect(notice).toContain(UPSTREAM.tag);
    expect(notice).toContain(UPSTREAM.commit);
    expect(notice).toContain("Brendan");
    expect(notice).toContain("app/icon.svg");
    expect(notice).toContain("app/favicon.ico");
    expect(notice).toContain("MIT");
  });
});