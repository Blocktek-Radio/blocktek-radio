CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization_members (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'publisher', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address text NOT NULL,
  network text NOT NULL,
  verified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (network, address)
);

CREATE TABLE publishers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES organizations(id),
  display_name text NOT NULL,
  assurance_level text NOT NULL DEFAULT 'blocktek-issued-unverified-legal-identity',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE publisher_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  issuer_key_id text NOT NULL,
  credential_digest text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('active', 'suspended', 'revoked')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

CREATE TABLE audio_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  title text NOT NULL,
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audio_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES audio_assets(id),
  object_key text NOT NULL UNIQUE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  media_type text NOT NULL,
  original_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE registration_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES publishers(id),
  wallet_id uuid REFERENCES wallets(id),
  status text NOT NULL CHECK (status IN ('received', 'awaiting_signature', 'awaiting_midnight', 'registered', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE release_manifests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL UNIQUE REFERENCES registration_requests(id),
  protocol text NOT NULL,
  canonical_json text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE release_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_id uuid NOT NULL REFERENCES release_manifests(id),
  signer_type text NOT NULL CHECK (signer_type IN ('publisher_wallet', 'audiotrust_platform')),
  algorithm text NOT NULL,
  key_id text NOT NULL,
  public_key text NOT NULL,
  signature text NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE authorization_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES registration_requests(id),
  provider text NOT NULL,
  status text NOT NULL,
  network text,
  contract_address text,
  transaction_id text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE blockchain_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES registration_requests(id),
  network text NOT NULL,
  transaction_id text NOT NULL,
  status text NOT NULL,
  finalized_at timestamptz,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (network, transaction_id)
);

CREATE TABLE verification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manifest_id uuid REFERENCES release_manifests(id),
  result text NOT NULL CHECK (result IN ('match', 'mismatch', 'invalid_signature', 'not_found')),
  observed_sha256 text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id),
  organization_id uuid REFERENCES organizations(id),
  action text NOT NULL,
  subject_type text NOT NULL,
  subject_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE consumed_nonces (
  nonce_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  wallet_id uuid REFERENCES wallets(id),
  network text NOT NULL,
  purpose text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE INDEX audio_assets_publisher_created_idx ON audio_assets (publisher_id, created_at DESC);
CREATE INDEX registration_requests_publisher_created_idx ON registration_requests (publisher_id, created_at DESC);
CREATE INDEX audit_logs_org_created_idx ON audit_logs (organization_id, created_at DESC);
CREATE INDEX consumed_nonces_expiry_idx ON consumed_nonces (expires_at);
