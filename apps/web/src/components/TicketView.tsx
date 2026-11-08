import { CheckCircle2, Download, MapPin, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { BookingDTO } from '@rushpass/shared';
import { seatLabel } from '@rushpass/shared';
import { downloadFile, errorMessage } from '../lib/api';
import { formatDateTime, rupees } from '../lib/format';
import { Banner, TicketStub } from './Booking';
import { TIER_COLOR } from './SeatMap';
import { Button } from './ui/Button';
import { Badge } from './ui';

/** The full e-ticket with QR code, used on the success page and the ticket page. */
export function TicketView({ booking, holder }: { booking: BookingDTO; holder?: string }) {
  const [downloading, setDownloading] = useState(false);
  const usedAt = booking.tickets.find((t) => t.checkedInAt)?.checkedInAt;

  const download = async () => {
    setDownloading(true);
    try {
      await downloadFile(`/bookings/${booking.id}/tickets.pdf`, `rushpass-${booking.id}.pdf`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md">
      <TicketStub
        glow
        stub={
          <div className="flex flex-col items-center p-6">
            {booking.qrDataUrl ? (
              <div className="relative rounded-2xl bg-white p-3 shadow-card">
                <img src={booking.qrDataUrl} alt="Entry QR code" className="h-52 w-52" />
                {usedAt && (
                  <div className="absolute inset-0 grid place-items-center rounded-2xl bg-black/70 text-center text-sm font-semibold text-white">
                    <div>
                      <CheckCircle2 className="mx-auto mb-1 h-8 w-8 text-success" />
                      Checked in
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid h-52 w-52 place-items-center rounded-2xl border border-dashed border-border text-sm text-muted">No QR</div>
            )}
            <p className="mt-3 font-mono text-[11px] tracking-widest text-muted">{booking.id.toUpperCase()}</p>
            <p className="mt-1 text-xs text-muted">One scan admits every seat on this ticket.</p>
            <Button variant="outline" size="sm" className="mt-4" loading={downloading} onClick={download} icon={<Download className="h-4 w-4" />}>
              Download PDF
            </Button>
          </div>
        }
      >
        <div className="relative">
          <div className="relative h-36 overflow-hidden">
            <Banner src={booking.show.event.bannerUrl} alt="" className="h-full w-full" />
            <div className="absolute inset-0 bg-gradient-to-t from-surface to-transparent" />
            <div className="absolute left-4 top-4 flex gap-1.5">
              <Badge tone={booking.status === 'CONFIRMED' ? 'success' : 'danger'}>{booking.status}</Badge>
              {booking.groupCode && (
                <Badge tone="primary">
                  <Users className="h-3 w-3" /> Group
                </Badge>
              )}
            </div>
          </div>
          <div className="px-6 pb-6">
            <h2 className="text-xl font-bold leading-tight">{booking.show.event.title}</h2>
            <p className="mt-1 text-sm text-muted">{formatDateTime(booking.show.startsAt)}</p>
            <p className="flex items-center gap-1 text-sm text-muted">
              <MapPin className="h-3.5 w-3.5" /> {booking.show.venue.name}, {booking.show.venue.city}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(booking.tickets.length ? booking.tickets.map((t) => t.seat) : booking.heldSeats ?? []).map((s) => (
                <span key={s.id} className="flex items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-1 text-sm">
                  <span className="h-2 w-2 rounded-full" style={{ background: TIER_COLOR[s.tier] }} />
                  <span className="font-mono font-bold">{seatLabel(s)}</span>
                </span>
              ))}
            </div>
            <div className="mt-4 flex justify-between text-sm">
              <span className="text-muted">{holder}</span>
              <span className="font-semibold">{rupees(booking.total, { decimals: true })}</span>
            </div>
          </div>
        </div>
      </TicketStub>
    </div>
  );
}
