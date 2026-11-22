// Cifra um JSON de dados para o robô "Aplicar dados no app" (o repositório é público).
// Uso: node tools/cifrar.mjs entrada.json tools/dados/<nome>.json
// Só quem tem a chave do Firebase (segredo FIREBASE_SA no GitHub) consegue abrir.
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const [, , ent, sai] = process.argv;
if (!ent || !sai) { console.error("Uso: node tools/cifrar.mjs entrada.json tools/dados/saida.json"); process.exit(1); }
const dados = fs.readFileSync(ent); JSON.parse(dados);   // confere que é JSON válido
const pub = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "chave-publica.pem"), "utf8");
const k = crypto.randomBytes(32), iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", k, iv);
const d = Buffer.concat([c.update(dados), c.final()]);
const out = { cifrado: { k: crypto.publicEncrypt({ key: pub, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, k).toString("base64"),
  iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), d: d.toString("base64") } };
fs.writeFileSync(sai, JSON.stringify(out)); console.log("Cifrado:", sai);
