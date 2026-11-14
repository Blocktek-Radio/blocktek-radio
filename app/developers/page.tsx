import Link from 'next/link'
import { ArrowRight, Code2, Webhook } from 'lucide-react'
import { SectionLabel, SiteShell } from '@/components/site-shell'
export default function Developers(){return <SiteShell><section className="page-hero"><div className="container"><SectionLabel>Developer surface</SectionLabel><h1>Build verification into the listening experience.</h1><p>Proposed API contracts for registration, verification, identity and provenance history. Endpoints are not active until a backend and provider adapters are configured.</p></div></section><section className="section"><div className="container split"><div><SectionLabel>Proposed endpoints</SectionLabel><h2>Small primitives. Composable evidence.</h2><div className="card" style={{marginTop:25}}><Code2 className="card-icon" size={22}/><h3>Audio registration</h3><p>Register a release with declared creator, content type, AI disclosure and processing actions.</p><code>POST /api/v1/audio/register</code></div><div className="card" style={{marginTop:12}}><Webhook className="card-icon" size={22}/><h3>Verification webhook</h3><p>Receive status changes when an anchor, credential or provider analysis becomes available.</p><code>POST /api/v1/webhooks/events</code></div></div><div className="dark-panel"><span className="tag">Proposed example</span><pre className="code" style={{marginTop:18}}>{`curl -X POST /api/v1/audio/verify \\
  -H "Authorization: Bearer $TOKEN" \\
  -F "file=@release.mp3"

{
  "assetId": "asset_demo_01",
  "signatureStatus": "unavailable",
  "exactHashMatch": "not_checked",
  "credentialStatus": "unavailable",
  "historyCompleteness": "incomplete",
  "limitations": [
    "No provider is connected"
  ]
}`}</pre><p style={{fontSize:12,marginTop:16}}>Authentication, rate limits, request validation and provider credentials belong on the server. Never expose private keys or provider tokens in browser code.</p></div></div></section><section className="section" style={{background:'#F0ECE7'}}><div className="container"><SectionLabel>Integration path</SectionLabel><h2 style={{marginBottom:24}}>Adapters keep the protocol vendor-neutral.</h2><div className="card-grid">{['IdentityProvider','ProvenanceProvider','StorageProvider','ChainAnchorProvider','FingerprintProvider','WatermarkProvider'].map(x=><div className="card" key={x}><code>{x}</code><p>Typed interface with unavailable state until a real implementation is configured.</p></div>)}</div><div className="actions"><Link className="button primary" href="/enterprise">Request pilot access <ArrowRight size={16}/></Link></div></div></section></SiteShell>}
