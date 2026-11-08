import { Home, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { GradientMesh } from '../components/Brand';
import { Button } from '../components/ui/Button';

export function NotFoundPage() {
  return (
    <div className="relative isolate flex min-h-[70vh] items-center justify-center overflow-hidden px-4 text-center">
      <GradientMesh />
      <div>
        <div className="font-display text-[clamp(6rem,22vw,12rem)] font-bold leading-none text-gradient">404</div>
        <h1 className="mt-2 text-2xl font-bold">This seat doesn’t exist</h1>
        <p className="mx-auto mt-2 max-w-md text-muted">The page you’re looking for has left the venue. Let’s get you back to the show.</p>
        <Link to="/" className="mt-8 inline-block">
          <Button variant="gradient" icon={<Home className="h-4 w-4" />}>Back to home</Button>
        </Link>
      </div>
    </div>
  );
}

export function ErrorPage({ error }: { error?: Error }) {
  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden px-4 text-center">
      <GradientMesh />
      <div>
        <div className="font-display text-[clamp(5rem,18vw,10rem)] font-bold leading-none text-gradient">500</div>
        <h1 className="mt-2 text-2xl font-bold">The sound system blew a fuse</h1>
        <p className="mx-auto mt-2 max-w-md text-muted">Something broke on our side. Try reloading — your held seats are safe for a few minutes.</p>
        {error && <p className="mx-auto mt-4 max-w-md font-mono text-xs text-muted/70">{error.message}</p>}
        <div className="mt-8 flex justify-center gap-3">
          <Button variant="gradient" onClick={() => window.location.reload()} icon={<RefreshCw className="h-4 w-4" />}>
            Reload
          </Button>
          <a href="/">
            <Button variant="outline">Home</Button>
          </a>
        </div>
      </div>
    </div>
  );
}
