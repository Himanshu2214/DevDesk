// Hours-by-activity ring (ECharts, only the parts that are used are bundled).
import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { PieChart } from 'echarts/charts';
import { TitleComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { r1 } from '../lib/format';

echarts.use([PieChart, TitleComponent, TooltipComponent, CanvasRenderer]);
const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

export function Donut({ data, sub, height = 150 }: { data: { name: string; value: number; color: string }[]; sub: string; height?: number }) {
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
  useEffect(() => {
    const total = data.reduce((s, d) => s + d.value, 0);
    chart.current?.setOption({
      animationDuration: 500,
      textStyle: { fontFamily: 'Poppins, Segoe UI, sans-serif' },
      tooltip: { trigger: 'item', backgroundColor: css('--menu'), borderColor: css('--border-2'), textStyle: { color: css('--text'), fontSize: 12, fontFamily: 'Poppins, Segoe UI, sans-serif' },
        formatter: (p: { marker: string; name: string; value: number; percent: number }) => `${p.marker}${p.name}<br><b>${p.value} h</b> · ${p.percent}%` },
      title: { text: `${r1(total)} h`, subtext: sub, left: 'center', top: '36%', textStyle: { color: css('--text'), fontSize: 20, fontWeight: 600, fontFamily: 'Poppins, Segoe UI, sans-serif' },
        subtextStyle: { color: css('--muted'), fontSize: 11 } },
      series: [{ type: 'pie', radius: ['66%', '88%'], label: { show: false }, padAngle: 2, itemStyle: { borderRadius: 4, borderColor: css('--panel'), borderWidth: 2 },
        data: data.filter(d => d.value > 0).map(d => ({ name: d.name, value: r1(d.value), itemStyle: { color: d.color } })) }],
    }, true);
  }, [data, sub, theme]);
  return <div ref={el} style={{ width: '100%', height }} />;
}
