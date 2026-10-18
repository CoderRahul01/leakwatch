import { Link } from 'react-router-dom';
import { LogoMark } from '../components/Logo';

export function NotFound() {
  return (
    <div className="nf">
      <LogoMark size={72} animated />
      <h1 className="display nf-title num">404</h1>
      <p className="lede">This page leaked. Unlike your ad money, we can’t get it back.</p>
      <div className="hero-cta">
        <Link to="/" className="btn btn-primary">Go home</Link>
        <Link to="/demo" className="btn btn-ghost">Open the demo</Link>
      </div>
    </div>
  );
}
