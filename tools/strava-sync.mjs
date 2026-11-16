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

const depois = st.ultimo || Math.floor(new Date("2026-01-01T00:00:00Z").getTime() / 1000);
const atividades = [];
for (let pg = 1; pg < 20; pg++) {
  const r = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${depois}&per_page=100&page=${pg}`, { headers: { Authorization: "Bearer " + tk.access_token } });
  const j = await r.json(); if (!r.ok) throw new Error("Erro ao listar atividades: " + JSON.stringify(j));
  atividades.push(...j); if (j.length < 100) break;
}
const existentes = (await db.collection("corridas").where("pessoa", "==", "marco").get()).docs.map(d => ({ id: d.id, ...d.data() }));
let novas = 0, ultimo = depois;
for (const a of atividades) {
  ultimo = Math.max(ultimo, Math.floor(new Date(a.start_date).getTime() / 1000) - 3600);
  if (!/Run$/.test(a.sport_type || a.type || "") || !(a.distance > 500)) continue;
  const id = "st_" + a.id, data = String(a.start_date_local).slice(0, 10), km = Math.round(a.distance / 10) / 100;
  if (existentes.some(x => x.id === id)) continue;
  if (existentes.some(x => x.data === data && Math.abs((+x.km || 0) - km) <= Math.max(0.3, km * 0.05))) continue;   // já registrada (manual ou Samsung)
  const doc = { pessoa: "marco", data, inicio: String(a.start_date_local).replace("Z", ""), km, seg: a.moving_time || a.elapsed_time,
    fc: a.average_heartrate ? Math.round(a.average_heartrate) : "", kcal: a.calories ? Math.round(a.calories) : "", fonte: "strava", obs: a.name || "", stravaId: String(a.id) };
  await db.collection("corridas").doc(id).set(doc); existentes.push({ id, ...doc }); novas++;
  console.log(`+ ${data} ${km} km`);
}
await ref.set({ ...st, ultimo, atualizado: new Date().toISOString() });
console.log(`Pronto: ${novas} corrida(s) nova(s) de ${atividades.length} atividade(s).`);
