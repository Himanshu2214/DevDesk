// ECharts line / bar chart host (only the parts that are used are bundled). The option is rebuilt when the theme changes,
// because colours come from the CSS tokens.
import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, MarkAreaComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, MarkLineComponent, MarkAreaComponent, CanvasRenderer]);
export const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

/** Shared look: Poppins, muted axis text, tooltip in the menu colours */
export const chartBase = () => ({
  textStyle: { fontFamily: 'Poppins, Segoe UI, sans-serif', color: css('--muted'), fontSize: 11.5 },
  animationDuration: 600, animationDurationUpdate: 500, animationEasingUpdate: 'cubicOut' as const,
  tooltip: { backgroundColor: css('--menu'), borderColor: css('--border-2'), borderWidth: 1, padding: [8, 10],
    textStyle: { color: css('--text'), fontSize: 12, fontFamily: 'Poppins, Segoe UI, sans-serif' }, extraCssText: 'box-shadow:0 8px 28px rgba(0,0,0,.3);border-radius:8px;' },
});

export function EChart({ option, height = 260, label }: { option: () => object; height?: number; label: string }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts>();
  const [theme, setTheme] = useState(0);
  useEffect(() => { const on = () => setTheme(x => x + 1); addEventListener('devdesk-theme', on); return () => removeEventListener('devdesk-theme', on) }, []);
  useEffect(() => {
    if (!el.current) return;
    chart.current = echarts.init(el.current);
    const ro = new ResizeObserver(() => chart.current?.resize());
    ro.observe(el.current);
    return () => { ro.disconnect(); chart.current?.dispose() };
  }, []);
  useEffect(() => { chart.current?.setOption(option() as echarts.EChartsCoreOption, true) }, [option, theme]);
  return <div ref={el} role="img" aria-label={label} style={{ width: '100%', height }} />;
}
