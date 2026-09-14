-- Dedicated short-lived rate counter; never reuse or mutate the append-only access audit.
-- Only random admission IDs and database timestamps are stored. At most 20 live entries.
CREATE TABLE public.admin_explorer_admission (
    id UUID PRIMARY KEY,
    admitted_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX ix_admin_explorer_admission_time ON public.admin_explorer_admission(admitted_at);
