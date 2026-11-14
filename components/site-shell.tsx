'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowUpRight, Menu, Radio, ShieldCheck, X } from 'lucide-react'
import { useState } from 'react'

const links = [
  { href: '/', label: 'Protocol' },
  { href: '/audiotrust', label: 'AudioTrust' },
  { href: '/identity', label: 'Identity' },
  { href: '/developers', label: 'Developers' },
  { href: '/enterprise', label: 'Enterprise' },
]

export function BrandMark() {
  return <img className="brand-logo" src="/brand/blocktek-radio-logo.png" alt="BlockTek Radio" />
}

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  return (
    <div className="site-frame">
      <header className="site-header">
        <Link href="/" onClick={() => setOpen(false)}><BrandMark /></Link>
        <button className="mobile-menu" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
        <nav className={open ? 'site-nav open' : 'site-nav'} aria-label="Main navigation">
          {links.map((link) => <Link key={link.href} href={link.href} className={pathname === link.href ? 'active' : ''} onClick={() => setOpen(false)}>{link.label}</Link>)}
          <Link href="/verify" className="nav-verify" onClick={() => setOpen(false)}><ShieldCheck size={16} /> Verify audio</Link>
        </nav>
      </header>
      <main>{children}</main>
      <footer className="site-footer">
        <div><BrandMark /><p>Radio without intermediaries.<br />Audio with verifiable provenance.</p></div>
        <div className="footer-links"><div><small>Explore</small><Link href="/audiotrust">AudioTrust</Link><Link href="/verify">Verify audio</Link><Link href="/app">Workspace</Link></div><div><small>Build</small><Link href="/developers">Developer API</Link><Link href="/enterprise">Enterprise</Link><Link href="/identity">Identity registry</Link></div></div>
        <div className="footer-bottom"><span>© 2026 BlockTek Radio Protocol</span><span>Prototype surfaces are labelled. No live chain claims.</span></div>
      </footer>
    </div>
  )
}

export function SectionLabel({ children }: { children: React.ReactNode }) { return <div className="section-label"><span />{children}</div> }
export function ArrowLink({ href, children }: { href: string; children: React.ReactNode }) { return <Link className="arrow-link" href={href}>{children}<ArrowUpRight size={16} /></Link> }
