"use strict";
/*
 * Cri-Olla · sitio del restaurante.
 * Es una interfaz más de Almuerzo.cl: el menú del día y los datos del local se leen en vivo de la base de almuerzo.cl (solo lectura pública);
 * ingresar, registrarse, pedir, reservar y ver pedidos ocurre en la PWA (app2.almuerzo.cl).
 */
(() => {
  const C = window.CRIOLLA_CONFIG;
  if (!C) return;

  const $ = (sel, root = document) => root.querySelector(sel);
  const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const DAY_ES = { monday: "Lunes", tuesday: "Martes", wednesday: "Miércoles", thursday: "Jueves", friday: "Viernes", saturday: "Sábado", sunday: "Domingo" };
  const ACCENTS = ["#FFD12E", "#FF5CA0", "#1FCFCF", "#FF7A33"];

  /* ---------- Utilidades ---------- */
  const clp = (n) => "$" + Number(n || 0).toLocaleString("es-CL");
  const hhmm = (d) => new Intl.DateTimeFormat("es-CL", { timeZone: C.timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  const toMin = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + (m || 0); };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  /** Día de la semana y minutos del día en la hora de Chile (no la del navegador). */
  function nowInChile() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: C.timezone, weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date()).map((p) => [p.type, p.value]));
    return { day: parts.weekday.toLowerCase(), minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute) };
  }

  async function api(path) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(`${C.supabaseUrl}/rest/v1/${path}`, { headers: { apikey: C.supabaseKey }, signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally { clearTimeout(timer); }
  }

  /* ---------- Enlaces a la PWA ---------- */
  function wireLinks() {
    const base = C.pwaUrl.replace(/\/+$/, "");
    const home = `/restaurant/${C.restaurantId}`;
    const redirect = encodeURIComponent(home);
    const targets = {
      login: `${base}/login?redirect=${redirect}`,
      register: `${base}/login?mode=register&source=${encodeURIComponent(C.restaurantId)}&redirect=${redirect}`,
      orders: `${base}/orders`,
      takeaway: `${base}${home}/menu`,
      reserve: `${base}${home}`,
      terms: `${base}/terminos`,
      privacy: `${base}/privacidad`,
    };
    document.querySelectorAll("[data-link]").forEach((a) => { const t = targets[a.dataset.link]; if (t) a.href = t; });
  }

  /* ---------- Fecha de hoy ---------- */
  function renderToday() {
    const txt = new Intl.DateTimeFormat("es-CL", { timeZone: C.timezone, weekday: "long", day: "numeric", month: "long" }).format(new Date());
    $("#hoy").textContent = `Menú de hoy · ${txt}`;
  }

  /* ---------- Local: horario y estado ---------- */
  function dayRanges(hours, day) {
    const v = hours && hours[day];
    if (!Array.isArray(v) || !v.length || v[0].is_closed) return [];
    return v.filter((r) => r.open && r.close);
  }
  const rangeLabel = (rs) => rs.map((r) => `${r.open} – ${r.close}`).join(" y ");

  function renderRestaurant(r) {
    const hours = r.opening_hours || {};
    const order = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

    // Dirección
    const street = r.address && r.address.street ? String(r.address.street).split(",")[0].trim() : "";
    if (street) $("#direccion").textContent = `${street} · ${r.comuna || "Las Condes"}`;

    // Horario agrupando días consecutivos iguales
    const groups = [];
    order.forEach((d) => {
      const label = rangeLabel(dayRanges(hours, d)) || "Cerrado";
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.days.push(d); else groups.push({ label, days: [d] });
    });
    const list = $("#horario");
    const today = nowInChile().day;
    list.replaceChildren(...groups.map((g) => {
      const first = DAY_ES[g.days[0]], last = DAY_ES[g.days[g.days.length - 1]].toLowerCase();
      const name = g.days.length === 1 ? first : g.days.length === 2 ? `${first} y ${last}` : `${first} a ${last}`;
      const li = el("li", g.days.includes(today) ? "is-today" : "");
      li.append(el("span", "", name), el("span", "", g.label));
      return li;
    }));

    // Estado ahora
    const st = $("#estado-local");
    const now = nowInChile();
    const todays = dayRanges(hours, now.day);
    st.classList.remove("is-open");
    if (r.is_active === false) {
      st.textContent = "El local no está recibiendo pedidos por ahora";
    } else if (!todays.length) {
      st.textContent = "Hoy el local está cerrado";
    } else {
      const open = todays.find((x) => now.minutes >= toMin(x.open) && now.minutes < toMin(x.close));
      if (open) { st.textContent = `Abierto ahora, hasta las ${open.close}`; st.classList.add("is-open"); }
      else if (now.minutes < toMin(todays[0].open)) st.textContent = `Hoy abrimos a las ${todays[0].open}`;
      else st.textContent = "Por hoy ya cerramos";
    }

    // Lo que el local no ofrece no se muestra
    document.querySelectorAll('[data-link="takeaway"]').forEach((a) => { a.hidden = r.has_takeaway === false; });
    document.querySelectorAll('[data-link="reserve"]').forEach((a) => { a.hidden = r.has_reservations === false; });
    return todays.length > 0;
  }

  /* ---------- Menú del día ---------- */
  const state = { items: [], cats: [], filter: "all", openToday: true, updated: null };

  function isSoldOut(it) {
    return !!it.disabled_by_stock || (it.stock_managed && Number(it.current_stock) <= 0) || (!it.is_available && !it.is_available_for_takeaway);
  }

  function renderMenu() {
    const grid = $("#menu-lista");
    const filters = $("#menu-filtros");
    grid.setAttribute("aria-busy", "false");
    const meta = $("#menu-actualizado");

    if (!state.items.length) {
      grid.replaceChildren(el("p", "menu__msg", "Hoy todavía no publicamos el menú. Vuelve en un rato."));
      filters.hidden = true; meta.textContent = "";
      return;
    }

    // Filtros por tipo de menú (categorías reales del local)
    const catNames = [];
    state.items.forEach((it) => { const n = catName(it); if (n && !catNames.includes(n)) catNames.push(n); });
    if (catNames.length > 1) {
      filters.hidden = false;
      const mk = (value, label) => { const b = el("button", "", label); b.type = "button"; b.setAttribute("aria-pressed", String(state.filter === value)); b.addEventListener("click", () => { state.filter = value; renderMenu(); }); return b; };
      filters.replaceChildren(mk("all", "Todos"), ...catNames.map((n) => mk(n, n)));
    } else { filters.hidden = true; state.filter = "all"; }

    const shown = state.items
      .filter((it) => state.filter === "all" || catName(it) === state.filter)
      .sort((a, b) => Number(isSoldOut(a)) - Number(isSoldOut(b)) || (a.position ?? 0) - (b.position ?? 0));

    grid.replaceChildren(...shown.map((it, i) => dishCard(it, i)));

    const allOut = state.items.every(isSoldOut);
    const parts = [];
    if (state.updated) parts.push(`Actualizado a las ${hhmm(state.updated)}`);
    if (allOut) parts.push("Por ahora se agotó todo el menú del día");
    else if (!state.openToday) parts.push("Hoy el local está cerrado: este es el último menú publicado");
    meta.textContent = parts.join(" · ");
  }

  function catName(it) {
    const c = state.cats.find((x) => x.id === it.category_id);
    return (c && c.name) || it.category || "";
  }

  function dishCard(it, i) {
    const out = isSoldOut(it);
    const card = el("article", "dish" + (out ? " is-out" : ""));
    card.style.setProperty("--accent", ACCENTS[i % ACCENTS.length]);

    const img = el("div", "dish__img");
    if (it.image_url && /^https:\/\//.test(it.image_url)) {
      const im = document.createElement("img"); im.src = it.image_url; im.alt = ""; im.loading = "lazy"; img.append(im);
    } else img.append(el("span", "", (it.name || "?").trim().charAt(0).toUpperCase()));
    img.setAttribute("aria-hidden", "true");

    const top = el("div", "dish__top");
    top.append(el("h3", "dish__name", it.name), el("span", "dish__price", clp(it.takeaway_price ?? it.price)));

    const foot = el("div", "dish__foot");
    const stock = el("span", "stock");
    if (out) { stock.className += " stock--out"; stock.textContent = "Agotado"; }
    else if (it.stock_managed && Number(it.current_stock) > 0) {
      stock.className += Number(it.current_stock) <= 5 ? " stock--low" : " stock--ok";
      stock.textContent = Number(it.current_stock) === 1 ? "Queda 1" : `Quedan ${it.current_stock}`;
    } else { stock.className += " stock--ok"; stock.textContent = "Disponible"; }
    foot.append(stock);
    if (!out) {
      const a = el("a", "btn btn--ink btn--sm", "Pedir"); a.href = `${C.pwaUrl.replace(/\/+$/, "")}/restaurant/${C.restaurantId}/menu`;
      a.setAttribute("aria-label", `Pedir ${it.name} en Almuerzo.cl`);
      foot.append(a);
    }

    card.append(img, el("p", "dish__cat", catName(it)), top);
    if (it.description) card.append(el("p", "dish__desc", it.description));
    card.append(foot);
    return card;
  }

  async function loadMenu() {
    const id = encodeURIComponent(C.restaurantId);
    try {
      const [items, cats] = await Promise.all([
        api(`menu_items?restaurant_id=eq.${id}&is_menu_del_dia=eq.true&select=id,name,description,price,takeaway_price,category,category_id,image_url,is_available,is_available_for_takeaway,stock_managed,current_stock,disabled_by_stock,position&order=position`),
        api(`menu_categories?restaurant_id=eq.${id}&is_visible=eq.true&select=id,name,position&order=position`),
      ]);
      state.items = items; state.cats = cats; state.updated = new Date();
      renderMenu();
    } catch (e) {
      const grid = $("#menu-lista");
      grid.setAttribute("aria-busy", "false");
      if (state.items.length) return; // ya hay un menú en pantalla: se conserva hasta el próximo intento
      const msg = el("p", "menu__msg", "No pudimos cargar el menú de hoy.");
      const retry = el("button", "btn btn--yellow btn--sm", "Reintentar"); retry.type = "button";
      retry.addEventListener("click", () => { grid.setAttribute("aria-busy", "true"); loadMenu(); });
      msg.append(retry);
      grid.replaceChildren(msg);
    }
  }

  async function loadRestaurant() {
    try {
      const rows = await api(`restaurants?id=eq.${encodeURIComponent(C.restaurantId)}&select=name,comuna,address,opening_hours,is_active,has_takeaway,has_reservations`);
      if (rows[0]) { state.openToday = renderRestaurant(rows[0]); if (state.items.length) renderMenu(); }
    } catch { /* se queda el texto fijo del HTML */ }
  }

  /* ---------- Novedades (contenido propio del sitio) ---------- */
  async function loadNews() {
    try {
      const res = await fetch("/novedades.json", { cache: "no-cache" });
      if (!res.ok) return;
      const list = await res.json();
      if (!Array.isArray(list) || !list.length) return;
      $("#novedades-lista").replaceChildren(...list.map((n) => {
        const li = el("li");
        li.append(el("span", "tag", n.tag || "Aviso"), el("h3", "", n.title), el("p", "", n.text));
        return li;
      }));
      $("#novedades").hidden = false;
      const link = $('a[href="#novedades"]'); if (link) link.hidden = false;
    } catch { /* sin novedades */ }
  }

  /* ---------- Pop-up «otro local» ---------- */
  function setupPopup() {
    const o = C.otherLocal, dlg = $("#otro-local");
    if (!o || !o.enabled || !dlg || typeof dlg.showModal !== "function") return;
    const KEY = "criolla_otro_local";
    let hiddenUntil = 0;
    try { hiddenUntil = Number(localStorage.getItem(KEY)) || 0; } catch { /* sin almacenamiento */ }
    if (Date.now() < hiddenUntil) return;

    $("#otro-direccion").textContent = `${o.name} · ${o.address}`;
    $("#otro-mapa").href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address)}`;

    const remember = () => { try { localStorage.setItem(KEY, String(Date.now() + (o.hideForDays || 7) * 86400000)); } catch { /* ignorar */ } };
    dlg.addEventListener("close", remember);
    $("#otro-cerrar").addEventListener("click", () => dlg.close());
    $("#otro-ahora-no").addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

    setTimeout(() => { if (!document.hidden && !dlg.open) dlg.showModal(); }, (o.showAfterSeconds || 4) * 1000);
  }

  /* ---------- Inicio ---------- */
  wireLinks();
  renderToday();
  const nav = $('a[href="#novedades"]'); if (nav) nav.hidden = true;
  Promise.all([loadRestaurant(), loadMenu()]).then(() => { if (state.items.length) renderMenu(); });
  loadNews();
  setupPopup();

  // Menú vivo: se vuelve a leer cada minuto mientras la pestaña está visible, y al volver a ella.
  setInterval(() => { if (!document.hidden) loadMenu(); }, (C.refreshSeconds || 60) * 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { loadMenu(); loadRestaurant(); } });
})();
