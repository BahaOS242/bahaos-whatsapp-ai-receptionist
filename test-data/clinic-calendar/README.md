# Bahamas Dental Service — External Clinic Reference Calendar

This directory is a deterministic, read-only reference dataset for the BAHAOS receptionist simulator.

## Range
2026-08-24 through 2027-08-24 inclusive.

## Time zone
America/Nassau.

## Clinic hours
Monday-Friday, 9:00 AM-5:00 PM.

## Services
The service definitions are included only as references for the simulator:
- Dental consultation / basic exam — 30 minutes — B$75
- Routine cleaning — 60 minutes — B$125
- Basic filling — 45 minutes — B$175
- Root canal — 90 minutes — B$950

The application's authoritative service catalogue should remain the source of truth for service meaning.

## Calendar semantics
- Rows are 30-minute candidate start times.
- `available` means the reference calendar does not contain a seeded conflict at that start time.
- `booked` means a seeded existing appointment occupies that start.
- `cancelled` is a historical/cancelled reference appointment and should not block a new appointment.
- `blocked` is clinic/staff unavailability.
- A booking adapter must additionally validate the entire service duration, not just the start-time row.
- The master reference files must never be mutated by simulated bookings.

## Simulation
Record simulated bookings/cancellations/reschedules in a separate transaction store so the reference calendar can always be reset and replayed.

## Files
- `clinic-calendar.json` — complete machine-readable reference dataset.
- `clinic-calendar.csv` — spreadsheet-friendly calendar view.
- `services.json` — service reference data.
- `README.md` — this documentation.

Generated deterministically with seed 242.
