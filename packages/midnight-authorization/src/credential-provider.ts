/**
 * Provider-neutral credential verification boundary.
 *
 * Parsing is deliberately separate from cryptographic verification. An
 * implementation must not treat a parsed credential as a trusted credential.
 * This interface is not wired into the Compact contract or registration path.
 */

export type EligibilityPredicates = Readonly<{
  individualIdentityVerified: boolean;
  organizationMember: boolean;
  publisherAuthorized: boolean;
}>;

export type CredentialStatus = 'active' | 'revoked' | 'suspended' | 'unknown';

export interface PresentedCredential {
  readonly format: string;
  /** Opaque credential/presentation bytes; callers must keep them out of logs. */
  readonly bytes: Uint8Array;
}

export interface ParsedCredential {
  readonly format: string;
  /** Provider-owned parsed data. It is untrusted until every verifier step passes. */
  readonly value: unknown;
}

export interface VerificationChallenge {
  readonly audience: string;
  readonly nonce: Uint8Array;
  readonly expiresAt: number;
}

export interface CredentialVerificationResult {
  readonly issuerId: string;
  readonly issuerTrusted: boolean;
  readonly credentialSignatureValid: boolean;
  readonly holderBindingValid: boolean;
  readonly requestedPredicates: EligibilityPredicates;
  readonly credentialStatus: CredentialStatus;
  readonly issuedAt: number;
  readonly expiresAt: number;
  /** Opaque reference for audit correlation; must not encode a stable holder ID. */
  readonly verificationReference: string;
}

export interface CredentialProvider {
  parse(presentation: PresentedCredential): Promise<ParsedCredential>;
  verifyIssuerSignature(parsed: ParsedCredential): Promise<boolean>;
  verifyIssuerTrust(parsed: ParsedCredential): Promise<boolean>;
  verifyHolderBinding(parsed: ParsedCredential, challenge: VerificationChallenge): Promise<boolean>;
  verifySelectiveDisclosure(
    parsed: ParsedCredential,
    requestedPredicates: readonly (keyof EligibilityPredicates)[],
  ): Promise<EligibilityPredicates>;
  checkStatus(parsed: ParsedCredential): Promise<CredentialStatus>;
}

/**
 * AudioTrust's current circuit accepts a separate BlockTek-signed typed
 * eligibility statement. A future adapter must bridge verified provider
 * results into that statement with a trusted BlockTek attestor; it must not
 * claim that Compact directly verifies this provider's credential or proof.
 */
export interface AudioTrustEligibilityAttestor {
  attestVerifiedEligibility(input: {
    readonly verification: CredentialVerificationResult;
    readonly request: {
      readonly registrationCommitment: Uint8Array;
      readonly nonce: Uint8Array;
      readonly contractAddress: string;
      readonly policyVersion: bigint;
    };
  }): Promise<{
    readonly compactStatement: unknown;
    readonly issuerSignature: unknown;
  }>;
}
