// Builds one index of all samples from src/edgeactions-js/*/sample.json.
//   node scripts/build-samples-index.mjs              validate only
//   node scripts/build-samples-index.mjs index.json   validate and write the index

import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..", "src", "edgeactions-js");
const read = (...p) => fs.readFileSync(path.join(root, ...p), "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
const exists = (...p) => fs.existsSync(path.join(root, ...p));

const categories = JSON.parse(read("sample.schema.json")).properties.category.enum;
const errors = [];
const samples = [];

for (const id of fs.readdirSync(root).sort()) {
    if (!exists(id, "edge_action.js")) continue;
    const fail = (msg) => errors.push(`${id}: ${msg}`);
    if (!exists(id, "sample.json")) { fail("missing sample.json"); continue; }

    let meta, testInput;
    try {
        meta = JSON.parse(read(id, "sample.json"));
        testInput = exists(id, "test_input.json")
            ? JSON.parse(read(id, "test_input.json"))
            : JSON.parse(read(id, "test_cases.json")).test_cases[0].input;
    } catch (e) { fail(e.message); continue; }

    if (!meta.title?.trim()) fail("title is required");
    if (!meta.description?.trim()) fail("description is required");
    if (meta.category !== undefined && !categories.includes(meta.category)) {
        fail(`category must be one of: ${categories.join(", ")}`);
    }
    const tags = meta.tags ?? [];
    if (!Array.isArray(tags) || tags.some((t) => typeof t !== "string" || !/^[a-z0-9-]+$/.test(t)) || new Set(tags).size !== tags.length) {
        fail("tags must be unique lowercase strings (a-z, 0-9, -)");
    }
    if (typeof testInput !== "object" || testInput === null || Array.isArray(testInput)) {
        fail("test input must be a JSON object");
    }

    const code = read(id, "edge_action.js");
    samples.push({
        id,
        title: meta.title,
        description: meta.description,
        category: meta.category ?? null,
        tags,
        // Drop editor-only type hints that reference the local edge_actions.d.ts.
        code: code.replace(/^\/\/ @ts-check\n+/, "").replaceAll('import("./edge_actions").', ""),
        testInput,
    });
}

if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
}
if (process.argv[2]) {
    fs.writeFileSync(process.argv[2], JSON.stringify({ categories, samples }, null, 2) + "\n");
}
console.log(`${samples.length} samples OK`);
