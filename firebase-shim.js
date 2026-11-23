/* Treinos Casagrande — versão independente do Claude.
   Faz o papel de window.claude.use("db" | "assets") usando o Firebase (Firestore + login Google),
   para que o mesmo código do app funcione fora do Claude. */
(() => {
  const CFG = {
    apiKey: "AIzaSyBajf8IHC6VQ_NSrksyMHCkTfdHM-Zki6o",
    authDomain: "treinos-casagrande.firebaseapp.com",
    projectId: "treinos-casagrande",
    storageBucket: "treinos-casagrande.firebasestorage.app",
    messagingSenderId: "784923030606",
    appId: "1:784923030606:web:bae344cc4d2477819dff1f"
  };
  // Login pelo botão oficial do Google (accounts.google.com): não depende de treinos-casagrande.firebaseapp.com,
  // que algumas redes (Wi-Fi de casa, operadora) bloqueiam. Vazio = usa só o login antigo.
  const GOOGLE_CLIENT_ID = "";
  firebase.initializeApp(CFG);
  const auth = firebase.auth(), fs = firebase.firestore();
  try { fs.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch {}
  window.__blobMap = window.__blobMap || {}; window.__fbLogin = true;

  // O Firestore não aceita lista dentro de lista: guarda como objeto e desfaz na leitura.
  const enc = v => Array.isArray(v) ? (v.some(Array.isArray) ? { __lista: v.map(x => Array.isArray(x) ? { __lista: x.map(enc) } : enc(x)) } : v.map(enc))
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, enc(x)])) : v;
  const dec = v => Array.isArray(v) ? v.map(dec) : v && typeof v === "object" ? ("__lista" in v && Object.keys(v).length === 1 ? dec(v.__lista) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, dec(x)]))) : v;
  const erro = e => { const x = new Error(e && e.message || "erro"); x.code = e && e.code === "permission-denied" ? "invalid_argument" : e && e.code === "unavailable" ? "unavailable" : (e && e.code) || "erro"; return x; };
  const snap = s => ({ id: s.id, exists: s.exists, data: () => s.exists ? dec(s.data()) : undefined, metadata: s.metadata });
  const qsnap = q => ({ docs: q.docs.map(snap), size: q.size, empty: q.empty });
  const docApi = ref => ({ id: ref.id,
    get: async () => { try { return snap(await ref.get()); } catch (e) { throw erro(e); } },
    set: async d => { try { await ref.set(enc(d)); } catch (e) { throw erro(e); } },
    update: async d => { try { await ref.set(enc(d), { merge: true }); } catch (e) { throw erro(e); } },
    delete: async () => { try { await ref.delete(); } catch (e) { throw erro(e); } },
    onSnapshot: (fn, err) => ref.onSnapshot(s => fn(snap(s)), e => err && err(erro(e))) });
  const queryApi = (q, col) => ({
    where: (...a) => queryApi(q.where(...a), col), orderBy: (...a) => queryApi(q.orderBy(...a), col), limit: n => queryApi(q.limit(n), col),
    get: async () => { try { return qsnap(await q.get()); } catch (e) { throw erro(e); } },
    onSnapshot: (fn, err) => q.onSnapshot(s => fn(qsnap(s)), e => err && err(erro(e))),
    doc: id => docApi(id ? col.doc(id) : col.doc()) });
  const db = { collection: c => { const r = fs.collection(c); return queryApi(r, r); }, doc: p => docApi(fs.doc(p)) };

  // Fotos: guardadas no próprio Firestore (coleção _fotos), já reduzidas.
  const paraDataUrl = blob => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(blob); });
  async function reduzir(blob) {
    let url = await paraDataUrl(blob); if (url.length < 900000) return url;
    const img = new Image(); img.src = url; await img.decode();
    for (const [max, q] of [[1400, .82], [1100, .78], [800, .72], [600, .65]]) {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      url = c.toDataURL("image/jpeg", q); if (url.length < 900000) return url;
    }
    const x = new Error("grande"); x.code = "too_large"; throw x;
  }
  const assets = {
    upload: async blob => { const data = await reduzir(blob), id = "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      try { await fs.collection("_fotos").doc(id).set({ data, criado: new Date().toISOString() }); } catch (e) { throw erro(e); }
      window.__blobMap[id] = data; return { id, url: data, sizeBytes: data.length, contentType: "image/jpeg" }; },
    delete: async id => { delete window.__blobMap[id]; try { await fs.collection("_fotos").doc(id).delete(); } catch (e) { throw erro(e); } },
    list: async () => ({ assets: Object.keys(window.__blobMap).map(id => ({ id })), usage: {} })
  };

  // Tela de entrada (login Google) — só a família tem acesso (regras do Firestore).
  const css = `#fb-login{position:fixed;inset:0;z-index:99999;background:#f3c123;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Inter,system-ui,sans-serif}
  #fb-login .box{background:#fff;border-radius:22px;padding:28px 24px;max-width:360px;width:100%;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.18)}
  #fb-login img{width:96px;height:96px;border-radius:22px}#fb-login h1{font:800 30px "Barlow Condensed",sans-serif;margin:12px 0 4px;color:#1d1d1f;letter-spacing:.02em}
  #fb-login p{color:#555;font-size:14px;margin:0 0 18px}#fb-login button{width:100%;border:0;border-radius:14px;padding:14px;font:600 16px Inter,sans-serif;background:#1d1d1f;color:#fff;cursor:pointer}
  #fb-login .sec{background:#eee;color:#1d1d1f;margin-top:10px}#fb-login #fb-gis{display:flex;justify-content:center;min-height:44px}#fb-login .err{color:#c0392b;font-size:13px;margin-top:12px;min-height:1em}`;
  let tela = null;
  function mostrarLogin(msg, sair) {
    if (!tela) { const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st); tela = document.createElement("div"); tela.id = "fb-login"; document.body.appendChild(tela); }
    tela.innerHTML = `<div class="box"><img src="icon-192.png" alt=""><h1>TREINOS CASAGRANDE</h1><p>Entre com a sua conta Google da família.</p>
      ${sair ? `<button id="fb-sair">Entrar com outra conta</button>` : GOOGLE_CLIENT_ID ? `<div id="fb-gis"></div><button id="fb-entrar" class="sec">Outra forma de entrar</button>` : `<button id="fb-entrar">Entrar com Google</button>`}<div class="err">${msg || ""}</div></div>`;
    tela.hidden = false;
    if (!sair && GOOGLE_CLIENT_ID) botaoGoogle();
    const b = tela.querySelector("#fb-entrar"); if (b) b.onclick = entrar;
    const s = tela.querySelector("#fb-sair"); if (s) s.onclick = () => auth.signOut();
  }
  let gisPronto = null;
  function botaoGoogle() {
    gisPronto ||= new Promise((ok, no) => { const sc = document.createElement("script"); sc.src = "https://accounts.google.com/gsi/client"; sc.async = true; sc.onload = ok; sc.onerror = no; document.head.appendChild(sc); });
    gisPronto.then(() => {
      google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, ux_mode: "popup", auto_select: false, itp_support: true,
        callback: async r => { try { await auth.signInWithCredential(firebase.auth.GoogleAuthProvider.credential(r.credential)); }
          catch (e) { mostrarLogin("Não deu para entrar (" + ((e && e.code) || "erro") + "). Tente de novo."); } } });
      const alvo = document.getElementById("fb-gis");
      if (alvo) google.accounts.id.renderButton(alvo, { theme: "filled_black", size: "large", shape: "pill", text: "signin_with", locale: "pt-BR", width: Math.min(312, alvo.clientWidth || 300) });
    }).catch(() => { const e = tela && tela.querySelector(".err"); if (e) e.textContent = "Não consegui carregar o botão do Google. Use “Outra forma de entrar”."; });
  }
  async function entrar() {
    const p = new firebase.auth.GoogleAuthProvider(); p.setCustomParameters({ prompt: "select_account" });
    try { await auth.signInWithPopup(p); }
    catch (e) { if (e && /popup-blocked|operation-not-supported|popup-closed-by-browser/.test(e.code || "")) return auth.signInWithRedirect(p); mostrarLogin(e && e.code === "auth/popup-closed-by-user" ? "" : "Não deu para entrar. Tente de novo."); }
  }
  let liberar; const pronto = new Promise(r => liberar = r); let aberto = false;
  auth.getRedirectResult().catch(() => {});
  auth.onAuthStateChanged(async u => {
    if (!u) { if (aberto) location.reload(); return document.readyState === "loading" ? addEventListener("DOMContentLoaded", () => mostrarLogin()) : mostrarLogin(); }
    try { await fs.doc("config/pessoas").get(); }
    catch (e) { if (e && e.code === "permission-denied") return mostrarLogin(`A conta ${u.email} não tem acesso a este app.`, true); }
    try { const q = await fs.collection("_fotos").get(); q.forEach(d => { window.__blobMap[d.id] = d.data().data; }); } catch {}
    fs.collection("_fotos").onSnapshot(q => q.forEach(d => { window.__blobMap[d.id] = d.data().data; }), () => {});
    try { const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(u.email || "").toLowerCase())); window.__fbEmailHash = [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join(""); } catch {}
    if (tela) tela.hidden = true; aberto = true; liberar();
    importarSeVazio();
  });

  // Primeira vez: banco vazio → oferecer importar o arquivo de dados que veio do Claude.
  async function importarSeVazio() {
    try { const f = await fs.collection("fichas").limit(1).get(); if (!f.empty) return; } catch { return; }
    const d = document.createElement("div"); d.id = "fb-import";
    d.innerHTML = `<style>#fb-import{position:fixed;left:12px;right:12px;bottom:84px;z-index:9999;background:#1d1d1f;color:#fff;border-radius:16px;padding:14px;font:14px Inter,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.3)}#fb-import b{display:block;margin-bottom:6px}#fb-import label,#fb-import button{display:inline-block;margin-top:8px;margin-right:8px;background:#f3c123;color:#1d1d1f;border:0;border-radius:10px;padding:9px 12px;font-weight:700;cursor:pointer}#fb-import button{background:#444;color:#fff}</style>
      <b>Trazer os dados do app do Claude</b>Escolha o arquivo <i>treinos-casagrande-dados.json</i>.<br><label>📥 Escolher arquivo<input type="file" hidden></label><button>Agora não</button>`;
    document.body.appendChild(d);
    d.querySelector("button").onclick = () => d.remove();
    d.querySelector("input").onchange = async e => {
      try { const j = JSON.parse(await e.target.files[0].text()); let n = 0, b = fs.batch(), k = 0;
        for (const [col, docs] of Object.entries(j.colecoes || {})) for (const [id, v] of Object.entries(docs)) { b.set(fs.collection(col).doc(id), enc(v)); n++; if (++k === 400) { await b.commit(); b = fs.batch(); k = 0; } }
        await b.commit(); d.innerHTML = `<b>Pronto! ${n} itens importados.</b>`; setTimeout(() => location.reload(), 1200);
      } catch (x) { alert("Não consegui importar: " + (x && x.message)); }
    };
  }

  window.claude = { use: async name => { await pronto; return name === "db" ? db : name === "assets" ? assets : null; } };
  if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
})();
