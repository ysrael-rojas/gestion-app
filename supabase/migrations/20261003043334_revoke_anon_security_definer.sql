alter function public.create_payment_with_allocations(
  uuid, public.payment_direction, date, numeric, public.payment_method,
  text, text, jsonb
) owner to postgres;

revoke execute on function public.create_payment_with_allocations(
  uuid, public.payment_direction, date, numeric, public.payment_method,
  text, text, jsonb
) from anon;

revoke execute on function public.rls_auto_enable() from anon;

grant execute on function public.create_payment_with_allocations(
  uuid, public.payment_direction, date, numeric, public.payment_method,
  text, text, jsonb
) to authenticated, service_role;
