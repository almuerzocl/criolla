"use strict";
/*
 * Cliente mínimo de Supabase (REST + Auth) para el panel de Cri-Olla.
 * Usa solo la URL y la clave publishable de config.js (nunca service_role).
 * Aislamiento: toda consulta de datos lleva el filtro del restaurante (api.scope*) y, además, lo exige RLS en la base.
 */
(() => {
  const C = window.CRIOLLA_CONFIG;
  const KEY = "criolla_panel_session";
  const RID = C.restaurantId;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } },
    set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
    del() { try { localStorage.removeItem(KEY); } catch { /* nada */ } },
  };
  let session = store.get();

  const fromAuth = (r) => ({
    access_token: r.access_token,
    refresh_token: r.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (Number(r.expires_in) || 3600),
    user: { id: r.user && r.user.id, email: r.user && r.user.email, meta: (r.user && r.user.user_metadata) || {} },
  });

  async function authCall(path, body, tok) {
    const headers = { apikey: C.supabaseKey, "Content-Type": "application/json" };
    if (tok) headers.Authorization = `Bearer ${tok}`;
    const res = await fetch(`${C.supabaseUrl}/auth/v1/${path}`, { method: "POST", headers, body: body ? JSON.stringify(body) : undefined });
    let json = {}; try { json = await res.json(); } catch { /* sin cuerpo */ }
    return { ok: res.ok, status: res.status, json };
  }

  async function token() {
    if (!session) return null;
    if (session.expires_at - 60 > Date.now() / 1000) return session.access_token;
    const r = await authCall("token?grant_type=refresh_token", { refresh_token: session.refresh_token });
    if (!r.ok) { session = null; store.del(); return null; }
    session = fromAuth(r.json); store.set(session);
    return session.access_token;
  }

  async function rest(path, { method = "GET", body, prefer } = {}) {
    const tok = await token();
    const headers = { apikey: C.supabaseKey, Authorization: `Bearer ${tok || C.supabaseKey}` };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (prefer) headers.Prefer = prefer;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(`${C.supabaseUrl}/rest/v1/${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: ctrl.signal });
      if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; try { e.detail = await res.json(); } catch { /* */ } throw e; }
      const txt = await res.text();
      return txt ? JSON.parse(txt) : null;
    } finally { clearTimeout(timer); }
  }

  const enc = encodeURIComponent;
  const inList = (ids) => `in.(${ids.filter((i) => UUID.test(i)).join(",")})`;

  const api = {
    restaurantId: RID,
    isUuid: (s) => UUID.test(String(s || "")),
    get session() { return session; },

    async login(email, password) {
      const r = await authCall("token?grant_type=password", { email, password });
      if (!r.ok) { const e = new Error(r.json.error_code || r.json.error || "login"); e.status = r.status; throw e; }
      session = fromAuth(r.json); store.set(session);
      return session;
    },
    /** Registro de cliente desde Cri-Olla: el origen viaja en user_metadata (igual que la PWA). */
    async signup({ email, password, first_name, last_name }) {
      const r = await authCall("signup", { email, password, data: { first_name, last_name, source_restaurant_id: RID } });
      if (!r.ok) { const e = new Error(r.json.error_code || r.json.msg || "signup"); e.status = r.status; throw e; }
      if (r.json.access_token) { session = fromAuth(r.json); store.set(session); return { session }; }
      return { session: null };
    },
    async logout() {
      const t = session && session.access_token;
      session = null; store.del();
      if (t) { try { await authCall("logout", null, t); } catch { /* sin red */ } }
    },

    /** Perfil propio. */
    async myProfile() {
      if (!session) return null;
      const rows = await rest(`profiles?id=eq.${enc(session.user.id)}&select=*`);
      return rows && rows[0] || null;
    },
    /** Crea el perfil propio si no existe; el origen es Cri-Olla (solo se fija al crear; la base lo bloquea después). */
    async ensureProfile() {
      const me = await api.myProfile();
      if (me) return me;
      const m = session.user.meta || {};
      await rest("profiles?on_conflict=id", {
        method: "POST", prefer: "resolution=ignore-duplicates,return=minimal",
        body: { id: session.user.id, email: session.user.email, first_name: m.first_name || "", last_name: m.last_name || "",
                role: "USER", account_type: "free", onboarding_completed: false, reservation_reputation: 100, takeaway_reputation: 100,
                total_reservations: 0, favorite_restaurant_ids: [], subscribed_daily_menu_ids: [], preferred_payment_methods: [],
                source_restaurant_id: RID },
      });
      return api.myProfile();
    },
    async updateMyProfile(patch) {
      const allowed = {}; ["first_name", "last_name", "phone"].forEach((k) => { if (k in patch) allowed[k] = patch[k]; });
      return rest(`profiles?id=eq.${enc(session.user.id)}`, { method: "PATCH", body: allowed, prefer: "return=minimal" });
    },

    /* ----- Lecturas del restaurante (siempre filtradas por restaurant_id de Cri-Olla) ----- */
    orders(limit = 200) { return rest(`takeaway_orders?restaurant_id=eq.${RID}&select=id,user_id,customer_name,customer_phone,items,total_amount,status,created_at,pickup_date,unique_code&order=created_at.desc&limit=${limit}`); },
    reservations(limit = 200) { return rest(`reservations?restaurant_id=eq.${RID}&select=id,organizer_id,user_id,date_time,party_size,status,special_requests,unique_code,title,created_at&order=date_time.desc&limit=${limit}`); },
    menu() { return rest(`menu_items?restaurant_id=eq.${RID}&select=id,name,price,category,is_available,is_available_for_takeaway,is_menu_del_dia,stock_managed,current_stock,disabled_by_stock,position&order=category.asc,position.asc`); },
    feedback(limit = 100) { return rest(`feedback?restaurant_id=eq.${RID}&select=id,user_id,order_id,rating,aspects,comment,created_at&order=created_at.desc&limit=${limit}`); },
    polls() { return rest(`polls?restaurant_id=eq.${RID}&select=id,question,starts_on,ends_on,is_active,created_at&order=created_at.desc&limit=20`); },
    pollOptions(pollId) { return rest(`poll_options?poll_id=eq.${enc(pollId)}&select=id,label,position&order=position.asc`); },

    /** Personas del restaurante: origen Cri-Olla, o con pedidos/reservas en Cri-Olla. */
    async people() {
      const [o, r] = await Promise.all([
        rest(`takeaway_orders?restaurant_id=eq.${RID}&select=user_id&limit=2000`),
        rest(`reservations?restaurant_id=eq.${RID}&select=organizer_id,user_id&limit=2000`),
      ]);
      const ids = new Set();
      o.forEach((x) => x.user_id && ids.add(x.user_id));
      r.forEach((x) => { if (x.organizer_id) ids.add(x.organizer_id); if (x.user_id) ids.add(x.user_id); });
      const cols = "id,email,first_name,last_name,display_name,phone,phone_number,role,total_reservations,total_takeaway_orders,reservation_reputation,takeaway_reputation,created_at,source_restaurant_id";
      const list = ids.size ? `,id.${inList([...ids])}` : "";
      const rows = await rest(`profiles?or=(source_restaurant_id.eq.${RID}${list})&role=eq.USER&select=${cols}&order=created_at.desc&limit=500`);
      return rows;
    },
    async person(id) {
      if (!api.isUuid(id)) return null;
      const cols = "id,email,first_name,last_name,display_name,phone,phone_number,total_reservations,total_takeaway_orders,reservation_reputation,takeaway_reputation,created_at,source_restaurant_id";
      const [p, o, r, f] = await Promise.all([
        rest(`profiles?id=eq.${id}&select=${cols}`),
        rest(`takeaway_orders?restaurant_id=eq.${RID}&user_id=eq.${id}&select=id,items,total_amount,status,created_at&order=created_at.desc&limit=100`),
        rest(`reservations?restaurant_id=eq.${RID}&or=(organizer_id.eq.${id},user_id.eq.${id})&select=id,date_time,party_size,status,created_at&order=date_time.desc&limit=100`),
        rest(`feedback?restaurant_id=eq.${RID}&user_id=eq.${id}&select=id,rating,aspects,comment,created_at&order=created_at.desc&limit=50`),
      ]);
      return p[0] ? { profile: p[0], orders: o, reservations: r, feedback: f } : null;
    },

    /* ----- Escrituras (siempre con restaurant_id de Cri-Olla) ----- */
    setItemAvailability(id, patch) {
      const body = {}; ["is_available", "is_available_for_takeaway"].forEach((k) => { if (k in patch) body[k] = !!patch[k]; });
      return rest(`menu_items?id=eq.${enc(id)}&restaurant_id=eq.${RID}`, { method: "PATCH", body, prefer: "return=minimal" });
    },
    async createPoll({ question, starts_on, ends_on, options }) {
      const rows = await rest("polls", { method: "POST", prefer: "return=representation", body: { restaurant_id: RID, question, starts_on, ends_on, is_active: true } });
      const poll = rows[0];
      await rest("poll_options", { method: "POST", prefer: "return=minimal", body: options.map((label, i) => ({ poll_id: poll.id, label, position: i + 1 })) });
      return poll;
    },
    setPollActive(id, active) { return rest(`polls?id=eq.${enc(id)}&restaurant_id=eq.${RID}`, { method: "PATCH", body: { is_active: !!active }, prefer: "return=minimal" }); },

    /* ----- Lecturas propias del cliente ----- */
    myOrders() { return rest(`takeaway_orders?user_id=eq.${enc(session.user.id)}&restaurant_id=eq.${RID}&select=id,items,total_amount,status,created_at,unique_code&order=created_at.desc&limit=100`); },
    myReservations() { return rest(`reservations?organizer_id=eq.${enc(session.user.id)}&restaurant_id=eq.${RID}&select=id,date_time,party_size,status,unique_code&order=date_time.desc&limit=100`); },
  };
  window.CriollaAPI = api;
})();
