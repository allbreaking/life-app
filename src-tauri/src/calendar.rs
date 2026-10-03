//! macOS Calendar + Reminders integration through EventKit.
//!
//! Side effects: reads and (for reminders) writes the user's system calendars after the user
//! grants access via the system prompt. The service and its data contracts compile on every
//! platform; EventKit access is macOS-only and EventKit objects never cross thread boundaries.

use serde::Serialize;
use tauri::State;

use crate::error::ErrorResponse;

/// A read-only snapshot of one calendar event.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEvent {
    pub id: String,
    pub title: String,
    pub calendar: String,
    /// Unix epoch seconds of the start time.
    pub start: Option<i64>,
    pub end: Option<i64>,
    pub all_day: bool,
}

/// A read-only snapshot of one reminder (task).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderItem {
    pub id: String,
    pub title: String,
    pub calendar: String,
    /// Unix epoch seconds of the due date; `None` when the reminder has no due date.
    pub due: Option<i64>,
    pub completed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TodayCalendar {
    pub events: Vec<CalendarEvent>,
    pub reminders: Vec<ReminderItem>,
    pub events_authorized: bool,
    pub reminders_authorized: bool,
}

/// Stateless service. EventKit objects are created and released inside each call.
pub struct CalendarService;

impl CalendarService {
    pub fn new() -> Self {
        Self
    }
}

impl Default for CalendarService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(target_os = "macos")]
mod imp {
    use super::{CalendarEvent, ReminderItem, TodayCalendar};
    use crate::error::ErrorResponse;

    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::runtime::Bool;
    use objc2_event_kit::{EKAuthorizationStatus, EKEntityType, EKEventStore, EKReminder};
    use objc2_foundation::{NSArray, NSCalendar, NSDate, NSDateComponents, NSError, NSString};

    impl super::CalendarService {
        /// Reads today's events and today-or-overdue incomplete reminders, requesting access first
        /// when it has not been determined yet.
        pub fn sync_today(&self) -> Result<TodayCalendar, ErrorResponse> {
            let store = unsafe { EKEventStore::new() };

            let events_authorized = self.ensure_events_access(&store);
            let reminders_authorized = self.ensure_reminders_access(&store);

            let events = if events_authorized {
                self.read_today_events(&store)
            } else {
                Vec::new()
            };
            let reminders = if reminders_authorized {
                self.read_today_reminders(&store)
            } else {
                Vec::new()
            };

            Ok(TodayCalendar {
                events,
                reminders,
                events_authorized,
                reminders_authorized,
            })
        }

        /// Toggles a reminder's completed flag and persists it back to EventKit.
        pub fn set_reminder_completed(&self, id: &str, completed: bool) -> Result<(), ErrorResponse> {
            let store = unsafe { EKEventStore::new() };
            if !self.ensure_reminders_access(&store) {
                return Err(calendar_error("提醒事项未授权，无法修改"));
            }

            let identifier = NSString::from_str(id);
            let item = unsafe { store.calendarItemWithIdentifier(&identifier) };
            let Some(item) = item else {
                return Err(calendar_error("找不到对应的提醒事项"));
            };

            let Ok(reminder) = item.downcast::<EKReminder>() else {
                return Err(calendar_error("该条目不是提醒事项"));
            };

            unsafe { reminder.setCompleted(completed) };
            unsafe { store.saveReminder_commit_error(&reminder, true) }
                .map_err(|error| calendar_error(&error.localizedDescription().to_string()))?;
            Ok(())
        }

        fn ensure_events_access(&self, store: &EKEventStore) -> bool {
            match unsafe { EKEventStore::authorizationStatusForEntityType(EKEntityType::Event) } {
                EKAuthorizationStatus::FullAccess => true,
                EKAuthorizationStatus::NotDetermined => self.request_full_access(store, false),
                _ => false,
            }
        }

        fn ensure_reminders_access(&self, store: &EKEventStore) -> bool {
            match unsafe { EKEventStore::authorizationStatusForEntityType(EKEntityType::Reminder) } {
                EKAuthorizationStatus::FullAccess => true,
                EKAuthorizationStatus::NotDetermined => self.request_full_access(store, true),
                _ => false,
            }
        }

        /// Requests full access for events (reminders=false) or reminders (reminders=true) and
        /// waits for the user's answer on the system prompt.
        fn request_full_access(&self, store: &EKEventStore, reminders: bool) -> bool {
            let (tx, rx) = std::sync::mpsc::channel::<bool>();
            let handler = RcBlock::new(move |granted: Bool, _error: *mut NSError| {
                let _ = tx.send(granted.as_bool());
            });
            let handler_ptr = RcBlock::as_ptr(&handler);
            if reminders {
                unsafe { store.requestFullAccessToRemindersWithCompletion(handler_ptr) };
            } else {
                unsafe { store.requestFullAccessToEventsWithCompletion(handler_ptr) };
            }
            rx.recv().unwrap_or(false)
        }

        fn read_today_events(&self, store: &EKEventStore) -> Vec<CalendarEvent> {
            let (start, end) = today_window();
            let predicate =
                unsafe { store.predicateForEventsWithStartDate_endDate_calendars(&start, &end, None) };
            let events = unsafe { store.eventsMatchingPredicate(&predicate) };
            events
                .iter()
                .map(|event| {
                    let title = unsafe { event.title() }.to_string();
                    let calendar = unsafe { event.calendar() }
                        .map(|cal| unsafe { cal.title() }.to_string())
                        .unwrap_or_default();
                    let all_day = unsafe { event.isAllDay() };
                    let start_date = unsafe { event.startDate() };
                    let end_date = unsafe { event.endDate() };
                    let start = nsdate_to_seconds(&*start_date);
                    let end = nsdate_to_seconds(&*end_date);
                    let id = unsafe { event.eventIdentifier() }
                        .map(|identifier| identifier.to_string())
                        .unwrap_or_default();
                    CalendarEvent {
                        id,
                        title,
                        calendar,
                        start,
                        end,
                        all_day,
                    }
                })
                .collect()
        }

