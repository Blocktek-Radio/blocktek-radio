ALTER TABLE users ADD COLUMN password_hash text;
ALTER TABLE wallets ALTER COLUMN verified_at DROP NOT NULL;
ALTER TABLE wallets ADD COLUMN binding_status text NOT NULL DEFAULT 'unbound'
  CHECK (binding_status IN ('unbound', 'signature-key-not-address-bound', 'address-bound'));

CREATE TABLE user_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX user_sessions_expiry_idx ON user_sessions (expires_at);

ALTER TABLE publishers ADD COLUMN status text NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'active', 'suspended'));
