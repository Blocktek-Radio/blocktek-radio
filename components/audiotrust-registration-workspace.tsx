'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { canonicalizeIntent, discoverMidnightWallets, MidnightConnectorProvider, verifyCreatorSignature } from '@/packages/wallet-provider/src/index.js'
import type { CreatorIntent } from '@/packages/wallet-provider/src/index.js'
import type { InitialAPI } from '@midnightntwrk/dapp-connector-api'

const API = `${process.env.NEXT_PUBLIC_AUDIOTRUST_API_URL || 'http://localhost:4100'}/api/v1`
const NETWORK = process.env.NEXT_PUBLIC_MIDNIGHT_NETWORK || 'preprod'
type WalletStatus = 'disconnected' | 'discovering' | 'connecting' | 'connected' | 'signing' | 'signature_verified' | 'error' | 'network_mismatch' | 'account_changed'
type WalletSession = {
  status: WalletStatus
  selectedProvider: InitialAPI | null
  connector: MidnightConnectorProvider | null
  account: string
  networkId: string | null
  connectedAt: number | null
  signingAvailable: boolean
  lastSignatureVerifiedAt: number | null
  error: { code: string; providerCode?: string; message: string } | null
}
const emptyWalletSession: WalletSession = { status: 'disconnected', selectedProvider: null, connector: null, account: '', networkId: null, connectedAt: null, signingAvailable: false, lastSignatureVerifiedAt: null, error: null }

type Profile = { user: { id: string; email: string; emailVerified: boolean }; publishers: Array<{ id: string; name: string; status: string; assuranceLevel: string; role: string }> }
type Release = { registrationId: string; status: string; audio: { sha256: string; size: number; mediaType: string } }
type IntentResponse = { manifest: Record<string, unknown>; manifestSha256: string; intent: CreatorIntent }

async function responseJson(response: Response) {
  const value = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(value.message || `Request failed (${response.status}).`)
  return value
}

