// All dates here are plain YYYY-MM-DD strings with no time component.
// We always construct/parse via local year/month/day parts — never via
// `new Date(isoString)` or `.toISOString()`, both of which go through UTC
// and can silently shift the displayed date by a day depending on the
// viewer's timezone.

export function parseDateISO(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function formatDateISO(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

// Python-style weekday: Monday=0 ... Sunday=6 (matches the backend's
// Household.week_start_day and date.weekday()). JS Date.getDay() is
// Sunday=0 ... Saturday=6, so it needs converting.
export function pythonWeekday(date: Date): number {
  return (date.getDay() + 6) % 7
}

// The most recent date on/before `today` whose weekday matches weekStartDay.
export function currentWeekStart(today: Date, weekStartDay: number): string {
  const diff = (pythonWeekday(today) - weekStartDay + 7) % 7
  return formatDateISO(addDays(today, -diff))
}

export const WEEKDAY_LABELS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

export function formatDayHeading(iso: string): string {
  const date = parseDateISO(iso)
  const weekday = WEEKDAY_LABELS[pythonWeekday(date)].slice(0, 3)
  return `${weekday} ${date.getDate()}/${date.getMonth() + 1}`
}

const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

// "5th", "1st", "22nd" — the 11th/12th/13th are always "th" even though
// their last digit (1/2/3) would otherwise suggest st/nd/rd.
function ordinal(day: number): string {
  if (day >= 11 && day <= 13) return `${day}th`
  switch (day % 10) {
    case 1:
      return `${day}st`
    case 2:
      return `${day}nd`
    case 3:
      return `${day}rd`
    default:
      return `${day}th`
  }
}

// e.g. "Saturday 5th September" — used as the default name for a new
// shopping list, so it's ready to use as-is for "this week's shop".
export function formatFullDate(date: Date): string {
  const weekday = WEEKDAY_LABELS[pythonWeekday(date)]
  const month = MONTH_LABELS[date.getMonth()]
  return `${weekday} ${ordinal(date.getDate())} ${month}`
}
