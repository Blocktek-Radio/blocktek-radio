'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { InitialAPI } from '@midnightntwrk/dapp-connector-api'
import { createIntent, canonicalizeIntent, discoverMidnightWallets, MidnightConnectorProvider, verifyCreatorSignature } from '@/packages/wallet-provider/src/index.js'
import type { DevelopmentMockProvider } from '@/packages/wallet-provider/src/dev-mock.js'

const NETWORK = 'undeployed'
const registrationCommitment = '12'.repeat(32)
const manifestCommitment = '34'.repeat(32)
type Provider = MidnightConnectorProvider | DevelopmentMockProvider

export default function WalletRegistrationDemo() {
  const [wallets, setWallets] = useState<InitialAPI[]>([])
  const [walletIndex, setWalletIndex] = useState('')
  const [provider, setProvider] = useState<Provider | null>(null)
  const [account, setAccount] = useState('')
  const [intent, setIntent] = useState<ReturnType<typeof createIntent> | null>(null)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const stopListening = useRef<(() => void) | null>(null)
  const production = process.env.NODE_ENV === 'production'
  const duplicateRdns = wallets.some((wallet, index) => wallets.findIndex((candidate) => candidate.rdns === wallet.rdns) !== index)
  const intentJson = useMemo(() => intent ? canonicalizeIntent(intent) : '', [intent])

  useEffect(() => { setWallets(discoverMidnightWallets()) }, [])

  async function connect(real: boolean) {
    setError(''); setResult(''); setIntent(null)
    try {
      let next: Provider
      if (real) next = new MidnightConnectorProvider(wallets[Number(walletIndex)], NETWORK)
      else {
        if (production) throw new Error('Development mock wallets are disabled in production.')
        const { DevelopmentMockProvider } = await import('@/packages/wallet-provider/src/dev-mock.js')
        next = new DevelopmentMockProvider({ networkId: NETWORK })
      }
      const state = await next.connect()
      if ('onChange' in next) stopListening.current = next.onChange((event) => {
        if (event.type === 'account_changed') { setAccount(event.account); setIntent(null); setResult('') }
        if (event.type === 'disconnected') { setProvider(null); setAccount(''); setIntent(null); setResult('') }
      })
      setProvider(next); setAccount(state.account)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Wallet connection failed.') }
  }

  async function disconnect() {
    stopListening.current?.(); stopListening.current = null
    await provider?.disconnect()
    setProvider(null); setAccount(''); setIntent(null); setResult(''); setError('')
  }

  function prepare() {
    if (!provider || !account) return
    setError(''); setResult('')
    try {
      setIntent(createIntent({ networkId: NETWORK, creatorAccount: account, registrationCommitment, manifestCommitment }))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not prepare signing intent.') }
  }

  async function approve() {
    if (!provider || !intent) return
    setError(''); setResult('')
    try {
      const currentNetwork = await provider.getNetwork()
      const currentAccount = await provider.getAccount()
      if (currentNetwork !== intent.networkId || currentAccount !== intent.creatorAccount) throw new Error('Wallet account or network changed. Review and prepare a new signing intent.')
      const signature = await provider.signMessage(intentJson)
      const verified = verifyCreatorSignature(intent, signature, { expectedNetwork: NETWORK, expectedAccount: currentAccount })
      setResult(`Intent signature verifies against the returned key (${verified.scheme}). Key-to-account binding is unverified. Publisher authorization remains BLOCKED because the existing Track A credential-wide revocation check is unresolved.`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Signing or verification failed.') }
  }

  return <div className="card" style={{ marginTop: 26 }}>
    <span className="tag">M1.2 · Local development · network: {NETWORK}</span>
    <h3>Creator wallet and registration approval</h3>
    <p>This demo uses synthetic commitments. Wallet ownership, creator approval, and publisher authorization are separate checks.</p>
    {!provider ? <>
      <label htmlFor="midnight-wallet" style={{ display: 'block', fontSize: 13, margin: '18px 0 7px' }}>Midnight connector wallet</label>
      <select id="midnight-wallet" value={walletIndex} onChange={(event) => setWalletIndex(event.target.value)} style={{ maxWidth: 420, width: '100%', padding: 12, border: '1px solid var(--line)', background: 'white' }}>
        <option value="">Choose a detected wallet</option>
        {wallets.map((wallet, index) => <option value={index} key={`${wallet.name}-${index}`}>{wallet.name} · connector {wallet.apiVersion}</option>)}
      </select>
      <div className="actions">
        <button className="button primary" disabled={!walletIndex} onClick={() => connect(true)}>Connect wallet</button>
        {!production && <button className="button ghost" onClick={() => connect(false)}>Use development mock</button>}
      </div>
      {duplicateRdns && <div className="notice" style={{ marginTop: 16 }}>Multiple connector entries report the same wallet identifier. Verify the selected extension before connecting.</div>}
      {wallets.length === 0 && <p>No compatible Midnight connector detected. A real 1AM connection has not been tested in this environment.</p>}
    </> : <>
      <div className="notice" style={{ marginTop: 18 }}><b>{provider.providerName}</b><br/>Connected account: {account.slice(0, 12)}…{account.slice(-6)}<br/>Network: {NETWORK}</div>
      <div className="actions"><button className="button ghost" onClick={prepare}>Prepare registration intent</button><button className="button ghost" onClick={disconnect}>Disconnect</button></div>
      {intent && <div style={{ marginTop: 18 }}><p><b>Review before wallet approval</b></p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: 'var(--warm)', padding: 14, fontSize: 12 }}>{intentJson}</pre><p>This signs the intent bytes with Midnight&apos;s required message prefix. It does not sign a transaction or transfer funds.</p><button className="button primary" onClick={approve}>Approve and verify signature</button></div>}
    </>}
    {error && <p role="alert" style={{ color: 'var(--red)' }}>{error}</p>}
    {result && <div className="notice" style={{ marginTop: 18 }}>{result}</div>}
    <p style={{ fontSize: 12, marginTop: 18 }}><b>Publisher authorization:</b> BLOCKED / test-only. No issuer credential is submitted or bypassed. No contract call is made by this demonstration.</p>
  </div>
}
