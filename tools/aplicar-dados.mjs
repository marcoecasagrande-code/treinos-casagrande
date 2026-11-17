// Aplica no Firestore os arquivos de tools/dados/*.json alterados no último commit.
// Cada arquivo: { docs: [{ col, id, campos }] } — "campos" é mesclado no documento (o resto do documento é mantido).
import admin from "firebase-admin";
import fs from "node:fs";
import { execSync } from "node:child_process";
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SA)) });
const db = admin.firestore();
let arqs = [];
try { arqs = execSync("git diff --name-only HEAD~1 HEAD -- tools/dados", { cwd: "..", encoding: "utf8" }).split("\n").filter(f => f.endsWith(".json")); } catch {}
if (process.env.ARQUIVO) arqs = [process.env.ARQUIVO];
for (const a of arqs) {
  const p = "../" + a; if (!fs.existsSync(p)) continue;
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const d of j.docs || []) { await db.collection(d.col).doc(d.id).set(d.campos, { merge: true }); console.log(`✓ ${d.col}/${d.id}`); }
}
console.log(`Pronto (${arqs.length} arquivo(s)).`);
