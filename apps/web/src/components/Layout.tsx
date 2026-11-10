import { AnimatePresence, motion } from 'framer-motion';
import { Github, LayoutDashboard, LogOut, Menu, ScanLine, Shield, Ticket, User, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { Role } from '@rushpass/shared';
import { api } from '../lib/api';
import { cn } from '../lib/format';
import { useAuth } from '../store/auth';
import { Avatar, Logo, ThemeToggle } from './Brand';
import { Button } from './ui/Button';
import { PageLoader } from './ui';

function useNavLinks() {
  const user = useAuth((s) => s.user);
  const links: { to: string; label: string; icon: ReactNode }[] = [{ to: '/explore', label: 'Explore', icon: null }];
  if (user) links.push({ to: '/bookings', label: 'My tickets', icon: <Ticket className="h-4 w-4" /> });
  if (user && ['ORGANIZER', 'ADMIN'].includes(user.role)) links.push({ to: '/organizer', label: 'Organizer', icon: <LayoutDashboard className="h-4 w-4" /> });
  if (user?.role === 'ADMIN') links.push({ to: '/admin', label: 'Admin', icon: <Shield className="h-4 w-4" /> });
  if (user && ['STAFF', 'ORGANIZER', 'ADMIN'].includes(user.role)) links.push({ to: '/staff/checkin', label: 'Check-in', icon: <ScanLine className="h-4 w-4" /> });
  return links;
}

export function Navbar() {
  const { user, status } = useAuth();
  const links = useNavLinks();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
    setMenu(false);
  }, [location.pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const logout = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    useAuth.getState().clear();
    navigate('/');
  };

  return (
    <header className="glass sticky top-0 z-40 border-x-0 border-t-0">
      <div className="container-page flex h-16 items-center gap-4">
        <Logo />
        <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Main">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                cn('relative rounded-lg px-3 py-2 text-sm font-medium transition', isActive ? 'text-text' : 'text-muted hover:text-text')
              }
            >
              {({ isActive }) => (
                <>
                  {l.label}
                  {isActive && <motion.span layoutId="nav-underline" className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-signature" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {status === 'loading' ? (
            <div className="h-10 w-24 animate-pulse rounded-btn bg-surface-2" />
          ) : user ? (
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenu((m) => !m)} className="flex items-center gap-2 rounded-full p-0.5 transition hover:ring-2 hover:ring-primary/40" aria-haspopup="menu" aria-expanded={menu}>
                <Avatar name={user.name} color={user.avatarColor} size={36} />
              </button>
              <AnimatePresence>
                {menu && (
                  <motion.div
                    role="menu"
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6 }}
                    className="card absolute right-0 mt-2 w-60 p-2"
                  >
                    <div className="px-3 py-2">
                      <div className="truncate font-semibold">{user.name}</div>
                      <div className="truncate text-xs text-muted">{user.email}</div>
                    </div>
                    <div className="my-1 h-px bg-border" />
                    <MenuLink to="/profile" icon={<User className="h-4 w-4" />}>Profile</MenuLink>
                    <MenuLink to="/bookings" icon={<Ticket className="h-4 w-4" />}>My tickets</MenuLink>
                    <button role="menuitem" onClick={logout} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger/10">
                      <LogOut className="h-4 w-4" /> Log out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link to="/login" className="rounded-btn px-3 py-2 text-sm font-medium text-muted hover:text-text">
                Log in
              </Link>
              <Link to="/register">
                <Button variant="gradient" size="sm">Get started</Button>
              </Link>
            </div>
          )}
          <button className="grid h-10 w-10 place-items-center rounded-btn border border-border md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Toggle menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-border md:hidden">
            <div className="container-page flex flex-col gap-1 py-3">
              {links.map((l) => (
                <NavLink key={l.to} to={l.to} className={({ isActive }) => cn('flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium', isActive ? 'bg-primary/15 text-text' : 'text-muted')}>
                  {l.icon}
                  {l.label}
                </NavLink>
              ))}
              {!user && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Link to="/login"><Button variant="outline" className="w-full">Log in</Button></Link>
                  <Link to="/register"><Button variant="gradient" className="w-full">Sign up</Button></Link>
                </div>
              )}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

function MenuLink({ to, icon, children }: { to: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Link role="menuitem" to={to} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-text">
      {icon}
      {children}
    </Link>
  );
}

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border">
      <div className="container-page grid gap-10 py-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-sm text-sm text-muted">
            Real-time ticketing for the shows everyone wants. Book with friends in a live group room, and never lose a seat to a crash again.
          </p>
        </div>
        <div>
          <h4 className="text-sm font-semibold">Discover</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li><Link to="/explore?category=CONCERT" className="hover:text-text">Concerts</Link></li>
            <li><Link to="/explore?category=COMEDY" className="hover:text-text">Comedy</Link></li>
            <li><Link to="/explore?drops=true" className="hover:text-text">Upcoming drops</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold">RushPass</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li><Link to="/organizer" className="hover:text-text">For organizers</Link></li>
            <li><Link to="/bookings" className="hover:text-text">My tickets</Link></li>
            <li>
              <a href="https://github.com/AnujaNag2004/rushpass" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-text">
                <Github className="h-3.5 w-3.5" /> Source on GitHub
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="perforation" />
      <div className="container-page flex flex-col items-center justify-between gap-2 py-6 text-xs text-muted sm:flex-row">
        <span>© {new Date().getFullYear()} RushPass. Built for the rush.</span>
        <span className="font-mono">Payments run in test mode.</span>
      </div>
    </footer>
  );
}

/** Browser-tab titles by route prefix; the first match wins. */
const PAGE_TITLES: [prefix: string, title: string][] = [
  ['/explore', 'Explore events'],
  ['/events/', 'Event'],
  ['/login', 'Log in'],
  ['/register', 'Create account'],
  ['/shows/', 'Choose seats'],
  ['/group/', 'Group room'],
  ['/checkout/', 'Checkout'],
  ['/booking/', 'Booking confirmed'],
  ['/bookings', 'My tickets'],
  ['/tickets/', 'Your ticket'],
  ['/profile', 'Profile'],
  ['/organizer', 'Organizer studio'],
  ['/admin/rush-monitor', 'Rush monitor'],
  ['/admin', 'Admin'],
  ['/staff/checkin', 'Door check-in'],
];

export function AppLayout() {
  const location = useLocation();
  useEffect(() => {
    const match = location.pathname.endsWith('/waiting-room')
      ? (['', 'Waiting room'] as const)
      : PAGE_TITLES.find(([prefix]) => location.pathname.startsWith(prefix));
    document.title = match ? `${match[1]} · RushPass` : 'RushPass — Get in before the rush';
  }, [location.pathname]);
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-white">
        Skip to content
      </a>
      <Navbar />
      <main id="main" className="flex-1">
        {/* CSS keyframes rather than a JS-driven transition: it can't stall if a lazy route suspends mid-animation. */}
        <div key={location.pathname} className="animate-page-in">
          <Outlet />
        </div>
      </main>
      <Footer />
    </div>
  );
}

export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageLoader />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (roles && user.role !== 'ADMIN' && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
