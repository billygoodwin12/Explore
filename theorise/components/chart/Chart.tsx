'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, type IChartApi, type ISeriesApi, ColorType, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import { useCandleData, type Interval } from '@/hooks/useCandleData';
import { C, D, M } from '@/styles/tokens';

const INTERVALS: Interval[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

interface Props {
  coin: string;
}

export default function Chart({ coin }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  const [interval, setInterval_] = useState<Interval>('15m');
  const { candles, loading } = useCandleData(coin, interval);

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#FFFFFF' },
        textColor: C.secondary,
        fontFamily: "'Source Code Pro', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: C.borderLight },
        horzLines: { color: C.borderLight },
      },
      crosshair: {
        vertLine: { color: C.muted, width: 1, style: 2, labelBackgroundColor: C.primary },
        horzLine: { color: C.muted, width: 1, style: 2, labelBackgroundColor: C.primary },
      },
      rightPriceScale: {
        borderColor: C.border,
      },
      timeScale: {
        borderColor: C.border,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: C.green,
      downColor: C.red,
      borderUpColor: C.green,
      borderDownColor: C.red,
      wickUpColor: C.green,
      wickDownColor: C.red,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      chart.applyOptions({ width, height });
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  // Update data when candles change
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current || candles.length === 0) return;

    const candleData = candles.map(c => ({
      time: c.time as import('lightweight-charts').UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumeData = candles.map(c => ({
      time: c.time as import('lightweight-charts').UTCTimestamp,
      value: c.volume,
      color: c.close >= c.open ? `${C.green}30` : `${C.red}30`,
    }));

    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);
  }, [candles]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', borderRadius: 10, overflow: 'hidden', background: C.card, border: `1px solid ${C.border}` }}>
      {/* Interval selector */}
      <div style={{ display: 'flex', gap: 2, padding: '8px 10px', borderBottom: `1px solid ${C.borderLight}` }}>
        {INTERVALS.map(iv => (
          <button
            key={iv}
            onClick={() => setInterval_(iv)}
            style={{
              padding: '4px 10px',
              borderRadius: 5,
              border: 'none',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
              fontFamily: M,
              background: interval === iv ? C.primary : 'transparent',
              color: interval === iv ? 'white' : C.muted,
              transition: 'all 0.1s',
            }}
          >
            {iv}
          </button>
        ))}
        {loading && (
          <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: M, color: C.muted, alignSelf: 'center' }}>
            loading...
          </span>
        )}
      </div>
      {/* Chart container */}
      <div ref={containerRef} style={{ flex: 1 }} />
    </div>
  );
}
