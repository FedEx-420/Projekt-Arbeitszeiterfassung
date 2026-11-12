select cron.schedule(
  'klarwerk-supplier-portals',
  '*/3 * * * *',
  $$select app_private.klarwerk_supplier_schedule_v1011()$$
);
