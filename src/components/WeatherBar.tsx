import type { Forecast, Weather } from '../liveTypes'

interface Props {
  weather: Weather | null
  forecast: Forecast | null
}

const deg = (v: number | null) => (v === null ? '—' : `${v.toFixed(0)}°C`)

/** Track conditions from the feed plus the rain forecast for the session window. */
export function WeatherBar({ weather, forecast }: Props) {
  if (!weather && !forecast) return null
  const wetRisk = forecast && forecast.p_rain >= 0.4
  return (
    <div className={`wx${weather?.raining ? ' is-raining' : ''}`} role="status" aria-label="Weather">
      {weather && (
        <>
          <span className="wx__now">{weather.raining ? 'RAINING' : 'DRY'}</span>
          <span>Track {deg(weather.track_c)}</span>
          <span>Air {deg(weather.air_c)}</span>
          {weather.humidity !== null && <span>Humidity {weather.humidity.toFixed(0)}%</span>}
          {weather.wind_ms !== null && <span>Wind {weather.wind_ms.toFixed(1)} m/s</span>}
        </>
      )}
      {forecast && (
        <span
          className={`wx__fc${wetRisk ? ' is-wet' : ''}`}
          title={forecast.hourly.map((h) => `${h.utc.slice(11)} UTC ${h.p}% ${h.mm} mm`).join('\n')}
        >
          Forecast: {Math.round(forecast.p_rain * 100)}% chance of rain during the session
          {forecast.mm > 0 ? ` (${forecast.mm} mm)` : ''}
        </span>
      )}
    </div>
  )
}
