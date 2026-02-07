import { LocalDocumentIndex } from "vectra";
import OpenAI from "openai";
import { config } from "../config.js";
import path from "path";

let index: LocalDocumentIndex | null = null;
let openai: OpenAI;

export async function initVectorStore(): Promise<void> {
  openai = new OpenAI({ apiKey: config.openai.apiKey });

  index = new LocalDocumentIndex({
    folderPath: path.resolve("data/vector-index"),
    embeddings: {
      createEmbeddings: async (inputs: string[]) => {
        const resp = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: inputs,
        });
        return {
          status: "success" as const,
          output: resp.data.map((d) => d.embedding),
        };
      },
      maxTokens: 8000,
    },
  });

  if (!(await index.isCatalogCreated())) {
    await index.createIndex();
    console.log("[vectra] Created new index");
  }

  console.log("[vectra] Vector store initialized");
}

function getIndex(): LocalDocumentIndex {
  if (!index) throw new Error("Vector store not initialized");
  return index;
}

export async function addDocument(
  id: string,
  text: string,
  metadata: Record<string, string> = {}
): Promise<void> {
  const idx = getIndex();

  // Delete existing doc if present (upsert)
  const existingId = await idx.getDocumentId(id);
  if (existingId) {
    await idx.deleteDocument(id);
  }

  await idx.upsertDocument(id, text, undefined, metadata);
}

export interface QueryResult {
  uri: string;
  text: string;
  score: number;
  metadata: Record<string, any>;
}

export interface VectorDocument {
  id: string;
  uri: string;
  text: string;
  metadata: Record<string, any>;
}

export async function listDocuments(): Promise<VectorDocument[]> {
  const catalogPath = path.resolve("data/vector-index/catalog.json");
  const indexDir = path.resolve("data/vector-index");
  try {
    const fs = await import("fs/promises");
    const raw = await fs.readFile(catalogPath, "utf-8");
    const catalog = JSON.parse(raw);
    const uriToId: Record<string, string> = catalog.uriToId || {};
    const docs: VectorDocument[] = [];
    for (const [uri, id] of Object.entries(uriToId)) {
      let text = "";
      let metadata: Record<string, any> = {};
      try {
        text = await fs.readFile(path.join(indexDir, `${id}.txt`), "utf-8");
      } catch {}
      try {
        const metaRaw = await fs.readFile(path.join(indexDir, `${id}.json`), "utf-8");
        metadata = JSON.parse(metaRaw);
      } catch {}
      docs.push({ id: id as string, uri, text, metadata });
    }
    return docs;
  } catch {
    return [];
  }
}

export async function deleteDocument(uri: string): Promise<boolean> {
  const idx = getIndex();
  const existingId = await idx.getDocumentId(uri);
  if (!existingId) return false;
  await idx.deleteDocument(uri);
  return true;
}

export async function query(
  question: string,
  topK = 5
): Promise<QueryResult[]> {
  const idx = getIndex();
  const results = await idx.queryDocuments(question, { maxDocuments: topK });

  const output: QueryResult[] = [];
  for (const r of results) {
    const sections = await r.renderSections(500, 1);
    output.push({
      uri: r.uri || "",
      text: sections.map((s: any) => s.text).join("\n"),
      score: r.score,
      metadata: {},
    });
  }
  return output;
}
