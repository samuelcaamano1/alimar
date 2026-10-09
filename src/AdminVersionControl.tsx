import { useMemo, useState } from 'react'
import { versionHistory } from './admin/versionHistory'

function formatDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return value

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed)
}

export default function AdminVersionControl() {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es')

    if (!needle) return versionHistory

    return versionHistory.filter((entry) =>
      [
        entry.code,
        entry.title,
        entry.summary,
        entry.commit,
        ...entry.files,
        ...entry.changes,
      ]
        .join(' ')
        .toLocaleLowerCase('es')
        .includes(needle),
    )
  }, [query])

  const latest = versionHistory[0] ?? null

  return (
    <section className="admin-panel admin-version-control">
      <div className="admin-version-heading">
        <div>
          <span className="admin-kicker">Control de versiones</span>
          <h2>Historial de módulos</h2>
          <p>
            Consultá qué se instaló, cuándo se aplicó y qué cambió en cada módulo de Alimar.
          </p>
        </div>

        <div className="admin-version-current">
          <small>Último registrado</small>
          <strong>{latest?.code ?? 'Sin versiones'}</strong>
          {latest && <span>{latest.title}</span>}
        </div>
      </div>

      <div className="admin-version-toolbar">
        <label>
          Buscar módulo o cambio
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ej. 1HOME.10, PDF, catálogo..."
          />
        </label>

        <div className="admin-version-count">
          <strong>{versionHistory.length}</strong>
          <span>versiones registradas</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="admin-version-empty">
          No encontramos una versión que coincida con “{query}”.
        </div>
      ) : (
        <div className="admin-version-list">
          {filtered.map((entry, index) => (
            <details
              className="admin-version-entry"
              key={entry.code}
              open={!query.trim() && index === 0}
            >
              <summary>
                <div className="admin-version-code">
                  <strong>{entry.code}</strong>
                  <span>{formatDate(entry.date)}</span>
                </div>

                <div className="admin-version-summary">
                  <strong>{entry.title}</strong>
                  <span>{entry.summary}</span>
                </div>

                <span className="admin-version-toggle" aria-hidden="true">
                  +
                </span>
              </summary>

              <div className="admin-version-detail">
                <div>
                  <h3>Qué cambió</h3>
                  <ul>
                    {entry.changes.map((change) => (
                      <li key={change}>{change}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3>Archivos principales</h3>
                  <div className="admin-version-files">
                    {entry.files.map((file) => (
                      <code key={file}>{file}</code>
                    ))}
                  </div>
                </div>

                <div className="admin-version-commit">
                  <span>Commit funcional</span>
                  <a
                    href={`https://github.com/samuelcaamano1/alimar/commit/${entry.commit}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {entry.commit.slice(0, 8)} ↗
                  </a>
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  )
}
