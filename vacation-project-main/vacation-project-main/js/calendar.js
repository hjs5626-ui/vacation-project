/* ═══════════════════════════════════════════════════════════
   MEMENTO DIARY — Calendar Rendering
   ═══════════════════════════════════════════════════════════ */

import { state } from './state.js';
import { dom } from './dom.js';

export function renderCalendar() {
  const date = state.calendarDate;
  const year = date.getFullYear();
  const month = date.getMonth();

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  dom.calMonth.textContent = `${monthNames[month]} ${year}`;

  // Weekday headers
  if (!dom.calWeekdays.children.length) {
    ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach((d) => {
      const span = document.createElement('span');
      span.textContent = d;
      dom.calWeekdays.appendChild(span);
    });
  }

  // Days
  dom.calDays.innerHTML = '';
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const today = new Date();

  // Previous month days
  for (let i = firstDay - 1; i >= 0; i--) {
    const dayEl = document.createElement('div');
    dayEl.className = 'cal-day other';
    dayEl.textContent = prevMonthDays - i;
    dom.calDays.appendChild(dayEl);
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dayEl = document.createElement('div');
    dayEl.className = 'cal-day';
    if (d === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
      dayEl.classList.add('today');
    }
    dayEl.textContent = d;
    dom.calDays.appendChild(dayEl);
  }

  // Next month days
  const totalCells = dom.calDays.children.length;
  const remaining = 42 - totalCells; // 6 rows × 7
  for (let i = 1; i <= remaining; i++) {
    const dayEl = document.createElement('div');
    dayEl.className = 'cal-day other';
    dayEl.textContent = i;
    dom.calDays.appendChild(dayEl);
  }
}
