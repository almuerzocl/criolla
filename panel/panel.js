"use strict";
/*
 * Panel de Cri-Olla: misma jerarquía de navegación que almuerzo.cl (login/registro → panel → personas, pedidos, reservas, menú, encuestas),
 * con identidad visual de Cri-Olla. Router por hash. Datos: solo los de Cri-Olla (ver api.js + RLS).
 * Pedidos y reservas son de solo lectura: cambiar su estado tiene efectos (avisos, stock, reputación) y se hace en el dashboard de almuerzo.cl.
 */
(() => {
  const C = window.CRIOLLA_CONFIG, api = window.CriollaAPI;
  const app = document.getElementById("app"), nav = document.getElementById("nav"), who = document.getElementById("who");

  const ADMIN = ["ADMIN", "OWNER", "RESTAURANT_ADMIN"];
  const ROLES = {
    panel: [...ADMIN, "PEDIDOS", "TAKEAWAY_MANAGER", "RESERVAS", "RESERVATION_MANAGER", "OPERATIONS_MANAGER"],
    personas: [...ADMIN, "OPERATIONS_MANAGER"],
    pedidos: [...ADMIN, "PEDIDOS", "TAKEAWAY_MANAGER", "OPERATIONS_MANAGER"],
    reservas: [...ADMIN, "RESERVAS", "RESERVATION_MANAGER", "OPERATIONS_MANAGER"],
    menu: ADMIN,
    encuestas: ADMIN,
  };
  const STAFF_NAV = [["panel", "Panel"], ["personas", "Personas"], ["pedidos", "Pedidos"], ["reservas", "Reservas"], ["menu", "Menú"], ["encuestas", "Encuestas"]];

  /* ---------- Utilidades ---------- */
  const h = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v);
    }
    kids.flat().forEach((c) => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  };
  const clp = (n) => "$" + Number(n || 0).toLocaleString("es-CL");
  const fdate = (s) => s ? new Intl.DateTimeFormat("es-CL", { timeZone: C.timezone, dateStyle: "short", timeStyle: "short" }).format(new Date(s)) : "—";
  const fday = (s) => s ? new Intl.DateTimeFormat("es-CL", { timeZone: C.timezone, dateStyle: "medium" }).format(new Date(s + "T12:00:00")) : "—";
  const fullName = (p) => [p.first_name, p.last_name].filter(Boolean).join(" ") || p.display_name || p.email || "Sin nombre";
  const itemsText = (items) => (Array.isArray(items) ? items : []).map((i) => `${i.quantity || i.qty || 1}× ${i.name || i.item_name || "ítem"}`).join(", ") || "—";
  const isStaff = (p) => !!p && p.restaurant_id === api.restaurantId && ROLES.panel.includes(String(p.role || "").toUpperCase());
  const can = (p, area) => isStaff(p) && ROLES[area].includes(String(p.role).toUpperCase());

  const msg = (text, cls) => h("p", { class: "pn-msg" + (cls ? " pn-msg--" + cls : ""), role: cls === "err" ? "alert" : "status" }, text);
  const table = (heads, rows, empty) => rows.length
    ? h("div", { class: "pn-tablewrap" }, h("table", { class: "pn-table" }, h("thead", {}, h("tr", {}, heads.map((x) => h("th", { scope: "col" }, x)))), h("tbody", {}, rows)))
    : msg(empty || "Sin registros.");
  const badge = (s) => h("span", { class: "pn-badge pn-badge--" + String(s || "").toLowerCase().replace(/[^a-z]+/g, "-") }, String(s || "—"));
  const stat = (label, value) => h("div", { class: "pn-stat" }, h("strong", {}, String(value)), h("span", {}, label));
  const view = (title, ...kids) => { app.replaceChildren(h("h1", { class: "h2" }, title), ...kids); app.focus({ preventScroll: true }); };
  const fail = (e) => msg(e && e.status === 401 ? "Tu sesión venció. Vuelve a ingresar." : "No pudimos cargar los datos. Intenta de nuevo.", "err");

  let me = null; // perfil propio

  /* ---------- Cabecera ---------- */
  function renderChrome(route) {
    nav.replaceChildren();
    who.replaceChildren();
    if (!me) { nav.append(h("a", { href: "#/login" }, "Ingresar"), h("a", { href: "#/registro" }, "Crear cuenta")); return; }
    const items = isStaff(me) ? STAFF_NAV.filter(([k]) => can(me, k)) : [["mis-pedidos", "Mis pedidos"], ["mis-reservas", "Mis reservas"], ["perfil", "Mi perfil"]];
    items.forEach(([k, l]) => nav.append(h("a", { href: "#/" + k, "aria-current": route === k ? "page" : null }, l)));
    who.append(h("span", {}, fullName(me)), h("button", { class: "btn btn--paper btn--sm", type: "button", onclick: async () => { await api.logout(); me = null; location.hash = "#/login"; } }, "Salir"));
  }

  /* ---------- Autenticación ---------- */
  function field(label, name, type = "text", extra = {}) {
    const id = "f-" + name;
    return h("div", { class: "pn-field" }, h("label", { for: id }, label), h("input", { id, name, type, required: extra.required !== false, autocomplete: extra.autocomplete, minlength: extra.minlength }));
  }
  function viewLogin() {
    const out = h("div", { "aria-live": "polite" });
    const form = h("form", { class: "pn-form", onsubmit: async (ev) => {
      ev.preventDefault(); const f = new FormData(ev.target); out.replaceChildren(msg("Ingresando…"));
      try { await api.login(String(f.get("email")).trim(), String(f.get("password"))); me = await api.ensureProfile(); route(isStaff(me) ? "#/panel" : "#/mis-pedidos"); }
      catch (e) { out.replaceChildren(msg(e.status === 400 ? "Correo o clave incorrectos." : "No pudimos ingresar. Intenta de nuevo.", "err")); }
    } }, field("Correo", "email", "email", { autocomplete: "username" }), field("Clave", "password", "password", { autocomplete: "current-password" }),
      h("button", { class: "btn btn--yellow", type: "submit" }, "Ingresar"), out,
      h("p", { class: "note" }, "¿Primera vez? ", h("a", { href: "#/registro" }, "Crea tu cuenta"), ". ¿Olvidaste tu clave? Recupérala en ", h("a", { href: C.pwaUrl + "/login" }, "Almuerzo.cl"), "."));
    view("Ingresar", form);
  }
  function viewRegister() {
    const out = h("div", { "aria-live": "polite" });
    const form = h("form", { class: "pn-form", onsubmit: async (ev) => {
      ev.preventDefault(); const f = new FormData(ev.target); out.replaceChildren(msg("Creando tu cuenta…"));
      try {
        const r = await api.signup({ email: String(f.get("email")).trim(), password: String(f.get("password")), first_name: String(f.get("first_name")).trim(), last_name: String(f.get("last_name")).trim() });
        if (r.session) { me = await api.ensureProfile(); route("#/mis-pedidos"); }
        else out.replaceChildren(msg("Te enviamos un correo para confirmar tu cuenta. Al confirmar, ingresa aquí.", "ok"));
      } catch (e) { out.replaceChildren(msg(e.status === 422 || /already|exists/i.test(e.message) ? "Ese correo ya tiene cuenta. Ingresa con tu clave." : "No pudimos crear la cuenta. Revisa los datos.", "err")); }
    } }, field("Nombre", "first_name", "text", { autocomplete: "given-name" }), field("Apellido", "last_name", "text", { autocomplete: "family-name" }),
      field("Correo", "email", "email", { autocomplete: "email" }), field("Clave (mínimo 8 caracteres)", "password", "password", { autocomplete: "new-password", minlength: 8 }),
      h("button", { class: "btn btn--pink", type: "submit" }, "Crear cuenta"), out,
      h("p", { class: "note" }, "La cuenta es de Almuerzo.cl y queda registrada como cliente de Cri-Olla. ¿Ya tienes? ", h("a", { href: "#/login" }, "Ingresa"), "."));
    view("Crear cuenta", form);
  }

  /* ---------- Staff ---------- */
  async function viewPanel() {
    view("Panel", msg("Cargando…"));
    try {
      const [orders, resv, people, fb] = await Promise.all([api.orders(500), api.reservations(500), can(me, "personas") ? api.people() : Promise.resolve(null), api.feedback(100)]);
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: C.timezone }).format(new Date());
      const dayOf = (s) => s ? new Intl.DateTimeFormat("en-CA", { timeZone: C.timezone }).format(new Date(s)) : "";
      const avg = fb.length ? (fb.reduce((a, x) => a + x.rating, 0) / fb.length).toFixed(1) : "—";
      view("Panel", h("div", { class: "pn-stats" },
        stat("Pedidos hoy", orders.filter((o) => (o.pickup_date || dayOf(o.created_at)) === today).length),
        stat("Reservas hoy", resv.filter((r) => dayOf(r.date_time) === today).length),
        people ? stat("Personas", people.length) : null,
        stat("Puntaje promedio", avg)),
        h("h2", { class: "pn-sub" }, "Últimos pedidos"),
        table(["Código", "Cliente", "Total", "Estado", "Fecha"], orders.slice(0, 8).map((o) => h("tr", {}, h("td", {}, o.unique_code || "—"), h("td", {}, o.customer_name || "—"), h("td", {}, clp(o.total_amount)), h("td", {}, badge(o.status)), h("td", {}, fdate(o.created_at)))), "Aún no hay pedidos."),
        h("p", { class: "note" }, "Para cambiar el estado de pedidos y reservas usa el ", h("a", { href: "https://rest2.almuerzo.cl", rel: "noopener" }, "dashboard de Almuerzo.cl"), "."));
    } catch (e) { view("Panel", fail(e)); }
  }
  async function viewPeople() {
    view("Personas", msg("Cargando…"));
    try {
      const rows = await api.people(); const q = h("input", { type: "search", placeholder: "Buscar por nombre o correo", "aria-label": "Buscar personas" });
      const body = h("div", {}); const draw = () => {
        const t = q.value.trim().toLowerCase();
        body.replaceChildren(table(["Nombre", "Correo", "Teléfono", "Origen", "Alta"], rows.filter((p) => !t || `${fullName(p)} ${p.email || ""}`.toLowerCase().includes(t)).map((p) =>
          h("tr", {}, h("td", {}, h("a", { href: "#/personas/" + p.id }, fullName(p))), h("td", {}, p.email || "—"), h("td", {}, p.phone || p.phone_number || "—"), h("td", {}, p.source_restaurant_id ? "Cri-Olla" : "Almuerzo.cl"), h("td", {}, fdate(p.created_at)))), "No hay personas registradas aún."));
      };
      q.addEventListener("input", draw); draw(); view("Personas", h("div", { class: "pn-bar" }, q, h("span", {}, rows.length + " personas")), body);
    } catch (e) { view("Personas", fail(e)); }
  }
  async function viewPerson(id) {
    view("Persona", msg("Cargando…"));
    try {
      const d = await api.person(id);
      if (!d) { view("Persona", msg("No encontramos a esta persona en Cri-Olla.", "err"), h("a", { href: "#/personas" }, "← Volver")); return; }
      const p = d.profile;
      view(fullName(p), h("a", { href: "#/personas" }, "← Volver a personas"),
        h("dl", { class: "pn-dl" }, h("dt", {}, "Correo"), h("dd", {}, p.email || "—"), h("dt", {}, "Teléfono"), h("dd", {}, p.phone || p.phone_number || "—"),
          h("dt", {}, "Origen"), h("dd", {}, p.source_restaurant_id ? "Cri-Olla" : "Almuerzo.cl"), h("dt", {}, "Alta"), h("dd", {}, fdate(p.created_at)),
          h("dt", {}, "Reputación"), h("dd", {}, `Reservas ${p.reservation_reputation ?? "—"} · Pedidos ${p.takeaway_reputation ?? "—"}`)),
        h("h2", { class: "pn-sub" }, "Pedidos en Cri-Olla"), table(["Fecha", "Detalle", "Total", "Estado"], d.orders.map((o) => h("tr", {}, h("td", {}, fdate(o.created_at)), h("td", {}, itemsText(o.items)), h("td", {}, clp(o.total_amount)), h("td", {}, badge(o.status)))), "Sin pedidos."),
        h("h2", { class: "pn-sub" }, "Reservas en Cri-Olla"), table(["Fecha", "Personas", "Estado"], d.reservations.map((r) => h("tr", {}, h("td", {}, fdate(r.date_time)), h("td", {}, r.party_size), h("td", {}, badge(r.status)))), "Sin reservas."),
        h("h2", { class: "pn-sub" }, "Comentarios"), table(["Fecha", "Puntaje", "Comentario"], d.feedback.map((f) => h("tr", {}, h("td", {}, fdate(f.created_at)), h("td", {}, f.rating + "/5"), h("td", {}, f.comment || "—"))), "Sin comentarios."));
    } catch (e) { view("Persona", fail(e)); }
  }
  async function viewOrders() {
    view("Pedidos", msg("Cargando…"));
    try {
      const rows = await api.orders(300);
      view("Pedidos", table(["Código", "Cliente", "Detalle", "Total", "Estado", "Fecha"], rows.map((o) => h("tr", {}, h("td", {}, o.unique_code || "—"), h("td", {}, o.user_id && can(me, "personas") ? h("a", { href: "#/personas/" + o.user_id }, o.customer_name || "Ver") : (o.customer_name || "—")), h("td", {}, itemsText(o.items)), h("td", {}, clp(o.total_amount)), h("td", {}, badge(o.status)), h("td", {}, fdate(o.created_at)))), "Aún no hay pedidos."));
    } catch (e) { view("Pedidos", fail(e)); }
  }
  async function viewReservations() {
    view("Reservas", msg("Cargando…"));
    try {
      const rows = await api.reservations(300);
      view("Reservas", table(["Código", "Fecha", "Personas", "Estado", "Notas"], rows.map((r) => h("tr", {}, h("td", {}, r.unique_code || "—"), h("td", {}, fdate(r.date_time)), h("td", {}, r.party_size), h("td", {}, badge(r.status)), h("td", {}, r.special_requests || "—"))), "Aún no hay reservas."));
    } catch (e) { view("Reservas", fail(e)); }
  }
  async function viewMenu() {
    view("Menú", msg("Cargando…"));
    try {
      const rows = await api.menu();
      const toggle = (it, key) => h("input", { type: "checkbox", checked: it[key] ? "" : null, "aria-label": `${it.name}: ${key === "is_available" ? "disponible" : "para retirar"}`, onchange: async (ev) => {
        const box = ev.target, v = box.checked; box.disabled = true;
        try { await api.setItemAvailability(it.id, { [key]: v }); it[key] = v; } catch { box.checked = !v; alert("No pudimos guardar el cambio."); } finally { box.disabled = false; }
      } });
      view("Menú", h("p", { class: "note" }, "Disponibilidad de los platos de Cri-Olla. Precios, stock y categorías se gestionan en el dashboard de Almuerzo.cl."),
        table(["Plato", "Categoría", "Precio", "Menú del día", "Stock", "Disponible", "Retiro"], rows.map((it) => h("tr", {}, h("td", {}, it.name), h("td", {}, it.category || "—"), h("td", {}, clp(it.price)), h("td", {}, it.is_menu_del_dia ? "Sí" : "No"),
          h("td", {}, it.stock_managed ? (it.disabled_by_stock ? "Agotado" : String(it.current_stock ?? "—")) : "—"), h("td", {}, toggle(it, "is_available")), h("td", {}, toggle(it, "is_available_for_takeaway")))), "No hay platos cargados."));
    } catch (e) { view("Menú", fail(e)); }
  }
  async function viewSurveys() {
    view("Encuestas", msg("Cargando…"));
    try {
      const [polls, fb] = await Promise.all([api.polls(), api.feedback(100)]);
      const out = h("div", { "aria-live": "polite" });
      const form = h("form", { class: "pn-form", onsubmit: async (ev) => {
        ev.preventDefault(); const f = new FormData(ev.target);
        const options = String(f.get("options")).split("\n").map((s) => s.trim()).filter(Boolean);
        if (options.length < 2) { out.replaceChildren(msg("Pon al menos 2 opciones (una por línea).", "err")); return; }
        try { await api.createPoll({ question: String(f.get("question")).trim(), starts_on: String(f.get("starts_on")), ends_on: String(f.get("ends_on")), options }); viewSurveys(); }
        catch { out.replaceChildren(msg("No pudimos crear la encuesta. Revisa las fechas.", "err")); }
      } }, field("Pregunta", "question"), field("Desde", "starts_on", "date"), field("Hasta", "ends_on", "date"),
        h("div", { class: "pn-field" }, h("label", { for: "f-options" }, "Opciones (una por línea)"), h("textarea", { id: "f-options", name: "options", rows: 4, required: true })),
        h("button", { class: "btn btn--yellow", type: "submit" }, "Crear encuesta"), out);
      view("Encuestas", h("h2", { class: "pn-sub" }, "Votaciones"),
        table(["Pregunta", "Desde", "Hasta", "Activa", ""], polls.map((p) => h("tr", {}, h("td", {}, p.question), h("td", {}, fday(p.starts_on)), h("td", {}, fday(p.ends_on)), h("td", {}, p.is_active ? "Sí" : "No"),
          h("td", {}, h("button", { class: "btn btn--paper btn--sm", type: "button", onclick: async () => { try { await api.setPollActive(p.id, !p.is_active); viewSurveys(); } catch { alert("No pudimos guardar el cambio."); } } }, p.is_active ? "Cerrar" : "Reabrir")))), "Sin votaciones."),
        h("h2", { class: "pn-sub" }, "Nueva votación"), form,
        h("h2", { class: "pn-sub" }, "Comentarios de clientes"),
        table(["Fecha", "Puntaje", "Comentario", "Aspectos"], fb.map((f) => h("tr", {}, h("td", {}, fdate(f.created_at)), h("td", {}, f.rating + "/5"), h("td", {}, f.comment || "—"), h("td", {}, (f.aspects || []).join(", ") || "—"))), "Sin comentarios."));
    } catch (e) { view("Encuestas", fail(e)); }
  }

  /* ---------- Cliente ---------- */
  async function viewMyOrders() {
    view("Mis pedidos", msg("Cargando…"));
    try { const rows = await api.myOrders(); view("Mis pedidos", table(["Código", "Detalle", "Total", "Estado", "Fecha"], rows.map((o) => h("tr", {}, h("td", {}, o.unique_code || "—"), h("td", {}, itemsText(o.items)), h("td", {}, clp(o.total_amount)), h("td", {}, badge(o.status)), h("td", {}, fdate(o.created_at)))), "Aún no tienes pedidos en Cri-Olla."), h("a", { class: "btn btn--ink btn--sm", href: `${C.pwaUrl}/restaurant/${C.restaurantId}/menu` }, "Pedir para retirar")); } catch (e) { view("Mis pedidos", fail(e)); }
  }
  async function viewMyReservations() {
    view("Mis reservas", msg("Cargando…"));
    try { const rows = await api.myReservations(); view("Mis reservas", table(["Código", "Fecha", "Personas", "Estado"], rows.map((r) => h("tr", {}, h("td", {}, r.unique_code || "—"), h("td", {}, fdate(r.date_time)), h("td", {}, r.party_size), h("td", {}, badge(r.status)))), "Aún no tienes reservas en Cri-Olla."), h("a", { class: "btn btn--paper btn--sm", href: `${C.pwaUrl}/restaurant/${C.restaurantId}` }, "Reservar mesa")); } catch (e) { view("Mis reservas", fail(e)); }
  }
  function viewProfile() {
    const out = h("div", { "aria-live": "polite" });
    const mk = (label, name, val) => { const f = field(label, name, "text", { required: false }); f.querySelector("input").value = val || ""; return f; };
    view("Mi perfil", h("form", { class: "pn-form", onsubmit: async (ev) => {
      ev.preventDefault(); const f = new FormData(ev.target);
      try { await api.updateMyProfile({ first_name: String(f.get("first_name")).trim(), last_name: String(f.get("last_name")).trim(), phone: String(f.get("phone")).trim() }); me = await api.myProfile(); out.replaceChildren(msg("Guardado.", "ok")); renderChrome("perfil"); }
      catch { out.replaceChildren(msg("No pudimos guardar.", "err")); }
    } }, mk("Nombre", "first_name", me.first_name), mk("Apellido", "last_name", me.last_name), mk("Teléfono", "phone", me.phone), h("p", { class: "note" }, "Correo: " + (me.email || "")), h("button", { class: "btn btn--yellow", type: "submit" }, "Guardar"), out));
  }

  /* ---------- Router ---------- */
  const STAFF_VIEWS = { panel: viewPanel, personas: viewPeople, pedidos: viewOrders, reservas: viewReservations, menu: viewMenu, encuestas: viewSurveys };
  const USER_VIEWS = { "mis-pedidos": viewMyOrders, "mis-reservas": viewMyReservations, perfil: viewProfile };

  function route(hash) { if (hash && location.hash !== hash) location.hash = hash; else render(); }

  async function render() {
    const [, name = "", arg] = (location.hash || "").split("/");
    if (api.session && !me) { try { me = await api.ensureProfile(); } catch { me = null; } }
    if (me && !isStaff(me) && String(me.role || "").toUpperCase() !== "USER") { // personal de otro local: sin acceso
      await api.logout(); me = null; renderChrome(""); view("Sin acceso", msg("Esta cuenta no pertenece a Cri-Olla.", "err"), h("a", { href: "#/login" }, "Ingresar con otra cuenta")); return;
    }
    renderChrome(name);
    if (!me) { if (name === "registro") return viewRegister(); return viewLogin(); }
    if (isStaff(me)) {
      if (name === "personas" && arg && can(me, "personas")) return viewPerson(arg);
      if (STAFF_VIEWS[name] && can(me, name)) return STAFF_VIEWS[name]();
      return route("#/panel");
    }
    if (USER_VIEWS[name]) return USER_VIEWS[name]();
    return route("#/mis-pedidos");
  }
  window.addEventListener("hashchange", render);
  render();
})();
