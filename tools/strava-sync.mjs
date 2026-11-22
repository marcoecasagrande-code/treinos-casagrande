// Traz as corridas do Strava do Marco para o app (Firestore, coleção "corridas").
// Roda no GitHub Actions. Segredos: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_CODE, FIREBASE_SA.
import admin from "firebase-admin";

const { STRAVA_CLIENT_ID: cid, STRAVA_CLIENT_SECRET: csec, STRAVA_CODE: code, FIREBASE_SA: sa } = process.env;
if (!cid || !csec || !sa) { console.log("Faltam segredos (STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, FIREBASE_SA)."); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
const db = admin.firestore();
const ref = db.collection("_privado").doc("strava");
const st = (await ref.get()).data() || {};

async function token(body) {
  const r = await fetch("https://www.strava.com/oauth/token", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: cid, client_secret: csec, ...body }) });
  const j = await r.json(); if (!r.ok) throw new Error("Strava recusou o token: " + JSON.stringify(j)); return j;
}
let tk;
if (code && code !== st.codigoUsado) { tk = await token({ code, grant_type: "authorization_code" }); st.codigoUsado = code; console.log("Autorização nova usada."); }
else if (st.refresh) tk = await token({ refresh_token: st.refresh, grant_type: "refresh_token" });
else { console.log("Sem autorização: gere o código e salve em STRAVA_CODE."); process.exit(1); }
st.refresh = tk.refresh_token;
await ref.set({ ...st, atualizado: new Date().toISOString() });

const inicioAno = Math.floor(new Date("2026-01-01T00:00:00Z").getTime() / 1000);
const backfill = !st.mapaV1 || !st.splitsV1;   // 1ª vez com mapas/parciais: relê o ano para completar as corridas já importadas
const depois = backfill ? inicioAno : (st.ultimo || inicioAno);
const atividades = [];
for (let pg = 1; pg < 20; pg++) {
  const r = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${depois}&per_page=100&page=${pg}`, { headers: { Authorization: "Bearer " + tk.access_token } });
  const j = await r.json(); if (!r.ok) throw new Error("Erro ao listar atividades: " + JSON.stringify(j));
  atividades.push(...j); if (j.length < 100) break;
}
const existentes = (await db.collection("corridas").where("pessoa", "==", "marco").get()).docs.map(d => ({ id: d.id, ...d.data() }));
// Parciais por km (pace, FC, subida) vêm do detalhe da atividade.
let detalhes = 0, parciais = 0, faltou = false;
async function splitsDe(aid) {
  if (detalhes >= 80) { faltou = true; return null; }   // limite da API: o resto fica para a próxima rodada
  detalhes++;
  const r = await fetch(`https://www.strava.com/api/v3/activities/${aid}`, { headers: { Authorization: "Bearer " + tk.access_token } });
  if (!r.ok) { faltou = true; console.log("Detalhe falhou", aid, r.status); return null; }
  const j = await r.json();
  const splits = (j.splits_metric || []).filter(x => x.distance > 50).map(x => ({ m: Math.round(x.distance), s: x.moving_time || x.elapsed_time,
    fc: x.average_heartrate ? Math.round(x.average_heartrate) : 0, el: Math.round(x.elevation_difference || 0) }));
  return { splits, subida: Math.round(j.total_elevation_gain || 0), fcmax: j.max_heartrate ? Math.round(j.max_heartrate) : 0 };
}
async function completar(docId, alvo, aid) {
  if (alvo.splits) return;
  const d = await splitsDe(aid); if (!d) return;
  await db.collection("corridas").doc(docId).set(d, { merge: true }); Object.assign(alvo, d); parciais++;
}
let novas = 0, mapas = 0, ultimo = st.ultimo || depois;
for (const a of atividades) {
  ultimo = Math.max(ultimo, Math.floor(new Date(a.start_date).getTime() / 1000) - 3600);
  if (!/Run$/.test(a.sport_type || a.type || "") || !(a.distance > 500)) continue;
  const id = "st_" + a.id, data = String(a.start_date_local).slice(0, 10), km = Math.round(a.distance / 10) / 100;
  const mapa = (a.map && a.map.summary_polyline) || "";
  const ja = existentes.find(x => x.id === id);
  if (ja) { if (mapa && !ja.mapa) { await db.collection("corridas").doc(id).set({ mapa }, { merge: true }); ja.mapa = mapa; mapas++; } await completar(id, ja, a.id); continue; }
  const igual = existentes.find(x => x.data === data && Math.abs((+x.km || 0) - km) <= Math.max(0.3, km * 0.05));
  if (igual) { if (mapa && !igual.mapa) { await db.collection("corridas").doc(igual.id).set({ mapa, stravaId: String(a.id) }, { merge: true }); igual.mapa = mapa; mapas++; } await completar(igual.id, igual, a.id); continue; }   // já registrada (manual ou Samsung): só junta o mapa
  const doc = { pessoa: "marco", data, inicio: String(a.start_date_local).replace("Z", ""), km, seg: a.moving_time || a.elapsed_time,
    fc: a.average_heartrate ? Math.round(a.average_heartrate) : "", kcal: a.calories ? Math.round(a.calories) : "", fonte: "strava", obs: a.name || "", stravaId: String(a.id), mapa };
  await db.collection("corridas").doc(id).set(doc); const novo = { id, ...doc }; existentes.push(novo); novas++;
  await completar(id, novo, a.id);
  console.log(`+ ${data} ${km} km`);
}
await ref.set({ ...st, ultimo: faltou && backfill ? st.ultimo || 0 : ultimo, mapaV1: true, splitsV1: st.splitsV1 || !faltou, atualizado: new Date().toISOString() });
console.log(`Pronto: ${novas} corrida(s) nova(s), ${mapas} mapa(s) e ${parciais} parcial(is) por km adicionados${faltou ? " (falta completar algumas na próxima rodada)" : ""}, de ${atividades.length} atividade(s).`);
