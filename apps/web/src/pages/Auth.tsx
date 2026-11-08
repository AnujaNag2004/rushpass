import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { z } from 'zod';
import type { AuthResponse } from '@rushpass/shared';
import { loginSchema, registerSchema } from '@rushpass/shared';
import { AvatarStack, GradientMesh, Logo } from '../components/Brand';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../store/auth';

const DEMO = [
  { label: 'User', email: 'user@rushpass.dev' },
  { label: 'Organizer', email: 'organizer@rushpass.dev' },
  { label: 'Admin', email: 'admin@rushpass.dev' },
  { label: 'Staff', email: 'staff@rushpass.dev' },
];

function useAfterAuth() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  return (res: AuthResponse) => {
    useAuth.getState().setSession(res.user, res.accessToken);
    toast.success(`Welcome, ${res.user.name.split(' ')[0]}!`);
    const next = params.get('next');
    navigate(next && next.startsWith('/') ? next : res.user.role === 'STAFF' ? '/staff/checkin' : '/', { replace: true });
  };
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="container-page grid min-h-[calc(100vh-4rem)] items-center gap-10 py-10 lg:grid-cols-2">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card mx-auto w-full max-w-md p-7 sm:p-9">
        <Logo />
        <h1 className="mt-6 text-3xl font-bold">{title}</h1>
        <p className="mt-1 text-muted">{subtitle}</p>
        <div className="mt-8">{children}</div>
      </motion.div>
      <div className="relative isolate hidden h-[560px] overflow-hidden rounded-[32px] border border-border lg:block">
        <GradientMesh intense />
        <div className="flex h-full flex-col justify-end p-10">
          <Sparkles className="h-8 w-8 text-gold" />
          <p className="mt-4 font-display text-4xl font-bold leading-tight">
            “We booked 6 seats together in <span className="text-gradient">under a minute.</span>”
          </p>
          <div className="mt-6 flex items-center gap-3">
            <AvatarStack
              people={[
                { name: 'Meera Iyer', color: '#FF4D8D' },
                { name: 'Rohan Gupta', color: '#FFB547' },
                { name: 'Ananya Rao', color: '#2EE6A6' },
                { name: 'Dev Patel', color: '#38BDF8' },
              ]}
            />
            <span className="text-sm text-muted">Group room, Neon Nights</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const user = useAuth((s) => s.user);
  const after = useAfterAuth();
  const form = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  if (user) return <Navigate to="/" replace />;

  const submit = form.handleSubmit(async (values) => {
    try {
      after(await api.post<AuthResponse>('/auth/login', values));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });

  return (
    <AuthShell title="Welcome back" subtitle="Log in to grab your seats.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input label="Email" type="email" autoComplete="email" {...form.register('email')} error={form.formState.errors.email?.message} />
        <Input label="Password" type="password" autoComplete="current-password" {...form.register('password')} error={form.formState.errors.password?.message} />
        <Button type="submit" variant="gradient" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          Log in <ArrowRight className="h-4 w-4" />
        </Button>
      </form>
      <div className="mt-6 rounded-xl border border-dashed border-border p-4">
        <div className="text-xs font-medium uppercase tracking-wider text-muted">Demo accounts · password Password@123</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {DEMO.map((d) => (
            <button
              key={d.email}
              type="button"
              className="chip"
              onClick={() => {
                form.setValue('email', d.email);
                form.setValue('password', 'Password@123');
              }}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-6 text-center text-sm text-muted">
        New here?{' '}
        <Link to="/register" className="font-semibold text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}

export function RegisterPage() {
  const user = useAuth((s) => s.user);
  const after = useAfterAuth();
  const form = useForm<z.infer<typeof registerSchema>>({ resolver: zodResolver(registerSchema) });
  if (user) return <Navigate to="/" replace />;

  const submit = form.handleSubmit(async (values) => {
    try {
      after(await api.post<AuthResponse>('/auth/register', values));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  });

  return (
    <AuthShell title="Join RushPass" subtitle="Be first in line for the shows everyone wants.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input label="Name" autoComplete="name" {...form.register('name')} error={form.formState.errors.name?.message} />
        <Input label="Email" type="email" autoComplete="email" {...form.register('email')} error={form.formState.errors.email?.message} />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="8+ characters with an uppercase letter and a number"
          {...form.register('password')}
          error={form.formState.errors.password?.message}
        />
        <Button type="submit" variant="gradient" size="lg" className="w-full" loading={form.formState.isSubmitting}>
          Create account <ArrowRight className="h-4 w-4" />
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-primary hover:underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
