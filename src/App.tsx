import { useState } from 'react';
import { Viewport3D } from './components/Viewport3D';
import { CATEGORY_LABELS } from './types/editor';
import type { DisplayUnit, ModelCategory, TransformTool } from './types/editor';

export function App() {
  const [activeTool, setActiveTool] = useState<TransformTool>('translate');
  const [unit, setUnit] = useState<DisplayUnit>('cm');
  const [selectedCategory, setSelectedCategory] = useState<'all' | ModelCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  const unitLabel = unit === 'cm' ? 'см' : 'м';

  return (
    <div className="app-shell">
      {/* Горна лента с инструменти */}
      <header className="topbar">
        <div className="topbar-group">
          <div className="brand-title">
            <span>Interior Studio 3D</span>
            <span className="brand-badge">v0.1</span>
          </div>
        </div>

        {/* Инструменти за трансформация */}
        <div className="topbar-group">
          <button
            type="button"
            className={`btn ${activeTool === 'translate' ? 'btn-active' : ''}`}
            onClick={() => setActiveTool('translate')}
          >
            Преместване (W)
          </button>
          <button
            type="button"
            className={`btn ${activeTool === 'rotate' ? 'btn-active' : ''}`}
            onClick={() => setActiveTool('rotate')}
          >
            Въртене (E)
          </button>
          <button
            type="button"
            className={`btn ${activeTool === 'scale' ? 'btn-active' : ''}`}
            onClick={() => setActiveTool('scale')}
          >
            Мащаб (R)
          </button>
        </div>

        {/* Мерни единици, сцена и Админ панел */}
        <div className="topbar-group">
          <button
            type="button"
            className={`btn ${unit === 'cm' ? 'btn-active' : ''}`}
            onClick={() => setUnit('cm')}
            title="Показвай стойностите в сантиметри"
          >
            см
          </button>
          <button
            type="button"
            className={`btn ${unit === 'm' ? 'btn-active' : ''}`}
            onClick={() => setUnit('m')}
            title="Показвай стойностите в метри"
          >
            м
          </button>

          <button type="button" className="btn" disabled title="Ще бъде активирано в Етап 7">
            Запази сцена
          </button>

          <button
            type="button"
            className={`btn ${isAdminOpen ? 'btn-active' : ''}`}
            onClick={() => setIsAdminOpen((prev) => !prev)}
          >
            {isAdminOpen ? 'Към 3D Редактора' : 'Админ панел'}
          </button>
        </div>
      </header>

      {/* Основна работна зона */}
      {isAdminOpen ? (
        <main className="workspace" style={{ padding: '24px', justifyContent: 'center' }}>
          <div className="empty-state-box" style={{ maxWidth: '560px', margin: 'auto' }}>
            <h2 style={{ margin: '0 0 8px 0', color: '#f8fafc', fontSize: '16px' }}>
              Администраторски панел (Подготовка)
            </h2>
            <p style={{ margin: '0 0 16px 0' }}>
              Тук ще качвате своите GLB модели, Preview изображения, реални размери в сантиметри
              и правила за мащабиране без промяна на кода. Ще го изградим в Етап 8.
            </p>
            <button
              type="button"
              className="btn btn-active"
              onClick={() => setIsAdminOpen(false)}
            >
              Обратно към 3D сцената
            </button>
          </div>
        </main>
      ) : (
        <main className="workspace">
          {/* Ляв панел: Библиотека */}
          <aside className="sidebar-left">
            <div className="panel-header">
              <span>Библиотека мебели</span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>0 модела</span>
            </div>

            <div className="panel-body">
              <input
                type="text"
                className="input-control"
                placeholder="Търсене на модел..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />

              <select
                className="select-control"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as 'all' | ModelCategory)}
              >
                <option value="all">Всички категории</option>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>

              <div className="empty-state-box">
                Библиотеката все още е празна. В следващите етапи тук ще се зареждат 3D моделите
                по категории и с Preview изображения.
              </div>
            </div>
          </aside>

          {/* Централен 3D прозорец */}
          <section className="viewport-container">
            <Viewport3D />
            <div className="viewport-hint">
              Ляв бутон: Въртене • Десен бутон: Преместване • Скрол: Приближаване | Клетка = 10 см /
              Квадрат = 1 м
            </div>
          </section>

          {/* Десен панел: Настройки на избрания обект */}
          <aside className="sidebar-right">
            <div className="panel-header">
              <span>Настройки на обект</span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Единици: {unitLabel}</span>
            </div>

            <div className="panel-body">
              <div className="empty-state-box">
                Няма избран обект. Когато добавим мебели в сцената, тук ще виждате и задавате
                точни координати, ротация и размери в {unitLabel}.
              </div>

              <div>
                <div className="section-label">Позиция ({unitLabel})</div>
                <div className="axis-grid">
                  <div className="axis-field">
                    <span>X</span>
                    <input className="input-control" type="number" value={0} disabled />
                  </div>
                  <div className="axis-field">
                    <span>Y</span>
                    <input className="input-control" type="number" value={0} disabled />
                  </div>
                  <div className="axis-field">
                    <span>Z</span>
                    <input className="input-control" type="number" value={0} disabled />
                  </div>
                </div>
              </div>

              <div>
                <div className="section-label">Ротация (градуси)</div>
                <div className="axis-grid">
                  <div className="axis-field">
                    <span>X</span>
                    <input className="input-control" type="number" value={0} disabled />
                  </div>
                  <div className="axis-field">
                    <span>Y</span>
                    <input className="input-control" type="number" value={0} disabled />
                  </div>
                  <div className="axis-field">
                    <span>Z</span>
                    <input className="input-control" type="number" value={0} disabled />
                  </div>
                </div>
              </div>

              <div>
                <div className="section-label">Размери ({unitLabel})</div>
                <div className="axis-grid">
                  <div className="axis-field">
                    <span>Ш (X)</span>
                    <input className="input-control" type="number" value={0} disabled />
                  </div>
                  <div className="axis-field">
                    <span>В (Y)</span>
                    <input className="input-control" type="number" value={0} disabled />
                  </div>
                  <div className="axis-field">
                    <span>Д (Z)</span>
                    <input className="input-control" type="number" value={0} disabled />
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </main>
      )}
    </div>
  );
}

export default App;