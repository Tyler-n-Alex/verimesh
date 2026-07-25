function normalizeNullifier(raw) {
  const trimmed = raw.trim();
  if (/^[0-9]+$/.test(trimmed) && !trimmed.startsWith("0")) {
    return normalizeNullifier("0x" + BigInt(trimmed).toString(16));
  }
  const body = trimmed.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]+$/.test(body)) throw new Error(`not hex: ${raw}`);
  if (body.length > 64) throw new Error(`too long: ${raw}`);
  return "0x" + body.padStart(64, "0");
}
const same = (a,b) => normalizeNullifier(a) === normalizeNullifier(b);

const hex = "0x04e5f6ab";
const dec = BigInt(hex).toString(10);
console.log("hex ->", normalizeNullifier(hex));
console.log("dec ->", normalizeNullifier(dec));
console.log("hex==dec (THE T2 GUARD):", same(hex, dec));
console.log("case-insensitive:", same("0xABCDEF", "0xabcdef"));
console.log("padding:", same("0x1", "0x0000001"));
console.log("whitespace:", same(" 0xAB ", "0xab"));
console.log("distinct humans stay distinct:", !same("0xaa", "0xbb"));
try { normalizeNullifier("0xzz"); console.log("FAIL: accepted junk"); } catch { console.log("rejects junk: true"); }
try { normalizeNullifier("0x" + "f".repeat(65)); console.log("FAIL: accepted oversize"); } catch { console.log("rejects oversize: true"); }
const real = "0x" + "a3f2".repeat(16);
console.log("full 32-byte roundtrip:", normalizeNullifier(real) === real, normalizeNullifier(real).length);
