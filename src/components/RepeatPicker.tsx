import type { Repeat } from '../api';
import { DAY_LETTERS, parseDays } from '../kinds';

/** Never / Daily / Weekdays / Weekly / pick days (S M T W T F S). */
export function RepeatPicker({ value, onChange }: { value: Repeat; onChange: (r: Repeat) => void }) {
  const days = parseDays(value);
  const mode = value.startsWith('days:') ? 'days' : value;
  const toggle = (d: number) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort();
    onChange(next.length ? (`days:${next.join(',')}` as Repeat) : '');
  };
  return (
    <div className="repeat-picker">
      <div className="seg">
        {([['', 'Never'], ['daily', 'Daily'], ['weekdays', 'Mon–Fri'], ['weekly', 'Weekly']] as const).map(([id, label]) => (
          <button type="button" key={id} className={mode === id ? 'on' : ''} onClick={() => onChange(id)}>{label}</button>
        ))}
        <button type="button" className={mode === 'days' ? 'on' : ''} onClick={() => onChange(mode === 'days' ? value : ('days:1,3,5' as Repeat))}>Pick days</button>
      </div>
      {mode === 'days' && (
        <div className="days" role="group" aria-label="Repeat on">
          {DAY_LETTERS.map((l, d) => (
            <button type="button" key={d} className={'day-btn' + (days.includes(d) ? ' on' : '')} aria-pressed={days.includes(d)} onClick={() => toggle(d)}
              aria-label={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d]}>{l}</button>
          ))}
        </div>
      )}
    </div>
  );
}
