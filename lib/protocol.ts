export type Availability = 'available' | 'unavailable' | 'unsupported' | 'not_checked'
export type Status = 'valid' | 'invalid' | 'expired' | 'revoked' | 'untrusted' | Availability
export type AiDisclosure = 'human_declared' | 'ai_generated' | 'ai_assisted' | 'transformed' | 'unknown' | 'not_declared'

export interface VerificationReport {
  signatureStatus: Status
  exactHashMatch: Status
  credentialStatus: Status
  c2paStatus: Status
  chainAnchorStatus: Status
  perceptualMatch?: Status
  watermarkSignal?: Status
  detectorSignal?: { status: Status; provider?: string; model?: string; version?: string }
  historyCompleteness: 'complete' | 'incomplete' | Availability
  checkedAt?: string
  limitations: string[]
}

export interface IdentityProvider { verify(reference: string): Promise<{ issuer?: string; status: Status; detail: string }> }
export interface ProvenanceProvider { validate(manifestUri: string): Promise<{ status: Status; events: ProvenanceEvent[] }> }
export interface StorageProvider { put(file: File): Promise<{ uri: string; sha256: string }> }
export interface ChainAnchorProvider { lookup(commitment: string): Promise<{ status: Status; network?: string; transactionUrl?: string }> }
export interface FingerprintProvider { compare(sha256: string): Promise<{ status: Status; assetId?: string }> }
export interface WatermarkProvider { inspect(file: File): Promise<{ status: Status; provider?: string }> }
export interface AudioAnalysisProvider { inspect(file: File): Promise<{ status: Status; provider?: string; model?: string }> }
export interface ProvenanceEvent { type: string; timestamp: string; actor?: string; detail?: string }

export interface AudioRegisterRequest { file?: File; secureUploadReference?: string; publisherDid?: string; signerAddress?: string; declaredCreator?: string; title?: string; contentType: string; aiDisclosure: AiDisclosure; processingActions?: string[]; licenseRef?: string }
export interface AudioRegisterResponse { assetId: string; sha256: string; manifestUri?: string; manifestId?: string; signerAddress?: string; signerDid?: string; signature?: string; chainAnchorStatus: Status; verificationUrl: string; createdAt: string }
