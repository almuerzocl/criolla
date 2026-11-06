# criolla — sitio web de Cri-Olla (Parque Titanium)

Sitio estático (HTML + CSS + JavaScript), **sin build ni dependencias**. Archivos: `index.html`, `styles.css`, `app.js`, `config.js`, `novedades.json`,
`favicon.svg`, `site.webmanifest`, `robots.txt`, `sitemap.xml`, `_headers`.

- **Fuente:** este repo (`almuerzocl/criolla`), rama `main`.
- **Despliegue:** Cloudflare (Worker `criolla`, https://criolla.esteban-4af.workers.dev), conectado a GitHub.
- **Dominio de producción:** https://criolla.almuerzo.cl (dominio personalizado configurado en Cloudflare; el DNS de `almuerzo.cl` también está allí).
- **Excepción a la regla de "solo Google Cloud":** decisión del usuario (2026-10-23). Este sitio NO usa Cloud Build ni Cloud Run, y no debe llevar `Dockerfile` ni `cloudbuild.yaml`.
- Sin secretos. `config.js` solo tiene valores públicos (URL de Supabase y clave *publishable*, que el navegador puede leer; lo que alcanza lo limita RLS).

## Modelo de operación

- Este sitio es **una interfaz más de almuerzo.cl** (mismo Supabase, proyecto `almuerzov5`), con el look and feel de Cri-Olla. No guarda datos propios.
- Cuentas, menú del día, platos disponibles, pedidos, reservas, historial y encuestas/comentarios se leen y se escriben en almuerzo.cl. Única excepción: los formularios de contacto específicos del restaurante.
- Cada web de restaurante sigue este mismo modelo.
- **Etapa actual (A):** el sitio *lee* en vivo (menú del día con stock, dirección y horario del local) y los botones Ingresar, Crear cuenta, Pedir, Reservar y Mis pedidos abren la PWA
  (`https://app2.almuerzo.cl`, repo `almuerzocl/v5-pwa`) con el local preseleccionado. Pedir/reservar/login dentro del sitio sería la etapa B/C.
- **Local que representa:** Cri-Olla - Parque Titanium, `restaurants.id = c8f518ae-2da9-4bb4-a95f-cca4c6b96056` (Costanera Sur 2760, Las Condes; lun–vie 12:00–16:00).
  Lo que se muestra del local (dirección, horario, ofrece retiro/reserva) sale de la base: se cambia en el panel de almuerzo.cl, no aquí.
- **Menú del día:** `menu_items` con `is_menu_del_dia = true` del local, agrupado por `menu_categories`. «Agotado» = `disabled_by_stock`, o con stock gestionado y `current_stock <= 0`.
  Se vuelve a leer cada 60 s mientras la pestaña está visible. Día y hora se calculan en `America/Santiago`.
- **Origen del cliente:** `profiles.source_restaurant_id` (uuid, FK a `restaurants.id`). `NULL` = ingresó por almuerzo.cl; un id = ingresó por el portal de ese restaurante.
  El enlace «Crear cuenta» manda `?source=<id>`; la PWA lo guarda al crear el perfil (ver `CONTENIDO.md` de `v5-pwa`). No confundir con `profiles.restaurant_id` (restaurante que administra un `RESTAURANT_ADMIN`).

## Contenido propio (se edita en este repo)

- **Novedades:** `novedades.json` (lista de `{tag, title, text}`; si está vacía la sección se oculta).
- **Pop-up «¿Sabías que tenemos otro local?»:** `config.js → otherLocal` (`enabled:false` lo apaga). Se muestra una vez cada 7 días por navegador.
  Hoy apunta a Los Militares 5934, que en almuerzo.cl figura **inactivo**: confirmar que sigue vigente.
- **WhatsApp y teléfono:** no se muestran porque el local no tiene número cargado en almuerzo.cl (`restaurants.phone` es nulo). Los números del sitio anterior eran de ejemplo.

## SEO, accesibilidad y configuración

- `<title>`, descripción, `lang="es-CL"`, canonical, Open Graph/Twitter, datos estructurados `Restaurant` (JSON-LD), favicon, `site.webmanifest`, `robots.txt` y `sitemap.xml`.
- `_headers`: CSP estricta (solo este origen, Google Fonts, el Supabase de almuerzo.cl y el mapa), `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'` y caché corta.
- Sin Babel/React ni scripts de terceros: ya no depende de unpkg. Fuentes reducidas a 3 familias.
- Accesibilidad: enlace «Saltar al contenido», foco visible, `prefers-reduced-motion`, contraste revisado (texto oscuro sobre rosa/turquesa/amarillo), pop-up con `<dialog>` (foco atrapado, Esc, devuelve el foco), etiquetas en controles y regiones en vivo.
- Se eliminó lo simulado del sitio anterior: login falso, «EN VIVO» aleatorio, confirmaciones de pedido sin pedido, reseñas y teléfonos de ejemplo.
