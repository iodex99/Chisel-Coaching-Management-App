import logo from '../assets/logo.jpg'

export function Logo({ className }: { className?: string }): JSX.Element {
  return <img src={logo} alt="Chisel Coaching Classes" className={className} />
}
