import { Landing } from './Landing';
import { Setup } from './Setup';

export function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/setup') return <Setup />;
  return <Landing />;
}
