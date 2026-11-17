import Link from 'next/link'
import { SectionLabel, SiteShell } from '@/components/site-shell'
import AudioTrustRegistrationWorkspace from '@/components/audiotrust-registration-workspace'

export default function Workspace() {
  return <SiteShell>
    <section className="page-hero"><div className="container">
      <SectionLabel>Publisher workspace</SectionLabel>
      <h1>Register releases with evidence that travels.</h1>
      <p>Create a publisher account, upload exact audio bytes privately, and review the signatures and authorization status. A real Midnight wallet is required for release signing.</p>
      <div className="actions"><Link className="button ghost" href="/verify">Open public verifier</Link></div>
    </div></section>
    <section className="section"><div className="container"><AudioTrustRegistrationWorkspace /></div></section>
  </SiteShell>
}
