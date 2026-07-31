import React, { useEffect } from "react";
import { reminderScheduler } from "./reminderScheduler";
import { ReminderToastContainer } from "./ReminderToastContainer";

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
    reminderScheduler.start();
    return () => reminderScheduler.stop();
  }, []);

  return (
    <>
      {children}
      <ReminderToastContainer />
    </>
  );
};
