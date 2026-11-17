'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Check, FileAudio, Info, ShieldCheck, X } from 'lucide-react'
import { ed25519 } from '@noble/curves/ed25519.js'
import { verifyCreatorSignature } from '@/packages/wallet-provider/src/index.js'
import type { CreatorIntent } from '@/packages/wallet-provider/src/index.js'
import { SectionLabel, SiteShell } from '@/components/site-shell'

const API = `${process.env.NEXT_PUBLIC_AUDIOTRUST_API_URL || 'http://localhost:4100'}/api/v1`
type Evidence = {
  registration: { id: string; status: string; createdAt: string }
  publisher: { id: string; name: string; assuranceLevel: string }
  audio: { title: string; sha256: string; size: number; mediaType: string }
  manifest: Record<string, unknown> | null
  manifestSha256: string | null
  manifestCanonical: string | null
  signatures: Array<{ signerType: string; algorithm: string; keyId: string; publicKey: string; signature: string; signedPayload: string | null }>
  midnightAuthorization: unknown
  limitations: string[]
}

function fromHex(value: string) {
  if (!/^(?:[a-f0-9]{2})+$/i.test(value)) throw new Error('Malformed hexadecimal signature evidence.')
  return Uint8Array.from(value.match(/.{2}/g)!, byte => Number.parseInt(byte, 16))
}

function fromBase64Url(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')), character => character.charCodeAt(0))
}

async function verifyPublicEvidence(data: Evidence) {
  const result = { manifestDigest: 'unavailable', creatorSignature: 'unavailable', platformSignature: 'unavailable' }
  if (data.manifestCanonical && data.manifestSha256) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data.manifestCanonical))
    const actual = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('')
    result.manifestDigest = actual === data.manifestSha256 ? 'verified' : 'invalid'
  }
  const creator = data.signatures.find(signature => signature.signerType === 'publisher_wallet')
  if (creator?.signedPayload) {
    try {
      const intent = JSON.parse(creator.signedPayload) as CreatorIntent
      verifyCreatorSignature(intent, { data: creator.signedPayload, signature: creator.signature, verifyingKey: creator.publicKey, scheme: creator.algorithm as 'schnorr_bip340' | 'ecdsa_secp256k1_sha256' }, {
        now: Math.min(Date.now(), intent.expiresAt - 1), expectedNetwork: intent.networkId, expectedAccount: intent.creatorAccount,
      })
      result.creatorSignature = 'verified'
    } catch { result.creatorSignature = 'invalid' }
  }
  const platform = data.signatures.find(signature => signature.signerType === 'audiotrust_platform')
  if (platform && data.manifestCanonical && platform.algorithm === 'Ed25519') {
    try {
      const message = new TextEncoder().encode(`AudioTrust:release-manifest:v1\n${data.manifestCanonical}`)
      const valid = ed25519.verify(fromBase64Url(platform.signature), message, fromBase64Url(platform.publicKey))
      result.platformSignature = valid ? 'verified' : 'invalid'
    } catch { result.platformSignature = 'invalid' }
  }
  return result
}