export default function AudioTrustRegistrationWorkspace() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [publisherName, setPublisherName] = useState('')
  const [registerMode, setRegisterMode] = useState(true)
  const [wallets, setWallets] = useState<InitialAPI[]>([])
  const [walletIndex, setWalletIndex] = useState('')
  const [walletSession, setWalletSession] = useState<WalletSession>(emptyWalletSession)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [release, setRelease] = useState<Release | null>(null)
  const [intentResult, setIntentResult] = useState<IntentResponse | null>(null)
  const [releases, setReleases] = useState<Array<Record<string, unknown>>>([])
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const stopListening = useRef<(() => void) | null>(null)
  const wallet = walletSession.connector
  const account = walletSession.account
  const walletStatus = walletSession.status
  const intentJson = useMemo(() => intentResult ? canonicalizeIntent(intentResult.intent) : '', [intentResult])

  function saveWalletError(cause: unknown) {
    const error = cause as Error & { code?: string; providerCode?: string }
    const code = error.code || 'wallet_error'
    const message = error.message || 'Wallet request failed.'
    setWalletSession(session => ({ ...session, error: { code, providerCode: error.providerCode, message } }))
    setError(`${error.code ? `[${error.code}${error.providerCode ? `/${error.providerCode}` : ''}] ` : ''}${message}`)
  }

  function listenToWallet(provider: MidnightConnectorProvider) {
    stopListening.current?.()
    stopListening.current = provider.onChange((event) => {
      if (event.type === 'account_changed') {
        setWalletSession(session => ({ ...session, account: event.account, status: 'account_changed', lastSignatureVerifiedAt: null, error: null }))
        setIntentResult(null); setResult(null)
      }
      if (event.type === 'network_mismatch') {
        setWalletSession(session => ({ ...session, account: event.account ?? session.account, networkId: event.networkId, status: 'network_mismatch', error: { code: 'network_mismatch', message: `Wallet network does not match ${NETWORK}.` } }))
        setIntentResult(null); setResult(null)
      }
      if (event.type === 'disconnected') {
        setWalletSession(emptyWalletSession)
        setIntentResult(null); setResult(null)
      }
    })
  }

  async function loadProfile() {
    const response = await fetch(`${API}/auth/me`, { credentials: 'include' })
    if (response.status === 401) { setProfile(null); return }
    const data = await responseJson(response) as Profile
    setProfile(data)
    if (data.publishers[0]) await loadReleases(data.publishers[0].id)
  }

  async function loadReleases(publisherId: string) {
    const response = await fetch(`${API}/publishers/${publisherId}/releases`, { credentials: 'include' })
    const data = await responseJson(response)
    setReleases(data.releases)
  }

  useEffect(() => {
    setWalletSession(session => ({ ...session, status: 'discovering' }))
    setWallets(discoverMidnightWallets())
    setWalletSession(session => ({ ...session, status: 'disconnected' }))
    void loadProfile().catch(() => {})
    return () => { stopListening.current?.() }
  }, [])

  async function submitAuth() {
    setBusy(true); setError('')
    try {
      const route = registerMode ? 'register' : 'login'
      const body = registerMode ? { email, password, organizationName, publisherName } : { email, password }
      await responseJson(await fetch(`${API}/auth/${route}`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      }))
      await loadProfile()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Account request failed.') }
    finally { setBusy(false) }
  }

  async function signOut() {
    await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' })
    stopListening.current?.(); stopListening.current = null
    setProfile(null); setWalletSession(emptyWalletSession); setRelease(null); setIntentResult(null); setReleases([])
  }

  async function connectWallet() {
    setBusy(true); setError('')
    setWalletSession({ ...emptyWalletSession, status: 'connecting' })
    let provider: MidnightConnectorProvider | null = null
    try {
      const selected = wallets[Number(walletIndex)]
      if (!selected) throw new Error('Choose an installed Midnight wallet first.')
      setWalletSession(session => ({ ...session, selectedProvider: selected, status: 'connecting', error: null }))
      provider = new MidnightConnectorProvider(selected, NETWORK)
      const connected = await provider.connect()
      listenToWallet(provider)
      setWalletSession({ status: 'connected', selectedProvider: selected, connector: provider, account: connected.account, networkId: connected.networkId, connectedAt: connected.connectionTimestamp, signingAvailable: provider.capabilities.signMessage, lastSignatureVerifiedAt: null, error: null })
    } catch (cause) {
      // A connector may have granted access before a subsequent account/network
      // read failed. Keep that session available for diagnosis and local clearing.
      if (provider?.connectionEstablished) {
        listenToWallet(provider)
        const error = cause as Error & { code?: string; providerCode?: string }
        setWalletSession({ status: provider.actualNetworkId && provider.actualNetworkId !== NETWORK ? 'network_mismatch' : 'error', selectedProvider: provider.initialApi, connector: provider, account: provider.account ?? '', networkId: provider.actualNetworkId, connectedAt: provider.connectionTimestamp, signingAvailable: provider.capabilities.signMessage, lastSignatureVerifiedAt: null, error: { code: error.code || 'wallet_error', providerCode: error.providerCode, message: error.message || 'Wallet connection failed.' } })
      } else {
        const error = cause as Error & { code?: string; providerCode?: string }
        setWalletSession(session => ({ ...session, status: 'error', error: { code: error.code || 'wallet_error', providerCode: error.providerCode, message: error.message || 'Wallet connection failed.' } }))
      }
      saveWalletError(cause)
    }
    finally { setBusy(false) }
  }

  async function disconnectWallet() {
    stopListening.current?.(); stopListening.current = null
    await wallet?.disconnect()
    setWalletSession(emptyWalletSession); setIntentResult(null); setResult(null)
  }

  async function uploadRelease() {
    if (!profile?.publishers[0] || !file) return
    setBusy(true); setError(''); setRelease(null); setIntentResult(null); setResult(null)
    try {
      const form = new FormData()
      form.append('audio', file, file.name)
      const response = await fetch(`${API}/publishers/${profile.publishers[0].id}/releases`, {
        method: 'POST', credentials: 'include', headers: { 'x-release-title': title }, body: form,
      })
      const created = await responseJson(response) as Release
      setRelease(created)
      await loadReleases(profile.publishers[0].id)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Audio upload failed.') }
    finally { setBusy(false) }
  }

  async function prepareIntent() {
    if (!wallet || !release) return
    setBusy(true); setError(''); setResult(null)
    try {
      const currentNetwork = await wallet.getNetwork()
      const currentAccount = await wallet.getAccount()
      if (currentNetwork !== NETWORK || currentAccount !== account) throw new Error('Wallet account or network changed. Review the connection before continuing.')
      const response = await fetch(`${API}/audio/${release.registrationId}/intent`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ walletAddress: currentAccount }),
      })
      setIntentResult(await responseJson(response) as IntentResponse)
    } catch (cause) { saveWalletError(cause instanceof Error ? cause : new Error('Could not prepare a signing intent.')) }
    finally { setBusy(false) }
  }

  async function approveRelease() {
    if (!wallet || !release || !intentResult) return
    setBusy(true); setError(''); setResult(null)
    try {
      const currentNetwork = await wallet.getNetwork()
      const currentAccount = await wallet.getAccount()
      if (currentNetwork !== intentResult.intent.networkId || currentAccount !== intentResult.intent.creatorAccount) throw new Error('Wallet account or network changed. Prepare a fresh intent.')
      setWalletSession(session => ({ ...session, status: 'signing', error: null }))
      const signature = await wallet.signMessage(intentJson)
      verifyCreatorSignature(intentResult.intent, signature, { expectedNetwork: NETWORK, expectedAccount: currentAccount })
      setWalletSession(session => ({ ...session, status: 'signature_verified', lastSignatureVerifiedAt: Date.now(), error: null }))
      const response = await fetch(`${API}/audio/${release.registrationId}/signature`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ intent: intentResult.intent, signature }),
      })
      const signed = await responseJson(response)
      setResult(signed)
      if (profile?.publishers[0]) await loadReleases(profile.publishers[0].id)
    } catch (cause) {
      setWalletSession(session => ({ ...session, status: wallet?.actualNetworkId !== NETWORK ? 'network_mismatch' : 'error' }))
      saveWalletError(cause)
    }
    finally { setBusy(false) }
  }

  return <div className="card" style={{ marginTop: 26 }}>
    <span className="tag">AudioTrust · local MVP · Midnight network: {NETWORK}</span>
    <h3>Publisher registration workspace</h3>
    <p>Create an account, register the original audio bytes, and review what is signed. Email verification and Midnight transaction submission are not configured yet.</p>
    {!profile ? <div style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
      <div className="actions"><button type="button" className={`button ${registerMode ? 'primary' : 'ghost'}`} onClick={() => setRegisterMode(true)}>Create account</button><button type="button" className={`button ${!registerMode ? 'primary' : 'ghost'}`} onClick={() => setRegisterMode(false)}>Sign in</button></div>
      <label>Email<input value={email} onChange={event => setEmail(event.target.value)} type="email" autoComplete="email" required /></label>
      <label>Password<input value={password} onChange={event => setPassword(event.target.value)} type="password" autoComplete={registerMode ? 'new-password' : 'current-password'} minLength={12} required /></label>
      {registerMode && <><label>Organization<input value={organizationName} onChange={event => setOrganizationName(event.target.value)} required /></label><label>Publisher name<input value={publisherName} onChange={event => setPublisherName(event.target.value)} required /></label></>}
      <button className="button primary" disabled={busy} onClick={() => void submitAuth()}>{busy ? 'Working…' : registerMode ? 'Create publisher account' : 'Sign in'}</button>
      <small>New accounts are not email-verified. Publisher assurance is labeled BlockTek-issued and is not legal identity verification.</small>
    </div> : <>
      <div className="notice" style={{ marginTop: 16 }}><b>{profile.user.email}</b><br/>{profile.publishers[0]?.name} · {profile.publishers[0]?.status} · {profile.publishers[0]?.assuranceLevel}<button className="button ghost" style={{ marginLeft: 12 }} onClick={() => void signOut()}>Sign out</button></div>
      <div style={{ display: 'grid', gap: 12, maxWidth: 600, marginTop: 18 }}>
        <h4 style={{ margin: '8px 0 0' }}>Register an audio release</h4>
        <label>Release title<input value={title} onChange={event => setTitle(event.target.value)} maxLength={180} required /></label>
        <label>Audio file<input type="file" accept="audio/*" onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
        <small>Private storage · MP3, WAV, Ogg, FLAC, MP4 audio, WebM audio or AAC · 100 MB maximum. Original bytes are retained.</small>
        <button className="button primary" disabled={busy || !file || !title || !profile.publishers[0]} onClick={() => void uploadRelease()}>{busy ? 'Working…' : 'Upload and hash audio'}</button>
        {release && <div className="notice"><b>Upload persisted · {release.status}</b><br/>Server SHA-256: <span className="hash">{release.audio.sha256}</span><br/>Exact bytes are private. A registration record exists, but is not yet authorized on Midnight.</div>}
      </div>
      <div style={{ display: 'grid', gap: 12, maxWidth: 650, marginTop: 24 }}>
        <h4 style={{ margin: '8px 0 0' }}>Publisher wallet approval</h4>
        {!wallet ? <>
          <small>Wallet status: {walletStatus}</small>
          <label>Installed Midnight wallet<select value={walletIndex} onChange={event => setWalletIndex(event.target.value)}><option value="">Choose an installed wallet</option>{wallets.map((item, index) => <option value={index} key={`${item.name}-${index}`}>{item.name} · connector {item.apiVersion}</option>)}</select></label>
          <button className="button ghost" disabled={busy || !walletIndex} onClick={() => void connectWallet()}>Connect real wallet</button>
          {!wallets.length && <small>No compatible Midnight wallet was detected. The uploaded release remains saved; no mock wallet is substituted.</small>}
        </> : <>
          <div className="notice">Wallet status: <b>{walletStatus}</b><br/>Connected: {wallet.providerName}<br/>Account: {account || 'unavailable'}<br/>Network: {walletSession.networkId ?? 'unknown'} (required: {NETWORK})<br/>Signing: {walletSession.signingAvailable ? 'available' : 'not available'}<br/>Connected at: {walletSession.connectedAt ? new Date(walletSession.connectedAt).toLocaleString() : 'not confirmed'}<br/>Last signature verification: {walletSession.lastSignatureVerifiedAt ? new Date(walletSession.lastSignatureVerifiedAt).toLocaleString() : 'none'}</div>
          <button className="button ghost" onClick={() => void disconnectWallet()}>Clear local wallet session</button>
          <button className="button ghost" disabled={busy || !release || walletStatus === 'network_mismatch' || !walletSession.signingAvailable} onClick={() => void prepareIntent()}>Prepare exact release intent</button>
          {!walletSession.signingAvailable && <small>The wallet connection is retained, but this connector does not currently expose signData. No signing request was sent.</small>}
          {walletSession.error && <small>Wallet diagnostic [{walletSession.error.code}{walletSession.error.providerCode ? `/${walletSession.error.providerCode}` : ''}]: {walletSession.error.message}</small>}
        </>}
        {intentResult && <><p>Review the release manifest and exact wallet request. No transaction or funds transfer is requested.</p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: 'var(--warm)', padding: 14, fontSize: 12 }}>{JSON.stringify(intentResult.manifest, null, 2)}{'\n\n'}{intentJson}</pre><button className="button primary" disabled={busy || !wallet?.capabilities.signMessage || walletStatus === 'network_mismatch'} onClick={() => void approveRelease()}>Sign with connected wallet</button></>}
        {result && <div className="notice"><b>Publisher and platform signatures verified.</b><br/>Registration status: awaiting Midnight authorization.<br/>Wallet key-to-address binding remains unverified; no Midnight transaction has been submitted.<br/><a href={`/verify?id=${release?.registrationId}`}>Open public verification report</a></div>}
      </div>
      <div style={{ marginTop: 28 }}><h4>Release history</h4>{releases.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Title</th><th>Exact hash</th><th>Status</th><th></th></tr></thead><tbody>{releases.map(item => <tr key={String(item.id)}><td>{String(item.title)}</td><td><code>{String(item.sha256).slice(0, 16)}…</code></td><td>{String(item.status)}</td><td><a href={`/verify?id=${String(item.id)}`}>Evidence</a></td></tr>)}</tbody></table></div> : <p>No releases yet.</p>}</div>
    </>}
    {error && <p role="alert" style={{ color: 'var(--red)' }}>{error}</p>}
  </div>
}
