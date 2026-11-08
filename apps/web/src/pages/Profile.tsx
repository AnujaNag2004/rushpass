import { Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { UserDTO } from '@rushpass/shared';
import { MEMBER_COLORS } from '@rushpass/shared';
import { Avatar } from '../components/Brand';
import { Button } from '../components/ui/Button';
import { Badge, Card, Input } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { cn } from '../lib/format';
import { useAuth } from '../store/auth';

export default function ProfilePage() {
  const user = useAuth((s) => s.user)!;
  const [name, setName] = useState(user.name);
  const [color, setColor] = useState(user.avatarColor);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.patch<UserDTO>('/auth/me', { name, avatarColor: color });
      useAuth.getState().setUser(updated);
      toast.success('Profile saved');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container-page max-w-2xl py-10">
      <h1 className="text-3xl font-bold">Your profile</h1>
      <Card className="mt-6 p-6 sm:p-8">
        <div className="flex items-center gap-5">
          <Avatar name={name || user.name} color={color} size={72} />
          <div>
            <div className="text-xl font-semibold">{name || user.name}</div>
            <div className="text-sm text-muted">{user.email}</div>
            <Badge tone="primary" className="mt-2">{user.role}</Badge>
          </div>
        </div>
        <div className="mt-8 space-y-6">
          <Input label="Display name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <div>
            <span className="label">Avatar colour — this is your colour in group rooms</span>
            <div className="mt-2 flex flex-wrap gap-3" role="radiogroup" aria-label="Avatar colour">
              {MEMBER_COLORS.map((c) => (
                <button
                  key={c}
                  role="radio"
                  aria-checked={color === c}
                  aria-label={c}
                  onClick={() => setColor(c)}
                  className={cn('grid h-10 w-10 place-items-center rounded-full transition hover:scale-110', color === c && 'ring-2 ring-text ring-offset-2 ring-offset-surface')}
                  style={{ background: c }}
                >
                  {color === c && <Check className="h-5 w-5 text-[#0B0A14]" />}
                </button>
              ))}
            </div>
          </div>
          <Button variant="gradient" loading={saving} onClick={save} disabled={name.trim().length < 2}>
            Save changes
          </Button>
        </div>
      </Card>
    </div>
  );
}
