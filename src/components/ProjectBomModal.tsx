import { useMemo, useState } from 'react';
import type {
  CatalogModel,
  CatalogTexture,
  SceneObject,
} from '../types/editor';
import type { RoomConfig } from '../types/room';
import {
  buildProjectBomReport,
  exportBomToCsv,
} from '../utils/projectBom';
import type { BomLineItem, BomSection } from '../utils/projectBom';

interface ProjectBomModalProps {
  projectTitle: string;
  room: RoomConfig;
  sceneObjects: SceneObject[];
  models: CatalogModel[];
  textures: CatalogTexture[];
  onClose: () => void;
}

const SECTION_LABELS: Record<BomSection, string> = {
  room: 'Помещение, подове и стени',
  parametric: 'Мебели по поръчка (разкрой и обков)',
  catalog: 'Готови мебели от каталога',
};

export function ProjectBomModal({
  projectTitle,
  room,
  sceneObjects,
  models,
  textures,
  onClose,
}: ProjectBomModalProps) {
  const [sectionFilter, setSectionFilter] = useState<'all' | BomSection>('all');

  const report = useMemo(
    () => buildProjectBomReport(room, sceneObjects, models, textures),
    [room, sceneObjects, models, textures]
  );

  const visibleItems = useMemo(() => {
    if (sectionFilter === 'all') return report.items;
    return report.items.filter((item) => item.section === sectionFilter);
  }, [report.items, sectionFilter]);

  const groupedByTitle = useMemo(() => {
    const groups: { title: string; section: BomSection; items: BomLineItem[] }[] =
      [];
    for (const item of visibleItems) {
      const existing = groups.find((g) => g.title === item.groupTitle);
      if (existing) {
        existing.items.push(item);
      } else {
        groups.push({
          title: item.groupTitle,
          section: item.section,
          items: [item],
        });
      }
    }
    return groups;
  }, [visibleItems]);

  const handlePrintPdf = () => {
    const win = window.open('', '_blank', 'width=960,height=800');
    if (!win) {
      window.print();
      return;
    }

    const dateStr = new Date().toLocaleDateString('bg-BG');
    const rowsHtml = groupedByTitle
      .map(
        (grp) => `
        <tr class="group-row">
          <td colspan="4">${grp.title}</td>
        </tr>
        ${grp.items
          .map(
            (it) => `
          <tr>
            <td>${it.itemName}</td>
            <td>${it.materialOrSpec}${it.notes ? ` <span class="note">(${it.notes})</span>` : ''}</td>
            <td class="num">${it.quantity.toFixed(it.unit === 'бр.' ? 0 : 2)}</td>
            <td class="unit">${it.unit}</td>
          </tr>
        `
          )
          .join('')}
      `
      )
      .join('');

    win.document.write(`<!doctype html>
<html lang="bg">
<head>
  <meta charset="utf-8" />
  <title>Спецификация — ${projectTitle}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 28px; font-size: 13px; }
    h1 { font-size: 20px; margin: 0 0 4px 0; }
    .meta { color: #475569; font-size: 12px; margin-bottom: 18px; }
    .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
    .card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; background: #f8fafc; }
    .card-lbl { font-size: 11px; color: #475569; }
    .card-val { font-size: 16px; font-weight: 700; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; background: #e2e8f0; padding: 8px; font-size: 12px; border: 1px solid #cbd5e1; }
    td { padding: 7px 8px; border: 1px solid #cbd5e1; }
    tr.group-row td { background: #f1f5f9; font-weight: 700; color: #1e293b; padding-top: 10px; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    td.unit { width: 54px; text-align: center; }
    .note { color: #64748b; font-size: 11px; }
    @media print { body { margin: 12mm; } }
  </style>
</head>
<body>
  <h1>Спецификация и разкрой на материали</h1>
  <div class="meta">Проект: <strong>${projectTitle}</strong> &bull; Дата: ${dateStr}</div>
  <div class="cards">
    <div class="card"><div class="card-lbl">Площ под</div><div class="card-val">${report.summary.floorAreaM2.toFixed(2)} м²</div></div>
    <div class="card"><div class="card-lbl">Чиста площ стени</div><div class="card-val">${report.summary.netWallAreaM2.toFixed(2)} м²</div></div>
    <div class="card"><div class="card-lbl">Плочи ПДЧ / МДФ</div><div class="card-val">${report.summary.boardAreaM2.toFixed(2)} м²</div></div>
    <div class="card"><div class="card-lbl">Термоплот</div><div class="card-val">${report.summary.countertopLm.toFixed(2)} л.м.</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Позиция / Материал</th>
        <th>Спецификация / Декор</th>
        <th class="num">Кол-во</th>
        <th>Мярка</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`);
    win.document.close();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 130,
        backgroundColor: 'rgba(2, 6, 23, 0.82)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 'min(1040px, 96vw)',
          height: 'min(760px, 92vh)',
          backgroundColor: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.75)',
        }}
      >
        {/* ЗАГЛАВНА ЛЕНТА */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#f8fafc' }}>
              📋 Спецификация и разкрой (BOM) — {projectTitle}
            </div>
            <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
              Автоматично изчислени квадратури, плочи за разкрой, плотове, обков и мебели
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-active"
              style={{ fontSize: '12px', fontWeight: 600 }}
              onClick={() => exportBomToCsv(projectTitle, report)}
            >
              ⬇ Експорт CSV / Excel
            </button>
            <button
              type="button"
              className="btn"
              style={{ fontSize: '12px' }}
              onClick={handlePrintPdf}
            >
              🖨 Принтирай / PDF
            </button>
            <button type="button" className="btn" onClick={onClose}>
              ✕ Затвори
            </button>
          </div>
        </div>

        {/* ОБОБЩЕНИ КАРТИ */}
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #1e293b',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '8px',
            backgroundColor: '#0b1220',
          }}
        >
          <div
            style={{
              backgroundColor: '#1e293b',
              borderRadius: '8px',
              padding: '8px 10px',
            }}
          >
            <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>Площ под</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#38bdf8' }}>
              {report.summary.floorAreaM2.toFixed(2)} м²
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#1e293b',
              borderRadius: '8px',
              padding: '8px 10px',
            }}
          >
            <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>
              Чиста площ стени
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
              {report.summary.netWallAreaM2.toFixed(2)} м²
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#1e293b',
              borderRadius: '8px',
              padding: '8px 10px',
            }}
          >
            <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>
              Плочи ПДЧ / МДФ
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#34d399' }}>
              {report.summary.boardAreaM2.toFixed(2)} м²
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#1e293b',
              borderRadius: '8px',
              padding: '8px 10px',
            }}
          >
            <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>Термоплот</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#fbbf24' }}>
              {report.summary.countertopLm.toFixed(2)} л.м.
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#1e293b',
              borderRadius: '8px',
              padding: '8px 10px',
            }}
          >
            <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>
              Обков (панти/водачи/дръжки)
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#e2e8f0' }}>
              {report.summary.hardwareCount} бр.
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#1e293b',
              borderRadius: '8px',
              padding: '8px 10px',
            }}
          >
            <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>
              Каталожни мебели
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#c084fc' }}>
              {report.summary.catalogFurnitureCount} бр.
            </div>
          </div>
        </div>

        {/* ФИЛТЪР ПО РАЗДЕЛ */}
        <div
          style={{
            padding: '8px 16px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            gap: '6px',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            className={`btn ${sectionFilter === 'all' ? 'btn-active' : ''}`}
            style={{ fontSize: '11.5px' }}
            onClick={() => setSectionFilter('all')}
          >
            Всички позиции ({report.items.length})
          </button>
          {(Object.keys(SECTION_LABELS) as BomSection[]).map((sec) => {
            const cnt = report.items.filter((i) => i.section === sec).length;
            return (
              <button
                key={sec}
                type="button"
                className={`btn ${sectionFilter === sec ? 'btn-active' : ''}`}
                style={{ fontSize: '11.5px' }}
                onClick={() => setSectionFilter(sec)}
              >
                {SECTION_LABELS[sec]} ({cnt})
              </button>
            );
          })}
        </div>

        {/* ТАБЛИЦА */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {groupedByTitle.length === 0 ? (
            <div className="empty-state-box">
              Няма позиции за показване в избрания раздел.
            </div>
          ) : (
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '12.5px',
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid #334155',
                    color: '#94a3b8',
                    textAlign: 'left',
                  }}
                >
                  <th style={{ padding: '8px' }}>Позиция / Материал</th>
                  <th style={{ padding: '8px' }}>Спецификация / Декор</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>
                    Количество
                  </th>
                  <th
                    style={{
                      padding: '8px',
                      textAlign: 'center',
                      width: '64px',
                    }}
                  >
                    Мярка
                  </th>
                </tr>
              </thead>
              <tbody>
                {groupedByTitle.map((group) => (
                  <>
                    <tr
                      key={`grp-${group.title}`}
                      style={{
                        backgroundColor: '#1e293b',
                        borderTop: '1px solid #334155',
                        borderBottom: '1px solid #334155',
                      }}
                    >
                      <td
                        colSpan={4}
                        style={{
                          padding: '8px 10px',
                          fontWeight: 700,
                          color: '#38bdf8',
                        }}
                      >
                        {group.title}
                      </td>
                    </tr>
                    {group.items.map((item) => (
                      <tr
                        key={item.id}
                        style={{ borderBottom: '1px solid #1e293b' }}
                      >
                        <td style={{ padding: '7px 10px', color: '#f1f5f9' }}>
                          {item.itemName}
                        </td>
                        <td style={{ padding: '7px 10px', color: '#cbd5e1' }}>
                          {item.materialOrSpec}
                          {item.notes && (
                            <span
                              style={{
                                marginLeft: '6px',
                                fontSize: '11px',
                                color: '#94a3b8',
                              }}
                            >
                              ({item.notes})
                            </span>
                          )}
                        </td>
                        <td
                          style={{
                            padding: '7px 10px',
                            textAlign: 'right',
                            fontWeight: 600,
                            color: '#f8fafc',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {item.quantity.toFixed(item.unit === 'бр.' ? 0 : 2)}
                        </td>
                        <td
                          style={{
                            padding: '7px 10px',
                            textAlign: 'center',
                            color: '#94a3b8',
                          }}
                        >
                          {item.unit}
                        </td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}