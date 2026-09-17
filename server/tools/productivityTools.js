const reminders = [];
let broadcaster = null;

export function setBroadcaster(broadcastFn) {
  broadcaster = broadcastFn;
}

export const productivityTools = {
  /**
   * Create reminder with background timer that triggers active desktop notification
   */
  async create_reminder({ title, minutes = 1 }) {
    const parsedMinutes = parseFloat(minutes) || 1;
    const timeMs = Math.max(parsedMinutes * 60 * 1000, 5000); // minimum 5s buffer
    const dueTime = new Date(Date.now() + timeMs).toLocaleTimeString();
    
    const reminder = {
      id: `rem_${Date.now()}`,
      title: title || 'Scheduled Reminder',
      dueTime,
      minutes: parsedMinutes,
      status: 'pending'
    };

    reminders.push(reminder);

    // Schedule active timer to fire reminder notification!
    setTimeout(() => {
      reminder.status = 'triggered';
      console.log(`[productivityTools] Reminder TRIGGERED: "${reminder.title}"`);
      if (broadcaster) {
        broadcaster({
          type: 'REMINDER_TRIGGERED',
          reminder: {
            id: reminder.id,
            title: reminder.title,
            dueTime: reminder.dueTime,
            message: `🔔 Reminder: ${reminder.title}`
          }
        });
      }
    }, timeMs);

    return {
      status: 'success',
      reminder,
      message: `Gotcha! Set reminder "${reminder.title}" for ${dueTime} (in ${parsedMinutes} min).`
    };
  },

  /**
   * List all active reminders
   */
  async list_reminders() {
    return {
      status: 'success',
      reminders,
      message: `You have ${reminders.length} active reminders.`
    };
  }
};
