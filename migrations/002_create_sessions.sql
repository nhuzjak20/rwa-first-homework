-- Server-side login sessions (connect-pg-simple schema).
CREATE TABLE IF NOT EXISTS "session" (
    sid    VARCHAR      NOT NULL PRIMARY KEY,
    sess   JSON         NOT NULL,
    expire TIMESTAMP(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS session_expire_idx ON "session" (expire);
