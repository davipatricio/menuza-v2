// Rust serializes every `Option<T>` as present-and-null, so the emitted schema
// marks those properties nullable but not required. The generated TypeScript
// then gets `field?: T | null`, which is wider than the wire shape and does not
// assign to the app's exact types. Mark every nullable property required.

/** @param {Record<string, unknown>} property */
function admitsNull(property) {
  // OpenAPI 3.1 spells `Option<T>` as `type: ["T", "null"]`; 3.0 uses `nullable`.
  const types = Array.isArray(property?.type) ? property.type : [];

  return property?.nullable === true || types.includes("null");
}

/** @param {import('orval').OpenAPIObject} spec */
export default function markNullablePropertiesRequired(spec) {
  for (const schema of Object.values(spec.components?.schemas ?? {})) {
    const required = new Set(schema.required ?? []);

    for (const [name, property] of Object.entries(schema.properties ?? {})) {
      if (admitsNull(property)) required.add(name);
    }

    if (required.size > 0) schema.required = [...required];
  }

  return spec;
}
