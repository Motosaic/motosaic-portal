import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";

// Pages
import ClientPortalPage from "@/pages/ClientPortalPage";
import IntakePage from "@/pages/IntakePage";
import UploadPage from "@/pages/UploadPage";
import AdminDashboard from "@/pages/AdminDashboard";
import ClientDetailPage from "@/pages/ClientDetailPage";
import DecksListPage from "@/pages/DecksListPage";
import DeckWorkspacePage from "@/pages/DeckWorkspacePage";
import LandingPage from "@/pages/LandingPage";
import NotFound from "@/pages/not-found";

function AppRoutes() {
  return (
    <Router hook={useHashLocation}>
      <Switch>
        {/* Landing: entry point with Admin + Client portal CTAs */}
        <Route path="/" component={LandingPage} />

        {/* Client portal: login + progress hub */}
        <Route path="/portal" component={ClientPortalPage} />

        {/* Questionnaire — requires client ID from portal login */}
        <Route path="/intake/:id" component={IntakePage} />

        {/* Document upload — separate section */}
        <Route path="/documents/:id" component={UploadPage} />

        {/* Legacy routes (backwards compat) */}
        <Route path="/intake" component={ClientPortalPage} />
        <Route path="/intake/:id/upload" component={UploadPage} />

        {/* Admin */}
        <Route path="/admin" component={AdminDashboard} />
        <Route path="/admin/clients/:id" component={ClientDetailPage} />

        {/* Decks — MotoMatch deck generator workspace */}
        <Route path="/decks" component={DecksListPage} />
        <Route path="/decks/:id" component={DeckWorkspacePage} />

        <Route component={NotFound} />
      </Switch>
    </Router>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppRoutes />
      <Toaster />
    </QueryClientProvider>
  );
}
