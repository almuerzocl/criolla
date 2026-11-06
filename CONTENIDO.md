# criolla — sitio web de Cri-Olla

Sitio estático (`index.html` + `support.js`), sin build.

- **Fuente:** este repo (`almuerzocl/criolla`), rama `main`.
- **Despliegue:** Cloudflare (Worker `criolla`, https://criolla.esteban-4af.workers.dev), conectado a GitHub.
- **Dominio de producción:** https://criolla.almuerzo.cl (dominio personalizado configurado en Cloudflare; el DNS de `almuerzo.cl` también está allí).
- **Excepción a la regla de "solo Google Cloud":** decisión del usuario (2026-10-23). Este sitio NO usa Cloud Build ni Cloud Run, y no debe llevar `Dockerfile` ni `cloudbuild.yaml`.
## Modelo de operación

- Este sitio es **una interfaz más de almuerzo.cl** (mismo Supabase), con el look and feel de Cri-Olla. No guarda datos propios.
- Cuentas, menú del día, platos disponibles, pedidos, reservas, historial y encuestas/comentarios se leen y se escriben en almuerzo.cl. Única excepción: los formularios de contacto específicos del restaurante.
- Cada web de restaurante sigue este mismo modelo.
- **Origen del cliente:** `profiles.source_restaurant_id` (uuid, FK a `restaurants.id`, proyecto Supabase `almuerzov5`). `NULL` = ingresó por almuerzo.cl; un id = ingresó por el portal de ese restaurante. Se fija al crear la cuenta y no se cambia; el cliente sigue siendo cliente general de almuerzo.cl. No confundir con `profiles.restaurant_id`, que solo identifica al restaurante que administra un usuario `RESTAURANT_ADMIN`.

- Sin secretos ni variables de build. `config.js` (valores públicos de Supabase) todavía no lo carga `index.html`.
