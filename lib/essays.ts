import fs from "node:fs";
import path from "node:path";

const ESSAYS_DIR = path.join(process.cwd(), "essays");

export type Essay = { slug: string; title: string; content: string };

// ponytail: title = first markdown heading, date/frontmatter when needed
export function getEssays(): Essay[] {
  if (!fs.existsSync(ESSAYS_DIR)) return [];
  return fs
    .readdirSync(ESSAYS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const content = fs.readFileSync(path.join(ESSAYS_DIR, f), "utf8");
      const title =
        content.match(/^#\s+(.+)$/m)?.[1] ?? f.replace(/\.md$/, "");
      return { slug: f.replace(/\.md$/, ""), title, content };
    });
}

export function getEssay(slug: string): Essay | undefined {
  return getEssays().find((e) => e.slug === slug);
}
