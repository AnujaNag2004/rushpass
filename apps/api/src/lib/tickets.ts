import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

export function qrDataUrl(token: string) {
  return QRCode.toDataURL(token, { margin: 1, width: 320, color: { dark: '#0B0A14', light: '#FFFFFF' } });
}

export interface TicketPdfInput {
  bookingId: string;
  eventTitle: string;
  venue: string;
  city: string;
  startsAt: Date;
  holderName: string;
  seats: { label: string; section: string; tier: string }[];
  total: number;
  qrToken: string;
}

const rupees = (paise: number) => `Rs. ${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

/** Generates a ticket-stub styled PDF. */
export async function ticketPdf(input: TicketPdfInput): Promise<Buffer> {
  const qr = await QRCode.toBuffer(input.qrToken, { margin: 1, width: 360 });
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const W = doc.page.width;
  doc.rect(0, 0, W, doc.page.height).fill('#0B0A14');

  // Ticket body
  const x = 48;
  const y = 72;
  const w = W - 96;
  const h = 560;
  doc.roundedRect(x, y, w, h, 18).fill('#15131F');
  const grad = doc.linearGradient(x, y, x + w, y);
  grad.stop(0, '#7C5CFF').stop(0.55, '#FF4D8D').stop(1, '#FFB547');
  doc.rect(x, y, w, 10).fill(grad);

  doc.fillColor('#F4F2FF').font('Helvetica-Bold').fontSize(26).text('RushPass', x + 32, y + 36);
  doc.fillColor('#9A94B8').font('Helvetica').fontSize(11).text('E-TICKET', x + 32, y + 68, { characterSpacing: 3 });

  doc.fillColor('#F4F2FF').font('Helvetica-Bold').fontSize(22).text(input.eventTitle, x + 32, y + 110, { width: w - 64 });
  const when = input.startsAt.toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
  doc.fillColor('#9A94B8').font('Helvetica').fontSize(12).text(`${when} IST`, x + 32, doc.y + 8);
  doc.text(`${input.venue}, ${input.city}`, x + 32, doc.y + 4);

  doc.fillColor('#FFB547').font('Helvetica-Bold').fontSize(12).text('SEATS', x + 32, y + 230, { characterSpacing: 2 });
  doc
    .fillColor('#F4F2FF')
    .font('Helvetica-Bold')
    .fontSize(16)
    .text(input.seats.map((s) => `${s.section} · ${s.label} (${s.tier})`).join('\n'), x + 32, y + 250, {
      width: w / 2,
    });

  doc.fillColor('#9A94B8').font('Helvetica').fontSize(11).text('Ticket holder', x + 32, y + 400);
  doc.fillColor('#F4F2FF').font('Helvetica-Bold').fontSize(14).text(input.holderName, x + 32, y + 416);
  doc.fillColor('#9A94B8').font('Helvetica').fontSize(11).text('Total paid', x + 32, y + 446);
  doc.fillColor('#F4F2FF').font('Helvetica-Bold').fontSize(14).text(rupees(input.total), x + 32, y + 462);

  // Perforation + notches
  const perfY = y + h - 110;
  doc.save();
  doc.dash(6, { space: 6 }).moveTo(x + 24, perfY).lineTo(x + w - 24, perfY).stroke('#2A2640');
  doc.restore();
  doc.circle(x, perfY, 14).fill('#0B0A14');
  doc.circle(x + w, perfY, 14).fill('#0B0A14');
  doc.fillColor('#9A94B8').font('Courier').fontSize(11).text(`BOOKING ${input.bookingId.toUpperCase()}`, x + 32, perfY + 36);
  doc.fillColor('#9A94B8').font('Helvetica').fontSize(10).text('Show this QR at the entrance. One scan admits all seats.', x + 32, perfY + 56);

  // QR
  doc.roundedRect(x + w - 232, y + 220, 200, 200, 12).fill('#FFFFFF');
  doc.image(qr, x + w - 222, y + 230, { width: 180, height: 180 });

  doc.end();
  return done;
}