export default function Verify() {
  const [file, setFile] = useState<File | null>(null)
  const [hash, setHash] = useState('')
  const [registrationId, setRegistrationId] = useState('')
  const [evidence, setEvidence] = useState<Evidence | null>(null)
  const [fileResult, setFileResult] = useState<Record<string, unknown> | null>(null)
  const [signatureChecks, setSignatureChecks] = useState<{ manifestDigest: string; creatorSignature: string; platformSignature: string } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('id')
    if (id) setRegistrationId(id)
  }, [])

  async function loadEvidence(id = registrationId) {
    const response = await fetch(`${API}/audio/${encodeURIComponent(id)}/evidence`)
    const data = await response.json()
    if (!response.ok) throw new Error(data.message || `Evidence request failed (${response.status}).`)
    const evidenceData = data as Evidence
    setEvidence(evidenceData)
    setSignatureChecks(await verifyPublicEvidence(evidenceData))
    setFileResult(null)
  }

  async function openEvidence() {
    setBusy(true); setError('')
    try { await loadEvidence() }
    catch (cause) { setEvidence(null); setError(cause instanceof Error ? cause.message : 'Could not load release evidence.') }
    finally { setBusy(false) }
  }

  async function selectFile(next: File | null) {
    setError(''); setFile(next); setHash(''); setFileResult(null)
    if (!next) return
    if (next.size > 100 * 1024 * 1024) { setError('File is larger than the 100 MB verification limit.'); return }
    if (registrationId.trim()) {
      setBusy(true)
      try {
        const form = new FormData()
        form.append('audio', next, next.name)
        const response = await fetch(`${API}/audio/${encodeURIComponent(registrationId.trim())}/verify-file`, { method: 'POST', body: form })
        const data = await response.json()
        if (!response.ok) throw new Error(data.message || `File comparison failed (${response.status}).`)
        const localDigest = await crypto.subtle.digest('SHA-256', await next.arrayBuffer())
        const localHash = Array.from(new Uint8Array(localDigest)).map(byte => byte.toString(16).padStart(2, '0')).join('')
        setFileResult({ ...data, localSha256: localHash, localResult: evidence?.audio.sha256 === localHash ? 'MATCH' : 'MISMATCH' })
        await loadEvidence(registrationId.trim())
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'File comparison failed.') }
      finally { setBusy(false) }
      return
    }
    const digest = await crypto.subtle.digest('SHA-256', await next.arrayBuffer())
    setHash(Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join(''))
  }

  return <SiteShell>
    <section className="page-hero"><div className="container"><SectionLabel>Public verifier</SectionLabel><h1>Inspect the evidence. Keep the uncertainty.</h1><p>Open a public release report with its ID, then compare the exact audio bytes. Without a release ID, this page calculates a local SHA-256 only.</p></div></section>
    <section className="section"><div className="container">
      <div className="notice"><b>What a match means:</b> the uploaded bytes have the same SHA-256 as the registered file. It does not establish truth, speaker identity, copyright ownership, or pre-registration integrity.</div>
      <div style={{ display: 'flex', gap: 10, marginTop: 24, maxWidth: 700 }}>
        <input aria-label="AudioTrust release ID" placeholder="Release ID" value={registrationId} onChange={event => { setRegistrationId(event.target.value); setEvidence(null); setFileResult(null); setHash('') }} style={{ flex: 1, padding: 12 }} />
        <button className="button primary" disabled={busy || !registrationId.trim()} onClick={() => void openEvidence()}>{busy ? 'Loading…' : 'Open evidence'}</button>
      </div>
      <div className="verify-layout" style={{ marginTop: 24 }}>
        <div>
          <label className="upload-box" htmlFor="audio-file"><FileAudio size={30} color="var(--red)"/><b style={{ marginTop: 14 }}>{file ? file.name : 'Choose an audio file to compare'}</b><span style={{ fontSize: 13, color: 'var(--muted)', marginTop: 7 }}>{registrationId ? 'Server comparison against the registered digest' : 'Local SHA-256 calculation · up to 100 MB'}</span><input id="audio-file" type="file" accept="audio/*,.flac" onChange={event => void selectFile(event.target.files?.[0] || null)} /></label>
          {error && <p role="alert" style={{ color: 'var(--red)', fontSize: 13 }}><AlertCircle size={14}/> {error}</p>}
          {fileResult && <div className="card" style={{ marginTop: 16 }}><span className="tag">Server compared exact bytes</span><h3 style={{ color: fileResult.result === 'MATCH' ? 'var(--blue)' : 'var(--red)' }}>{String(fileResult.result) === 'MATCH' ? <Check size={17}/> : <X size={17}/>} {String(fileResult.result)}</h3><p>Expected SHA-256</p><div className="hash" style={{ maxWidth: '100%', textAlign: 'left' }}>{String(fileResult.expectedSha256)}</div><p>Observed SHA-256</p><div className="hash" style={{ maxWidth: '100%', textAlign: 'left' }}>{String(fileResult.observedSha256)}</div><small>Comparison event is recorded in the release history.</small></div>}
          {hash && <div className="card" style={{ marginTop: 16 }}><span className="tag">Local calculation</span><p style={{ marginBottom: 5 }}>SHA-256 exact-file hash</p><div className="hash" style={{ maxWidth: '100%', textAlign: 'left' }}>{hash}</div></div>}
        </div>
        <div className="evidence"><div className="evidence-head"><b>Verification report</b><span className="tag">{evidence ? evidence.registration.status : 'No release loaded'}</span></div>
          {evidence ? <>
            <div className="evidence-row"><span>Publisher</span><span className="status">{evidence.publisher.name}</span></div>
            <div className="evidence-row"><span>Publisher assurance</span><span className="status">{evidence.publisher.assuranceLevel}</span></div>
            <div className="evidence-row"><span>Registered file SHA-256</span><span className="status">{evidence.audio.sha256.slice(0, 16)}…</span></div>
            <div className="evidence-row"><span>Manifest digest (browser verified)</span><span className="status">{signatureChecks?.manifestDigest || 'Checking'}</span></div>
            <div className="evidence-row"><span>Publisher signature (browser verified)</span><span className="status">{signatureChecks?.creatorSignature || 'Checking'}</span></div>
            <div className="evidence-row"><span>AudioTrust signature (browser verified)</span><span className="status">{signatureChecks?.platformSignature || 'Checking'}</span></div>
            <div className="evidence-row"><span>Midnight authorization</span><span className="status">{evidence.registration.status === 'awaiting_midnight' ? 'Pending · no transaction' : evidence.registration.status}</span></div>
            <div style={{ padding: 18 }}><b>{evidence.audio.title}</b><br/><small>{evidence.audio.mediaType} · {evidence.audio.size.toLocaleString()} bytes</small><details style={{ marginTop: 12 }}><summary>Signed manifest</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 11 }}>{JSON.stringify(evidence.manifest, null, 2)}</pre></details><details style={{ marginTop: 12 }}><summary>Signature evidence</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 11 }}>{JSON.stringify(evidence.signatures, null, 2)}</pre></details></div>
            <div style={{ padding: '0 18px 18px', color: 'var(--muted)', fontSize: 12, lineHeight: 1.6 }}>{evidence.limitations.map((limitation, index) => <p key={index}><Info size={13} style={{ verticalAlign: 'middle', marginRight: 7 }}/>{limitation}</p>)}</div>
          </> : <div style={{ padding: 20, color: 'var(--muted)', fontSize: 13 }}>Enter a release ID to retrieve public evidence. No positive result is shown until the API provides the evidence.</div>}
          <div style={{ padding: 20, color: 'var(--muted)', fontSize: 12, lineHeight: 1.6 }}><ShieldCheck size={15} style={{ verticalAlign: 'middle', marginRight: 7, color: 'var(--blue)' }}/> A valid signature proves that a key signed a message under the stated protocol; it does not establish speaker identity or truth.</div>
        </div>
      </div>
    </div></section>
  </SiteShell>
}
