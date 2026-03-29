import crypto from "node:crypto";
import path from "node:path";

const BUILTIN_SOURCE_CATALOG = {
  vercel: {
    url: "https://github.com/vercel-labs/agent-skills",
    label: "Vercel Agent Skills",
    provenance: "known",
  },
};

function createSourceId(input) {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (normalized) return `src_${normalized}`;

  return `src_${crypto.createHash("sha1").update(input).digest("hex").slice(0, 12)}`;
}

function sanitizeAlias(value) {
  return value
    .toLowerCase()
    .replace(/\.git$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

function looksLikeUrl(value) {
  return /^(https?:\/\/|git@|ssh:\/\/|file:\/\/|\.{0,2}\/|\/)/.test(value);
}

export function deriveSourceAlias(reference) {
  if (!reference || !looksLikeUrl(reference)) return null;

  const trimmed = reference.replace(/\/+$/, "");
  let candidate = null;

  if (trimmed.startsWith("git@")) {
    const afterColon = trimmed.split(":").pop() || "";
    candidate = path.basename(afterColon);
  } else {
    candidate = path.basename(trimmed);
  }

  const alias = sanitizeAlias(candidate);
  return alias || null;
}

export function getBuiltinSourceCatalog() {
  return { ...BUILTIN_SOURCE_CATALOG };
}

export function resolveSourceReference(reference, config = {}) {
  const sourceCatalog = {
    ...BUILTIN_SOURCE_CATALOG,
    ...(config.sourceCatalog || {}),
  };

  if (sourceCatalog[reference]) {
    return {
      id: createSourceId(reference),
      alias: reference,
      ...sourceCatalog[reference],
    };
  }

  if (looksLikeUrl(reference)) {
    return {
      id: createSourceId(reference),
      alias: null,
      url: reference,
      label: null,
      provenance: "user",
    };
  }

  throw new Error(`Unknown source reference: ${reference}`);
}

export function resolveSourceDefinition(source, config = {}) {
  if (typeof source === "string") {
    return resolveSourceReference(source, config);
  }

  if (!source || typeof source !== "object") {
    throw new Error("Invalid source definition");
  }

  if (source.alias && config.sourceCatalog?.[source.alias]) {
    return {
      id: createSourceId(source.alias),
      alias: source.alias,
      ...config.sourceCatalog[source.alias],
      url: source.url || config.sourceCatalog[source.alias].url,
    };
  }

  if (source.alias && source.url) {
    return {
      id: createSourceId(source.alias),
      alias: source.alias,
      url: source.url,
      label: source.label || null,
      provenance: source.provenance || "user",
    };
  }

  if (source.url) {
    const alias = source.alias || deriveSourceAlias(source.url);
    return {
      id: createSourceId(alias || source.url),
      alias,
      url: source.url,
      label: source.label || null,
      provenance: source.provenance || "user",
    };
  }

  if (source.alias) {
    return resolveSourceReference(source.alias, config);
  }

  throw new Error("Invalid source definition");
}
