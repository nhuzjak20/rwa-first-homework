-- Passes issued by the system. QR codes are never stored; they are generated on demand.
CREATE TABLE IF NOT EXISTS passes (
    id         UUID PRIMARY KEY,
    name       TEXT        NOT NULL CHECK (btrim(name) <> ''),
    document   TEXT        NOT NULL CHECK (btrim(document) <> ''),
    issued_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    status     TEXT        NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS passes_issued_at_idx ON passes (issued_at DESC);
CREATE INDEX IF NOT EXISTS passes_status_idx ON passes (status);
