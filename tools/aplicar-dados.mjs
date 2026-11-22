// Aplica no Firestore os arquivos de tools/dados/*.json alterados no último commit.
// Cada arquivo: { docs: [...] } ou { cifrado: {k, iv, tag, d} } (gerado por tools/cifrar.mjs; só este robô abre).
// Itens de docs:
//   { col, id, campos }                       → "campos" é mesclado no documento (o resto é mantido)
//   { col, id, apagar: true }                 → apaga o documento
//   { col, id, mesclarLista: { campo, itens } } → junta itens numa lista do documento sem duplicar
//       (mesmo id, ou mesma data com nome parecido); campos vazios são preenchidos, os já preenchidos ficam.
import admin from "firebase-admin";
import fs from "node:fs";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
const SA = JSON.parse(process.env.FIREBASE_SA);
if (process.env.MOSTRAR_CHAVE) { console.log(crypto.createPublicKey(SA.private_key).export({ type: "spki", format: "pem" })); process.exit(0); }
admin.initializeApp({ credential: admin.credential.cert(SA) });
const db = admin.firestore();

function abrir(c) {
  const k = crypto.privateDecrypt({ key: SA.private_key, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(c.k, "base64"));
  const dc = crypto.createDecipheriv("aes-256-gcm", k, Buffer.from(c.iv, "base64")); dc.setAuthTag(Buffer.from(c.tag, "base64"));
  return JSON.parse(Buffer.concat([dc.update(Buffer.from(c.d, "base64")), dc.final()]).toString("utf8"));
}
const norm = s => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const palavras = s => new Set(norm(s).split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !["corrida", "circuito", "etapa", "run", "2026", "2027", "2028"].includes(w)));
const parecido = (a, b) => { const A = palavras(a), B = palavras(b); for (const w of A) if (B.has(w)) return true; return false; };
const vazio = v => v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
function juntar(velho, novo) {
  const r = { ...velho };
  for (const [k, v] of Object.entries(novo)) {
    if (k === "id") continue;
    if (v && typeof v === "object" && !Array.isArray(v) && velho[k] && typeof velho[k] === "object") r[k] = juntar(velho[k], v);
    else if (k === "opcoes" && Array.isArray(v) && Array.isArray(velho[k])) r[k] = [...new Set([...velho[k], ...v].map(Number))].sort((a, b) => a - b);
    else if (vazio(velho[k]) && !vazio(v)) r[k] = v;
  }
  return r;
}

let arqs = [];
try { arqs = execSync("git diff --name-only HEAD~1 HEAD -- tools/dados", { cwd: "..", encoding: "utf8" }).split("\n").filter(f => f.endsWith(".json")); } catch {}
if (process.env.ARQUIVO) arqs = [process.env.ARQUIVO];
for (const a of arqs) {
  const p = "../" + a; if (!fs.existsSync(p)) continue;
  let j = JSON.parse(fs.readFileSync(p, "utf8"));
  if (j.cifrado) j = abrir(j.cifrado);
  for (const d of j.docs || []) {
    const ref = db.collection(d.col).doc(d.id);
    if (d.apagar) { await ref.delete(); console.log(`✗ apagado ${d.col}/${d.id}`); continue; }
    if (d.mesclarLista) {
      const { campo, itens } = d.mesclarLista, atual = (await ref.get()).data() || {}, lista = [...(atual[campo] || [])];
      let novos = 0, atual_ = 0;
      for (const it of itens || []) {
        const i = lista.findIndex(x => x.id === it.id || (it.data && x.data === it.data && parecido(x.nome, it.nome)));
        if (i >= 0) { lista[i] = juntar(lista[i], it); atual_++; } else { lista.push(it); novos++; }
      }
      lista.sort((x, y) => String(x.data || "").localeCompare(String(y.data || "")));
      await ref.set({ [campo]: lista }, { merge: true }); console.log(`✓ ${d.col}/${d.id}: ${novos} novo(s), ${atual_} já existia(m)`); continue;
    }
    await ref.set(d.campos, { merge: true }); console.log(`✓ ${d.col}/${d.id}`);
  }
}
console.log(`Pronto (${arqs.length} arquivo(s)).`);
