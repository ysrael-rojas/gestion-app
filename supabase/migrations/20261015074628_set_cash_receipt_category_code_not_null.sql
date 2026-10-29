-- SPEC 37, paso 2 de 2: code NOT NULL. La app siempre envía code desde
-- esta versión (semillas con código + createCategory con slug), así que la
-- restricción no rompe ninguna ruta de inserción.
do $$
begin
  if exists (select 1 from public.cash_receipt_category where code is null) then
    raise exception 'Aún hay categorías sin código: revisar antes del NOT NULL';
  end if;
end $$;

alter table public.cash_receipt_category alter column code set not null;
