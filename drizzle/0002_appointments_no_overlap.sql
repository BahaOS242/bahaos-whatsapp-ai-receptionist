-- Custom SQL migration file, put your code below! --

-- Database-authoritative concurrency protection for appointment booking.
--
-- The application-level availability check (src/ai/availability.ts,
-- consulted by LLMProvider/ReceptionistTools before proposing a booking)
-- is check-then-act and gives no atomicity guarantee across two
-- concurrent requests for the same slot — it exists purely for
-- conversational guidance ("that time works" / "here are alternatives").
-- This constraint is the actual source of truth: whichever INSERT reaches
-- Postgres first wins the slot; any other INSERT that would overlap it
-- is rejected by Postgres itself (error code 23P01, exclusion_violation),
-- regardless of how many application processes or requests are racing.
--
-- btree_gist is required to mix plain equality columns (tenant_id,
-- staff_user_id) with a range-overlap column (the appointment's time
-- span) in a single GiST exclusion constraint.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- The actual invariant (see PROJECT_CONTEXT / the Phase 1 concurrency
-- task): two appointments for the same tenant and the same
-- provider/resource must never have overlapping [starts_at, ends_at)
-- intervals. Deliberately interval overlap (tstzrange with &&), not a
-- naive (date, time) equality check — appointments have variable
-- durations (services.duration_minutes), so two DIFFERENT start times
-- can still genuinely conflict (e.g. 2:00-2:30 and 2:15-2:45), and two
-- appointments that merely touch at the boundary (2:00-2:30 immediately
-- followed by 2:30-3:00) must NOT conflict — '[)' (inclusive start,
-- exclusive end) gives exactly that semantics.
--
-- staff_user_id is nullable (no per-staff scheduling exists in the
-- product yet — see schema.ts's comment on the column). COALESCE'ing it
-- to a fixed sentinel UUID makes "no specific provider assigned" behave
-- as ONE shared resource per tenant for conflict purposes, rather than
-- each NULL being treated as distinct from every other NULL (which is
-- how plain `=`/exclusion semantics treat NULL, and would otherwise let
-- this constraint silently allow unlimited overlapping bookings for
-- every tenant with no staff differentiation — i.e. all of them today).
-- Once specific staff members ARE assigned, this constraint automatically
-- extends to let genuinely different staff hold the same time slot
-- (WHERE clause below is the same for both cases; only the COALESCE
-- value differs based on whether staff_user_id is set).
--
-- Per the task's explicit invariant: a cancelled appointment must never
-- block a slot — the partial WHERE clause excludes it entirely from the
-- constraint, so any number of cancelled rows can coexist with, or be
-- superseded by, a real booking for the same time.
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    COALESCE("staff_user_id", '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  )
  WHERE ("status" <> 'cancelled');
