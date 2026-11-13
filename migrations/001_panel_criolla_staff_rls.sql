-- 001 · Panel de Cri-Olla: acceso del personal a SU restaurante (aditiva; no modifica ni borra nada existente).
--
-- Qué agrega:
--   1. staff_restaurant_id()        -> restaurante del personal autenticado (NULL si no es personal).
--   2. staff_admin_restaurant_id()  -> igual, solo para ADMIN / OWNER / RESTAURANT_ADMIN.
--   3. staff_can_see_person(uuid)   -> el personal ve a una persona solo si: nació en su portal (source_restaurant_id),
--                                      o tiene pedidos/reservas en su restaurante. SECURITY DEFINER para evitar recursión de RLS.
--   4. Política SELECT en profiles  -> usa (3). Se suma (OR) a profiles_select; esa no cambia.
--   5. Política UPDATE en menu_items -> solo admins del local, solo filas de su restaurante.
-- Aislamiento: todo se ata a profiles.restaurant_id del usuario; personal de Cri-Olla no alcanza otros restaurantes.
-- No se tocan datos. Reversible con DROP POLICY / DROP FUNCTION de los objetos nuevos.

BEGIN;

CREATE OR REPLACE FUNCTION public.staff_restaurant_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p.restaurant_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.restaurant_id IS NOT NULL
      AND upper(p.role) IN ('ADMIN','OWNER','RESTAURANT_ADMIN','PEDIDOS','TAKEAWAY_MANAGER',
                            'RESERVAS','RESERVATION_MANAGER','OPERATIONS_MANAGER');
$$;

CREATE OR REPLACE FUNCTION public.staff_admin_restaurant_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p.restaurant_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.restaurant_id IS NOT NULL
      AND upper(p.role) IN ('ADMIN','OWNER','RESTAURANT_ADMIN');
$$;

CREATE OR REPLACE FUNCTION public.staff_can_see_person(p_profile uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        r.rid IS NOT NULL AND (
            EXISTS (SELECT 1 FROM public.profiles x
                    WHERE x.id = p_profile AND x.source_restaurant_id = r.rid)
            OR EXISTS (SELECT 1 FROM public.takeaway_orders o
                       WHERE o.user_id = p_profile AND o.restaurant_id = r.rid)
            OR EXISTS (SELECT 1 FROM public.reservations v
                       WHERE v.restaurant_id = r.rid
                         AND (v.organizer_id = p_profile OR v.user_id = p_profile))
        ), false)
    FROM (SELECT public.staff_restaurant_id() AS rid) r;
$$;

REVOKE ALL ON FUNCTION public.staff_restaurant_id()       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_admin_restaurant_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_can_see_person(uuid)  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_restaurant_id()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_admin_restaurant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_can_see_person(uuid)  TO authenticated;

DROP POLICY IF EXISTS profiles_staff_select_restaurant_people ON public.profiles;
CREATE POLICY profiles_staff_select_restaurant_people ON public.profiles
    FOR SELECT TO authenticated
    USING (public.staff_can_see_person(id));

DROP POLICY IF EXISTS menu_items_staff_update_own_restaurant ON public.menu_items;
CREATE POLICY menu_items_staff_update_own_restaurant ON public.menu_items
    FOR UPDATE TO authenticated
    USING      (restaurant_id = (SELECT public.staff_admin_restaurant_id()))
    WITH CHECK (restaurant_id = (SELECT public.staff_admin_restaurant_id()));

COMMIT;