        fn read_today_reminders(&self, store: &EKEventStore) -> Vec<ReminderItem> {
            let (_start, end) = today_window();
            let predicate = unsafe {
                store.predicateForIncompleteRemindersWithDueDateStarting_ending_calendars(
                    None,
                    Some(&end),
                    None,
                )
            };
            let (tx, rx) = std::sync::mpsc::channel::<Vec<ReminderItem>>();
            let handler = RcBlock::new(move |reminders: *mut NSArray<EKReminder>| {
                let items = extract_reminders(reminders);
                let _ = tx.send(items);
            });
            unsafe { store.fetchRemindersMatchingPredicate_completion(&predicate, &*handler) };
            rx.recv().unwrap_or_default()
        }
    }

    /// Extracts plain-Rust reminder snapshots from a raw EventKit array pointer, without leaking
    /// non-`Send` EventKit objects across the callback boundary.
    fn extract_reminders(ptr: *mut NSArray<EKReminder>) -> Vec<ReminderItem> {
        if ptr.is_null() {
            return Vec::new();
        }
        let Some(array) = (unsafe { Retained::retain(ptr) }) else {
            return Vec::new();
        };
        array
            .iter()
            .map(|reminder| {
                let title = unsafe { reminder.title() }.to_string();
                let calendar = unsafe { reminder.calendar() }
                    .map(|cal| unsafe { cal.title() }.to_string())
                    .unwrap_or_default();
                let completed = unsafe { reminder.isCompleted() };
                let due = unsafe { reminder.dueDateComponents() }
                    .and_then(|components| date_components_to_seconds(&components));
                let id = unsafe { reminder.calendarItemIdentifier() }.to_string();
                ReminderItem {
                    id,
                    title,
                    calendar,
                    due,
                    completed,
                }
            })
            .collect()
    }

    /// Converts an `NSDateComponents` due date into local epoch seconds, when all required units
    /// are present. Reminders without a concrete due date yield `None`.
    fn date_components_to_seconds(components: &NSDateComponents) -> Option<i64> {
        let calendar = NSCalendar::currentCalendar();
        let date = calendar.dateFromComponents(components);
        date.as_deref().and_then(nsdate_to_seconds)
    }

    fn nsdate_to_seconds(date: &NSDate) -> Option<i64> {
        let seconds = date.timeIntervalSince1970();
        if seconds.is_finite() {
            Some(seconds.round() as i64)
        } else {
            None
        }
    }

    /// Returns the local start-of-today and start-of-tomorrow as `NSDate`s, marking the window of
    /// "today" for event queries.
    fn today_window() -> (Retained<NSDate>, Retained<NSDate>) {
        let now = chrono::Local::now();
        let start = now
            .date_naive()
            .and_hms_opt(0, 0, 0)
            .expect("midnight is a valid time")
            .and_local_timezone(chrono::Local)
            .earliest()
            .expect("local midnight is unambiguous");
        let end = start + chrono::Duration::days(1);
        (
            NSDate::dateWithTimeIntervalSince1970(start.timestamp() as f64),
            NSDate::dateWithTimeIntervalSince1970(end.timestamp() as f64),
        )
    }

    fn calendar_error(message: &str) -> ErrorResponse {
        ErrorResponse {
            code: "CALENDAR_ERROR",
            message: message.to_string(),
        }
    }
}

#[cfg(not(target_os = "macos"))]
impl CalendarService {
    pub fn sync_today(&self) -> Result<TodayCalendar, ErrorResponse> {
        Err(unsupported_error())
    }

    pub fn set_reminder_completed(&self, _id: &str, _completed: bool) -> Result<(), ErrorResponse> {
        Err(unsupported_error())
    }
}

#[cfg(not(target_os = "macos"))]
fn unsupported_error() -> ErrorResponse {
    ErrorResponse {
        code: "UNSUPPORTED",
        message: "日历同步仅在 macOS 桌面版中可用".to_string(),
    }
}

/// Syncs today's system calendar events and reminders. Side effects: may show the macOS calendar
/// and reminders access prompts on first use, then reads the selected range.
#[tauri::command]
pub fn sync_today_calendar(service: State<'_, CalendarService>) -> Result<TodayCalendar, ErrorResponse> {
    service.sync_today()
}

/// Toggles one reminder's completion state and writes it back to the system calendar.
#[tauri::command]
pub fn set_reminder_completed(
    id: String,
    completed: bool,
    service: State<'_, CalendarService>,
) -> Result<(), ErrorResponse> {
    service.set_reminder_completed(&id, completed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn today_calendar_contract_serializes_camel_case() {
        let value = TodayCalendar {
            events: vec![CalendarEvent {
                id: "e1".into(),
                title: "会议".into(),
                calendar: "工作".into(),
                start: Some(1),
                end: Some(2),
                all_day: false,
            }],
            reminders: vec![ReminderItem {
                id: "r1".into(),
                title: "买牛奶".into(),
                calendar: "家庭".into(),
                due: Some(3),
                completed: false,
            }],
            events_authorized: true,
            reminders_authorized: false,
        };
        let json = serde_json::to_string(&value).expect("serializes");
        assert!(json.contains("\"eventsAuthorized\":true"));
        assert!(json.contains("\"remindersAuthorized\":false"));
        assert!(json.contains("\"allDay\":false"));
    }
}
