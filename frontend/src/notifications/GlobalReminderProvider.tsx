import React, { useEffect } from "react";
import { reminderScheduler } from "./reminderScheduler";
import { ReminderToastContainer } from "./ReminderToastContainer";
import { reminderService } from "../services/reminders/ReminderService";

interface Props {
  children: React.ReactNode;
}

/**
 * The single global mount point for the Reminder Toast system.
 *
 * Wraps the entire routed application (mounted once in MainLayout, above
 * the page <Routes>) so the Reminder Scheduler runs for the whole session —
 * independent of whatever page is active — and the one and only
 * ReminderToastContainer renders alongside it, never inside an individual
 * page. No page component should ever start the scheduler or render a
 * toast container itself.
 *
 *   App -> MainLayout -> GlobalReminderProvider -> ReminderToastContainer
 *                                                -> Application Pages
 */
export const GlobalReminderProvider: React.FC<Props> = ({ children }) => {
  useEffect(() => {
    // Reminders are now backend-persisted and shared across accounts (see
    // ReminderService.ts) — this pulls every reminder the logged-in user may
    // see, across every project, exactly once per session so the scheduler
    // below can evaluate them without requiring each project's workspace to
    // have been opened first. Starts the scheduler regardless of whether
    // this succeeds (same as before) so a transient network failure on
    // mount never stops reminders already in the local mirror from firing.
    reminderService
      .refreshAllReminders()
      .catch((error) => console.error("Failed to refresh reminders from server:", error))
      .finally(() => reminderScheduler.start());

    return () => reminderScheduler.stop();
  }, []);

  return (
    <>
      {children}
      <ReminderToastContainer />
    </>
  );
};
