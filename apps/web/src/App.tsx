import { Component, lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppLayout, RequireAuth } from './components/Layout';
import { PageLoader } from './components/ui';
import { refreshAccessToken } from './lib/api';
import { getSocket } from './lib/socket';
import { ErrorPage, NotFoundPage } from './pages/Errors';
import { HomePage } from './pages/Home';

const ExplorePage = lazy(() => import('./pages/Explore'));
const EventDetailPage = lazy(() => import('./pages/EventDetail'));
const SeatSelectionPage = lazy(() => import('./pages/SeatSelection'));
const WaitingRoomPage = lazy(() => import('./pages/WaitingRoom'));
const GroupRoomPage = lazy(() => import('./pages/GroupRoom'));
const CheckoutPage = lazy(() => import('./pages/Checkout'));
const BookingSuccessPage = lazy(() => import('./pages/BookingSuccess'));
const MyBookingsPage = lazy(() => import('./pages/MyBookings'));
const TicketPage = lazy(() => import('./pages/Ticket'));
const LoginPage = lazy(() => import('./pages/Auth').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('./pages/Auth').then((m) => ({ default: m.RegisterPage })));
const ProfilePage = lazy(() => import('./pages/Profile'));
const OrganizerDashboard = lazy(() => import('./pages/organizer/Dashboard'));
const EventEditorPage = lazy(() => import('./pages/organizer/EventEditor'));
const VenueBuilderPage = lazy(() => import('./pages/organizer/VenueBuilder'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminUsersPage = lazy(() => import('./pages/admin/Users'));
const RushMonitorPage = lazy(() => import('./pages/admin/RushMonitor'));
const CheckinPage = lazy(() => import('./pages/staff/Checkin'));

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? <ErrorPage error={this.state.error} /> : this.props.children;
  }
}

export function App() {
  useEffect(() => {
    // Restore the session from the refresh cookie, then open the realtime connection.
    refreshAccessToken().finally(() => getSocket());
  }, []);

  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/events/:slug" element={<EventDetailPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/shows/:id/seats" element={<RequireAuth><SeatSelectionPage /></RequireAuth>} />
            <Route path="/shows/:id/waiting-room" element={<RequireAuth><WaitingRoomPage /></RequireAuth>} />
            <Route path="/group/:code" element={<RequireAuth><GroupRoomPage /></RequireAuth>} />
            <Route path="/checkout/:bookingId" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
            <Route path="/booking/:id/success" element={<RequireAuth><BookingSuccessPage /></RequireAuth>} />
            <Route path="/bookings" element={<RequireAuth><MyBookingsPage /></RequireAuth>} />
            <Route path="/tickets/:id" element={<RequireAuth><TicketPage /></RequireAuth>} />
            <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
            <Route path="/organizer" element={<RequireAuth roles={['ORGANIZER']}><OrganizerDashboard /></RequireAuth>} />
            <Route path="/organizer/events/new" element={<RequireAuth roles={['ORGANIZER']}><EventEditorPage /></RequireAuth>} />
            <Route path="/organizer/events/:id" element={<RequireAuth roles={['ORGANIZER']}><EventEditorPage /></RequireAuth>} />
            <Route path="/organizer/venues/:id/builder" element={<RequireAuth roles={['ORGANIZER']}><VenueBuilderPage /></RequireAuth>} />
            <Route path="/admin" element={<RequireAuth roles={['ADMIN']}><AdminDashboard /></RequireAuth>} />
            <Route path="/admin/users" element={<RequireAuth roles={['ADMIN']}><AdminUsersPage /></RequireAuth>} />
            <Route path="/admin/rush-monitor" element={<RequireAuth roles={['ADMIN']}><RushMonitorPage /></RequireAuth>} />
            <Route path="/staff/checkin" element={<RequireAuth roles={['STAFF', 'ORGANIZER']}><CheckinPage /></RequireAuth>} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}
