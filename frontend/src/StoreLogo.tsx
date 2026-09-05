import type { SVGProps } from 'react'
import {
  AldiLogo,
  AsdaLogo,
  BootsLogo,
  CoopLogo,
  IcelandLogo,
  MorrisonsLogo,
  OcadoLogo,
  SainsburysLogo,
  TescoLogo,
  WaitroseLogo,
} from './storeLogos'

// Keyed by the store's name, lowercased and stripped of punctuation/spacing
// (see normalizeStoreName) so "Co-op"/"Coop", "Sainsbury's"/"Sainsburys" etc.
// all resolve the same way — mirrors the backend's own
// catalog.views._normalize_store_name, used the same way there to match a
// trolley.co.uk store name against this app's Store list.
const LOGO_BY_NORMALIZED_NAME: Record<string, (props: SVGProps<SVGSVGElement>) => JSX.Element> = {
  aldi: AldiLogo,
  asda: AsdaLogo,
  boots: BootsLogo,
  coop: CoopLogo,
  iceland: IcelandLogo,
  morrisons: MorrisonsLogo,
  ocado: OcadoLogo,
  sainsburys: SainsburysLogo,
  tesco: TescoLogo,
  waitrose: WaitroseLogo,
}

function normalizeStoreName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Lets a caller decide whether to show the store's name as text alongside
// (or instead of) the logo — a store with no logo on file (e.g. Costco,
// Farmfoods, Lidl, M&S Food — not among the chains trolley.co.uk itself
// compares prices across, so no source to pull a logo from) still needs its
// name shown as text somewhere, since StoreLogo itself renders nothing for
// those.
export function hasStoreLogo(name: string): boolean {
  return normalizeStoreName(name) in LOGO_BY_NORMALIZED_NAME
}

// Renders nothing for a store with no logo on file — see hasStoreLogo.
export function StoreLogo({ name, ...props }: { name: string } & SVGProps<SVGSVGElement>) {
  const Logo = LOGO_BY_NORMALIZED_NAME[normalizeStoreName(name)]
  if (!Logo) return null
  return <Logo aria-hidden="true" {...props} />
}
