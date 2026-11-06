"use strict";
/*
 * Encuestas y comentarios (etapa B).
 * El cliente inicia sesión con su cuenta de Almuerzo.cl (correo y clave) directamente contra Supabase Auth y escribe en las tablas de almuerzo.cl:
 *   - feedback   (puntaje, aspectos, comentario; sobre un pedido o general)
 *   - poll_votes (voto de la encuesta de la semana; se puede cambiar mientras está abierta)
 * Todo lo protege RLS: el navegador solo puede crear/ver lo suyo. La sesión se guarda en localStorage de este dominio.
 */
(() => {
  const C = window.CRIOLLA_CONFIG;
  if (!C) return;
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const SESSION_KEY = "criolla_session";
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const track = (name, params) => { try { if (typeof window.gtag === "function") window.gtag("event", name, params); } catch { /* sin analítica */ } };

  /* ---------- Sesión (Supabase Auth por REST) ---------- */
  const session = {
    data: null,
    load() { try { this.data = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { this.data = null; } return this.data; },
    save(d) { this.data = d; try { localStorage.setItem(SESSION_KEY, JSON.stringify(d)); } catch { /* sin almacenamiento: la sesión dura lo que dure la página */ } },
    clear() { this.data = null; try { localStorage.removeItem(SESSION_KEY); } catch { /* nada */ } },
  };

  function fromAuthResponse(r) {
    return { access_token: r.access_token, refresh_token: r.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (Number(r.expires_in) || 3600), user: { id: r.user && r.user.id, email: r.user && r.user.email } };
  }

  async function authCall(path, body, token) {
    const headers = { apikey: C.supabaseKey, "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${C.supabaseUrl}/auth/v1/${path}`, { method: "POST", headers, body: body ? JSON.stringify(body) : undefined });
    let json = null; try { json = await res.json(); } catch { /* sin cuerpo */ }
    return { ok: res.ok, status: res.status, json: json || {} };
  }

  async function login(email, password) {
    const r = await authCall("token?grant_type=password", { email, password });
    if (!r.ok) {
      const code = r.json.error_code || r.json.error || "";
      const e = new Error(code); e.status = r.status; throw e;
    }
    session.save(fromAuthResponse(r.json));
    return session.data;
  }

  /** Token vigente (renueva si vence en menos de un minuto); null si no hay sesión o no se pudo renovar. */
  async function token() {
    const s = session.data; if (!s) return null;
    if (s.expires_at - 60 > Date.now() / 1000) return s.access_token;
    const r = await authCall("token?grant_type=refresh_token", { refresh_token: s.refresh_token });
    if (!r.ok) { session.clear(); return null; }
    session.save(fromAuthResponse(r.json));
    return session.data.access_token;
  }

  async function logout() {
    const t = session.data && session.data.access_token;
    session.clear();
    if (t) { try { await authCall("logout", null, t); } catch { /* ya se limpió localmente */ } }
  }

  /* ---------- API de datos ---------- */
  async function api(path, { method = "GET", body, prefer, auth = false } = {}) {
    const headers = { apikey: C.supabaseKey };
    if (auth) { const t = await token(); if (!t) { const e = new Error("no-session"); e.status = 401; throw e; } headers.Authorization = `Bearer ${t}`; }
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (prefer) headers.Prefer = prefer;
    const res = await fetch(`${C.supabaseUrl}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) { let j = {}; try { j = await res.json(); } catch { /* sin cuerpo */ } const e = new Error(j.message || `HTTP ${res.status}`); e.status = res.status; e.code = j.code; throw e; }
    if (res.status === 204 || method === "POST" && prefer && prefer.includes("return=minimal")) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  const rid = encodeURIComponent(C.restaurantId);
  const todayCL = () => new Intl.DateTimeFormat("en-CA", { timeZone: C.timezone }).format(new Date()); // AAAA-MM-DD

  /* ---------- Mensajes ---------- */
  const say = (node, text, kind) => { node.textContent = text || ""; node.className = "msg" + (kind ? ` is-${kind}` : ""); };

  /* ---------- Vistas de la tarjeta de comentarios ---------- */
  const view = { out: $("#auth-out"), form: $("#feedback-form"), noProfile: $("#auth-noprofile") };
  function show(which) { Object.entries(view).forEach(([k, n]) => { n.hidden = k !== which; }); }

  let profileName = "";
  async function enterSession() {
    // El comentario referencia a profiles(id): sin perfil no se puede guardar. Se avisa antes de mostrar el formulario.
    let rows;
    try { rows = await api(`profiles?id=eq.${encodeURIComponent(session.data.user.id)}&select=first_name`, { auth: true }); }
    catch (e) { if (e.status === 401) { session.clear(); show("out"); return; } rows = null; }
    if (rows && !rows.length) { show("noProfile"); return; }
    profileName = (rows && rows[0] && rows[0].first_name) || (session.data.user.email || "").split("@")[0];
    $("#session-name").textContent = `Hola, ${profileName}`;
    show("form");
    await loadOrders();
    await loadPoll();
  }

  /* ---------- Login ---------- */
  $("#login-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const msg = $("#login-msg"), btn = $("#login-btn");
    const email = $("#login-email").value.trim(), pass = $("#login-pass").value;
    if (!email || !pass) { say(msg, "Escribe tu correo y tu clave.", "error"); return; }
    btn.disabled = true; say(msg, "Ingresando…");
    try {
      await login(email, pass);
      $("#login-pass").value = ""; say(msg, "");
      track("login", { method: "password", source: "criolla_web" });
      await enterSession();
    } catch (e) {
      const m = e.status === 429 ? "Demasiados intentos. Espera un momento e inténtalo de nuevo."
        : e.message === "email_not_confirmed" ? "Confirma tu correo desde el mensaje que te enviamos y vuelve a intentarlo."
        : e.status === 400 ? "Correo o clave incorrectos."
        : "No pudimos iniciar sesión. Inténtalo de nuevo.";
      say(msg, m, "error");
    } finally { btn.disabled = false; }
  });

  $("#logout-btn").addEventListener("click", async () => { await logout(); show("out"); say($("#fb-msg"), ""); await loadPoll(); });

  /* ---------- Comentarios ---------- */
  const fb = { mode: "general", rating: null, aspects: new Set(), orders: [] };

  function pressed(group, btn, on) { btn.setAttribute("aria-pressed", String(on)); }

  $("#fb-mode").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-mode]"); if (!b || b.disabled) return;
    fb.mode = b.dataset.mode;
    document.querySelectorAll("#fb-mode button").forEach((x) => pressed("mode", x, x === b));
    renderOrderBox();
  });
  $("#fb-rating").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-v]"); if (!b) return;
    const v = Number(b.dataset.v); fb.rating = fb.rating === v ? null : v; // volver a tocar quita el puntaje
    document.querySelectorAll("#fb-rating button").forEach((x) => pressed("rating", x, Number(x.dataset.v) === fb.rating));
  });
  $("#fb-aspects").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const t = b.textContent; if (fb.aspects.has(t)) fb.aspects.delete(t); else fb.aspects.add(t);
    pressed("aspect", b, fb.aspects.has(t));
  });

  function orderLabel(o) {
    let items = o.items;
    if (typeof items === "string") { try { items = JSON.parse(items); } catch { items = []; } }
    const names = (Array.isArray(items) ? items : []).map((i) => (i && i.name ? `${Number(i.quantity) > 1 ? i.quantity + "× " : ""}${i.name}` : "")).filter(Boolean).join(", ");
    const d = new Intl.DateTimeFormat("es-CL", { timeZone: C.timezone, day: "numeric", month: "short" }).format(new Date(o.pickup_date ? o.pickup_date + "T12:00:00" : o.created_at));
    return `${d} · ${names || "Pedido"}`.slice(0, 90);
  }

  async function loadOrders() {
    fb.orders = [];
    try {
      const uid = encodeURIComponent(session.data.user.id);
      const [orders, rated] = await Promise.all([
        api(`takeaway_orders?user_id=eq.${uid}&restaurant_id=eq.${rid}&status=eq.COMPLETADO&select=id,items,pickup_date,created_at&order=created_at.desc&limit=10`, { auth: true }),
        api(`feedback?user_id=eq.${uid}&order_id=not.is.null&select=order_id`, { auth: true }),
      ]);
      const done = new Set((rated || []).map((r) => r.order_id));
      fb.orders = (orders || []).filter((o) => !done.has(o.id));
    } catch { fb.orders = []; }
    const orderBtn = $('#fb-mode button[data-mode="order"]');
    orderBtn.disabled = !fb.orders.length;
    if (!fb.orders.length && fb.mode === "order") { fb.mode = "general"; document.querySelectorAll("#fb-mode button").forEach((x) => pressed("mode", x, x.dataset.mode === "general")); }
    renderOrderBox();
  }

  function renderOrderBox() {
    const showOrder = fb.mode === "order" && fb.orders.length > 0;
    $("#fb-order-box").hidden = !showOrder;
    $("#fb-no-orders").hidden = fb.orders.length > 0;
    const sel = $("#fb-order");
    sel.replaceChildren(...fb.orders.map((o) => { const op = el("option", "", orderLabel(o)); op.value = o.id; return op; }));
  }

  $("#feedback-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const msg = $("#fb-msg"), btn = $("#fb-send");
    const comment = $("#fb-comment").value.trim();
    if (fb.rating == null && !comment) { say(msg, "Elige un puntaje o escribe un comentario.", "error"); return; }
    const orderId = fb.mode === "order" ? $("#fb-order").value : null;
    if (orderId !== null && !UUID.test(orderId)) { say(msg, "Elige el pedido que quieres calificar.", "error"); return; }
    btn.disabled = true; say(msg, "Enviando…");
    try {
      await api("feedback", { method: "POST", prefer: "return=minimal", auth: true, body: {
        user_id: session.data.user.id, restaurant_id: C.restaurantId, order_id: orderId, rating: fb.rating, aspects: [...fb.aspects], comment: comment || null,
      } });
      track("feedback_submit", { type: orderId ? "order" : "general", rating: fb.rating == null ? undefined : fb.rating });
      say(msg, "¡Gracias por tu opinión!", "ok");
      fb.rating = null; fb.aspects.clear(); $("#fb-comment").value = "";
      document.querySelectorAll("#fb-rating button, #fb-aspects button").forEach((x) => pressed("reset", x, false));
      if (orderId) await loadOrders();
    } catch (e) {
      if (e.status === 401) { session.clear(); show("out"); say($("#login-msg"), "Tu sesión venció. Ingresa de nuevo.", "error"); return; }
      say(msg, e.code === "23505" ? "Ya calificaste ese pedido." : e.code === "23503" ? "Falta terminar tu cuenta en Almuerzo.cl." : "No pudimos enviar tu opinión. Inténtalo de nuevo.", "error");
    } finally { btn.disabled = false; }
  });

  /* ---------- Encuesta de la semana ---------- */
  async function loadPoll() {
    const body = $("#poll-body");
    try {
      const day = todayCL();
      const polls = await api(`polls?restaurant_id=eq.${rid}&is_active=eq.true&starts_on=lte.${day}&ends_on=gte.${day}&order=ends_on.asc&limit=1&select=id,question,ends_on`);
      if (!polls.length) { body.replaceChildren(el("p", "", "Estamos preparando la próxima votación. Cuando esté lista la verás aquí.")); return; }
      const poll = polls[0], pid = encodeURIComponent(poll.id);
      const [opts, results, mine] = await Promise.all([
        api(`poll_options?poll_id=eq.${pid}&order=position&select=id,label`),
        api("rpc/poll_results", { method: "POST", body: { p_poll_id: poll.id } }),
        session.data ? api(`poll_votes?poll_id=eq.${pid}&select=option_id`, { auth: true }).catch(() => []) : Promise.resolve([]),
      ]);
      renderPoll(poll, opts, results || [], mine && mine[0] ? mine[0].option_id : null);
    } catch {
      body.replaceChildren(el("p", "", "No pudimos cargar la encuesta. Vuelve a intentarlo en un rato."));
    }
  }

  function renderPoll(poll, opts, results, myVote) {
    const body = $("#poll-body");
    const votes = Object.fromEntries(results.map((r) => [r.option_id, Number(r.votes) || 0]));
    const total = Object.values(votes).reduce((a, b) => a + b, 0);
    const canVote = !!session.data;
    const list = el("div", "poll__opts");
    list.setAttribute("role", "group"); list.setAttribute("aria-label", poll.question);
    opts.forEach((o) => {
      const n = votes[o.id] || 0, pct = total ? Math.round((n / total) * 100) : 0;
      const b = el("button", "vote"); b.type = "button"; b.disabled = !canVote;
      b.setAttribute("aria-pressed", String(o.id === myVote));
      const bar = el("span", "vote__bar"); bar.style.setProperty("--w", pct + "%");
      const row = el("span", "vote__row"); row.append(el("span", "", o.label), el("span", "", `${pct}%`));
      b.append(bar, row);
      if (canVote) b.addEventListener("click", () => vote(poll, o.id, b));
      list.append(b);
    });
    const end = new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", day: "numeric", month: "long" }).format(new Date(poll.ends_on + "T00:00:00Z"));
    const meta = el("p", "poll__meta", `${total} ${total === 1 ? "voto" : "votos"} · cierra el ${end}${canVote ? "" : " · Ingresa para votar"}`);
    const msg = el("p", "msg"); msg.id = "poll-msg"; msg.setAttribute("role", "status");
    body.replaceChildren(el("p", "poll__q", poll.question), list, meta, msg);
  }

  async function vote(poll, optionId, btn) {
    const msg = $("#poll-msg"); say(msg, "Guardando tu voto…");
    try {
      await api("poll_votes?on_conflict=poll_id,user_id", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", auth: true, body: { poll_id: poll.id, user_id: session.data.user.id, option_id: optionId } });
      track("poll_vote", { poll_id: poll.id });
      await loadPoll();
      say($("#poll-msg"), "¡Listo! Puedes cambiar tu voto hasta que cierre la encuesta.", "ok");
    } catch (e) {
      if (e.status === 401) { session.clear(); show("out"); await loadPoll(); say($("#login-msg"), "Tu sesión venció. Ingresa de nuevo.", "error"); return; }
      say(msg, e.code === "23503" ? "Falta terminar tu cuenta en Almuerzo.cl." : "No pudimos guardar tu voto. Inténtalo de nuevo.", "error");
    }
  }

  /* ---------- Inicio ---------- */
  (async () => {
    if (session.load() && session.data.access_token) { await enterSession(); if (!session.data) { show("out"); await loadPoll(); } }
    else { show("out"); await loadPoll(); }
  })();
})();
