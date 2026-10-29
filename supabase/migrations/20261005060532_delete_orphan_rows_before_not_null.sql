-- SPEC 16 — Paso 1: eliminar filas huérfanas (owner_id NULL) respetando el orden de FKs.
-- Hoja -> raíz: payment_allocation -> payment -> comprobante -> entidad.
DELETE FROM public.payment_allocation;
DELETE FROM public.payment;
DELETE FROM public.comprobante;
DELETE FROM public.entidad;
