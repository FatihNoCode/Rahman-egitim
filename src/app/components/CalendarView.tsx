import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CalendarViewProps {
  datesWithData: Set<string>;
  selectedDate: string | null;
  onDateClick: (date: string) => void;
  language: 'tr' | 'nl';
}

export default function CalendarView({ datesWithData, selectedDate, onDateClick, language }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthNames = {
    tr: ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'],
    nl: ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'],
  };

  const dayNames = {
    tr: ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'],
    nl: ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'],
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    // Get the day of week (0 = Sunday, 1 = Monday, etc.)
    let firstDayOfWeek = firstDay.getDay();
    // Convert to Monday = 0, Sunday = 6
    firstDayOfWeek = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

    const days = [];

    // Add empty cells for days before month starts
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  };

  const formatDate = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  const previousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const nextMonth = () => {
    const today = new Date();
    const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1);
    // Don't allow going beyond current month
    if (next <= today) {
      setCurrentMonth(next);
    }
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isFutureDate = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date > today;
  };

  const days = getDaysInMonth(currentMonth);
  const canGoNext = currentMonth.getMonth() < new Date().getMonth() ||
                    currentMonth.getFullYear() < new Date().getFullYear();

  return (
    <div className="w-full">
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <button
          onClick={previousMonth}
          className="p-1 sm:p-2 hover:bg-gray-100 rounded-lg transition"
          aria-label={language === 'tr' ? 'Önceki ay' : 'Vorige maand'}
        >
          <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
        <h4 className="text-base sm:text-lg font-semibold">
          {monthNames[language][currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </h4>
        <button
          onClick={nextMonth}
          disabled={!canGoNext}
          className="p-1 sm:p-2 hover:bg-gray-100 rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label={language === 'tr' ? 'Sonraki ay' : 'Volgende maand'}
        >
          <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </div>

      {/* Day Names */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {dayNames[language].map((day) => (
          <div key={day} className="text-center text-xs sm:text-sm font-semibold text-gray-600 py-1">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} className="aspect-square" />;
          }

          const dateStr = formatDate(date);
          const hasData = datesWithData.has(dateStr);
          const isSelected = selectedDate === dateStr;
          const isTodayDate = isToday(date);
          const isFuture = isFutureDate(date);

          return (
            <button
              key={dateStr}
              onClick={() => hasData && !isFuture && onDateClick(dateStr)}
              disabled={!hasData || isFuture}
              className={`aspect-square flex items-center justify-center rounded-lg text-xs sm:text-sm font-medium transition relative
                ${hasData && !isFuture
                  ? 'cursor-pointer hover:bg-emerald-100'
                  : 'cursor-not-allowed text-gray-300'
                }
                ${isSelected ? 'bg-emerald-600 text-white hover:bg-emerald-700' : ''}
                ${!isSelected && hasData && !isFuture ? 'bg-emerald-50 text-emerald-800' : ''}
                ${!hasData && !isFuture ? 'text-gray-400' : ''}
                ${isTodayDate && !isSelected ? 'ring-2 ring-emerald-600 ring-offset-1' : ''}
                ${isFuture ? 'bg-gray-50' : ''}
              `}
            >
              {date.getDate()}
              {hasData && !isFuture && !isSelected && (
                <div className="absolute bottom-0.5 sm:bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-emerald-600 rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 sm:mt-4 flex flex-wrap gap-3 sm:gap-4 text-xs sm:text-sm text-gray-600">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 sm:w-4 sm:h-4 bg-emerald-50 border border-emerald-200 rounded flex items-center justify-center">
            <div className="w-1 h-1 bg-emerald-600 rounded-full" />
          </div>
          <span>{language === 'tr' ? 'Veri var' : 'Gegevens beschikbaar'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 sm:w-4 sm:h-4 ring-2 ring-emerald-600 rounded" />
          <span>{language === 'tr' ? 'Bugün' : 'Vandaag'}</span>
        </div>
      </div>
    </div>
  );
}
