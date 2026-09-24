/**
 * Deep card schema check.
 *
 * Replaces a top-level-only `_check_schema_props` pass: every nested property,
 * required key, enum, pattern, and additionalProperties rule is enforced.
 *
 * Usage: node scripts/check-card-schema.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cardsDir = path.join(root, "cards");
const schemaPath = path.join(cardsDir, "card.schema.json");

export function loadSchema(file = schemaPath) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function deref(schema, rootSchema) {
  if (!schema || typeof schema !== "object") return schema;
  if (!schema.$ref) return schema;
  const ref = schema.$ref;
  if (!ref.startsWith("#/$defs/")) {
    throw new Error("unsupported $ref " + ref);
  }
  const name = ref.slice("#/$defs/".length);
  const target = rootSchema.$defs && rootSchema.$defs[name];
  if (!target) throw new Error("missing $ref " + ref);
  return target;
}

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * Validate `data` against a schema node. Returns a list of error strings.
 * Empty list means the value matches.
 */
export function validateSchema(data, schema, rootSchema = schema, pointer = "$") {
  schema = deref(schema, rootSchema);
  const errors = [];
  if (!schema || typeof schema !== "object") return errors;

  if (schema.oneOf) {
    const matched = [];
    const branchErrors = [];
    for (let i = 0; i < schema.oneOf.length; i++) {
      const sub = validateSchema(data, schema.oneOf[i], rootSchema, pointer);
      if (sub.length === 0) matched.push(i);
      else branchErrors.push(sub);
    }
    if (matched.length !== 1) {
      const detail =
        matched.length === 0
          ? branchErrors
              .map((errs, i) => "branch " + i + ": " + errs.slice(0, 3).join("; "))
              .join(" | ")
          : "matched branches " + matched.join(",");
      errors.push(pointer + " oneOf failed (" + detail + ")");
    }
    return errors;
  }

  if (Object.prototype.hasOwnProperty.call(schema, "const") && data !== schema.const) {
    errors.push(pointer + " expected const " + JSON.stringify(schema.const));
    return errors;
  }

  if (schema.enum && !schema.enum.includes(data)) {
    errors.push(pointer + " expected one of " + schema.enum.join("|"));
    return errors;
  }

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const got = typeOf(data);
    if (!types.includes(got)) {
      errors.push(pointer + " expected " + types.join("|") + " but got " + got);
      return errors;
    }
  }

  if (typeof data === "string") {
    if (schema.minLength != null && data.length < schema.minLength) {
      errors.push(pointer + " shorter than " + schema.minLength);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(data)) {
      errors.push(pointer + " failed pattern " + schema.pattern);
    }
  }

  if (typeof data === "number") {
    if (schema.minimum != null && data < schema.minimum) {
      errors.push(pointer + " below minimum " + schema.minimum);
    }
    if (schema.maximum != null && data > schema.maximum) {
      errors.push(pointer + " above maximum " + schema.maximum);
    }
  }

  if (Array.isArray(data)) {
    if (schema.minItems != null && data.length < schema.minItems) {
      errors.push(pointer + " fewer than " + schema.minItems + " items");
    }
    if (schema.items) {
      data.forEach((item, i) => {
        errors.push(...validateSchema(item, schema.items, rootSchema, pointer + "[" + i + "]"));
      });
    }
  }

  if (data && typeof data === "object" && !Array.isArray(data)) {
    const props = schema.properties || {};
    const required = schema.required || [];
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) {
        errors.push(pointer + " missing required " + key);
      }
    }
    for (const key of Object.keys(data)) {
      if (props[key]) {
        errors.push(...validateSchema(data[key], props[key], rootSchema, pointer + "." + key));
        continue;
      }
      if (schema.additionalProperties === false) {
        errors.push(pointer + " unexpected property " + key);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        errors.push(
          ...validateSchema(data[key], schema.additionalProperties, rootSchema, pointer + "." + key)
        );
      }
    }
  }

  return errors;
}

export function validateCard(card, schema = loadSchema()) {
  const errors = validateSchema(card, schema, schema, "$");
  return { ok: errors.length === 0, errors };
}

export function cardFiles(dir = cardsDir) {
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json") && name !== "card.schema.json")
    .sort();
}

export function validateAllCards(dir = cardsDir, schema = loadSchema()) {
  const failures = [];
  const files = cardFiles(dir);
  for (const name of files) {
    let card;
    try {
      card = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    } catch (err) {
      failures.push({ file: name, errors: ["invalid JSON: " + err.message] });
      continue;
    }
    const result = validateCard(card, schema);
    if (!result.ok) failures.push({ file: name, errors: result.errors });
  }
  return { files: files.length, failures };
}

function main() {
  const { files, failures } = validateAllCards();
  console.log("cards " + files + "  pass " + (files - failures.length) + "  fail " + failures.length);
  for (const row of failures) {
    console.log("FAIL " + row.file);
    for (const err of row.errors) console.log("  " + err);
  }
  if (failures.length) process.exit(1);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
