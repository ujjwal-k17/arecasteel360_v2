ALTER TABLE public.truck_trips
DROP CONSTRAINT IF EXISTS truck_trips_trip_type_check;

ALTER TABLE public.truck_trips
ADD CONSTRAINT truck_trips_trip_type_check
CHECK (trip_type IN ('Purchase', 'Sales', 'Job Work', 'Job Work Out', 'Job Work Return'));