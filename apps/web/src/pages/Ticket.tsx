import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { BookingDTO } from '@rushpass/shared';
import { CANCEL_CUTOFF_MS } from '@rushpass/shared';
import { TicketView } from '../components/TicketView';
import { Button } from '../components/ui/Button';
import { EmptyState, Modal, PageLoader } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { rupees } from '../lib/format';
import { useAuth } from '../store/auth';

export default function TicketPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const [confirm, setConfirm] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['booking', id], queryFn: () => api.get<BookingDTO>(`/bookings/${id}`) });

  const cancel = useMutation({
    mutationFn: () => api.post<BookingDTO>(`/bookings/${id}/cancel`),
    onSuccess: (b) => {
      qc.setQueryData(['booking', id], b);
      qc.invalidateQueries({ queryKey: ['bookings'] });
      toast.success(`Booking cancelled. ${rupees(b.total)} will be refunded.`);
      setConfirm(false);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isLoading) return <PageLoader />;
  if (error || !data) return <EmptyState title="Ticket not found" body={errorMessage(error)} />;

  const cancellable =
    data.status === 'CONFIRMED' &&
    new Date(data.show.startsAt).getTime() - Date.now() > CANCEL_CUTOFF_MS &&
    !data.tickets.some((t) => t.checkedInAt);

  return (
    <div className="container-page max-w-2xl py-8">
      <Link to="/bookings" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> My tickets
      </Link>
      <div className="mt-6">
        <TicketView booking={data} holder={user?.name} />
      </div>
      {cancellable && (
        <div className="mt-8 text-center">
          <Button variant="ghost" className="text-danger" onClick={() => setConfirm(true)} icon={<XCircle className="h-4 w-4" />}>
            Cancel booking
          </Button>
          <p className="mt-1 text-xs text-muted">Free cancellation up to 24 hours before the show.</p>
        </div>
      )}
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Cancel this booking?">
        <p className="text-sm text-muted">
          Your {data.tickets.length} seat(s) will be released for others and {rupees(data.total, { decimals: true })} will be refunded to your original payment method.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(false)}>
            Keep tickets
          </Button>
          <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>
            Yes, cancel
          </Button>
        </div>
      </Modal>
    </div>
  );
}
