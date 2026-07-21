import { useEffect, useRef } from 'react';
import { useJarvis } from '../jarvis/engine/JarvisProvider';
import { useRemindersContext } from './RemindersContext';
import { createReminderTools } from './remindersTools';
import type { Reminder } from '../../hooks/useReminders';

/**
 * Registers reminder tools + context with Jarvis while the module is enabled,
 * unregistering cleanly when toggled off. Renders nothing — mirrors
 * ObsidianRegistrar, the established pattern for toggleable modules.
 */
export default function RemindersRegistrar() {
  const { registerTools, registerContext } = useJarvis();
  const { enabled, pending, addReminder, completeReminder, deleteReminder } = useRemindersContext();

  const pendingRef = useRef<Reminder[]>(pending);
  pendingRef.current = pending;

  useEffect(() => {
    if (!enabled) return;
    const unregTools = registerTools(
      'reminders',
      createReminderTools({ pendingRef, addReminder, completeReminder, deleteReminder }),
    );
    const unregCtx = registerContext('reminders', () => ({
      reminders: pendingRef.current.map((r) => ({ text: r.text, dueAt: r.dueAt })),
    }));
    return () => {
      unregTools();
      unregCtx();
    };
  }, [enabled, addReminder, completeReminder, deleteReminder, registerTools, registerContext]);

  return null;
}
